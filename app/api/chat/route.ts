import { NextRequest, NextResponse } from "next/server";
import { embed, chat } from "@/lib/gemini";
import { search } from "@/lib/pinecone";

// 채팅 서버리스 함수: 질문 → 검색 → Gemini 답변
export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "question이 필요합니다." },
        { status: 400 }
      );
    }

    // 1. 질문을 임베딩 (검색용 task_type)
    const queryVector = await embed(question, "RETRIEVAL_QUERY");

    // 2. Pinecone에서 관련 노트 검색
    const matches = await search(queryVector, 5);

    // 3. 검색 결과로 컨텍스트 구성
    const context = matches
      .map((m, i) => {
        const md = m.metadata as Record<string, unknown>;
        return `[자료 ${i + 1}] (출처: ${md?.fileName})\n${md?.text}`;
      })
      .join("\n\n");

    // 4. Gemini로 답변 생성
    const answer = await chat(
      question,
      context || "(검색된 자료가 없습니다.)"
    );

    // 5. 답변 + 참고한 출처 반환
    const sources = matches.map((m) => {
      const md = m.metadata as Record<string, unknown>;
      return {
        fileName: md?.fileName,
        driveUrl: md?.driveUrl,
        score: m.score,
      };
    });

    return NextResponse.json({ answer, sources });
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    console.error(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
