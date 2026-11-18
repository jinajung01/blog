// 배포용 사이트 만들기 (GitHub Actions에서 실행)
// 1) 블로그 파일을 출력 폴더에 복사
// 2) Firebase에서 공개 글을 읽어 글마다 검색용 페이지(p/글ID.html)를 만듦
//    → 자바스크립트를 실행하지 않는 검색엔진(네이버 등)과 공유 미리보기도 글 내용을 읽을 수 있음
// 3) sitemap.xml(검색엔진용 주소 목록)과 rss.xml(새 글 피드) 생성
//
// 사용법: node scripts/build-site.mjs <출력 폴더>
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firebaseConfig } from '../firebase-config.js';
import { renderBody, plainText, readTime, fmtDate, CATS } from '../data.js';

const SITE = 'https://jinajung01.github.io/blog/';
const SITE_DESC = 'AI와 함께 무언가를 만들며 배운 PM 이야기를 적어 둡니다.';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2];
if (!OUT) { console.error('출력 폴더를 지정해 주세요.'); process.exit(1); }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const summary = (body) => plainText(body).replace(/\s+/g, ' ').trim().slice(0, 150);
const day = (d) => d.toISOString().slice(0, 10);

// ---------- 1. 파일 복사 ----------
const SKIP = new Set(['.git', '.github', 'scripts', 'node_modules', '_site', 'README.md']);
await mkdir(OUT, { recursive: true });
for (const name of await readdir(ROOT)) {
  if (SKIP.has(name) || name.startsWith('.')) continue;
  await cp(join(ROOT, name), join(OUT, name), { recursive: true });
}

// ---------- 2. 공개 글 읽기 (Firestore REST, 방문자 권한) ----------
function value(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(value);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, value(x)]));
  return null;
}
const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents:runQuery?key=${firebaseConfig.apiKey}`;
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'posts' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } } },
      { fieldFilter: { field: { fieldPath: 'visibility' }, op: 'EQUAL', value: { stringValue: 'public' } } }
    ] } }
  } })
});
if (!res.ok) {
  // 실패하면 배포를 멈춰서, 이전에 배포된 사이트(글 페이지 포함)가 그대로 유지되게 함
  console.error('글을 불러오지 못했어요:', res.status, await res.text());
  process.exit(1);
}
const posts = (await res.json())
  .filter((r) => r.document)
  .map((r) => {
    const f = Object.fromEntries(Object.entries(r.document.fields || {}).map(([k, v]) => [k, value(v)]));
    const id = r.document.name.split('/').pop();
    const published = f.publishedAt || f.createdAt || new Date(r.document.createTime);
    const updated = f.updatedAt || new Date(r.document.updateTime);
    return {
      id, title: f.title || '', body: f.body || '', category: f.category || '',
      tags: Array.isArray(f.tags) ? f.tags : [], images: f.images || {}, cover: f.cover || '',
      published, updated
    };
  })
  .filter((p) => /^[\w-]+$/.test(p.id) && p.title)
  .sort((a, b) => b.published - a.published);
console.log(`공개 글 ${posts.length}개`);

// ---------- 3. 글마다 검색용 페이지 ----------
const template = await readFile(join(ROOT, 'post.html'), 'utf8');
function replaceOnce(html, from, to) {
  if (!html.includes(from)) throw new Error('post.html에서 찾지 못함: ' + from);
  return html.replace(from, () => to);
}
await mkdir(join(OUT, 'p'), { recursive: true });
for (const p of posts) {
  const pageUrl = `${SITE}p/${p.id}.html`;
  const desc = summary(p.body) || SITE_DESC;
  const cat = CATS[p.category] || '';
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: p.title, description: desc, inLanguage: 'ko',
    datePublished: p.published.toISOString(), dateModified: p.updated.toISOString(),
    mainEntityOfPage: pageUrl, url: pageUrl,
    articleSection: cat || undefined, keywords: p.tags.join(', ') || undefined,
    author: { '@type': 'Person', name: 'zn' },
    publisher: { '@type': 'Organization', name: 'zn' },
    image: SITE + 'og-image.png'
  };
  const head = `  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${pageUrl}">
  <link rel="alternate" type="application/rss+xml" title="zn" href="${SITE}rss.xml">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="zn">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="article:published_time" content="${p.published.toISOString()}">
  <meta property="article:modified_time" content="${p.updated.toISOString()}">
  ${cat ? `<meta property="article:section" content="${esc(cat)}">` : ''}
  <meta property="og:image" content="https://jinajung01.github.io/blog/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="zn blog">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;

  let html = template;
  // 상대 주소(style.css, main.js, posts.html 등)가 블로그 첫 폴더 기준으로 동작하도록
  html = replaceOnce(html, '<meta charset="UTF-8">', '<meta charset="UTF-8">\n  <base href="../">');
  html = replaceOnce(html, '<title>글 - zn</title>', `<title>${esc(p.title)} - zn</title>`);
  html = html.replace(/  <!-- SEO\(글\) 시작[\s\S]*?<!-- SEO\(글\) 끝 -->/, () => head);
  html = replaceOnce(html, '<body>', `<body data-post-id="${p.id}">`);
  html = replaceOnce(html, '<a href="posts.html" data-post-crumb>글 목록</a>',
    `<a href="posts.html${p.category ? '?cat=' + p.category : ''}" data-post-crumb>${esc(cat || '글 목록')}</a>`);
  html = replaceOnce(html, '<span class="eyebrow" data-post-cat></span>', `<span class="eyebrow" data-post-cat>${esc(cat)}</span>`);
  html = replaceOnce(html, '<h1 data-post-title>글을 불러오는 중…</h1>', `<h1 data-post-title>${esc(p.title)}</h1>`);
  html = replaceOnce(html, '<span data-post-meta></span>', `<span data-post-meta>${fmtDate(p.published)} · ${readTime(p.body)}</span>`);
  html = replaceOnce(html, '<article class="article" data-post-body></article>',
    `<article class="article" data-post-body>\n${renderBody(p.body, p.images)}\n    </article>`);
  html = replaceOnce(html, '<div class="tags" data-post-tags></div>',
    `<div class="tags" data-post-tags>${p.tags.map((t) => `<a href="posts.html?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>`);
  if (!p.cover) html = html.replace('<div class="post-cover placeholder" data-post-cover>', '<div class="post-cover placeholder" data-post-cover hidden>');
  await writeFile(join(OUT, 'p', `${p.id}.html`), html);
}

