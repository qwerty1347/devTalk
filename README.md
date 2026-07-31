# devTalk

devNote 저장소의 문서를 임베딩·검색해, 질문하면 Gemini가 그 기록을 근거로
답해주는 서버리스 RAG 채팅. 소스는 **GitHub repo / 로컬 폴더 / Google Drive** 중
원하는 것을 쓸 수 있다.

## 스택

- **Next.js (App Router, TypeScript)** + **Vercel** (API 라우트 = 서버리스 함수)
- **Gemini 3.5 Flash Lite** (답변, 소진 시 3.5-flash → 3.6-flash 폴백)
  + **gemini-embedding-001** (임베딩, 768차원)
- 답변 렌더링: **react-markdown + remark-gfm** (표·코드블록)
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
  Gemini 3.5 Flash Lite ──④ 답변 생성(마크다운)──▶ 답변 + 출처 링크 ──▶ 브라우저
```

## 폴더 구조

```
devTalk/
├─ app/
│  ├─ api/chat/route.ts   # 채팅 서버리스 함수 (질문→검색→답변)
│  ├─ page.tsx            # 채팅 UI (Answer = 마크다운 렌더링)
│  └─ layout.tsx
├─ lib/
│  ├─ gemini.ts           # 임베딩 / 채팅(모델 폴백) / 이미지 설명 (지연 초기화)
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
# npm run index          # Google Drive
```
- 텍스트/마크다운은 그대로, 이미지(Drive)는 Gemini Flash 설명으로 변환 후 임베딩
- **증분 인덱싱**: 이미 넣은 파일은 건너뜀. 중간에 끊겨도 다시 돌리면 이어서 진행
- 처음부터 다시 넣으려면 `npm run reset` (Pinecone 비우기 + 진행 기록 삭제)

#### 노트를 추가·수정·삭제했을 때

진행 기록은 `.indexed-github.json`(로컬 전용, gitignore됨)에 `파일경로: true` 로 남는다.
이 기록을 기준으로 건너뛰므로, 상황별로 처리가 다르다.

| 상황 | 조치 |
|---|---|
| 노트 **추가** | `npm run index:github` — 새 파일만 자동 감지 |
| 노트 **수정** | `.indexed-github.json`에서 그 줄을 지우고 → `npm run index:github` |
| 노트 **삭제** | 벡터가 자동으로 지워지지 **않음**. `npm run reset` 후 전체 재인덱싱 |
| 전체 재구축 | `npm run reset` → `npm run index:github` |

> ⚠️ 로컬 파일이 아니라 **GitHub API로 읽는다.** 반드시 `main`에 push한 뒤 실행할 것.
> dev 서버는 켜둔 채로 인덱싱해도 무관하다.

실행 예시 (문서 1개 추가 후):
```
📦 qwerty1347/devNote (@main) 문서 목록 가져오는 중...
   23개 문서(.md/.txt) 발견

📄 Database/Elasticsearch 쿼리 가이드 (auth_apikey).md
   ✅ 21 chunks

