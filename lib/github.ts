// 공개 GitHub 저장소의 문서를 읽는다. (공개 repo는 인증 불필요)
// .env: GITHUB_REPO="owner/repo", (선택) GITHUB_BRANCH="main"
//
// - 기본 브랜치 조회 + 파일 트리 조회에만 GitHub API 사용 (총 2회 호출)
// - 실제 파일 내용은 raw.githubusercontent.com에서 받아옴 (API rate limit 미적용)

const REPO = process.env.GITHUB_REPO || ""; // "owner/repo"

export type RepoFile = {
  path: string; // repo 내 경로 (예: docs/intro.md)
  name: string; // 파일명
  url: string; // GitHub blob URL (출처 링크)
};

export function repoName(): string {
  return REPO;
}

// 기본 브랜치 알아내기 (GITHUB_BRANCH를 지정했으면 그걸 사용)
export async function getDefaultBranch(): Promise<string> {
  if (process.env.GITHUB_BRANCH) return process.env.GITHUB_BRANCH;
  const res = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`repo 조회 실패: ${res.status} (repo=${REPO})`);
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch || "main";
}

// repo 전체 파일 경로를 재귀적으로 가져와서 원하는 확장자만 필터 (트리 API 1회 호출)
export async function listRepoDocs(
  branch: string,
  exts: string[] = [".md", ".txt"]
): Promise<RepoFile[]> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/git/trees/${branch}?recursive=1`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (!res.ok) throw new Error(`트리 조회 실패: ${res.status}`);
  const data = (await res.json()) as { tree?: { path: string; type: string }[] };

  return (data.tree || [])
    .filter(
      (t) =>
        t.type === "blob" &&
        exts.some((e) => t.path.toLowerCase().endsWith(e))
    )
    .map((t) => ({
      path: t.path,
      name: t.path.split("/").pop() || t.path,
      url: `https://github.com/${REPO}/blob/${branch}/${t.path}`,
    }));
}

// 파일 원문 받기 (raw는 CDN이라 API rate limit에 안 걸림)
export async function fetchRepoFile(path: string, branch: string): Promise<string> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${REPO}/${branch}/${path}`
  );
  if (!res.ok) throw new Error(`다운로드 실패 (${path}): ${res.status}`);
  return res.text();
}
