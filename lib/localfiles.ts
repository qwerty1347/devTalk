import { readdirSync, statSync, readFileSync } from "fs";
import { join, relative, sep } from "path";

// 로컬 폴더의 문서를 읽는다. (인증·네트워크 불필요, 커밋 안 한 파일도 포함)

export type LocalFile = {
  path: string; // 절대 경로
  rel: string; // 기준 폴더 기준 상대 경로 (예: 01 Knowledge/FastAPI/x.md)
  name: string; // 파일명
  mtimeMs: number; // 수정 시각 (변경 감지용)
};

const SKIP_DIRS = new Set([".git", "node_modules", ".next", ".obsidian"]);

// 폴더를 재귀적으로 훑어 원하는 확장자 파일만 수집
export function listLocalDocs(
  dir: string,
  exts: string[] = [".md", ".txt"]
): LocalFile[] {
  const out: LocalFile[] = [];

  function walk(current: string) {
    for (const name of readdirSync(current)) {
      if (SKIP_DIRS.has(name)) continue;
      const p = join(current, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p);
      } else if (exts.some((e) => name.toLowerCase().endsWith(e))) {
        out.push({
          path: p,
          rel: relative(dir, p).split(sep).join("/"),
          name,
          mtimeMs: st.mtimeMs,
        });
      }
    }
  }

  walk(dir);
  return out;
}

export function readLocalFile(p: string): string {
  return readFileSync(p, "utf8");
}
