import type { ReactNode } from "react";

export const metadata = {
  title: "devTalk",
  description: "내 개발 기록과 대화하는 RAG 채팅",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: "#fff", color: "#111" }}>
        {children}
      </body>
    </html>
  );
}
