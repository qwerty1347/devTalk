// 인덱싱 서버리스 함수 (GitHub repo 소스): scripts/index-github.ts 의 웹 버전.
// UI 의 히든 패널에서 호출한다. 진행 상황을 NDJSON 으로 흘려보낸다.
//
// 스크립트와 다른 점 두 가지 (서버리스 제약):
//  1) 진행 기록을 파일(.indexed-github.json)이 아니라 Pinecone 에서 조회한다. (디스크가 없음)
//  2) 함수 실행 시간 상한이 있으므로 예산만큼만 처리하고 paused 를 내려준다. (클라이언트가 이어서 재호출)
import { NextRequest } from "next/server";
import {
  getDefaultBranch,
  listRepoDocs,
  fetchRepoFile,
  repoName,
} from "@/lib/github";
import { embed } from "@/lib/gemini";
import { chunkText } from "@/lib/chunk";
import { upsertChunks, indexedPaths, type NoteVector } from "@/lib/pinecone";
import { vectorId } from "@/lib/id";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Hobby 상한

// 한 요청에서 처리할 시간 예산. maxDuration 보다 넉넉히 낮게 둬서
// 마지막 파일 처리 도중 함수가 잘리지 않게 한다.
const BUDGET_MS = 45_000;

// 인덱싱 패널 비밀번호. 바꾸려면 이 한 줄만 고치면 된다.
const SECRET = "admin";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-index-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!process.env.GITHUB_REPO) {
    return new Response("GITHUB_REPO 가 설정되지 않았습니다.", { status: 500 });
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));

      try {
        const branch = await getDefaultBranch();
        const files = await listRepoDocs(branch);

        // 이미 적재된 문서는 건너뛴다 (증분 인덱싱)
        const done = await indexedPaths(files.map((f) => f.path));
        const todo = files.filter((f) => !done.has(f.path));

        send({
          type: "start",
          repo: repoName(),
          branch,
          total: files.length,
          todo: todo.length,
        });

        let processed = 0;
        let chunkCount = 0;

        for (const file of todo) {
          // 예산을 넘으면 중단하고 남은 개수를 알려준다. 클라이언트가 다시 호출해 이어간다.
          if (Date.now() - startedAt > BUDGET_MS) {
            send({ type: "paused", processed, chunks: chunkCount, remaining: todo.length - processed });
            return;
          }

          send({ type: "file", path: file.path, processed, todo: todo.length });

          const text = await fetchRepoFile(file.path, branch);
          const chunks = chunkText(text);
          const vectors: NoteVector[] = [];

          for (let i = 0; i < chunks.length; i++) {
            const values = await embed(chunks[i], "RETRIEVAL_DOCUMENT");
            vectors.push({
              id: vectorId("gh", file.path, i),
              values,
              metadata: {
                text: chunks[i],
                fileName: file.path,
                driveUrl: file.url, // 출처 링크 (메타 키는 재사용, 값은 GitHub URL)
                type: "text",
              },
            });
          }

          if (vectors.length) await upsertChunks(vectors);

          processed++;
          chunkCount += vectors.length;
          send({ type: "ok", path: file.path, chunks: vectors.length, processed, todo: todo.length });
        }

        send({ type: "done", processed, chunks: chunkCount, skipped: done.size });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // 프록시가 스트림을 모아뒀다 한 번에 보내지 않도록
      "X-Accel-Buffering": "no",
    },
  });
}
