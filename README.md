# devTalk

devNote 저장소의 문서를 임베딩·검색해, 질문하면 Gemini 가 그 기록을 근거로 답해주는 서버리스 RAG 채팅.

문서 소스는 **GitHub repo / 로컬 폴더 / Google Drive** 중 원하는 것을 쓸 수 있습니다.

![Architecture](/public/architecture.png)

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | Next.js 15 (App Router, TypeScript) + React 19 |
| 배포 | Vercel (API 라우트 = 서버리스 함수) |
| 답변 LLM | Gemini `3.5-flash-lite` → `3.5-flash` → `3.6-flash` 폴백 체인 |
| 임베딩 | `gemini-embedding-001` (768차원, 정규화) |
| VectorDB | Pinecone — `dev-note` 인덱스 (dense, 768차원, Cosine) |
| 렌더링 | react-markdown + remark-gfm (표·코드블록) |
| 문서 소스 | GitHub repo · 로컬 폴더 · Google Drive |

---

## 핵심 특징

| 영역 | 내용 |
|---|---|
| **문서 인덱싱** | `.md`/`.txt` 를 1000자·150자 overlap 으로 청킹 후 임베딩해 Pinecone 에 적재 |
| **증분 인덱싱** | 이미 넣은 파일은 `.indexed-github.json` 기록으로 건너뜀. 중간에 끊겨도 이어서 진행 |
| **RAG 검색** | 질문을 `RETRIEVAL_QUERY` 로 임베딩 → Pinecone top-5 검색 → 청크 + 출처를 컨텍스트로 주입 |
| **모델 폴백** | 무료 티어 쿼터가 모델별로 잡히므로, 429/503 시 다음 모델로 자동 전환 (`withRetry` 지수 백오프 4회) |
| **다중 소스** | GitHub API / 로컬 FS / Drive 서비스 계정을 각각 인덱싱 스크립트로 분리 |
| **지연 초기화** | Pinecone·Gemini 클라이언트를 사용 시점에 생성 → `next build` 가 키 없이 터지지 않음 |

---

## 폴더 구조

```text
devTalk/
├─ app/
│  ├─ api/chat/route.ts   # 채팅 서버리스 함수 (질문 → 검색 → 답변)
│  ├─ page.tsx            # 채팅 UI (Answer = 마크다운 렌더링)
│  └─ layout.tsx
├─ lib/
│  ├─ gemini.ts           # 임베딩 / 채팅(모델 폴백) / 이미지 설명
│  ├─ pinecone.ts         # 인덱스 검색·적재
│  ├─ chunk.ts            # 텍스트 청킹 (1000자, 150자 overlap)
│  ├─ id.ts               # 벡터 ID 를 ASCII 해시로 (한글 파일명 대응)
│  ├─ loadEnv.ts          # 인덱싱 스크립트용 환경변수 선로드
│  ├─ github.ts           # GitHub repo 에서 문서 읽기
│  ├─ localfiles.ts       # 로컬 폴더에서 문서 읽기
│  └─ drive.ts            # Google Drive 에서 문서 읽기 (서비스 계정)
├─ scripts/
│  ├─ index.ts            # 인덱싱 — Google Drive
│  ├─ index-github.ts     # 인덱싱 — GitHub repo
│  ├─ index-local.ts      # 인덱싱 — 로컬 폴더
│  └─ reset.ts            # Pinecone 비우기 + 진행 기록 삭제
├─ docs/                  # 구조·배포 가이드
├─ .env.example
└─ package.json
```

---

## 준비 (한 번만)

```bash
npm install
cp .env.example .env
```

**공통 (필수)**

| 변수 | 발급처 |
|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `PINECONE_API_KEY` | https://app.pinecone.io → API Keys |
| `PINECONE_INDEX` | `dev-note` |

**소스별 (택1 또는 병행)**

| 소스 | 변수 |
|---|---|
| GitHub | `GITHUB_REPO=owner/repo`, `GITHUB_BRANCH`(선택) — 공개 repo 는 인증 불필요 |
| 로컬 | `LOCAL_DOCS_DIR=D:/path/to/notes` |
| Drive | `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `DRIVE_FOLDER_ID` |

**Pinecone 인덱스 생성** — 콘솔에서 Manual configuration 으로
Dense / Dimensions **768** / Metric **cosine** / Name **dev-note**

> ⚠️ 차원(768)은 생성 후 못 바꿉니다. 임베딩도 768로 뽑으므로 반드시 일치해야 합니다.

---

## 실행

```bash
npm run index:github   # 인덱싱 — GitHub repo
npm run index:local    # 인덱싱 — 로컬 폴더
npm run index          # 인덱싱 — Google Drive
npm run reset          # Pinecone 비우기 + 진행 기록 삭제

