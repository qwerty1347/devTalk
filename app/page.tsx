"use client";

import {
  useState,
  useRef,
  useEffect,
  isValidElement,
  type ComponentProps,
  type FormEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Source = { fileName: string; driveUrl: string; score: number };
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

// 클립보드 복사. https/localhost 가 아니면 navigator.clipboard 가 막히므로
// (예: http://192.168.x.x:3000 으로 접속) textarea + execCommand 로 폴백한다.
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

// 코드블록: 우상단에 언어 라벨 + 복사 버튼을 얹는다.
// 텍스트는 ref 로 DOM 에서 직접 읽는다 (AST 를 되짚는 것보다 단순하고 정확)
function Pre({ children, ...props }: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const child = Array.isArray(children) ? children[0] : children;
  const lang =
    (isValidElement<{ className?: string }>(child) &&
      /language-(\w+)/.exec(child.props.className ?? "")?.[1]) ||
    "";

  async function onCopy() {
    const ok = await copyText(ref.current?.textContent ?? "");
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="codewrap">
      <div className="codebar">
        {lang && <span className="codelang">{lang}</span>}
        <button type="button" className="copybtn" onClick={onCopy} aria-label="코드 복사">
          {copied ? "✓ 복사됨" : "복사"}
        </button>
      </div>
      <pre ref={ref} {...props}>
        {children}
      </pre>
    </div>
  );
}

// 답변은 마크다운으로 온다. remark-gfm 을 붙여야 표(GFM 확장)가 렌더링된다.
// rehype-raw 는 붙이지 말 것 — 노트 속 HTML 이 그대로 DOM 에 주입된다.
function Answer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopyAll() {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: Pre }}>
        {text}
      </ReactMarkdown>
      <button type="button" className="copyall" onClick={onCopyAll}>
        {copied ? "✓ 답변 복사됨" : "답변 전체 복사"}
      </button>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지 오면 맨 아래로 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        data.error
          ? {
              role: "assistant",
              // dev 환경에서는 서버가 detail(원문 에러)을 함께 내려준다. 코드블록으로 보여줘
              // 터미널을 안 봐도 브라우저에서 원인을 바로 확인할 수 있게 한다.
              content: data.detail
                ? `**오류:** ${data.error}\n\n\`\`\`json\n${data.detail}\n\`\`\``
                : `**오류:** ${data.error}`,
            }
          : { role: "assistant", content: data.answer, sources: data.sources ?? [] },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `요청 실패: ${err instanceof Error ? err.message : err}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh", // 모바일 주소창을 제외한 실제 화면 높이
        maxWidth: 820,
        margin: "0 auto",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* 헤더 */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "16px 20px",
          borderBottom: "1px solid #ececec",
          fontWeight: 600,
          fontSize: 18,
        }}
      >
        <img src="/logo.svg" alt="devTalk" width={36} height={36} />
        devTalk
      </header>

      {/* 대화 영역 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        {messages.length === 0 && (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#9a9a9a",
              textAlign: "center",
            }}
          >
            {/* <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div> */}
            <p style={{ margin: 0 }}>내 개발 기록에 대해 무엇이든 물어보세요.</p>
            <p style={{ margin: "4px 0 0", fontSize: 14 }}>
              예: &ldquo;도커 빌드 느릴 때 어떻게 했었지?&rdquo;
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 16,
            }}
          >
            <div style={{ maxWidth: msg.role === "user" ? "78%" : "92%" }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 16,
                  // 마크다운에 pre-wrap 이 걸리면 줄바꿈이 이중으로 먹어 문단이 벌어진다
                  whiteSpace: msg.role === "user" ? "pre-wrap" : "normal",
                  lineHeight: 1.6,
                  fontSize: 15,
                  background: msg.role === "user" ? "#111" : "#f4f4f5",
                  color: msg.role === "user" ? "#fff" : "#111",
                  borderBottomRightRadius: msg.role === "user" ? 4 : 16,
                  borderBottomLeftRadius: msg.role === "user" ? 16 : 4,
                  overflowX: "auto",
                }}
              >
                {msg.role === "user" ? msg.content : <Answer text={msg.content} />}
              </div>

              {/* 참고 기록 (assistant만) */}
              {msg.sources && msg.sources.length > 0 && (
                <div style={{ marginTop: 8, paddingLeft: 4 }}>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>
                    참고한 기록
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {msg.sources.map((s, j) => (
                      <a
                        key={j}
                        href={s.driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: 12,
                          color: "#0070f3",
                          textDecoration: "none",
                          background: "#f0f6ff",
                          border: "1px solid #d6e6ff",
                          borderRadius: 999,
                          padding: "3px 10px",
                        }}
                      >
                        🔗 {s.fileName} ({(s.score * 100).toFixed(0)}%)
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* 로딩(타이핑) 표시 */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 16,
                borderBottomLeftRadius: 4,
                background: "#f4f4f5",
                color: "#999",
                fontSize: 15,
              }}
            >
              검색 중…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 입력창 (하단 고정) */}
      <form
        onSubmit={send}
        style={{
          display: "flex",
          gap: 8,
          padding: "16px 20px",
          // 아이폰 홈 인디케이터(safe area)만큼 하단 여백 추가
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          borderTop: "1px solid #ececec",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요…"
          style={{
            flex: 1,
            padding: "12px 16px",
            fontSize: 16, // 16px 미만이면 iOS에서 입력 시 화면이 확대됨
            border: "1px solid #ddd",
            borderRadius: 999,
            outline: "none",
            minWidth: 0, // 좁은 화면에서 입력창이 버튼을 밀어내지 않게
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: "0 22px",
            fontSize: 15,
            border: "none",
            borderRadius: 999,
            background: loading || !input.trim() ? "#bbb" : "#111",
            color: "#fff",
            cursor: loading || !input.trim() ? "default" : "pointer",
          }}
        >
          전송
        </button>
      </form>

      {/* 답변(.md) 마크다운 스타일 — 페이지에 한 번만 주입 */}
      <style jsx global>{`
        .md > *:first-child {
          margin-top: 0;
        }
        .md > *:last-child {
          margin-bottom: 0;
        }
        .md h1,
        .md h2,
        .md h3,
        .md h4 {
          font-size: 15px;
          font-weight: 700;
          margin: 16px 0 6px;
        }
        .md p,
        .md li {
          line-height: 1.65;
        }
        .md p {
          margin: 6px 0;
        }
        .md ul,
        .md ol {
          padding-left: 20px;
          margin: 6px 0;
        }
        .md li {
          margin: 2px 0;
        }
        .md hr {
          border: none;
          border-top: 1px solid #e2e2e5;
          margin: 14px 0;
        }
        .md a {
          color: #0070f3;
        }
        .md blockquote {
          margin: 8px 0;
          padding: 2px 0 2px 12px;
          border-left: 3px solid #d4d4d8;
          color: #52525b;
        }

        /* 표 — 좁은 화면에서 가로 스크롤 */
        .md table {
          display: block;
          overflow-x: auto;
          width: max-content;
          max-width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          font-size: 14px;
        }
        .md th,
        .md td {
          border: 1px solid #e2e2e5;
          padding: 7px 11px;
          text-align: left;
          vertical-align: top;
          white-space: nowrap;
        }
        .md th {
          background: #ececee;
          font-weight: 600;
        }
        .md tbody tr:nth-child(even) {
          background: #fafafa;
        }

        /* 코드 */
        .md code {
          background: #e8e8ea;
          padding: 1.5px 5px;
          border-radius: 4px;
          font-size: 13px;
          font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
        }
        .md pre {
          background: #1e1e20;
          color: #e6e6e6;
          padding: 12px 14px;
          border-radius: 0 0 10px 10px;
          overflow-x: auto;
          margin: 0;
        }
        .md pre code {
          background: none;
          padding: 0;
          color: inherit;
          font-size: 12.5px;
        }

        /* 코드블록 헤더 (언어 라벨 + 복사 버튼) */
        .codewrap {
          margin: 10px 0;
        }
        .codebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background: #2a2a2e;
          border-radius: 10px 10px 0 0;
          padding: 5px 8px 5px 12px;
          min-height: 30px;
        }
        .codelang {
          font-size: 11.5px;
          color: #a1a1aa;
          font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
        }
        .copybtn {
          margin-left: auto;
          border: none;
          background: transparent;
          color: #a1a1aa;
          font-size: 11.5px;
          padding: 3px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.12s, color 0.12s;
        }
        .copybtn:hover {
          background: #3f3f46;
          color: #fafafa;
        }

        /* 답변 전체 복사 — 평소엔 숨기고 버블에 마우스를 올리면 보인다 */
        .copyall {
          display: block;
          margin: 10px 0 0 auto;
          border: 1px solid #dcdce0;
          background: #fff;
          color: #71717a;
          font-size: 11.5px;
          padding: 4px 10px;
          border-radius: 999px;
          cursor: pointer;
          opacity: 0;
          transition: opacity 0.15s, color 0.12s;
        }
        .md:hover .copyall {
          opacity: 1;
        }
        .copyall:hover {
          color: #111;
        }
        /* 터치 기기는 hover 가 없으므로 항상 보이게 */
        @media (hover: none) {
          .copyall {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