// ---------- 4. sitemap.xml ----------
const latest = posts[0] ? day(posts[0].updated) : day(new Date());
const urls = [
  { loc: SITE, lastmod: latest },
  { loc: SITE + 'posts.html', lastmod: latest },
  ...posts.map((p) => ({ loc: `${SITE}p/${p.id}.html`, lastmod: day(p.updated) }))
];
await writeFile(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);

// ---------- 5. rss.xml ----------
const cdata = (s) => '<![CDATA[' + String(s).replace(/]]>/g, ']]]]><![CDATA[>') + ']]>';
await writeFile(join(OUT, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>zn</title>
  <link>${SITE}</link>
  <description>${esc(SITE_DESC)}</description>
  <language>ko</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${posts.slice(0, 30).map((p) => `  <item>
    <title>${cdata(p.title)}</title>
    <link>${SITE}p/${p.id}.html</link>
    <guid isPermaLink="true">${SITE}p/${p.id}.html</guid>
    <pubDate>${p.published.toUTCString()}</pubDate>
    ${CATS[p.category] ? `<category>${cdata(CATS[p.category])}</category>` : ''}
    <description>${cdata(summary(p.body))}</description>
  </item>`).join('\n')}
</channel>
</rss>
`);

// ---------- 6. widgets.json (첫 화면 날씨·고양이 사진) ----------
// API 키는 GitHub 저장소 Secrets(OPENWEATHER_API_KEY, THECATAPI_KEY)에만 두고, 배포할 때 여기서 받아 옴
// → 키가 사이트 코드에 드러나지 않음. 매시간 자동 배포 때마다 새로 받아 옴
// 키가 없거나 요청이 실패해도 배포는 계속하고, 그 칸만 화면에서 숨김
async function getJson(u, headers = {}) {
  try {
    const r = await fetch(u, { headers, signal: AbortSignal.timeout(10000) });
    if (!r.ok) { console.warn('위젯 데이터 요청 실패:', r.status, u.split('?')[0]); return null; }
    return await r.json();
  } catch (e) { console.warn('위젯 데이터 요청 오류:', e.message); return null; }
}
const widgets = { updatedAt: new Date().toISOString(), weather: null, cats: [] };
const owKey = process.env.OPENWEATHER_API_KEY;
if (owKey) {
  const w = await getJson(`https://api.openweathermap.org/data/2.5/weather?lat=37.5665&lon=126.978&units=metric&lang=kr&appid=${owKey}`);
  if (w && w.main && w.weather && w.weather[0]) {
    widgets.weather = {
      city: '서울',
      temp: Math.round(w.main.temp),
      feels: Math.round(w.main.feels_like),
      min: Math.round(w.main.temp_min),
      max: Math.round(w.main.temp_max),
      humidity: w.main.humidity,
      desc: w.weather[0].description,
      icon: w.weather[0].icon,
      at: new Date(w.dt * 1000).toISOString()
    };
  }
}
const catKey = process.env.THECATAPI_KEY;
if (catKey) {
  const c = await getJson('https://api.thecatapi.com/v1/images/search?limit=12&mime_types=jpg,png&size=med', { 'x-api-key': catKey });
  if (Array.isArray(c)) widgets.cats = c.filter((x) => x && /^https:\/\//.test(x.url)).map((x) => ({ url: x.url, w: x.width, h: x.height }));
}
await writeFile(join(OUT, 'widgets.json'), JSON.stringify(widgets));
console.log(`위젯: 날씨 ${widgets.weather ? '있음' : '없음'}, 고양이 사진 ${widgets.cats.length}장`);

console.log(`완료: 글 페이지 ${posts.length}개, sitemap.xml, rss.xml → ${OUT}`);
