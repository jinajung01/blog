# 내 블로그

HTML·CSS·자바스크립트로만 만든 블로그입니다. 따로 설치할 것 없이 `index.html`을 브라우저로 열면 바로 볼 수 있습니다.

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
| `data.js` | Firebase 연결 (구글 로그인, 글 저장·불러오기) |
| `firebase-config.js` | Firebase 설정값과 관리자 계정 ID |
| `firestore.rules` | 관리자만 글을 쓰고, 나만 보기·임시저장 글은 관리자만 읽게 막는 보안 규칙 |

> 로그인과 글쓰기는 Firebase(구글 서비스)로 동작합니다. 댓글·좋아요·구독은 아직 **화면 시안**이라 저장되지 않습니다.

## 관리자 로그인 설정 (처음 한 번)

1. Firebase 콘솔에서 프로젝트를 만들고 **Authentication → Google** 로그인을 켭니다.
2. **Authentication → 설정 → 승인된 도메인**에 `jinajung01.github.io`를 추가합니다.
3. **Firestore Database**를 만들고, `firestore.rules` 내용을 **규칙** 탭에 붙여 넣어 게시합니다.
4. 웹 앱 설정값을 `firebase-config.js`의 `firebaseConfig`에 넣습니다.
5. 블로그 로그인 화면에서 구글로 로그인하면 **관리자 등록용 ID**가 보입니다. 이 값을 `firebase-config.js`의 `ADMIN_UID`와 `firestore.rules`의 `ADMIN_UID` 자리에 넣고 규칙을 다시 게시합니다.

## 새 글 쓰는 법

1. `post.html`을 복사해 새 이름으로 저장하고 제목·날짜·본문을 바꿉니다.
2. `posts.html`의 글 목록 맨 위에 `<a class="post-row">` 한 덩어리를 추가합니다.
   - `data-cat`은 `plan`(기획) / `design`(디자인) / `retro`(회고) 중 하나, `data-date`는 `2026-11-17` 형식으로 적습니다.
3. 첫 화면(`index.html`)의 최근 글 카드도 필요하면 바꿉니다.

`[작성자 이름]`, `[작성자 소개]`처럼 대괄호로 된 부분은 내 정보로 바꿔 주세요.

## 인터넷에 공개하기 (GitHub Pages)

`main` 브랜치에 올리면 `https://jinajung01.github.io/blog/` 주소에 자동으로 반영됩니다.
