# devTalk

dev-notes 저장소의 문서를 임베딩·검색해, 질문하면 Gemini가 그 기록을 근거로
답해주는 서버리스 RAG 채팅. 소스는 **GitHub repo / 로컬 폴더 / Google Drive** 중
원하는 것을 쓸 수 있다.

## 스택

- **Next.js (App Router, TypeScript)** + **Vercel** (API 라우트 = 서버리스 함수)
- **Gemini 2.5 Flash** (답변) + **gemini-embedding-001** (임베딩, 768차원)
- **Pinecone** (dense / 768 / cosine, 인덱스명 `dev-note`)
- 문서 소스: **GitHub repo** · **로컬 폴더** · **Google Drive** (택1 또는 병행)

## 아키텍처
![Architecture](/public/architecture.png)


### 단계별 상세

```
[ 인덱싱 · 로컬에서 수동 실행 ]

  GitHub repo ┐
  로컬 폴더    ├─▶ 문서 읽기 ─▶ 청킹 ─────▶ gemini-embedding-001 ─▶ Pinecone
  Google Drive┘   (.md/.txt)   (1000자·        (768d · 정규화)      (dense·cosine)
                               150 overlap)


[ 채팅 · Vercel 서버리스 (요청 시에만 실행) ]

  브라우저
    │  ① 질문
    ▼
  /api/chat ──② 질문 임베딩(RETRIEVAL_QUERY)──▶ Pinecone 검색 (top-5)
    │                                              │
    │  ◀──────────── ③ 관련 청크 + 출처 ────────────┘
    ▼
  Gemini 2.5 Flash ──④ 답변 생성──▶ 답변 + 참고 출처 링크 ──▶ 브라우저
```

## 폴더 구조

```
devTalk/
├─ app/
│  ├─ api/chat/route.ts   # 채팅 서버리스 함수 (질문→검색→답변)
│  ├─ page.tsx            # 채팅 UI
│  └─ layout.tsx
├─ lib/
│  ├─ gemini.ts           # 임베딩 / 채팅 / 이미지 설명 (클라이언트 지연 초기화)
│  ├─ pinecone.ts         # 인덱스 검색·적재 (클라이언트 지연 초기화)
│  ├─ chunk.ts            # 텍스트 청킹 (1000자, 150자 overlap)
│  ├─ id.ts               # 벡터 ID를 ASCII 해시로 (한글 파일명 대응)
│  ├─ loadEnv.ts          # 인덱싱 스크립트용 환경변수 선로드
│  ├─ github.ts           # GitHub repo에서 문서 읽기
│  ├─ localfiles.ts       # 로컬 폴더에서 문서 읽기
│  └─ drive.ts            # Google Drive에서 문서 읽기 (서비스 계정)
├─ scripts/
│  ├─ index.ts            # 인덱싱 — Google Drive
│  ├─ index-github.ts     # 인덱싱 — GitHub repo
│  ├─ index-local.ts      # 인덱싱 — 로컬 폴더
│  └─ reset.ts            # Pinecone 비우기 + 진행 기록 삭제
├─ docs/                  # 구조·배포 가이드
├─ .env.example
└─ package.json
```

## 준비 (한 번만)

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경변수 채우기
`.env.example` 을 복사해 `.env`(또는 `.env.local`) 를 만들고 값을 채운다.
```bash
cp .env.example .env
```

**공통 (필수)**
- `GEMINI_API_KEY` — https://aistudio.google.com/apikey
- `PINECONE_API_KEY` — https://app.pinecone.io → API Keys
- `PINECONE_INDEX` — `dev-note`

**쓰는 소스에 따라 (택1)**
- GitHub: `GITHUB_REPO=owner/repo` (공개 repo는 인증 불필요), `GITHUB_BRANCH`(선택)
- 로컬: `LOCAL_DOCS_DIR=D:/path/to/notes`
- Drive: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `DRIVE_FOLDER_ID`

### 3. Pinecone 인덱스 생성
콘솔에서 **Manual configuration** 으로:
- Vector type **Dense** / Dimensions **768** / Metric **cosine** / Name **dev-note**

> ⚠️ 차원(768)은 생성 후 못 바꾼다. 임베딩도 768로 뽑으므로 반드시 일치해야 한다.

## 사용

### 자료 인덱싱 (소스별, 자료가 늘면 다시 실행)
```bash
npm run index:github   # GitHub repo
npm run index:local    # 로컬 폴더
npm run index          # Google Drive
```
- 텍스트/마크다운은 그대로, 이미지(Drive)는 Gemini Flash 설명으로 변환 후 임베딩
- **증분 인덱싱**: 이미 넣은 파일은 건너뜀. 중간에 끊겨도 다시 돌리면 이어서 진행
- 처음부터 다시 넣으려면 `npm run reset` (Pinecone 비우기 + 진행 기록 삭제)

### 채팅 UI 띄우기 (로컬)
```bash
npm run dev
```
브라우저에서 http://localhost:3000 접속.

### 배포 (Vercel)
GitHub에 올린 뒤 Vercel에 연결하면 `git push` 시 자동 배포된다.
런타임에 필요한 아래 값을 **Vercel → Settings → Environment Variables** 에 등록한다.
```
GEMINI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX
```
(인덱싱 전용 변수 `GITHUB_REPO`·`LOCAL_DOCS_DIR`·`GOOGLE_*` 는 로컬에서만 쓰므로 불필요)

> ⚠️ 개인 노트이므로 배포 시 URL을 아는 사람은 누구나 접근할 수 있다.
> 공개 배포한다면 간단한 비밀번호/로그인을 추가할 것.

## 메모

- Pinecone/Gemini 클라이언트는 **지연 초기화**한다. 모듈 로드가 아닌 실제 사용
  시점에 생성해, `next build`(page data 수집)에서 키 없이 터지는 문제를 방지.
- 지원 형식: 텍스트(`.md`/`.txt`), Google Docs, 이미지(Drive). PDF는 현재 건너뜀.
- Gemini 무료 티어는 입력이 모델 학습에 쓰일 수 있으니, 민감한 코드/키가 섞인
  노트는 주의.
- Pinecone 무료(Starter)는 장기 미사용 시 인덱스가 정지될 수 있다.
