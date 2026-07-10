import { createHash } from "crypto";

// Pinecone 벡터 ID는 ASCII 문자만 허용한다.
// 한글·특수문자가 든 파일 경로를 결정적(deterministic) ASCII ID로 변환한다.
// (같은 경로+청크 번호 → 항상 같은 ID → 재인덱싱 시 덮어쓰기됨)
export function vectorId(prefix: string, path: string, chunk: number): string {
  const hash = createHash("sha1").update(path).digest("hex");
  return `${prefix}:${hash}:${chunk}`;
}