🎉 완료! 21개 chunk 저장, 22개 문서는 이미 처리되어 건너뜀.
```

인덱스에 실제로 들어갔는지 확인:
```bash
npx tsx -e "import './lib/loadEnv'; import {Pinecone} from '@pinecone-database/pinecone'; const pc=new Pinecone({apiKey:process.env.PINECONE_API_KEY!}); pc.index(process.env.PINECONE_INDEX||'dev-note').describeIndexStats().then(s=>console.log('총 벡터:', s.totalRecordCount))"
```

### 채팅 UI 띄우기 (로컬)
```bash
npm run dev
```
브라우저에서 http://localhost:3000 접속.

> ⚠️ **`next dev`는 프로젝트당 하나만 띄울 것.** 두 개가 뜨면 같은 `.next` 폴더를
> 서로 덮어써서 반드시 깨진다. (→ 트러블슈팅 «Internal Server Error»)

### 배포 (Vercel)
GitHub에 올린 뒤 Vercel에 연결하면 `git push` 시 자동 배포된다.
런타임에 필요한 아래 값을 **Vercel → Settings → Environment Variables** 에 등록한다.
```
GEMINI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX
```
(인덱싱 전용 변수 `GITHUB_REPO`·`LOCAL_DOCS_DIR`·`GOOGLE_*` 는 로컬에서만 쓰므로 불필요)

> ⚠️ 개인 노트이므로 배포 시 URL을 아는 사람은 누구나 접근할 수 있다.
> 공개 배포한다면 간단한 비밀번호/로그인을 추가할 것.

## 답변 화면 읽는 법

### «참고한 기록» 뒤의 퍼센트

```
🔗 Web/UploadFile vs bytes.md (76%)
```

**Pinecone 코사인 유사도 점수**다. 정확도·신뢰도가 아니다.
`app/page.tsx` 가 `search()` 가 돌려준 match score 에 100을 곱해 % 모양으로만 보여준다.

```tsx
🔗 {s.fileName} ({(s.score * 100).toFixed(0)}%)
```

의미는 «질문 임베딩과 이 청크 임베딩이 의미적으로 얼마나 가까운가» 이다.
«이 답변이 76% 정확하다» 가 아니다.

> ⚠️ `gemini-embedding-001` 은 점수 범위가 압축돼 있어 **무관한 텍스트도 50% 밑으로
> 잘 안 떨어진다.** 0%가 기준선이 아니라 **50% 부근이 기준선**이라, 퍼센트로 보여주면
> 오해를 부르는 지표다.

실측값:

| 질문 | 최고 score | 실제 관련성 |
|---|---|---|
| "UploadFile이랑 bytes 차이" | 76% | 정확히 맞는 노트 |
| "Elasticsearch auth_apikey" | 77% | 정확히 맞는 노트 |
| "오늘 서울 날씨 어때?" | 53% | 전혀 무관 |

읽는 눈금:

| 표시값 | 의미 |
|---|---|
| 70% 이상 | 확실히 관련 있는 노트 |
| 60~70% | 관련은 있으나 부분적 |
| 60% 미만 | 사실상 무관 (걸러야 할 구간) |

헷갈리면 등급 표시로 바꾸거나 아예 숫자를 빼도 된다. 사용자가 판단에 쓸 지표는 아니다.
```tsx
🔗 {s.fileName} {s.score >= 0.7 ? "●●●" : s.score >= 0.6 ? "●●" : "●"}
```

근본 대응은 60% 미만을 아예 안 보여주는 것 → 트러블슈팅 4번 참고.

### 답변 서식 (마크다운)

답변은 마크다운으로 오고 `react-markdown` + `remark-gfm` 으로 렌더링한다.
표는 GFM 확장이라 `remark-gfm` 이 **반드시** 필요하다.

- `lib/gemini.ts` 프롬프트의 `[답변 형식]` 절이 표·코드펜스를 쓰도록 지시한다
- `app/page.tsx` 의 `Answer` 컴포넌트가 렌더링하고, 표/코드 스타일은 `<style jsx global>`
  로 페이지에 한 번만 주입한다
- user 메시지는 평문(`pre-wrap`), assistant 메시지만 마크다운(`normal`)이다.
  마크다운에 `pre-wrap` 이 걸리면 줄바꿈이 이중으로 먹어 문단이 벌어진다

> ⚠️ **`rehype-raw` 는 붙이지 말 것.** 노트 속 HTML이 그대로 DOM에 주입된다.
> 기본 설정은 HTML을 이스케이프하므로 XSS 위험이 없다.

## 실행 화면

![DEV RAG 챗](/public/screenshots/rag.gif)
![DEV RAG 챗1](/public/screenshots/rag1.png)
![DEV RAG 챗2](/public/screenshots/rag2.png)
![DEV RAG 챗3](/public/screenshots/rag3.png)

## 트러블슈팅

### 0. 500 에러의 원인을 확인하는 방법

브라우저에 «Internal Server Error» 만 떠서 원인을 못 보는 상황이 잦다. 500은 두 종류이고
확인 방법이 다르다.

| 어디서 난 500 | 확인 위치 |
|---|---|
| `GET /` (페이지 자체) | **dev 서버 터미널 콘솔에만** 스택이 찍힌다. 브라우저엔 본문 없음 |
| `POST /api/chat` | 응답 JSON + 채팅 화면. 터미널에도 찍힌다 |

`/api/chat` 은 dev 환경에서 원문 에러를 `detail` 필드로 함께 내려주므로, **채팅 화면에
코드블록으로 원인이 그대로 보인다.** 터미널을 안 봐도 된다.
(`process.env.NODE_ENV !== "production"` 조건이라 프로덕션에서는 빠진다)

브라우저 DevTools → Network → 해당 요청 → Response 로도 같은 JSON을 볼 수 있다.

터미널 로그를 파일로 남겨 나중에 보려면 (PowerShell):
```powershell
npm run dev 2>&1 | Tee-Object -FilePath dev.log
```

### 1. `404 — This model is no longer available to new users`

```json
{"error":{"code":404,"message":"This model models/gemini-2.5-flash is no longer available to new users.","status":"NOT_FOUND"}}
```

모델이 EOL 된 것이다. `gemini-2.5-flash`는 신규 사용자 차단됨 → `lib/gemini.ts` 의
`CHAT_MODELS` 배열(3.5-flash-lite → 3.5-flash → 3.6-flash)로 교체했다.

> ⚠️ `ListModels` 응답에 모델명이 보여도 쓸 수 있다는 뜻이 아니다. `gemini-2.5-flash`는
> 목록에는 그대로 나오면서 `generateContent` 만 404가 난다. 반드시 실제 호출로 확인할 것.

지금 이 키로 쓸 수 있는 모델 확인:
```bash
KEY=$(grep '^GEMINI_API_KEY=' .env | cut -d= -f2-)
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$KEY&pageSize=200" \
  | grep -o '"name": "models/[^"]*"'
```

특정 모델이 진짜 응답하는지 확인:
```bash
curl -sS -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=$KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"role":"user","parts":[{"text":"say ok"}]}]}'
```

### 2. `503 UNAVAILABLE` / `429 RESOURCE_EXHAUSTED`

```json
{"error":{"code":503,"message":"This model is currently experiencing high demand...","status":"UNAVAILABLE"}}
```

**코드 버그가 아니라 무료 티어 혼잡이다.** `lib/gemini.ts`의 `withRetry`가 429/500/503에
대해 2·4·8·16초 지수 백오프로 4번 재시도하는데, 그 30초 동안 계속 503이면 그대로 던진다.

dev 서버 로그에 재시도 흔적이 남으므로 그것으로 판별한다:
```
⏳ chat 503 — 2s 후 재시도 (1/5)
⏳ chat 503 — 4s 후 재시도 (2/5)
...
POST /api/chat 500 in 38605ms
```

대응:
- 대개 **일시적**이라 잠시 후 재시도하면 풀린다
- 자주 겪으면 덜 혼잡한 모델로 교체 (아래는 5회 호출 실측)

  | 모델 | 결과 | 5회 소요 |
  |---|---|---|
  | `gemini-3.6-flash` | 5/5 | 10초 |
  | `gemini-3.5-flash` | 5/5 | 8초 |
  | `gemini-3.5-flash-lite` | 5/5 | **5초** |
  | `gemini-3.1-flash-lite` | 5/5 | 55초 ⚠️ |

#### 429는 «일일 한도» 라 성격이 다르다

503(혼잡)은 잠시 뒤 풀리지만, 429는 그날 몫을 다 쓴 것이라 **기다려도 안 풀린다.**
에러 본문에 한도가 그대로 찍혀 있다.

```
"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
"quotaValue": "20",  "model": "gemini-3.6-flash"
```

핵심은 쿼터가 **모델별로 따로** 잡힌다는 것(`PerProjectPerModel`). 한 모델이 소진돼도
다른 모델은 살아 있다. 그래서 `lib/gemini.ts` 에 **모델 폴백 체인**을 넣었다.

```ts
export const CHAT_MODELS = [
  "gemini-3.5-flash-lite", // 가장 빠르고 혼잡이 덜하다
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];
```

`chat()` 이 앞에서부터 시도하고, `withRetry` 까지 실패하면 다음 모델로 넘어간다.

| 모델 | 일일 한도(무료) |
|---|---|
| `gemini-3.5-flash-lite` | 20회 |
| `gemini-3.5-flash` | 20회 |
| `gemini-3.6-flash` | 20회 |

즉 채팅 상한은 **하루 약 60회**다. 임베딩(`gemini-embedding-001`)은 별도 한도이고
훨씬 여유롭다.

> 리셋은 **태평양 자정** 기준 = 한국시간 **오후 4시경**. "내일 아침"이 아니라
> 오후 4시가 하루 경계다.

사용자에게 Google 원문 JSON이 노출되지 않도록 `app/api/chat/route.ts` 에서
«지금 AI 서버가 혼잡하거나 무료 사용량을 초과했습니다» 로 치환한다. (원문은 dev 환경에서
`detail` 필드로만 내려간다 → 트러블슈팅 0번)

### 3. `localhost:3000` 에서 Internal Server Error

`.next` 관련 ENOENT/EBUSY가 로그에 도배된다:
```
⨯ ENOENT: ... .next\routes-manifest.json
⨯ ENOENT: ... .next\server\app\page.js
<w> EBUSY: resource busy or locked, rename ... 1.pack.gz
GET / 500
```

원인은 **`next dev` 중복 실행**이다. 두 프로세스가 같은 `.next`를 동시에 쓰면서
한쪽이 참조하던 빌드 산출물을 다른 쪽이 덮어써 버린 것. 앱 코드 문제가 아니다.

복구 (PowerShell):
```powershell
# 1) 포트 3000을 잡고 있는 프로세스 확인
Get-NetTCPConnection -State Listen -LocalPort 3000 | Select-Object OwningProcess

