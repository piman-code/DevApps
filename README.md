# 파이맨의 DevApps

선생님용 앱 소개·다운로드 페이지. 주소: https://piman-devapps.pages.dev (Cloudflare Pages)

소개는 누구나 볼 수 있고, **다운로드는 비밀키를 넣어야** 열립니다. 다운로드 링크는 저장소에 없고 Cloudflare 비밀 변수에만 있습니다.

## 폴더 구성

- `site/` — 배포되는 화면. `index.html`이 `apps.json`을 읽어 카드를 그립니다.
- `functions/api/unlock.js` — 비밀키 확인, 30일 쿠키. `functions/api/get.js` — 쿠키가 맞으면 실제 링크로 보냄.
- `lib/auth.js` — 서명·쿠키 공통 함수.
- `index.html`(맨 위) — 옛 주소(piman-code.github.io/DevApps)에서 새 주소로 넘겨 주는 안내 페이지.
- 저장소에 없는 파일(.gitignore): `다운로드_비밀키.txt`, `links.json`, `.dev.vars`. **절대 커밋하지 않기.**

## 관리 방법

- **새 버전**: 구글 드라이브에 zip 업로드 → 공유 "링크가 있는 모든 사용자 · 뷰어" → 링크를 `links.json`의 `앱id:windows`(또는 `:mac`)에 넣기 → `site/apps.json`의 `version`, `size`, `sha256`, `site.updated` 수정 → 링크 반영과 배포(아래).
- **Mac 버전 추가**: `"mac": null`을 `{ "version": "…", "size": "…", "sha256": "…", "start": "…" }`로 바꾸고 `links.json`에 `앱id:mac` 링크 추가. `start`가 있으면 그 운영체제에서는 앱 공통 `start` 대신 보입니다.
- **새 앱**: `apps` 배열에 항목을 복사해 `id`, `name`, `symbol`, `color`, `category`, `summary`, `features`, `requirements`, `start`를 채웁니다.
- 확인값: `shasum -a 256 파일.zip`

## 링크 반영과 배포

```
python3 -c "import json;print(json.dumps(json.load(open('links.json')),ensure_ascii=False),end='')" | npx wrangler pages secret put LINKS --project-name piman-devapps
npx wrangler pages deploy --branch main --commit-dirty=true
```

비밀키 바꾸기: `npx wrangler pages secret put DOWNLOAD_KEY` 후 새 키 입력 → 선생님들께 새 키 안내(기존 쿠키는 자동으로 무효).

## 미리보기

```
npx wrangler pages dev
```

`.dev.vars`(DOWNLOAD_KEY, LINKS)가 있어야 잠금이 동작합니다. http://127.0.0.1:8788 에서 확인합니다.
