import { Pinecone } from "@pinecone-database/pinecone";

// 지연 초기화: 클라이언트를 모듈 로드 시점이 아니라 "실제 사용 시점"에 만든다.
// (next build 중엔 환경변수가 없어 생성자가 터지는 배포 실패를 방지)
let _index: ReturnType<Pinecone["index"]> | null = null;
function getIndex() {
  if (!_index) {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    _index = pc.index(process.env.PINECONE_INDEX || "devnotes");
  }
  return _index;
}

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
  const index = getIndex();
  const BATCH = 100;
  for (let i = 0; i < vectors.length; i += BATCH) {
    await index.upsert(vectors.slice(i, i + BATCH));
  }
}

// 질문 벡터와 가장 가까운 노트 top-k를 찾는다.
export async function search(vector: number[], topK = 5) {
  const res = await getIndex().query({
    vector,
    topK,
    includeMetadata: true,
  });
  return res.matches ?? [];
}

// 인덱스의 모든 벡터를 삭제한다. (reset 스크립트에서 사용)
export async function deleteAllVectors() {
  await getIndex().deleteAll();
}
