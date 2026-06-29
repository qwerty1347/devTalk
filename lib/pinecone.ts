import { Pinecone } from "@pinecone-database/pinecone";

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

export const index = pc.index(process.env.PINECONE_INDEX || "devnotes");

export type NoteMetadata = {
  text: string; // 원본 청크 텍스트 (답변 생성에 사용)
  fileName: string; // 출처 파일명
  driveUrl: string; // 원본 Drive 링크
  type: "text" | "image"; // 텍스트 파일인지 이미지인지
};

export type NoteVector = {
  id: string;
  values: number[];
  metadata: NoteMetadata;
};

// 벡터를 배치로 나눠 Pinecone에 적재한다.
export async function upsertChunks(vectors: NoteVector[]) {
  const BATCH = 100;
  for (let i = 0; i < vectors.length; i += BATCH) {
    await index.upsert(vectors.slice(i, i + BATCH));
  }
}

// 질문 벡터와 가장 가까운 노트 top-k를 찾는다.
export async function search(vector: number[], topK = 5) {
  const res = await index.query({
    vector,
    topK,
    includeMetadata: true,
  });
  return res.matches ?? [];
}
