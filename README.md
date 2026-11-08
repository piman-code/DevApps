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

## 링크 반영과 배포

```
python3 -c "import json;print(json.dumps(json.load(open('links.json')),ensure_ascii=False),end='')" | npx wrangler pages secret put LINKS --project-name piman-devapps
git rev-parse HEAD > site/build.txt
npx wrangler pages deploy --branch main --commit-dirty=true
```

커밋한 뒤 `site/build.txt`를 갱신하고 배포하면 전용 대문의 "배포 확인"에 그 SHA가 보입니다.

### 비밀키 바꾸기

- 다운로드 키: `npx wrangler pages secret put DOWNLOAD_KEY --project-name piman-devapps` 후 새 키 입력 → 선생님들께 새 키 안내(기존 쿠키는 자동으로 무효).
- 관리자 키: `npx wrangler pages secret put ADMIN_KEY --project-name piman-devapps` 후 새 키 입력 → `파이맨전용_비밀키.txt`와 `.dev.vars`도 같은 값으로 고치기.

## 미리보기

```
npx wrangler pages dev
```

`.dev.vars`(DOWNLOAD_KEY, LINKS, ADMIN_KEY)가 있어야 잠금이 동작합니다. http://127.0.0.1:8788 에서 확인합니다.
