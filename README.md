# 파이맨의 DevApps

선생님용 앱 소개·다운로드 페이지. 주소: https://piman-devapps.pages.dev (Cloudflare Pages)

입구는 둘입니다.

| 구분 | 주소 | 누가 보나 |
|---|---|---|
| 공개용 | `/` | 누구나. 소개는 열려 있고 **다운로드만 비밀키**(DOWNLOAD_KEY)로 잠김 |
| 파이맨 전용 | `/private/` | 관리자 키(ADMIN_KEY)를 아는 사람만. 입구는 공개 대문 표지의 「파이맨 전용」 버튼(목록은 키 없이 보이지 않음) |

공개 대문은 발표형(표지 → 앱 목록 → 처음 받으실 때 → 개인정보 안내)이고 오른쪽 위에서 발표·읽기·인쇄 모드를 고릅니다. 다운로드 링크는 저장소에 없고 Cloudflare 비밀 변수에만 있습니다.

## 폴더 구성

- `site/` — 배포되는 화면. `index.html`이 `apps.json`을 읽어 카드를 그립니다.
- `site/private/` — 파이맨 전용. `index.html`(전용 대문: 도구 목록·관리), `house-price-map.html`(전국 집값 지도).
- `functions/_middleware.js` — 사이트 입구. `/private/` 아래는 관리자 쿠키가 맞을 때만 보여 주고, 아니면 401 로그인 화면을 줍니다. 인코딩한 주소(`/%70rivate/` 등)도 풀어서 막습니다.
- `functions/api/unlock.js` — 다운로드 비밀키 확인, 30일 쿠키 `dk`. `functions/api/get.js` — 쿠키가 맞으면 실제 링크로 보냄.
- `functions/api/admin.js` — 관리자 키 확인, 30일 쿠키 `ak`.
- `lib/auth.js` — 서명·쿠키 공통 함수(두 잠금이 같이 씀).
- `site/build.txt` — 배포한 커밋 SHA. 전용 대문의 "배포 확인"이 읽습니다.
- `index.html`(맨 위) — 옛 주소(piman-code.github.io/DevApps)에서 새 주소로 넘겨 주는 안내 페이지.
- 저장소에 없는 파일(.gitignore): `다운로드_비밀키.txt`, `파이맨전용_비밀키.txt`, `links.json`, `.dev.vars`. **절대 커밋하지 않기.**

## 관리 방법

- **새 버전**: 구글 드라이브에 zip 업로드 → 공유 "링크가 있는 모든 사용자 · 뷰어" → 링크를 `links.json`의 `앱id:windows`(또는 `:mac`)에 넣기 → `site/apps.json`의 `version`, `size`, `sha256`, `site.updated` 수정 → 링크 반영과 배포(아래).
- **Mac 버전 추가**: `"mac": null`을 `{ "version": "…", "size": "…", "sha256": "…", "start": "…" }`로 바꾸고 `links.json`에 `앱id:mac` 링크 추가. `start`가 있으면 그 운영체제에서는 앱 공통 `start` 대신 보입니다.
- **새 앱**: `apps` 배열에 항목을 복사해 `id`, `name`, `symbol`, `color`, `category`, `summary`, `features`, `requirements`, `start`를 채웁니다.
- **전용 도구 추가**: `site/private/`에 HTML을 넣고 `site/private/index.html`의 "나만 쓰는 도구" 장면에 카드를 하나 추가합니다. `/private/` 아래는 자동으로 잠깁니다.
- 확인값: `shasum -a 256 파일.zip`
- **웹앱 링크**: 다른 저장소에 있는 웹앱은 `apps.json`에 `"web": "https://…"`로 넣으면 「바로 열기」 카드가 됩니다(지금: 수업 3줄 메모). 공개하지 않을 웹앱은 `site/private/index.html` "나만 쓰는 도구"에 외부 링크 카드로 둡니다(전광판·모둠 편성·강의 원고).
- **아이콘**: 어두운 배경 + 밝은 색 π. 아이폰 홈 화면을 '어둡게'로 두면 iOS가 웹 북마크 아이콘의 배경을 지우고 글자만 남기므로, 글자가 어두우면 안 보입니다. 아이콘을 바꾸면 `?v=` 숫자를 올리고, 이미 추가한 홈 화면 북마크는 지웠다가 다시 추가해야 바뀝니다.

## 자동 배포

`main`에 push되면 `.github/workflows/deploy.yml`(GitHub Actions)이 Cloudflare Pages에 배포하고 `/build.txt`(= 배포한 커밋)를 확인합니다. **맥에서 `wrangler pages deploy`를 같이 하지 않습니다**(이중 배포). 결과는 GitHub 저장소의 Actions 탭에서 봅니다.

처음 한 번: GitHub 저장소 Settings › Secrets and variables › Actions에 `CLOUDFLARE_API_TOKEN`(권한 Account › Cloudflare Pages › Edit), `CLOUDFLARE_ACCOUNT_ID`를 넣습니다. 강의 원고 저장소에 넣은 값과 같아도 됩니다. 넣은 뒤 Actions › DevApps 배포 › Run workflow로 한 번 돌립니다.

## 링크 반영

다운로드 링크(`links.json`)는 비밀 변수라 맥에서 넣습니다. 배포는 필요 없고 바로 적용됩니다.

```
python3 -c "import json;print(json.dumps(json.load(open('links.json')),ensure_ascii=False),end='')" | npx wrangler pages secret put LINKS --project-name piman-devapps
```

비상용 수동 배포(Actions가 안 될 때만): `git rev-parse HEAD > site/build.txt && npx wrangler pages deploy --branch main --commit-dirty=true`

### 비밀키 바꾸기

- 다운로드 키: `npx wrangler pages secret put DOWNLOAD_KEY --project-name piman-devapps` 후 새 키 입력 → 선생님들께 새 키 안내(기존 쿠키는 자동으로 무효).
- 관리자 키: `npx wrangler pages secret put ADMIN_KEY --project-name piman-devapps` 후 새 키 입력 → `파이맨전용_비밀키.txt`와 `.dev.vars`도 같은 값으로 고치기.

## 미리보기

```
npx wrangler pages dev
```

`.dev.vars`(DOWNLOAD_KEY, LINKS, ADMIN_KEY)가 있어야 잠금이 동작합니다. http://127.0.0.1:8788 에서 확인합니다.
