# 파이맨의 DevApps

선생님용 앱 소개·다운로드 페이지. `index.html`이 `apps.json`을 읽어 화면을 그립니다.

## 관리 방법 (apps.json만 고치면 됨)

- **새 버전 배포**: 구글 드라이브에 zip 업로드 → 공유를 "링크가 있는 모든 사용자 · 뷰어"로 → 해당 앱의 `windows`(또는 `mac`)에서 `version`, `size`, `url` 수정 → `site.updated` 날짜 수정
- **Mac 버전 추가**: `"mac": null`을 `{ "version": "…", "size": "…", "url": "…" }`로 바꾸면 Mac 탭에 다운로드 버튼이 생깁니다.
- **새 앱 추가**: `apps` 배열에 항목 하나를 복사해 붙이고 `id`, `name`, `symbol`(글자 하나), `color`, `category`, `summary`, `features`, `requirements`, `start`를 채웁니다.
- 드라이브 링크는 파일의 `공유 → 링크 복사` 주소(`https://drive.google.com/file/d/…/view?usp=sharing`)를 그대로 쓰면 됩니다.

## 미리보기

`apps.json`을 불러와야 해서 파일을 더블클릭하면 안 열립니다. 이 폴더에서 다음을 실행한 뒤 http://127.0.0.1:8765 를 엽니다.

```
python -m http.server 8765
```

## 공개 (GitHub Pages)

이 폴더를 GitHub 공개 저장소에 올리고 Settings → Pages → Branch `main` / `(root)`를 선택하면 `https://<아이디>.github.io/<저장소>/` 주소가 생깁니다. 이후 `apps.json`을 고쳐 push하면 1~2분 안에 반영됩니다.
