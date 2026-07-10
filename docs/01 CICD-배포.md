# 02 CI/CD & 배포

devTalk의 배포 파이프라인 정리. **GitHub Actions(CI) + Vercel(CD)** 조합으로,
`git push` 한 번이면 검사 → 배포까지 자동으로 흐른다.

## 전체 흐름

```
코드 수정 → git push
      │
      ├─→ GitHub Actions (CI) : 타입체크 + 빌드 검사 (✅/❌)
      │
      └─→ Vercel (CD)        : 자동 빌드 → 자동 배포 🚀
```

| 단계 | 도구 | 역할 |
|------|------|------|
| CI (지속적 통합) | GitHub Actions | push마다 빌드/타입체크 자동 검사 |
| CD (지속적 배포) | Vercel | 검사된 코드를 자동으로 빌드·배포 |

## CI — GitHub Actions

설정 파일: `.github/workflows/ci.yml`

- **트리거**: `main` 브랜치에 push, 또는 `main`으로 PR
- **작업**: Node 20 설치 → `npm ci` → `npx tsc --noEmit`(타입체크) → `npm run build`(빌드 검사)
- **결과 확인**: GitHub 저장소 → **Actions** 탭에서 ✅(통과)/❌(실패)

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run build
```

> 브랜치가 `master`라면 `ci.yml`의 `main`을 `master`로 바꾸거나,
> `git branch -M main`으로 브랜치명을 통일한다.

## CD — Vercel

### 최초 1회 연결
1. https://vercel.com → GitHub으로 로그인
2. **Add New → Project** → `devTalk` 저장소 **Import**
3. 설정은 기본값(Next.js 자동 인식) → **Deploy**

연결 후부터는:
```
git push → Vercel 자동 감지 → 빌드 → 배포
PR 생성  → Preview(미리보기) 배포 자동 생성
```

### 배포 주소
- 프로덕션: `https://devtalk-xxxx.vercel.app`
- PC·모바일 브라우저에서 접속 가능

## 환경변수 (실제 키 붙일 때)

현재는 API가 **목업**이라 환경변수가 필요 없다.
실제 검색을 붙이면(= `app/api/chat/route.ts`를 실제 버전으로 복구) 아래 키를
**Vercel → Settings → Environment Variables**에 등록해야 한다.

| 변수 | 비고 |
|------|------|
| `GEMINI_API_KEY` | Google AI Studio |
| `PINECONE_API_KEY` | Pinecone 콘솔 |
| `PINECONE_INDEX` | `devnotes` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 서비스 계정 |
| `GOOGLE_PRIVATE_KEY` | 서비스 계정 키 |
| `DRIVE_FOLDER_ID` | 인덱싱 폴더 |

> `.env.local`은 git에 올라가지 않으므로(=`.gitignore`), 배포 환경에선
> Vercel 환경변수로 따로 주입한다.

## 체험 순서

```
1. 코드 살짝 수정
2. git add . && git commit -m "..." && git push
3. GitHub Actions 탭 → CI 검사 자동 실행 확인
4. 통과 시 Vercel이 자동 배포 → 사이트 갱신 (CD)
```

## 주의

- 개인 노트 검색이므로, 실제 데이터로 배포할 땐 **간단한 인증(비밀번호/로그인)** 추가 권장.
  (목업 단계에선 가짜 데이터라 무방)
- CI 빌드는 목업 상태에서도 통과한다. 실제 키 연동 후에도 빌드 자체엔
  환경변수가 필요 없지만(런타임에만 사용), 동작 테스트는 배포 후 확인.
