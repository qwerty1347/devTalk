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
    console.error(e);
    // Google 원문 JSON이 그대로 노출되지 않도록 사용자용 문구로 치환한다.
    const raw = e instanceof Error ? e.message : "";
    const message = /RESOURCE_EXHAUSTED|UNAVAILABLE|429|503/.test(raw)
      ? "지금 AI 서버가 혼잡하거나 무료 사용량을 초과했습니다. 잠시 후 다시 시도해 주세요."
      : "답변 생성 중 오류가 발생했습니다.";
    return NextResponse.json(
      {
        error: message,
        // 개발 환경에서만 원문을 함께 내려, 브라우저에서 바로 원인을 볼 수 있게 한다.
        // (프로덕션에서는 내부 정보가 노출되지 않도록 빠진다)
        ...(process.env.NODE_ENV !== "production" ? { detail: raw } : {}),
      },
      { status: 500 }
    );
  }
}
