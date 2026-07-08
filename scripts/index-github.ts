// 인덱싱 스크립트 (GitHub repo 버전): 공개 저장소의 .md/.txt를 임베딩해 Pinecone에 적재.
// 실행:  npm run index:github
//
// .env.local(또는 .env)에 필요:
//   GITHUB_REPO=owner/repo      (예: reactjs/react.dev)
//   GITHUB_BRANCH=main          (선택. 없으면 기본 브랜치 자동 감지)
import "../lib/loadEnv"; // ⚠️ 반드시 다른 import보다 먼저 (환경변수 선로드)

import { existsSync, readFileSync, writeFileSync } from "fs";
import {
  getDefaultBranch,
  listRepoDocs,
  fetchRepoFile,
  repoName,
} from "../lib/github";
import { embed } from "../lib/gemini";
import { chunkText } from "../lib/chunk";
import { upsertChunks, type NoteVector } from "../lib/pinecone";
import { vectorId } from "../lib/id";

const MANIFEST = ".indexed-github.json"; // repo path -> 처리 완료
type Manifest = Record<string, boolean>;

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

async function main() {
  if (!process.env.GITHUB_REPO) {
    throw new Error("GITHUB_REPO 가 .env.local 에 없습니다. 예: GITHUB_REPO=owner/repo");
  }

  const branch = await getDefaultBranch();
  console.log(`📦 ${repoName()} (@${branch}) 문서 목록 가져오는 중...`);
  const files = await listRepoDocs(branch);
  console.log(`   ${files.length}개 문서(.md/.txt) 발견\n`);

  const manifest = loadManifest();
  let total = 0;
  let skipped = 0;

  for (const file of files) {
    if (manifest[file.path]) {
      skipped++;
      continue;
    }

    console.log(`📄 ${file.path}`);
    const text = await fetchRepoFile(file.path, branch);
    if (!text.trim()) {
      manifest[file.path] = true;
      saveManifest(manifest);
      continue;
    }

    const chunks = chunkText(text);
    const vectors: NoteVector[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const values = await embed(chunks[i], "RETRIEVAL_DOCUMENT");
      vectors.push({
        id: vectorId("gh", file.path, i),
        values,
        metadata: {
          text: chunks[i],
          fileName: file.path,
          driveUrl: file.url, // 출처 링크 (메타 키는 재사용, 값은 GitHub URL)
          type: "text",
        },
      });
    }

    await upsertChunks(vectors);
    manifest[file.path] = true;
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
