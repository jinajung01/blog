# zn

HTML·CSS·자바스크립트로만 만든 블로그입니다. 따로 설치할 것 없이 `index.html`을 브라우저로 열면 바로 볼 수 있습니다.

## 미니 프로젝트: AI 초안 도우미

수업 메모·실습 내용을 넣으면 빠진 맥락을 최대 3개 묻고, 블로그 글 초안으로 정리해 글쓰기 칸에 채워 주는 관리자 전용 챗봇입니다.
배포 주소: https://jinajung01.github.io/blog/write.html (관리자 로그인 필요)

| 항목 | 위치 |
|------|------|
| PRD (기획서) | [docs/PRD.md](docs/PRD.md) |
| 테스트 보고서 | [docs/TEST_REPORT.md](docs/TEST_REPORT.md) (스크린샷: [docs/screenshots](docs/screenshots)) |
| 에이전트용 지침 | [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md) (Claude Code는 [CLAUDE.md](CLAUDE.md)를 통해 불러옴) |
| 의사결정 로그 | [logs/decision-log.md](logs/decision-log.md) |
| 성공·실패 로그 | [logs/success-fail-log.md](logs/success-fail-log.md) |
| 소스코드 | [chatbot.js](chatbot.js) (챗봇 기능 전체), [write.html](write.html)·[style.css](style.css)·[main.js](main.js) (글쓰기 화면 연결), [firebase-config.js](firebase-config.js) (App Check 사이트 키) |
| 단위테스트 | [tests/chatbot.test.mjs](tests/chatbot.test.mjs) — 실행: `node --test tests/` |

## 폴더 구성

| 파일 | 내용 |
|------|------|
| `index.html` | 첫 화면 (소개, 추천 글, 최근 글, 카테고리, 구독) |
| `posts.html` | 글 목록 (카테고리 필터·제목 검색·정렬) |
| `post.html` | 글 상세 (좋아요, 링크 복사, 댓글) |
| `write.html` | 글쓰기 화면 |
| `login.html` | 관리자 로그인 화면 |
| `style.css` | 전체 디자인 |
| `main.js` | 버튼·검색 같은 화면 동작 |
| `chatbot.js` | 글쓰기 화면의 AI 초안 도우미 (Firebase AI Logic + App Check) |
| `data.js` | Firebase 연결 (구글 로그인, 글 저장·불러오기) |
| `firebase-config.js` | Firebase 설정값과 관리자 계정 ID |
| `firestore.rules` | 관리자만 글을 쓰고, 나만 보기·임시저장 글은 관리자만 읽게 막는 보안 규칙 |

> 로그인·글쓰기·대표 이미지·좋아요·댓글·구독 신청은 모두 Firebase(구글 서비스)에 저장됩니다.
> 구독 신청한 이메일은 Firebase 콘솔의 Firestore `subscribers` 모음에서 볼 수 있습니다. (자동 메일 발송은 없음)

## 관리자 로그인 설정 (처음 한 번)

1. Firebase 콘솔에서 프로젝트를 만들고 **Authentication → Google** 로그인을 켭니다.
2. **Authentication → 설정 → 승인된 도메인**에 `jinajung01.github.io`를 추가합니다.
3. **Firestore Database**를 만들고, `firestore.rules` 내용을 **규칙** 탭에 붙여 넣어 게시합니다.
4. 웹 앱 설정값을 `firebase-config.js`의 `firebaseConfig`에 넣습니다.
5. 블로그 로그인 화면에서 구글로 로그인하면 **관리자 등록용 ID**가 보입니다. 이 값을 `firebase-config.js`의 `ADMIN_UID`와 `firestore.rules`의 `ADMIN_UID` 자리에 넣고 규칙을 다시 게시합니다.

## 새 글 쓰는 법

1. 블로그의 **글쓰기** 버튼 → 관리자 구글 계정으로 로그인합니다.
2. 대표 이미지·제목·본문·카테고리·태그·공개 범위를 정하고 **발행하기**를 누릅니다.
   - 본문 서식: `## 소제목`, `**굵게**`, `*기울임*`, `> 인용`, `- 목록`, `[글자](https://주소)` (툴바 버튼으로도 넣을 수 있음)
3. 발행한 글은 글 상세 화면의 **관리자 메뉴**에서 수정·삭제합니다.



## 인터넷에 공개하기 (GitHub Pages)

`main` 브랜치에 올리면 `https://jinajung01.github.io/blog/` 주소에 자동으로 반영됩니다.

## 검색 노출 (SEO)

- 배포는 GitHub Actions(`.github/workflows/deploy.yml`)가 맡습니다. `main`에 올릴 때와 **매시간** 자동으로 실행됩니다.
- 실행할 때마다 `scripts/build-site.mjs`가 Firebase의 공개 글을 읽어 다음을 만듭니다.
  - `p/글ID.html`: 글마다 내용이 미리 들어 있는 검색용 페이지 (네이버 등 자바스크립트를 읽지 않는 검색엔진·공유 미리보기용)
  - `sitemap.xml`: 검색엔진에 제출하는 주소 목록
  - `rss.xml`: 새 글 피드 (네이버 서치어드바이저에 제출)
- 새 글을 바로 반영하려면 GitHub 저장소 → **Actions → 블로그 배포 → Run workflow**를 누릅니다.
- 내 컴퓨터에서 미리 보기: `node scripts/build-site.mjs _site`
