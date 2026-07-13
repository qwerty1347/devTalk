import { GoogleGenAI } from "@google/genai";

// 지연 초기화: next build의 page data 수집 단계(환경변수 없음)에서
// 생성자가 터지지 않도록, 실제 사용 시점에 클라이언트를 만든다.
let _ai: GoogleGenAI | null = null;
function getAI() {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _ai;
}

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIM = 768; // Pinecone 인덱스 차원과 반드시 일치
export const CHAT_MODEL = "gemini-2.5-flash";

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

// 429(rate limit)/5xx 등 일시적 오류 시 지수 백오프로 재시도.
// 무료 티어에서 대량 인덱싱할 때 중간에 죽지 않도록 한다.
async function withRetry<T>(fn: () => Promise<T>, label = "Gemini"): Promise<T> {
  const MAX = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const err = e as { status?: number; code?: number };
      const status = err?.status ?? err?.code;
      const retryable = status === 429 || status === 500 || status === 503;
      if (!retryable || attempt >= MAX) throw e;
      const waitMs = Math.min(60_000, 1000 * 2 ** attempt); // 2s,4s,8s,16s,32s
      console.warn(
        `   ⏳ ${label} ${status} — ${waitMs / 1000}s 후 재시도 (${attempt}/${MAX})`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

// 3072차원 미만으로 자르면 결과가 단위벡터가 아니므로 직접 정규화해야
// 코사인 유사도가 정확히 동작한다. (Google 권고사항)
function normalize(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  return norm > 0 ? v.map((x) => x / norm) : v;
}

// 텍스트를 임베딩 벡터로 변환.
// 저장(문서)할 땐 RETRIEVAL_DOCUMENT, 질문(검색)할 땐 RETRIEVAL_QUERY 를 쓰면 검색 품질이 올라간다.
export async function embed(text: string, taskType: TaskType): Promise<number[]> {
  const res = await withRetry(
    () =>
      getAI().models.embedContent({
        model: EMBED_MODEL,
        contents: text,
        config: { taskType, outputDimensionality: EMBED_DIM },
      }),
    "embed"
  );
  return normalize(res.embeddings![0].values!);
}

// 검색된 노트(context)를 근거로 질문에 답한다.
export async function chat(question: string, context: string): Promise<string> {
  const prompt = `당신은 사용자의 개발 기록을 바탕으로 답하는 어시스턴트입니다.
아래 "참고 자료"는 사용자가 직접 정리한 노트에서 검색된 내용입니다.
이 자료를 근거로 한국어로 답하고, 자료에 없는 내용은 추측하지 말고 모른다고 솔직히 말하세요.

[참고 자료]
${context}

[질문]
${question}`;

  const res = await withRetry(
    () =>
      getAI().models.generateContent({
        model: CHAT_MODEL,
        contents: prompt,
      }),
    "chat"
  );
  return res.text ?? "";
}

// 이미지를 Gemini Flash로 설명(텍스트화)한다. 이 텍스트를 임베딩해서 검색에 쓴다.
export async function describeImage(base64: string, mimeType: string): Promise<string> {
  const res = await withRetry(
    () =>
      getAI().models.generateContent({
        model: CHAT_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64 } },
              {
                text: "이 이미지는 개발 기록의 일부입니다. 나중에 검색할 수 있도록 이미지에 담긴 내용(코드, 에러 메시지, 다이어그램, 화면 등)을 한국어로 자세히 설명해 주세요. 글자가 보이면 그대로 옮겨 적어 주세요.",
              },
            ],
          },
        ],
      }),
    "describeImage"
  );
  return res.text ?? "";
}