# 2) devTalk node 프로세스 전부 종료
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'devTalk' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# 3) 깨진 빌드 캐시 삭제 후 하나만 재시작
Remove-Item -Recurse -Force .next
npm run dev
```

### 4. 답변은 «모른다»인데 출처는 5개가 붙는다

`app/api/chat/route.ts` 가 score와 무관하게 **무조건 top-5를 가져오기 때문**이다.
무관한 질문에도 늘 문서 5개가 «참고한 기록»에 붙어서, 하드코딩된 응답처럼 보인다.

실측 score 분포 — 경계가 **0.6** 부근이다.

| | score |
|---|---|
| 관련 질문 | 0.64 ~ 0.77 |
| 무관한 질문 | 0.51 ~ 0.53 |

임계값 필터를 넣으면 해결된다:
```ts
const MIN_SCORE = 0.6;
const matches = (await search(queryVector, 8)).filter(m => (m.score ?? 0) >= MIN_SCORE);

if (matches.length === 0) {
  return NextResponse.json({
    answer: "관련된 기록을 찾지 못했습니다. 다른 표현으로 질문해 보시겠어요?",
    sources: [],
  });
}
```

### 5. Git Bash 에서 curl 로 한글 질문 시 «인코딩 오류» 응답

Git Bash가 UTF-8을 깨뜨려서 생기는 **셸 문제이지 앱 버그가 아니다.**
PowerShell에서 바이트로 명시해 보낼 것:
```powershell
$body = [System.Text.Encoding]::UTF8.GetBytes('{"question":"질문내용"}')
$r = Invoke-WebRequest http://localhost:3000/api/chat -Method POST `
       -ContentType 'application/json; charset=utf-8' -Body $body -UseBasicParsing
