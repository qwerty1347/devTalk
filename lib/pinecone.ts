import { Pinecone } from "@pinecone-database/pinecone";
import { vectorId } from "./id";

// 지연 초기화: 클라이언트를 모듈 로드 시점이 아니라 "실제 사용 시점"에 만든다.
// (next build 중엔 환경변수가 없어 생성자가 터지는 배포 실패를 방지)
let _index: ReturnType<Pinecone["index"]> | null = null;
function getIndex() {
  if (!_index) {
    // 폴백을 두면 환경변수를 빠뜨렸을 때 존재하지 않는 인덱스를 조용히 바라보게 된다.
    // (Vercel 에 PINECONE_INDEX 를 등록하지 않은 경우 등) 즉시 터지는 편이 안전하다.
    const name = process.env.PINECONE_INDEX;
    if (!name) throw new Error("PINECONE_INDEX 가 설정되지 않았습니다.");
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    _index = pc.index(name);
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

// 이미 적재된 문서 경로를 Pinecone 에서 직접 확인한다.
// 서버리스에는 쓸 디스크가 없어 .indexed-github.json 을 못 쓰므로,
// "chunk 0 벡터가 존재하는가" 로 처리 완료 여부를 판정한다. (ID 가 결정적이라 가능)
export async function indexedPaths(paths: string[], prefix = "gh"): Promise<Set<string>> {
  const index = getIndex();
  const done = new Set<string>();
  const BATCH = 100; // fetch 는 한 번에 너무 많은 ID 를 받지 않는다

  for (let i = 0; i < paths.length; i += BATCH) {
    const slice = paths.slice(i, i + BATCH);
    const ids = slice.map((p) => vectorId(prefix, p, 0));
    const found = (await index.fetch(ids)).records ?? {};
    slice.forEach((p, j) => {
      if (found[ids[j]]) done.add(p);
    });
  }
  return done;
}
