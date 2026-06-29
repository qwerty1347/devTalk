# devTalk

Google Drive에 정리해 둔 개발 기록(텍스트/이미지)을 임베딩·검색해, 질문하면
Gemini가 내 기록을 근거로 답해주는 서버리스 RAG 채팅.

## 스택

- **Next.js (App Router, TypeScript)** + **Vercel** (API 라우트 = 서버리스 함수)
- **Gemini 2.5 Flash** (답변) + **gemini-embedding-001** (임베딩, 768차원)
- **Pinecone** (dense / 768 / cosine, 인덱스명 `devnotes`)
- **Google Drive** (서비스 계정으로 폴더 읽기)

## 폴더 구조

```
devTalk/
├─ app/
│  ├─ api/chat/route.ts   # 채팅 서버리스 함수 (질문→검색→답변)
│  ├─ page.tsx            # 채팅 UI
│  └─ layout.tsx
├─ lib/
│  ├─ drive.ts            # Drive API (서비스 계정)
│  ├─ gemini.ts           # 임베딩 / 채팅 / 이미지 설명
│  ├─ pinecone.ts         # 인덱스 검색·적재
│  └─ chunk.ts            # 텍스트 청킹
├─ scripts/index.ts       # 인덱싱 스크립트 (로컬에서 수동 실행)
├─ .env.example
└─ package.json
```

## 준비 (한 번만)

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경변수 채우기
`.env.example` 을 복사해 `.env.local` 을 만들고 값을 채웁니다.
```bash
cp .env.example .env.local
```
- `GEMINI_API_KEY` — https://aistudio.google.com/apikey 에서 발급
- `PINECONE_API_KEY` — https://app.pinecone.io → API Keys
- `PINECONE_INDEX` — `devnotes` (직접 만든 인덱스 이름)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` — GCP 서비스 계정 JSON 키에서
- `DRIVE_FOLDER_ID` — 인덱싱할 Drive 폴더 URL 끝의 ID

### 3. Pinecone 인덱스 생성
콘솔에서 **Manual configuration** 으로:
- Vector type: **Dense**
- Dimensions: **768**
- Metric: **cosine**
- Name: **devnotes**

> ⚠️ 차원(768)은 생성 후 못 바꿉니다. 임베딩도 768로 뽑으므로 반드시 일치해야 합니다.

### 4. Drive 폴더 공유
인덱싱할 Drive 폴더를 **서비스 계정 이메일**(`...@....iam.gserviceaccount.com`)에
"보기" 권한으로 공유합니다.

## 사용

### 자료 인덱싱 (자료가 늘면 다시 실행)
```bash
npm run index
```
Drive 폴더의 텍스트/마크다운/Google Docs는 그대로, 이미지는 Gemini Flash가
설명을 뽑아 임베딩한 뒤 Pinecone에 저장합니다.

### 채팅 UI 띄우기 (로컬)
```bash
npm run dev
```
브라우저에서 http://localhost:3000 접속.

### 배포 (선택)
GitHub에 올린 뒤 Vercel에 연결하고, `.env.local` 의 값들을 Vercel 환경변수에
등록하면 `git push` 시 자동 배포됩니다.

> ⚠️ 개인 노트이므로 배포 시 URL을 아는 사람은 누구나 접근할 수 있습니다.
> 공개 배포한다면 간단한 비밀번호/로그인을 추가하세요.

## 메모

- 지원 형식: 텍스트(`text/*`), Google Docs, 이미지(`image/*`). PDF는 현재 건너뜀.
- Gemini 무료 티어는 입력이 모델 학습에 쓰일 수 있으니, 민감한 코드/키가 섞인
  노트는 주의하세요.
- Pinecone 무료(Starter)는 장기 미사용 시 인덱스가 정지될 수 있습니다.
