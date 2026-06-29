import { NextRequest, NextResponse } from "next/server";

// 🚧 임시 목업(mock) — 디자인/UI 확인용 하드코딩 버전.
// 키 연결 없이 동작합니다. 실제 기능 붙일 땐 원래 버전으로 되돌리세요.
export async function POST(req: NextRequest) {
  const { question } = await req.json();

  // 실제 호출처럼 약간 지연 (로딩 상태 보이게)
  await new Promise((r) => setTimeout(r, 600));

  const answer = `(샘플 답변) "${question}" 에 대한 답이에요.

이건 하드코딩된 목업입니다. 실제로는 여기에 Pinecone에서 검색한
내 개발 기록을 근거로 Gemini가 생성한 답변이 들어갑니다.

예를 들어 도커 빌드가 느릴 땐 멀티스테이지 빌드와 레이어 캐시를
활용했고, .dockerignore 로 불필요한 파일을 제외했습니다.`;

  const sources = [
    {
      fileName: "docker-최적화-메모.md",
      driveUrl: "https://drive.google.com/file/d/sample1/view",
      score: 0.91,
    },
    {
      fileName: "빌드-속도-개선.txt",
      driveUrl: "https://drive.google.com/file/d/sample2/view",
      score: 0.84,
    },
    {
      fileName: "스크린샷-2025.png",
      driveUrl: "https://drive.google.com/file/d/sample3/view",
      score: 0.77,
    },
  ];

  return NextResponse.json({ answer, sources });
}