[System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
```
(`curl -o /dev/null -w "%{http_code}"` 조합도 이 환경에서 `000`을 뱉으니 쓰지 말 것)

## 메모

- Pinecone/Gemini 클라이언트는 **지연 초기화**한다. 모듈 로드가 아닌 실제 사용
  시점에 생성해, `next build`(page data 수집)에서 키 없이 터지는 문제를 방지.
- **임베딩 모델은 바꾸지 말 것.** `gemini-embedding-2` 가 목록에 있고 호출도 되지만,
  임베딩 공간이 달라 기존 벡터와 섞이면 검색이 망가진다. 바꾸려면 `npm run reset` 후
  전체 재인덱싱이 필수. 채팅 모델 교체는 재인덱싱과 무관하다.
- Gemini 3.x는 **thinking 모델**이라 응답에 `thoughtSignature`가 붙고 2.5 대비 지연·토큰이
  늘 수 있다. RAG 답변엔 사고량을 줄이는 편이 체감 속도에 낫다:
  `config: { thinkingConfig: { thinkingLevel: "low" } }`
- 지원 형식: 텍스트(`.md`/`.txt`), Google Docs, 이미지(Drive). PDF는 현재 건너뜀.
- Gemini 무료 티어는 입력이 모델 학습에 쓰일 수 있으니, 민감한 코드/키가 섞인
  노트는 주의.
- Pinecone 무료(Starter)는 장기 미사용 시 인덱스가 정지될 수 있다.