npm run dev            # 채팅 UI → http://localhost:3000
```

### 노트를 추가·수정·삭제했을 때

| 상황 | 조치 |
|---|---|
| 노트 **추가** | `npm run index:github` — 새 파일만 자동 감지 |
| 노트 **수정** | `.indexed-github.json` 에서 그 줄을 지우고 → `npm run index:github` |
| 노트 **삭제** | 벡터가 자동으로 지워지지 **않음**. `npm run reset` 후 전체 재인덱싱 |

> ⚠️ 로컬 파일이 아니라 **GitHub API 로 읽습니다.** 반드시 `main` 에 push 한 뒤 실행하세요.
> ⚠️ **`next dev` 는 프로젝트당 하나만** 띄우세요. 두 개가 뜨면 같은 `.next` 를 서로 덮어써 반드시 깨집니다.

### 배포 (Vercel)

GitHub 에 올린 뒤 Vercel 에 연결하면 `git push` 시 자동 배포됩니다.
런타임 환경변수는 `GEMINI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX` 3개만 등록하면 됩니다.
(인덱싱 전용 변수 `GITHUB_REPO`·`LOCAL_DOCS_DIR`·`GOOGLE_*` 는 로컬에서만 사용)

> ⚠️ 개인 노트이므로 배포 시 URL 을 아는 사람은 누구나 접근할 수 있습니다. 공개 배포한다면 비밀번호/로그인을 추가하세요.

---

## 처리 흐름

**인덱싱 (로컬에서 수동 실행)**
문서 읽기(`.md`/`.txt`) → 청킹(1000자·150 overlap) → `gemini-embedding-001` 임베딩(768d) → Pinecone upsert

**채팅 (Vercel 서버리스)**

1. 질문을 `RETRIEVAL_QUERY` 로 임베딩
2. Pinecone 에서 top-5 유사 청크 + 출처 조회
3. 청크를 컨텍스트로 Gemini 호출 → 마크다운 답변 생성
4. 답변 + 출처 링크(유사도 %) 반환

> 출처 뒤 퍼센트는 **Pinecone 코사인 유사도**이지 정확도가 아닙니다.
> `gemini-embedding-001` 은 점수 범위가 압축돼 있어 **50% 부근이 기준선**입니다 —
> 70% 이상은 확실히 관련, 60~70% 는 부분적, 60% 미만은 사실상 무관.

---

## 트러블슈팅

| 증상 | 원인 / 대응 |
|---|---|
| `404 no longer available to new users` | 모델 EOL. `ListModels` 에 보여도 쓸 수 있다는 뜻이 아니니 실제 호출로 확인 후 `CHAT_MODELS` 교체 |
| `503 UNAVAILABLE` | 무료 티어 혼잡. 대개 일시적이며 `withRetry` 가 2·4·8·16초 백오프로 재시도 |
| `429 RESOURCE_EXHAUSTED` | 일일 한도 소진(모델당 20회 ≈ 하루 60회). 기다려도 안 풀리며 리셋은 **한국시간 오후 4시경** |
| `localhost:3000` Internal Server Error | `next dev` 중복 실행. node 프로세스 종료 → `.next` 삭제 → 하나만 재시작 |
| 답변은 "모른다"인데 출처가 5개 | score 무관하게 top-5 를 가져오기 때문. `MIN_SCORE = 0.6` 필터 필요 |
| Git Bash `curl` 한글 인코딩 오류 | 셸 문제. PowerShell 에서 `[Text.Encoding]::UTF8.GetBytes()` 로 바이트 전송 |

> 500 에러 확인 위치 — `GET /` 는 **dev 서버 터미널에만** 스택이 찍히고,
> `POST /api/chat` 은 dev 환경에서 원문 에러를 `detail` 필드로 내려주어 채팅 화면에 그대로 보입니다.

---

## 주의사항

- **임베딩 모델은 바꾸지 말 것.** 임베딩 공간이 달라 기존 벡터와 섞이면 검색이 망가집니다. 바꾸려면 `npm run reset` 후 전체 재인덱싱 필수. (채팅 모델 교체는 재인덱싱과 무관)
- **`rehype-raw` 는 붙이지 말 것.** 노트 속 HTML 이 DOM 에 그대로 주입됩니다. 기본 설정은 이스케이프하므로 안전합니다.
- Gemini 3.x 는 thinking 모델이라 지연·토큰이 늘 수 있습니다. RAG 답변은 `thinkingConfig: { thinkingLevel: "low" }` 가 체감 속도에 유리합니다.
- 지원 형식: 텍스트(`.md`/`.txt`), Google Docs, 이미지(Drive). PDF 는 건너뜁니다.
- Gemini 무료 티어는 입력이 학습에 쓰일 수 있으니 민감한 코드/키가 섞인 노트는 주의하세요.
- Pinecone 무료(Starter)는 장기 미사용 시 인덱스가 정지될 수 있습니다.

---

## 실행 화면

![DEV RAG 챗](/public/screenshots/rag.gif)
![DEV RAG 챗1](/public/screenshots/rag1.png)
![DEV RAG 챗2](/public/screenshots/rag2.png)
![DEV RAG 챗3](/public/screenshots/rag3.png)
