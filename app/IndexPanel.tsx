"use client";

// 히든 인덱싱 패널. 헤더 오른쪽 끝 투명 영역을 5번 연타하면 열린다. (page.tsx 참고)
// confirm(실행 확인) → running(진행 로그) → result(완료 알림) 3단계.
// /api/index 가 NDJSON 으로 흘려주는 진행 상황을 그대로 찍고,
// 서버가 시간 예산 때문에 paused 를 내리면 자동으로 이어서 다시 호출한다.
import { useEffect, useRef, useState } from "react";

const MAX_ROUNDS = 20; // 무한 재호출 방지 (한 라운드 ≈ 45초)

type Phase = "confirm" | "running" | "result";
type Result = { kind: "success" | "empty" | "error"; title: string; detail: string };

// 라운드를 넘나들며 누적되는 집계. (서버는 라운드별 숫자만 알려준다)
type Totals = { processed: number; chunks: number; skipped: number };

export default function IndexPanel({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [secret, setSecret] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const running = phase === "running";

  // 새로고침해도 다시 안 치도록 (탭 닫으면 사라짐)
  useEffect(() => {
    setSecret(sessionStorage.getItem("devtalk:index-secret") ?? "");
  }, []);

  // 로그는 항상 맨 아래를 보여준다
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log, showLog]);

  // ESC 로 닫기 (진행 중에는 막는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, onClose]);

  const push = (line: string) => setLog((l) => [...l, line]);

  // 한 라운드 = 요청 1회. paused 로 끝나면 true 를 돌려주고 바깥에서 다시 부른다.
  async function runOnce(totals: Totals): Promise<boolean> {
    const res = await fetch("/api/index", {
      method: "POST",
      headers: { "x-index-secret": secret },
    });

    if (!res.ok || !res.body) {
      const body = (await res.text()).trim();
      const msg =
        res.status === 401
          ? "시크릿이 올바르지 않습니다."
          : res.status === 503
          ? "서버에 INDEX_SECRET 이 설정되지 않았습니다."
          : `${res.status} ${body}`;
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let paused = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? ""; // 마지막 조각은 다음 청크와 이어붙인다
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        switch (ev.type) {
          case "start":
            // 첫 라운드에서만 "이미 처리된 문서 수"를 확정한다
            if (totals.skipped < 0) totals.skipped = ev.total - ev.todo;
            setProgress({ done: totals.processed, total: totals.processed + ev.todo });
            push(`📦 ${ev.repo} @${ev.branch} — 문서 ${ev.total}개, 처리 대상 ${ev.todo}개`);
            break;
          case "file":
            push(`📄 ${ev.path}`);
            break;
          case "ok":
            totals.processed++;
            totals.chunks += ev.chunks;
            setProgress((p) => ({ ...p, done: totals.processed }));
            push(`   ✅ ${ev.chunks} chunks`);
            break;
          case "paused":
            paused = true;
            push(`⏸ 시간 제한 — ${ev.remaining}개 남음, 이어서 진행합니다…`);
            break;
          case "done":
            push("🎉 라운드 완료");
            break;
          case "error":
            throw new Error(ev.message);
        }
      }
    }
    return paused;
  }

  async function start() {
    if (running || !secret.trim()) return;
    sessionStorage.setItem("devtalk:index-secret", secret);
    setPhase("running");
    setLog([]);
    setProgress({ done: 0, total: 0 });

    const totals: Totals = { processed: 0, chunks: 0, skipped: -1 };

    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        if (!(await runOnce(totals))) break;
        if (round === MAX_ROUNDS) push("⚠️ 라운드 상한 도달 — 다시 실행해 이어가세요.");
      }
      const skipped = Math.max(totals.skipped, 0);
      setResult(
        totals.processed === 0
          ? {
              kind: "empty",
              title: "이미 최신 상태입니다",
              detail: `새로 인덱싱할 문서가 없습니다. (기존 ${skipped}개 문서는 이미 적재됨)`,
            }
          : {
              kind: "success",
              title: "인덱싱 완료",
              detail: `문서 ${totals.processed}개 · ${totals.chunks}개 chunk 를 적재했습니다. (기존 ${skipped}개는 건너뜀)`,
            }
      );
    } catch (e) {
      setResult({
        kind: "error",
        title: "인덱싱 실패",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setPhase("result");
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      className="ix-backdrop"
      onClick={() => !running && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="ix-card" onClick={(e) => e.stopPropagation()}>
        {/* ── 1단계: 실행 확인 ─────────────────────────── */}
        {phase === "confirm" && (
          <>
            <div className="ix-icon ix-icon-ask">↻</div>
            <h2 className="ix-title">문서 인덱싱을 실행할까요?</h2>
            <p className="ix-desc">
              GitHub 저장소의 <b>새 문서만</b> 임베딩해 Pinecone 에 적재합니다. 이미 적재된
              문서는 건너뜁니다.
            </p>

            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
              placeholder="INDEX_SECRET"
              className="ix-input"
              autoFocus
            />

            <div className="ix-actions">
              <button type="button" className="ix-btn ix-btn-ghost" onClick={onClose}>
                취소
              </button>
              <button
                type="button"
                className="ix-btn ix-btn-primary"
                onClick={start}
                disabled={!secret.trim()}
              >
                실행
              </button>
            </div>
          </>
        )}

        {/* ── 2단계: 진행 중 ───────────────────────────── */}
        {phase === "running" && (
          <>
            <div className="ix-head">
              <span className="ix-spinner" />
              <strong className="ix-head-title">인덱싱 진행 중</strong>
              <span className="ix-count">
                {progress.total > 0 ? `${progress.done} / ${progress.total}` : "준비 중…"}
              </span>
            </div>

            <div className="ix-bar">
              <div className="ix-bar-fill" style={{ width: `${pct}%` }} />
            </div>

            <div className="ix-log" ref={logRef}>
              {log.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>

            <p className="ix-note">창을 닫지 마세요. 문서가 많으면 몇 분 걸릴 수 있습니다.</p>
          </>
        )}

        {/* ── 3단계: 완료 알림 ─────────────────────────── */}
        {phase === "result" && result && (
          <>
            <div className={`ix-icon ix-icon-${result.kind}`}>
              {result.kind === "success" ? "✓" : result.kind === "empty" ? "≡" : "!"}
            </div>
            <h2 className="ix-title">{result.title}</h2>
            <p className="ix-desc">{result.detail}</p>

            {log.length > 0 && (
              <>
                <button
                  type="button"
                  className="ix-toggle"
                  onClick={() => setShowLog((v) => !v)}
                >
                  {showLog ? "로그 접기 ▲" : "로그 보기 ▼"}
                </button>
                {showLog && (
                  <div className="ix-log" ref={logRef}>
                    {log.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="ix-actions">
              {result.kind === "error" && (
                <button
                  type="button"
                  className="ix-btn ix-btn-ghost"
                  onClick={() => setPhase("confirm")}
                >
                  다시 시도
                </button>
              )}
              <button type="button" className="ix-btn ix-btn-primary" onClick={onClose} autoFocus>
                확인
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .ix-backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(17, 17, 17, 0.45);
          backdrop-filter: blur(2px);
          animation: ix-fade 0.15s ease-out;
          font-family: system-ui, sans-serif;
        }
        .ix-card {
          width: 100%;
          max-width: 420px;
          background: #fff;
          border-radius: 18px;
          padding: 26px 24px 20px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
          animation: ix-pop 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.2);
        }

        /* 상단 원형 아이콘 */
        .ix-icon {
          width: 52px;
          height: 52px;
          margin: 0 auto 14px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          line-height: 1;
        }
        .ix-icon-ask {
          background: #f4f4f5;
          color: #111;
        }
        .ix-icon-success {
          background: #e8f7ee;
          color: #12864a;
        }
        .ix-icon-empty {
          background: #f0f6ff;
          color: #0070f3;
        }
        .ix-icon-error {
          background: #fdeceb;
          color: #d93025;
          font-weight: 700;
        }

        .ix-title {
          margin: 0 0 6px;
          font-size: 17px;
          font-weight: 700;
          color: #111;
        }
        .ix-desc {
          margin: 0 0 18px;
          font-size: 13.5px;
          line-height: 1.6;
          color: #6b6b70;
          word-break: break-word;
        }
        .ix-desc b {
          color: #111;
          font-weight: 600;
        }

        .ix-input {
          width: 100%;
          padding: 11px 14px;
          font-size: 16px; /* 16px 미만이면 iOS 에서 확대됨 */
          border: 1px solid #ddd;
          border-radius: 11px;
          outline: none;
          text-align: center;
          box-sizing: border-box;
        }
        .ix-input:focus {
          border-color: #111;
        }

        .ix-actions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }
        .ix-btn {
          flex: 1;
          padding: 12px 0;
          font-size: 14.5px;
          font-weight: 600;
          border: none;
          border-radius: 11px;
          cursor: pointer;
        }
        .ix-btn-ghost {
          background: #f4f4f5;
          color: #52525b;
        }
        .ix-btn-ghost:hover {
          background: #ececee;
        }
        .ix-btn-primary {
          background: #111;
          color: #fff;
        }
        .ix-btn-primary:disabled {
          background: #c9c9cd;
          cursor: default;
        }

        /* 진행 중 헤더 */
        .ix-head {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 12px;
        }
        .ix-head-title {
          font-size: 15px;
          color: #111;
        }
        .ix-count {
          margin-left: auto;
          font-size: 12.5px;
          color: #9a9a9a;
          font-variant-numeric: tabular-nums;
        }
        .ix-spinner {
          width: 15px;
          height: 15px;
          border: 2px solid #e4e4e7;
          border-top-color: #111;
          border-radius: 50%;
          animation: ix-spin 0.7s linear infinite;
        }

        .ix-bar {
          height: 5px;
          background: #ececee;
          border-radius: 999px;
          overflow: hidden;
        }
        .ix-bar-fill {
          height: 100%;
          background: #111;
          border-radius: 999px;
          transition: width 0.3s ease;
        }

        .ix-log {
          margin-top: 12px;
          max-height: 240px;
          overflow-y: auto;
          padding: 10px 12px;
          text-align: left;
          background: #f7f7f8;
          border: 1px solid #ececec;
          border-radius: 11px;
          font-size: 12.5px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-all;
          color: #3f3f46;
        }

        .ix-note {
          margin: 12px 0 0;
          font-size: 12px;
          color: #9a9a9a;
        }
        .ix-toggle {
          border: none;
          background: none;
          padding: 0;
          font-size: 12.5px;
          color: #9a9a9a;
          cursor: pointer;
        }

        @keyframes ix-fade {
          from {
            opacity: 0;
          }
        }
        @keyframes ix-pop {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.97);
          }
        }
        @keyframes ix-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
