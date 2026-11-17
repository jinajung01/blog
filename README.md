# 내 블로그

HTML, CSS, 약간의 자바스크립트로 만든 간단한 블로그입니다. 따로 설치할 것 없이 `index.html`을 브라우저로 열면 바로 볼 수 있습니다.

## 폴더 구성

| 파일 | 내용 |
|------|------|
| `index.html` | 메인 화면 (추천 글, 최신 글 카드, 사이드바) |
| `about.html` | 소개 페이지 |
| `posts/` | 글 하나당 HTML 파일 하나 |
| `style.css` | 전체 디자인 (베이비핑크 Y2K, 차분한 잡지풍) |
| `main.js` | 메인 화면의 카테고리 필터와 글 검색 |

## 새 글 쓰는 법

1. `posts/first-post.html`을 복사해서 새 이름으로 저장합니다. (예: `posts/second-post.html`)
2. 제목, 날짜, 본문을 바꿉니다.
3. `index.html`의 최신 글 목록 맨 앞에 카드(`<a class="card">` 한 덩어리)를 추가합니다.
   - `data-cat`에 카테고리를 적습니다: `daily`(일상), `make`(만들기), `retro`(회고)
   - 같은 카테고리의 "준비 중" 카드가 있으면 지웁니다.
4. 사이드바의 카테고리 글 수와, 필요하면 맨 위 추천 글도 바꿉니다.

## 인터넷에 공개하기 (GitHub Pages)

저장소의 **Settings → Pages**에서 `main` 브랜치를 선택하면
`https://jinajung01.github.io/blog/` 주소로 블로그가 공개됩니다.
