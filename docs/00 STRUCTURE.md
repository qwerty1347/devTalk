# devTalk

서버리스 RAG 채팅 — Google Drive에 정리해 둔 개발 기록(텍스트/이미지)을 임베딩·검색해
질문하면 Gemini가 내 기록 기반으로 답해주는 개인용 프로젝트.

## 스택

| 구분 | 선택 |
|------|------|
| 프레임워크 | Next.js (App Router, TypeScript) |
| 배포 | Vercel (API 라우트 = 서버리스 함수) |
| LLM | Google Gemini 2.5 Flash |
| 임베딩 | gemini-embedding-001 (text-only) |
| 벡터 DB | Pinecone |
| 자료 소스 | Google Drive (서비스 계정 + 폴더 공유) |

## 동작 흐름

```
[인덱싱: 가끔 수동 실행]
Google Drive ─► 파일 읽기 ─► (이미지는 Flash로 설명/OCR) ─► 청킹
            ─► gemini-embedding-001 ─► Pinecone upsert (원본 Drive 링크는 메타데이터)

[채팅: 서버리스 함수, 요청 시에만 실행]
질문 ─► gemini-embedding-001(query) ─► Pinecone 검색(top-k)
     ─► 검색 결과 + 질문 ─► Gemini 2.5 Flash ─► 답변(+ 원본 Drive 링크)
```

- **인덱싱(쓰기)**과 **채팅(읽기)**은 분리. 인덱싱은 새 자료 생길 때만 돌림.
- 이미지는 `gemini-embedding-001`이 텍스트 전용이라, Flash로 먼저 텍스트 설명을 뽑아 임베딩.

## 디렉터리 구조

```
devTalk/
├─ app/
│  ├─ api/
│  │  └─ chat/
│  │     └─ route.ts        # 채팅 서버리스 함수: 질문→검색→Gemini 답변
│  ├─ page.tsx              # 채팅 UI
│  └─ layout.tsx
├─ lib/
│  ├─ drive.ts              # Google Drive API (서비스 계정 인증, 파일 목록/다운로드)
│  ├─ gemini.ts             # 임베딩 / 채팅 / 이미지 설명 호출
│  ├─ pinecone.ts           # 인덱스 생성·검색·upsert
│  └─ chunk.ts              # 텍스트 청킹 유틸
├─ scripts/
│  └─ index.ts              # 인덱싱 스크립트(수동 실행): Drive→임베딩→Pinecone
├─ .env.local              # 환경변수 (git 제외)
├─ .env.example            # 환경변수 템플릿
├─ next.config.js
├─ package.json
├─ tsconfig.json
└─ STRUCTURE.md            # 이 문서
```

## 환경변수 (.env.example)

```bash
# Gemini
GEMINI_API_KEY=

# Pinecone
PINECONE_API_KEY=
PINECONE_INDEX=devnotes

# Google Drive (서비스 계정)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
DRIVE_FOLDER_ID=            # 인덱싱할 Drive 폴더 ID
```

## 주요 파일 역할

| 파일 | 역할 |
|------|------|
| `scripts/index.ts` | Drive에서 파일을 읽어 청킹·임베딩 후 Pinecone에 적재. `npm run index`로 수동 실행 |
| `lib/drive.ts` | 서비스 계정으로 Drive 인증, 폴더 내 파일 목록·다운로드, Google Docs는 텍스트 export |
| `lib/gemini.ts` | `embed(text, taskType)`, `chat(messages, context)`, `describeImage(bytes)` |
| `lib/pinecone.ts` | 인덱스 핸들, `upsert(vectors)`, `query(vector, topK)` |
| `lib/chunk.ts` | 긴 텍스트를 검색 단위로 분할 (오버랩 포함) |
| `app/api/chat/route.ts` | 질문 임베딩 → Pinecone 검색 → 컨텍스트 구성 → Gemini Flash 답변 |
| `app/page.tsx` | 입력창 + 답변 표시 + 참고한 원본 Drive 링크 |

## 결정 필요 (스캐폴딩 전)

- [ ] 이미지 처리 포함 여부 — 텍스트만 먼저 / 이미지(Flash 설명)까지
- [ ] 임베딩 차원 — **768**(가볍고 충분, 추천) / 1536 / 3072
      → Pinecone 인덱스 생성 시 고정되므로 먼저 정해야 함
- [ ] task_type 분리 — 저장 시 `RETRIEVAL_DOCUMENT`, 질의 시 `RETRIEVAL_QUERY` (검색 품질 ↑)

## 메모

- Pinecone 무료(Starter) 플랜은 장기간 미사용 시 인덱스가 정지/삭제될 수 있음.
- Gemini 무료 티어는 입력이 모델 학습에 사용될 수 있으니, 민감한 코드/키가 섞인 노트는 주의.
