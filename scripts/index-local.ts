// 인덱싱 스크립트 (로컬 폴더 버전): 로컬 폴더의 .md/.txt를 임베딩해 Pinecone에 적재.
// 실행:  npm run index:local
//
// .env(.env.local)에 필요:
//   LOCAL_DOCS_DIR=D:/projects/dev-notes   (역슬래시 대신 슬래시 권장)
//   GITHUB_REPO=qwerty1347/dev-notes        (선택. 출처 링크를 GitHub로 만들 때)
//   GITHUB_BRANCH=main                      (선택)
import "../lib/loadEnv"; // ⚠️ 반드시 다른 import보다 먼저 (환경변수 선로드)

import { existsSync, readFileSync, writeFileSync } from "fs";
import { listLocalDocs, readLocalFile } from "../lib/localfiles";
import { embed } from "../lib/gemini";
import { chunkText } from "../lib/chunk";
import { upsertChunks, type NoteVector } from "../lib/pinecone";
import { vectorId } from "../lib/id";

const DIR = process.env.LOCAL_DOCS_DIR || "";
const REPO = process.env.GITHUB_REPO || "";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const MANIFEST = ".indexed-local.json"; // rel -> mtimeMs

type Manifest = Record<string, number>;

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST)) return {};
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  } catch {
    return {};
  }
}
function saveManifest(m: Manifest) {
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

// 출처 링크: GITHUB_REPO가 있으면 GitHub 파일 URL, 없으면 상대 경로
function sourceUrl(rel: string): string {
  if (REPO) {
    const encoded = rel.split("/").map(encodeURIComponent).join("/");
    return `https://github.com/${REPO}/blob/${BRANCH}/${encoded}`;
  }
  return rel;
}

async function main() {
  if (!DIR) {
    throw new Error("LOCAL_DOCS_DIR 가 .env 에 없습니다. 예: LOCAL_DOCS_DIR=D:/projects/dev-notes");
  }
  if (!existsSync(DIR)) {
    throw new Error(`폴더를 찾을 수 없습니다: ${DIR}`);
  }

  console.log(`📁 ${DIR} 에서 문서 목록 가져오는 중...`);
  const files = listLocalDocs(DIR);
  console.log(`   ${files.length}개 문서(.md/.txt) 발견\n`);

  const manifest = loadManifest();
  let total = 0;
  let skipped = 0;

  for (const file of files) {
    // 같은 수정시각이면 이미 인덱싱한 것 → 건너뜀
    if (manifest[file.rel] === file.mtimeMs) {
      skipped++;
      continue;
    }

    console.log(`📄 ${file.rel}`);
    const text = readLocalFile(file.path);
    if (!text.trim()) {
      manifest[file.rel] = file.mtimeMs;
      saveManifest(manifest);
      continue;
    }

    const chunks = chunkText(text);
    const url = sourceUrl(file.rel);

    const vectors: NoteVector[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const values = await embed(chunks[i], "RETRIEVAL_DOCUMENT");
      vectors.push({
        id: vectorId("local", file.rel, i),
        values,
        metadata: {
          text: chunks[i],
          fileName: file.rel,
          driveUrl: url, // 출처 링크 (메타 키 재사용)
          type: "text",
        },
      });
    }

    await upsertChunks(vectors);
    manifest[file.rel] = file.mtimeMs;
    saveManifest(manifest);

    total += vectors.length;
    console.log(`   ✅ ${vectors.length} chunks`);
  }

  console.log(`\n🎉 완료! ${total}개 chunk 저장, ${skipped}개 문서는 이미 처리되어 건너뜀.`);
}

main().catch((e) => {
  console.error("❌ 인덱싱 실패:", e);
  process.exit(1);
});
