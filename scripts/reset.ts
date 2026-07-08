// 리셋 스크립트: Pinecone 인덱스의 모든 벡터를 삭제하고, 인덱싱 진행 기록도 지운다.
// 실행:  npm run reset
// (처음부터 깨끗하게 다시 인덱싱하고 싶을 때 사용)
import "../lib/loadEnv"; // ⚠️ 반드시 다른 import보다 먼저 (환경변수 선로드)

import { existsSync, unlinkSync } from "fs";
import { index } from "../lib/pinecone";

const MANIFESTS = [".indexed.json", ".indexed-github.json", ".indexed-local.json"];

async function main() {
  console.log("🗑  Pinecone 인덱스의 모든 벡터 삭제 중...");
  await index.deleteAll();
  console.log("✅ Pinecone 인덱스를 비웠습니다.");

  for (const m of MANIFESTS) {
    if (existsSync(m)) {
      unlinkSync(m);
      console.log(`🧹 진행 기록 삭제: ${m}`);
    }
  }

  console.log("\n완료! 이제 처음부터 다시 인덱싱하면 됩니다. (npm run index:github)");
}

main().catch((e) => {
  console.error("❌ 리셋 실패:", e);
  process.exit(1);
});
