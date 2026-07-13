// 인덱싱 스크립트: Google Drive 자료를 읽어 임베딩해서 Pinecone에 적재한다.
// 실행:  npm run index

// - 하위 폴더까지 재귀 탐색
// - 이미 인덱싱한 파일은 건너뜀(증분). 중간에 끊겨도 다시 돌리면 이어서 진행
// - 파일이 수정되면(modifiedTime 변경) 다시 인덱싱
import "../lib/loadEnv"; // ⚠️ 반드시 다른 import보다 먼저 (환경변수 선로드)

import { existsSync, readFileSync, writeFileSync } from "fs";
import {
  listFiles,
  downloadText,
  exportDoc,
  downloadBase64,
  driveUrl,
  type DriveFile,
} from "../lib/drive";
import { embed, describeImage } from "../lib/gemini";
import { chunkText } from "../lib/chunk";
import { upsertChunks, type NoteVector } from "../lib/pinecone";

const FOLDER_ID = process.env.DRIVE_FOLDER_ID!;
const MANIFEST = ".indexed.json"; // fileId -> modifiedTime (어디까지 했는지 기록)

type Manifest = Record<string, string>;

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

// 파일 하나에서 인덱싱할 텍스트를 추출한다 (형식별 처리).
async function extractText(
  file: DriveFile
): Promise<{ text: string; type: "text" | "image" } | null> {
  const mime = file.mimeType;

  if (mime === "application/vnd.google-apps.document") {
    return { text: await exportDoc(file.id), type: "text" };
  }
  if (mime.startsWith("text/") || mime === "application/json") {
    return { text: await downloadText(file.id), type: "text" };
  }
  if (mime.startsWith("image/")) {
    const b64 = await downloadBase64(file.id);
    const desc = await describeImage(b64, mime);
    return { text: desc, type: "image" };
  }

  console.log(`   ⏭  건너뜀 (${mime})`);
  return null; // PDF 등은 아직 미지원
}

async function main() {
  if (!FOLDER_ID) throw new Error("DRIVE_FOLDER_ID 가 .env.local(또는 .env)에 없습니다.");

  console.log("📂 Drive 폴더(하위 폴더 포함)에서 파일 목록 가져오는 중...");
  const files = await listFiles(FOLDER_ID);
  console.log(`   ${files.length}개 파일 발견\n`);

  const manifest = loadManifest();
  let totalChunks = 0;
  let skipped = 0;

  for (const file of files) {
    // 이미 같은 버전으로 인덱싱한 파일은 건너뜀
    if (manifest[file.id] === file.modifiedTime) {
      skipped++;
      continue;
    }

    console.log(`📄 ${file.name}`);
    const extracted = await extractText(file);
    if (!extracted || !extracted.text.trim()) {
      manifest[file.id] = file.modifiedTime; // 내용 없음도 처리한 것으로 기록
      saveManifest(manifest);
      continue;
    }

    const chunks = chunkText(extracted.text);
    const url = driveUrl(file.id);

    const vectors: NoteVector[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const values = await embed(chunks[i], "RETRIEVAL_DOCUMENT");
      vectors.push({
        id: `${file.id}-${i}`,
        values,
        metadata: {
          text: chunks[i],
          fileName: file.name,
          driveUrl: url,
          type: extracted.type,
        },
      });
    }

    await upsertChunks(vectors);

    // 파일 단위로 진행 상황 저장 → 중간에 끊겨도 다음 실행에서 이어서 진행
    manifest[file.id] = file.modifiedTime;
    saveManifest(manifest);

    totalChunks += vectors.length;
    console.log(`   ✅ ${vectors.length} chunks 인덱싱`);
  }

  console.log(
    `\n🎉 완료! 이번에 ${totalChunks}개 chunk 저장, ${skipped}개 파일은 이미 처리되어 건너뜀.`
  );
}

main().catch((e) => {
  console.error("❌ 인덱싱 실패:", e);
  process.exit(1);
});
