---
name: blog-deploy
description: zn 블로그(jinajung01/blog, GitHub Pages)의 변경 사항을 커밋하고 배포한 뒤 실제 사이트에서 확인한다. "배포해줘", "올려줘", "반영해줘", 리디자인·기능 추가를 마친 뒤 배포 단계에서 사용. blog-redesign 스킬의 마지막 단계에서도 불러 쓴다.
---

# 블로그 배포

zn 블로그의 변경 사항을 커밋하고 GitHub Pages에 배포한 뒤, 실제 사이트에서 동작을 확인하는 절차.

## 기본 정보

- 코드 위치: `C:\Users\user\Desktop\AIPM 소스코드\blog` (git 저장소, 브랜치 `main`)
- 저장소: `jinajung01/blog`, 사이트: https://jinajung01.github.io/blog/
- 배포 방식: `main`에 push하면 GitHub Actions의 "블로그 배포" 워크플로가 자동 실행된다(매시간 정각+7분에도 실행).
  - `scripts/build-site.mjs`가 `_site`를 만든다. 검색용 글 페이지 `p/{id}.html`, sitemap, RSS, `widgets.json`(날씨·고양이)이 이때 생긴다.
  - 날씨·고양이 API 키는 GitHub Secrets(`OPENWEATHER_API_KEY`, `THECATAPI_KEY`)에 있다. 키를 직접 다루거나 입력하지 않는다.

## 시작 전 지킬 것

- **사용자가 배포를 분명히 요청했을 때만 커밋·push한다.** 화면이 바뀌는 변경이면, 배포 전에 PC·휴대폰 캡처를 먼저 보여 주고 승인을 받는다.
- 사용자에게는 한국어로 답한다.
- `firestore.rules`가 바뀌었으면 배포 전에 사용자에게 Firebase 콘솔에서 게시해 달라고 요청한다. 경로는 Firebase 콘솔 → Firestore Database → 규칙이고, 파일 **전체**를 붙여 넣고 게시한다. 게시했다는 답을 받은 뒤에 진행한다. 게시하지 않고 배포하면 새 기능의 저장이 막힌다.

## 절차

### 1. 변경 내용 확인

```bash
cd "/c/Users/user/Desktop/AIPM 소스코드/blog" && git status --short && git diff --stat
```

- 의도하지 않은 파일이 섞였는지 본다. `widgets.json`, `_site/`, `node_modules/`는 `.gitignore` 대상이라 올라가지 않는다.
- `.claude/` 폴더(스킬 등)는 커밋하지 않는다. 빌드가 저장소 파일을 사이트로 복사하기 때문에, 올리면 공개될 수 있다.

### 2. 버전 번호 올리기 (캐시 무효화)

HTML·JS가 `style.css?v=…`, `main.js?v=…`, `data.js?v=…`, `firebase-config.js?v=…` 형태로 파일을 불러온다. CSS·JS를 바꿨다면 번호를 올려야 방문자 브라우저가 새 파일을 받는다.

- 현재 번호 확인: `grep -o 'main.js?v=[0-9a-z]*' index.html`
- 새 번호는 `오늘날짜(YYYYMMDD)` + 알파벳이다(예: `20261119a`). 같은 날 이미 배포했으면 다음 알파벳을 쓴다.
- 모든 `*.html`과 `main.js`, `data.js`의 옛 번호를 한꺼번에 바꾼다.
  ```bash
  for f in *.html main.js data.js; do sed -i 's/옛번호/새번호/g' "$f"; done
  grep -l '옛번호' *.html *.js   # 아무것도 안 나와야 함
  ```
- HTML 문구만 바꿨고 CSS·JS가 그대로면 이 단계는 생략해도 된다.

### 3. 커밋 (한국어 규칙)

프로젝트 `CLAUDE.md` 규칙을 따른다.
- 제목은 `<타입>: <요약>` 형식으로, 50자 이내에 명사형으로 끝낸다.
- 타입은 기능, 수정, 개선, 문서, 스타일, 설정, 삭제, 테스트 중 하나다.
- 본문은 글머리표로 쓰고, 전문 용어를 줄인다.
- 한 커밋에는 한 가지 목적만 담는다.

```bash
git add <파일들> && git commit -q -F - <<'EOF'
스타일: 첫 화면 리디자인과 모바일 화면 개선

- 바뀐 점 1
- 바뀐 점 2
- 브라우저가 예전 파일을 쓰지 않도록 버전 번호 갱신

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- git 작성자 이메일은 noreply로 둔다. 사용자 이메일을 커밋에 넣지 않는다.

### 4. push하고 배포가 끝날 때까지 기다리기

```bash
git push -q origin main
gh run list --limit 1 --json databaseId,headSha,status --jq '.[0]'   # 방금 커밋의 run인지 headSha로 확인
gh run watch <databaseId> --exit-status >/dev/null 2>&1; gh run view <databaseId> --json conclusion --jq .conclusion
```

- 보통 1~2분 걸린다. 오래 걸릴 수 있으니 timeout은 넉넉하게 준다(최대 600000ms).
- 실패하면 `gh run view <id> --log-failed`로 원인을 보고 사용자에게 알린다. 다시 push하기 전에 사용자에게 먼저 알린다.

### 5. 실제 사이트에서 확인

1. 새 버전이 올라갔는지 본다.
   ```bash
   curl -s https://jinajung01.github.io/blog/ | grep -o 'main.js?v=[0-9a-z]*'
   ```
2. 내장 브라우저(`mcp__Claude_Browser__navigate`)로 바뀐 페이지를 연다. 그다음 `javascript_tool`로 3~4초 기다린 뒤 다음을 확인한다.
   - 화면에 들어가야 할 내용이 실제로 채워졌는가(글 목록, 기록 현황 등).
   - `document.documentElement.scrollWidth > innerWidth`가 false인가(화면이 가로로 넘치지 않는가).
   - `read_console_messages`(onlyErrors)에 오류가 없는가.
3. **글 상세 페이지(`post.html?id=…`)는 꼭 필요할 때만 연다.** 관리자가 아닌 브라우저로 열면 조회수가 1 올라간다. 열었다면 사용자에게 그 사실을 알린다.

### 6. 사용자에게 보고

- 커밋 번호와 제목, 배포 성공 여부, 실제 사이트에서 확인한 것과 확인하지 못한 것을 나눠서 말한다.
- 예전에 사이트를 열어 둔 브라우저에는 옛 화면이 남아 있을 수 있다. 새로고침하면 바뀐다고 안내한다.
