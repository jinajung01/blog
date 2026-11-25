// 블로그 화면 동작
import {
  configured, adminReady, CATS, isAdmin, currentUser, signInGoogle, signInEmail, signOutNow,
  listPosts, getPost, savePost, deletePost, hasLiked, toggleLike,
  listComments, addComment, deleteComment, subscribe, store,
  compressImage, renderBody, plainText, fmtDate, readTime, countView, listViews, kstDay
} from './data.js?v=20261125f';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const params = new URLSearchParams(location.search);
const PAGE_SIZE = 10;

// ---- GA 이벤트 (이벤트 택소노미 TO-BE) ----
// 관리자 기기는 GA 코드에서 수집이 꺼져 있어 여기서 보내도 기록되지 않음
const track = (name, params) => {
  if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
};
// 글 링크에 data-loc를 붙여 두면 클릭할 때 select_content 전송
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-loc][data-post-id]');
  if (a) track('select_content', { content_type: 'post', post_id: a.dataset.postId, list_location: a.dataset.loc });
});
const markLink = (a, p, loc) => {
  if (p.status === 'draft') return a; // 임시저장 글(관리자 전용)은 제외
  a.dataset.loc = loc;
  a.dataset.postId = p.id;
  return a;
};

// 로그인 상태
let user = null;
try { user = await currentUser(); } catch (e) { console.warn('로그인 확인 실패', e); }
const admin = isAdmin(user); // 주 관리자 + 평가용 테스트 계정
// 관리자 기기 표시: GA 방문 통계에서 내 방문을 빼기 위함
if (admin) store.set('blog.isAdmin', '1');

// 헤더 글쓰기 버튼: 관리자면 바로 글쓰기, 아니면 로그인 화면 (AC-01)
if (admin) $$('[data-write-link]').forEach((a) => { a.href = 'write.html'; });
// 관리자에게만 보이는 메뉴 (조회수)
if (admin) $$('[data-admin-only]').forEach((a) => { a.hidden = false; });

$$('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
  await signOutNow();
  store.del('blog.isAdmin');
  location.href = 'index.html'; // AC-16
}));

let postsCache = null;
async function visiblePosts() {
  if (!postsCache) {
    try { postsCache = await listPosts(admin); } catch (e) { console.warn('글 목록을 불러오지 못했어요', e); postsCache = []; }
  }
  return postsCache;
}
const postHref = (p) => (p.status === 'draft' ? 'write.html?id=' : 'post.html?id=') + encodeURIComponent(p.id);
const badge = (p) => {
  if (p.status === 'draft') return el('span', 'badge-private badge-draft', '임시저장');
  if (p.visibility === 'private') return el('span', 'badge-private', '나만 보기'); // AC-19
  return null;
};
const setCover = (node, src) => {
  if (!src) return node;
  node.style.backgroundImage = 'url("' + src + '")';
  node.classList.add('has-image');
  return node;
};
const excerpt = (body) => plainText(body).replace(/\s+/g, ' ').trim().slice(0, 90);
const catLine = (p, prefix) => {
  const n = el('span', 'eyebrow', (prefix || '') + (CATS[p.category] || (p.status === 'draft' ? '분류 없음' : '')));
  const b = badge(p); if (b) n.appendChild(b);
  return n;
};
// 대표 이미지가 없으면 카테고리 색 상자만 보여 줌 (글자 없이)
const coverBox = (cls, p) => {
  const box = el('div', cls + ' placeholder tint-' + (p.status === 'draft' ? 'draft' : p.category));
  box.setAttribute('aria-hidden', 'true');
  return setCover(box, p.cover);
};
const ago = (d) => {
  const s = (Date.now() - d) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
  return fmtDate(d);
};

// ================= 첫 화면 =================
// 날씨 띠·고양이 사진: 배포 때 만들어진 widgets.json을 읽어서 표시 (없거나 실패하면 그 칸은 숨긴 채로 둠)
const weatherBar = $('[data-weather]');
const catBox = $('[data-cat]');
if (weatherBar || catBox) {
  fetch('widgets.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      const w = data.weather;
      if (weatherBar && w) {
        $('[data-w-icon]', weatherBar).src = `https://openweathermap.org/img/wn/${encodeURIComponent(w.icon)}@2x.png`;
        $('[data-w-city]', weatherBar).textContent = w.city;
        $('[data-w-desc]', weatherBar).textContent = w.desc;
        $('[data-w-temp]', weatherBar).textContent = `${w.temp}°`;
        $('[data-w-sub]', weatherBar).textContent = `최저 ${w.min}° · 최고 ${w.max}° · 체감 ${w.feels}° · 습도 ${w.humidity}%`;
        const at = new Date(w.at);
        $('[data-w-at]', weatherBar).textContent = `${at.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric' })} 기준`;
        weatherBar.hidden = false;
      }
      const cats = Array.isArray(data.cats) ? data.cats.filter((c) => c && /^https:\/\//.test(c.url)) : [];
      if (catBox && cats.length) {
        const img = $('[data-cat-img]', catBox);
        let i = Math.floor(Math.random() * cats.length);
        const show = () => { img.src = cats[i].url; };
        show();
        const next = $('[data-cat-next]', catBox);
        if (cats.length < 2) next.hidden = true;
        next.addEventListener('click', () => { i = (i + 1) % cats.length; show(); });
        catBox.hidden = false;
      }
    })
    .catch(() => {});
}

const subForm = $('[data-subscribe-form]');
if (subForm) {
  const done = $('[data-subscribe-done]');
  const err = $('[data-subscribe-error]');
  if (store.get('blog.subscribed')) { subForm.hidden = true; done.hidden = false; }
  subForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('input', subForm).value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      err.textContent = '이메일 주소를 확인해 주세요.'; err.hidden = false; return;
    }
    err.hidden = true;
    $('button', subForm).disabled = true;
    try {
      const r = await subscribe(email);
      if (r === 'ok') track('sign_up', { method: 'email', signup_location: 'home' });
      store.set('blog.subscribed', '1');
      done.textContent = r === 'already' ? '이미 구독 중인 주소예요.' : '구독 신청이 완료되었습니다.';
      subForm.hidden = true; done.hidden = false;
    } catch (ex) {
      err.textContent = '신청하지 못했어요. 잠시 후 다시 시도해 주세요.'; err.hidden = false;
      console.warn(ex);
    }
    $('button', subForm).disabled = false;
  });
}

const recent = $('[data-recent]');
if (recent) {
  const posts = (await visiblePosts()).filter((p) => p.status === 'published');
  const catChip = (p) => el('span', 'cat-chip tint-' + p.category, CATS[p.category] || '');
  // 카테고리별 글 수 (카테고리 카드 + 첫 화면 '기록 현황')
  $$('[data-cat-count]').forEach((n) => {
    const c = posts.filter((p) => p.category === n.dataset.catCount).length;
    n.textContent = c + '편';
    const go = $('[data-cat-go="' + n.dataset.catCount + '"]');
    if (go && !c) { go.textContent = '첫 글을 준비 중이에요'; go.classList.add('is-empty'); }
  });
  if (posts.length) {
    $('[data-stat-total]').textContent = posts.length;
    $$('[data-stat-cat]').forEach((n) => { n.textContent = posts.filter((p) => p.category === n.dataset.statCat).length; });
    $('[data-stat-last]').textContent = '마지막 발행 ' + fmtDate(posts[0].date);
    $('[data-hero-stats]').hidden = false;
  }
  // 추천 글 = 가장 최근 글
  const f = posts[0];
  if (f) {
    const box = $('[data-featured]');
    box.hidden = false;
    const fCover = $('[data-f-cover]');
    fCover.textContent = ''; // 대표 이미지가 없을 때 '대표 이미지' 글자 대신 색 상자만
    fCover.setAttribute('aria-label', f.title);
    setCover(fCover, f.cover).classList.add('tint-' + f.category);
    $('[data-f-cover]').href = postHref(f);
    markLink($('[data-f-cover]'), f, 'home_featured');
    const cat = $('[data-f-cat]');
    cat.className = 'featured-label';
    cat.textContent = '';
    cat.append(catChip(f), el('span', null, '최신 글'));
    const b = badge(f); if (b) cat.appendChild(b);
    $('[data-f-title]').textContent = f.title;
    $('[data-f-excerpt]').textContent = excerpt(f.body);
    $('[data-f-meta]').textContent = fmtDate(f.date) + ' · ' + readTime(f.body);
    $('[data-f-link]').href = postHref(f);
    markLink($('[data-f-link]'), f, 'home_featured');
  }
  const rest = posts.slice(1, 4);
  rest.forEach((p) => {
    const a = el('a', 'recent-row');
    a.href = postHref(p);
    a.appendChild(coverBox('thumb', p));
    const body = el('div', 'body');
    body.append(catChip(p), el('h3', null, p.title));
    const ex = excerpt(p.body);
    if (ex) body.appendChild(el('p', null, ex));
    a.append(body, el('span', 'meta', fmtDate(p.date) + ' · ' + readTime(p.body)));
    recent.appendChild(markLink(a, p, 'home_recent'));
  });
  if (!posts.length) $('[data-recent-empty]').hidden = false;
  if (posts.length === 1) recent.closest('section').hidden = true;
}

// ================= 글 목록 =================
const list = $('[data-post-list]');
if (list) {
  const rowsBox = $('[data-rows]', list);
  if (admin) {
    $('[data-admin-note]', list).hidden = false;
    $('.chip[data-cat="draft"]', list).hidden = false; // AC-14
  }
  const posts = await visiblePosts();
  const chips = $$('.chip', list).filter((c) => !c.hidden);
  const search = $('[data-search]', list);
  const sort = $('[data-sort]', list);
  const state = {
    cat: chips.some((c) => c.dataset.cat === params.get('cat')) ? params.get('cat') : 'all',
    q: '', tag: params.get('tag') || '', page: 1
  };

  const row = (p) => {
    const a = markLink(el('a', 'post-row'), p, 'list');
    a.href = postHref(p);
    const text = el('div', 'text');
    const meta = p.status === 'draft'
      ? '임시저장 ' + fmtDate(p.date) + ' · 이어 쓰기'
      : fmtDate(p.date) + ' · ' + readTime(p.body) + (p.likes ? ' · 좋아요 ' + p.likes : '');
    text.append(catLine(p), el('h2', null, p.title || '(제목 없음)'), el('p', null, excerpt(p.body)), el('span', 'meta', meta));
    a.append(text, coverBox('cover', p));
    return a;
  };

  const render = () => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === state.cat)));
    const q = state.q.trim();
    let shown = posts.filter((p) => {
      const okCat = state.cat === 'all' ? p.status !== 'draft'
        : state.cat === 'draft' ? p.status === 'draft'
        : p.status !== 'draft' && p.category === state.cat;
      const okQ = !q || p.title.includes(q);
      const okTag = !state.tag || p.tags.includes(state.tag);
      return okCat && okQ && okTag;
    });
    if (sort.value === 'old') shown = shown.slice().sort((a, b) => a.date - b.date);
    if (sort.value === 'popular') shown = shown.slice().sort((a, b) => b.likes - a.likes || b.date - a.date);

    const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    rowsBox.innerHTML = '';
    shown.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE).forEach((p) => rowsBox.appendChild(row(p)));

    const pager = $('[data-pager]', list);
    pager.innerHTML = '';
    if (pages > 1) {
      for (let n = 1; n <= pages; n++) {
        const b = el('button', 'page-btn', String(n));
        b.type = 'button';
        if (n === state.page) b.setAttribute('aria-current', 'page');
        b.addEventListener('click', () => { state.page = n; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        pager.appendChild(b);
      }
    }
    $('[data-tag-filter]', list).hidden = !state.tag;
    $('[data-tag-label]', list).textContent = '#' + state.tag + ' 태그가 붙은 글';
    $('[data-count]', list).textContent = '글 ' + shown.length + '개';
    $('[data-empty]', list).hidden = shown.length !== 0;
    $('[data-empty-msg]', list).textContent = posts.length
      ? '다른 검색어를 입력하거나 카테고리를 바꿔 보세요.'
      : '아직 올라온 글이 없어요.';
    return shown.length;
  };
  chips.forEach((c) => c.addEventListener('click', () => {
    if (state.cat === c.dataset.cat) return;
    state.cat = c.dataset.cat; state.page = 1; render();
    track('filter_apply', { filter_type: 'category', filter_value: state.cat });
  }));
  let searchTimer = null;
  search.addEventListener('input', () => {
    state.q = search.value; state.page = 1;
    const count = render();
    clearTimeout(searchTimer);
    const term = state.q.trim();
    if (term) searchTimer = setTimeout(() => track('search', { search_term: term, result_count: count }), 1000); // 입력을 멈추고 1초 뒤
  });
  sort.addEventListener('change', () => {
    state.page = 1; render();
    track('filter_apply', { filter_type: 'sort', filter_value: sort.value });
  });
  $('[data-tag-clear]', list).addEventListener('click', () => { state.tag = ''; history.replaceState(null, '', 'posts.html'); render(); });
  $('[data-reset]', list).addEventListener('click', () => {
    state.cat = 'all'; state.q = ''; state.tag = ''; state.page = 1; search.value = '';
    history.replaceState(null, '', 'posts.html'); render();
  });
  render();
}

// ================= 글 상세 =================
const postBody = $('[data-post-body]');
let currentPost = null; // GA 이벤트용 (공개된 글을 불러왔을 때만)
if (postBody) {
  // post.html?id=… 또는 검색용 글 페이지(p/글ID.html, body에 data-post-id)
  const id = params.get('id') || document.body.dataset.postId;
  if (!id) location.replace('posts.html');
  let p = null;
  try { p = id ? await getPost(id) : null; } catch (e) { p = null; } // 권한 없음 = 보이지 않음 (AC-13)
  if (!p || (p.status === 'draft' && !admin)) {
    const main = $('.post-main');
    main.innerHTML = '';
    const box = el('div', 'post-msg');
    box.append(el('strong', null, '글을 찾을 수 없어요'), el('p', 'meta', '삭제되었거나 공개되지 않은 글이에요.'));
    const back = el('a', 'btn btn-line', '글 목록으로'); back.href = 'posts.html';
    box.appendChild(back);
    main.appendChild(box);
  } else {
    document.title = p.title + ' - zn';
    currentPost = p;
    // 조회수 기록: 공개 글만, 관리자 기기는 제외 (관리자 조회수 화면용)
    if (!admin && !store.get('blog.isAdmin') && p.status === 'published' && p.visibility === 'public') {
      countView(p.id).catch((e) => console.warn('조회수 기록 실패', e));
    }
    // SEO: post.html?id=… 로 연 경우, 검색엔진에는 같은 글의 검색용 페이지(p/글ID.html)를 대표 주소로 알림
    if (!document.body.dataset.postId && p.status === 'published' && p.visibility === 'public') {
      const canon = document.createElement('link');
      canon.rel = 'canonical';
      canon.href = new URL('p/' + encodeURIComponent(p.id) + '.html', location.href).href;
      document.head.appendChild(canon);
      const desc = $('[data-seo-desc]');
      if (desc) desc.content = excerpt(p.body).slice(0, 150) || desc.content;
    }
    const crumb = $('[data-post-crumb]');
    crumb.textContent = CATS[p.category] || '글 목록';
    crumb.href = 'posts.html' + (p.category ? '?cat=' + p.category : '');
    const cat = $('[data-post-cat]'); cat.textContent = CATS[p.category] || '';
    const b = badge(p); if (b) cat.appendChild(b);
    $('[data-post-title]').textContent = p.title;
    $('[data-post-meta]').textContent = fmtDate(p.date) + ' · ' + readTime(p.body);
    const cov = $('[data-post-cover]');
    cov.classList.add('tint-' + p.category);
    if (p.cover) setCover(cov, p.cover); else cov.hidden = true;
    postBody.innerHTML = renderBody(p.body, p.images); // 글자는 모두 안전하게 바꿔서 넣음
    const tags = $('[data-post-tags]');
    tags.innerHTML = ''; // 검색용 페이지에 미리 들어 있는 태그와 겹치지 않게
    p.tags.forEach((t) => {
      const a = el('a', null, '#' + t);
      a.href = 'posts.html?tag=' + encodeURIComponent(t);
      a.addEventListener('click', () => track('filter_apply', { filter_type: 'tag', filter_value: t }));
      tags.appendChild(a);
    });

    // 이전 글
    const all = (await visiblePosts()).filter((x) => x.status === 'published');
    const i = all.findIndex((x) => x.id === p.id);
    const prev = i >= 0 ? all[i + 1] : null;
    if (prev) {
      const a = $('[data-prev]');
      a.hidden = false; a.href = postHref(prev);
      $('[data-prev-title]').textContent = prev.title;
      markLink(a, prev, 'post_prev');
    }

    // 관리자: 수정·삭제
    if (admin) {
      $('[data-admin-bar]').hidden = false;
      $('[data-edit]').href = 'write.html?id=' + encodeURIComponent(p.id);
      $('[data-delete]').addEventListener('click', async () => {
        if (!confirm('이 글을 삭제할까요? 댓글도 함께 지워지고 되돌릴 수 없어요.')) return;
        try { await deletePost(p.id); location.href = 'posts.html'; } catch (e) { alert('삭제하지 못했어요.'); console.warn(e); }
      });
    }

    // 좋아요
    const like = $('[data-like]');
    let likes = p.likes;
    const drawLike = () => {
      like.setAttribute('aria-pressed', String(hasLiked(p.id)));
      $('span', like).textContent = '좋아요 ' + likes;
    };
    drawLike();
    if (p.status === 'published') {
      like.addEventListener('click', async () => {
        like.disabled = true;
        try {
          const on = await toggleLike(p.id);
          track(on ? 'post_like' : 'post_unlike', { post_id: p.id, post_category: p.category });
          likes = Math.max(0, likes + (on ? 1 : -1));
          drawLike();
        } catch (e) { console.warn(e); }
        like.disabled = false;
      });
    } else like.disabled = true;

    // 댓글
    const cList = $('[data-comment-list]');
    const cCount = $('[data-comment-count]');
    const cErr = $('[data-comment-error]');
    const drawComments = async () => {
      let cs = [];
      try { cs = await listComments(p.id); } catch (e) { console.warn(e); }
      cList.innerHTML = '';
      cs.forEach((c) => {
        const item = el('div', 'comment');
        item.appendChild(el('span', 'avatar'));
        const box = el('div');
        const who = el('div', 'who');
        who.append(el('strong', null, c.name), el('span', null, ' · ' + ago(c.date)));
        if (admin) {
          const del = el('button', 'link-plain comment-del', '삭제');
          del.type = 'button';
          del.addEventListener('click', async () => {
            if (!confirm('이 댓글을 삭제할까요?')) return;
            try { await deleteComment(p.id, c.id); drawComments(); } catch (e) { alert('삭제하지 못했어요.'); }
          });
          who.appendChild(del);
        }
        box.append(who, el('p', null, c.text));
        item.appendChild(box);
        cList.appendChild(item);
      });
      cCount.textContent = cs.length;
    };
    await drawComments();
    const cForm = $('[data-comment-form]');
    cForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const box = $('textarea', cForm);
      const text = box.value.trim();
      const name = ($('[id="comment-name"]').value.trim() || '익명').slice(0, 20);
      if (!text) { box.focus(); return; }
      cErr.hidden = true;
      $('button[type="submit"]', cForm).disabled = true;
      try {
        await addComment(p.id, name, text.slice(0, 1000));
        track('comment_submit', { post_id: p.id, post_category: p.category });
        box.value = '';
        await drawComments();
      } catch (ex) {
        cErr.textContent = '댓글을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.';
        cErr.hidden = false;
        console.warn(ex);
      }
      $('button[type="submit"]', cForm).disabled = false;
    });
  }
}
// GA: 글 상세는 실제 글 제목으로 방문 기록
if (postBody) {
  const pv = { page_type: 'post', page_title: document.title, page_location: location.href };
  if (currentPost) {
    // 같은 글이 post.html?id=… 와 p/글ID.html 두 주소로 나뉘지 않도록 대표 주소로 통일하고,
    // 이 페이지에서 나가는 모든 이벤트(체류 시간 포함)에 글 ID·카테고리를 붙임
    const shared = {
      page_location: new URL('p/' + encodeURIComponent(currentPost.id) + '.html', document.baseURI).href,
      page_title: document.title,
      post_id: currentPost.id,
      post_category: currentPost.category
    };
    if (typeof window.gtag === 'function') window.gtag('set', shared);
    Object.assign(pv, shared);
  }
  track('page_view', pv);

  // 완독: 본문 끝(좋아요·링크 복사 줄)이 화면에 보였고, 글을 연 지 최소 시간이 지났을 때 글당 1번
  // 최소 시간 = 예상 읽는 시간(1분에 500자)의 절반, 10초~2분 사이
  const end = $('.actions') || $('[data-post-tags]');
  if (currentPost && currentPost.status === 'published' && end) {
    const minMs = Math.min(120, Math.max(10, plainText(currentPost.body).length * 0.06)) * 1000;
    let seen = false;
    let sent = false;
    let timer = null;
    const check = () => {
      if (sent) return;
      if (!seen && end.getBoundingClientRect().top <= window.innerHeight) seen = true;
      if (!seen || performance.now() < minMs) return;
      sent = true;
      clearTimeout(timer);
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      track('post_read_complete', { post_id: currentPost.id, post_category: currentPost.category, read_seconds: Math.round(performance.now() / 1000) });
    };
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    timer = setTimeout(check, Math.max(0, minMs - performance.now()) + 100); // 끝을 먼저 봤으면 최소 시간이 되는 순간 기록
    check();
  }
}
const copy = $('[data-copy]');
if (copy) {
  copy.addEventListener('click', () => {
    const label = $('span', copy);
    const done = () => {
      label.textContent = '복사했어요';
      if (currentPost) track('share', { method: 'link_copy', content_type: 'post', item_id: currentPost.id, post_id: currentPost.id, post_category: currentPost.category });
      setTimeout(() => { label.textContent = '링크 복사'; }, 1500);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
  });
}

// ================= 글쓰기 (관리자만) =================
if (document.body.classList.contains('write-page')) {
  if (!admin) {
    location.replace('login.html'); // AC-12
  } else {
    let postId = params.get('id');
    let wasPublished = false;
    let tags = [];
    let cover = '';
    let images = {};
    const title = $('[data-title]');
    const body = $('[data-body]');
    const catSel = $('[data-cat-select]');
    const visBtns = $$('[data-vis]');
    const errBox = $('[data-write-error]');
    const saveState = $('[data-save-state]');
    const tagList = $('[data-tag-list]');
    const tagForm = $('[data-tag-form]');

    const showError = (msg) => { errBox.textContent = msg; errBox.hidden = !msg; };
    const setVis = (v) => visBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.vis === v)));
    const getVis = () => (visBtns.find((b) => b.getAttribute('aria-checked') === 'true') || visBtns[0]).dataset.vis;
    const count = () => { $('[data-char-count]').textContent = plainText(body.value).length; }; // AC-06
    const drawTags = () => {
      tagList.innerHTML = '';
      tags.forEach((t) => {
        const chip = el('span', 'tag-item', '#' + t);
        const x = el('button');
        x.type = 'button';
        x.setAttribute('aria-label', t + ' 태그 삭제');
        x.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        x.addEventListener('click', () => { tags = tags.filter((v) => v !== t); drawTags(); });
        chip.appendChild(x);
        tagList.appendChild(chip);
      });
    };

    // 기존 글 불러오기: 임시저장 이어 쓰기(AC-18), 발행 글 수정
    if (postId) {
      try {
        const p = await getPost(postId);
        if (p) {
          title.value = p.title; body.value = p.body; catSel.value = p.category;
          tags = p.tags.slice(); setVis(p.visibility); cover = p.cover; images = { ...p.images };
          wasPublished = p.status === 'published';
          saveState.textContent = wasPublished ? '발행된 글 수정 중' : '임시저장 글 · ' + fmtDate(p.date);
          $('[data-publish]').textContent = wasPublished ? '수정 발행' : '발행하기';
          $('[data-write-delete]').hidden = false;
        } else postId = null;
      } catch (e) { postId = null; }
    }

    // ---- 대표 이미지 ----
    const drop = $('[data-cover-drop]');
    const fileInput = $('[data-cover-file]');
    const hint = $('[data-cover-hint]');
    const HINT = hint.textContent;
    const drawCover = () => {
      drop.style.backgroundImage = cover ? 'url("' + cover + '")' : '';
      drop.classList.toggle('has-image', !!cover);
      $('[data-cover-tools]').hidden = !cover;
      $('[data-cover-pick]').hidden = !!cover;
      hint.hidden = !!cover;
    };
    const useFile = async (file) => {
      if (!file) return;
      showError('');
      hint.textContent = '이미지를 줄이는 중…';
      try { cover = await compressImage(file); } catch (e) {
        showError(e.message === 'not-image' ? '이미지 파일만 올릴 수 있어요.' : '이미지를 불러오지 못했어요. 다른 파일로 시도해 주세요.');
      }
      hint.textContent = HINT;
      drawCover();
    };
    // 점선 칸 어디를 눌러도 파일 고르기 창이 열림 (이미지가 있을 땐 바꾸기·삭제 버튼만)
    drop.addEventListener('click', (e) => {
      if (e.target.closest('[data-cover-tools]')) return;
      if (!cover) fileInput.click();
    });
    $('[data-cover-pick]').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    $('[data-cover-change]').addEventListener('click', () => fileInput.click());
    $('[data-cover-remove]').addEventListener('click', () => { cover = ''; drawCover(); });
    fileInput.addEventListener('change', () => { useFile(fileInput.files[0]); fileInput.value = ''; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); useFile(e.dataTransfer.files[0]); });

    // ---- 서식 툴바 ----
    const replaceSel = (fn) => {
      const s = body.selectionStart, e = body.selectionEnd;
      const [text, selStart, selEnd] = fn(body.value.slice(s, e), s);
      body.setRangeText(text, s, e, 'end');
      body.focus();
      if (selStart != null) body.setSelectionRange(selStart, selEnd);
      count();
    };
    const wrap = (mark, placeholder) => replaceSel((sel, s) => {
      const inner = sel || placeholder;
      return [mark + inner + mark, s + mark.length, s + mark.length + inner.length];
    });
    const prefixLines = (prefix) => {
      // 선택한 줄들의 맨 앞에 기호를 붙임
      const v = body.value;
      const start = v.lastIndexOf('\n', body.selectionStart - 1) + 1;
      let end = v.indexOf('\n', body.selectionEnd);
      if (end === -1) end = v.length;
      const lines = v.slice(start, end).split('\n').map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l));
      body.setRangeText(lines.join('\n'), start, end, 'select');
      body.focus();
      count();
    };
    const inlineFile = $('[data-inline-file]');
    const dataSize = () => JSON.stringify({ b: body.value, c: cover, i: images }).length;
    inlineFile.addEventListener('change', async () => {
      const file = inlineFile.files[0];
      inlineFile.value = '';
      if (!file) return;
      showError('');
      try {
        const data = await compressImage(file, 250000, 1200);
        if (dataSize() + data.length > 950000) { showError('이미지가 너무 많아 더 넣을 수 없어요. (글 1개에 약 1MB까지)'); return; }
        const id = Date.now().toString(36);
        images[id] = data;
        replaceSel(() => ['\n![이미지](img:' + id + ')\n', null, null]);
      } catch (e) {
        showError(e.message === 'not-image' ? '이미지 파일만 넣을 수 있어요.' : '이미지를 불러오지 못했어요.');
      }
    });
    $$('[data-fmt]').forEach((btn) => btn.addEventListener('click', () => {
      const cmd = btn.dataset.fmt;
      if (cmd === 'h2') prefixLines('## ');
      if (cmd === 'quote') prefixLines('> ');
      if (cmd === 'list') prefixLines('- ');
      if (cmd === 'bold') wrap('**', '굵은 글자');
      if (cmd === 'italic') wrap('*', '기울인 글자');
      if (cmd === 'link') {
        const url = prompt('연결할 주소를 입력하세요 (https://로 시작)', 'https://');
        if (!url || !/^https?:\/\/\S+$/.test(url.trim())) return;
        replaceSel((sel, s) => {
          const label = sel || '링크';
          return ['[' + label + '](' + url.trim() + ')', s + 1, s + 1 + label.length];
        });
      }
      if (cmd === 'image') inlineFile.click();
    }));

    count(); drawTags(); drawCover();
    document.body.removeAttribute('data-guard');

    // ---- AI 초안 도우미 (관리자 확인 뒤에만 불러옴) ----
    // 초안은 글쓰기 칸만 채우고, 저장은 기존 임시저장·발행 버튼으로 한다
    // 쓰던 내용이 있으면 'confirm'을 돌려주고, 패널에서 "바꾸기"를 누르면 force=true로 다시 부름
    // (브라우저 확인 창 confirm()은 막히는 환경이 있어 쓰지 않음)
    const applyDraft = (d, force) => {
      if (!force && (title.value.trim() || body.value.trim())) return 'confirm';
      title.value = d.title;
      body.value = (d.summary ? '> 요약: ' + d.summary + '\n\n' : '') + d.body;
      if (CATS[d.category]) catSel.value = d.category;
      tags = d.tags.slice(0, 20);
      drawTags(); count();
      [title, body, catSel].forEach((x) => x.classList.remove('field-error'));
      saveState.textContent = 'AI 초안 넣음 · 아직 저장 안 됨';
      return true;
    };
    let aiChat = null; // 글이 처음 저장되면 대화 기록을 그 글에 연결하기 위함
    import('./chatbot.js?v=20261125d')
      .then((m) => { aiChat = m.initChatbot({ applyDraft, track, getPostId: () => postId }); })
      .catch((e) => console.warn('AI 초안 도우미를 불러오지 못했어요', e));

    body.addEventListener('input', count);
    tagForm.addEventListener('submit', (e) => { // AC-08
      e.preventDefault();
      const input = $('input', tagForm);
      const t = input.value.trim().replace(/^#/, '').slice(0, 30);
      if (t && !tags.includes(t) && tags.length < 20) tags.push(t);
      input.value = '';
      drawTags();
    });
    visBtns.forEach((b) => b.addEventListener('click', () => setVis(b.dataset.vis))); // AC-07

    const collect = () => {
      // 본문에서 지운 이미지는 함께 정리
      const used = {};
      body.value.replace(/!\[[^\]]*\]\(img:([\w-]+)\)/g, (m, id) => { if (images[id]) used[id] = images[id]; return m; });
      return { title: title.value.trim(), body: body.value, category: catSel.value, tags, visibility: getVis(), cover, images: used };
    };
    const busy = (on) => $$('[data-save], [data-publish], [data-write-delete]').forEach((b) => { b.disabled = on; });
    const saveErr = (e, what) => {
      const big = e && /size|exceeds|too large/i.test(String(e.message));
      showError(big ? '이미지가 너무 커서 저장하지 못했어요. 이미지를 줄이거나 빼 주세요.' : what + '하지 못했어요. 잠시 후 다시 시도해 주세요.');
      console.warn(e);
    };

    $('[data-save]').addEventListener('click', async () => { // AC-09
      showError(''); busy(true);
      try {
        postId = await savePost(postId, collect(), false, false);
        if (aiChat) aiChat.onSaved(postId);
        wasPublished = false;
        history.replaceState(null, '', 'write.html?id=' + encodeURIComponent(postId));
        $('[data-write-delete]').hidden = false;
        $('[data-publish]').textContent = '발행하기';
        const d = new Date();
        saveState.textContent = '임시저장됨 · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' · 임시저장 카테고리에 보관';
      } catch (e) { saveErr(e, '저장'); }
      busy(false);
    });

    $('[data-publish]').addEventListener('click', async () => {
      const data = collect();
      const missing = []; // AC-11
      title.classList.toggle('field-error', !data.title); if (!data.title) missing.push('제목');
      body.classList.toggle('field-error', !data.body.trim()); if (!data.body.trim()) missing.push('본문');
      catSel.classList.toggle('field-error', !data.category); if (!data.category) missing.push('카테고리');
      if (missing.length) { showError(missing.join(', ') + '을(를) 입력해 주세요.'); return; }
      showError(''); busy(true);
      try {
        postId = await savePost(postId, data, true, !wasPublished);
        if (aiChat) aiChat.onSaved(postId);
        location.href = 'post.html?id=' + encodeURIComponent(postId); // AC-10
      } catch (e) { saveErr(e, '발행'); busy(false); }
    });

    $('[data-write-delete]').addEventListener('click', async () => {
      if (!postId || !confirm('이 글을 삭제할까요? 되돌릴 수 없어요.')) return;
      busy(true);
      try { await deletePost(postId); location.href = 'posts.html'; } catch (e) { saveErr(e, '삭제'); busy(false); }
    });
  }
}

// ================= 조회수 (관리자만, Chart.js) =================
if (document.body.classList.contains('stats-page')) {
  if (!admin) {
    location.replace('login.html');
  } else {
    document.body.removeAttribute('data-guard');
    const DAYS = 60; // 최근 60일을 불러와 7일·30일과 그 직전 기간을 비교
    const keys = [];
    for (let i = DAYS - 1; i >= 0; i--) keys.push(kstDay(new Date(Date.now() - i * 864e5)));
    const dayLabel = (k) => Number(k.slice(5, 7)) + '.' + Number(k.slice(8, 10));
    const fmtN = (n) => n.toLocaleString('ko-KR');
    const sumOf = (a) => a.reduce((s, v) => s + v, 0);

    let items = [];
    let loadError = false;
    try {
      const [posts, views] = await Promise.all([listPosts(true), listViews()]);
      const byId = Object.fromEntries(posts.map((p) => [p.id, p]));
      items = views.filter((v) => byId[v.id]).map((v) => ({
        id: v.id, title: byId[v.id].title || '(제목 없음)', cat: byId[v.id].category,
        daily: keys.map((k) => Number(v.days[k]) || 0)
      }));
    } catch (e) {
      console.warn('조회수를 불러오지 못했어요', e);
      loadError = true;
    }

    let range = 30;
    let selected = null;
    let current = null;
    let lineChart = null;
    let barChart = null;
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    const summarize = () => {
      const from = DAYS - range;
      const rows = items.map((it) => ({
        id: it.id, title: it.title, cat: it.cat,
        views: sumOf(it.daily.slice(from)), prev: sumOf(it.daily.slice(from - range, from)), series: it.daily.slice(from)
      })).filter((r) => r.views > 0 || r.prev > 0).sort((a, b) => b.views - a.views);
      const total = sumOf(rows.map((r) => r.views));
      const prevTotal = sumOf(rows.map((r) => r.prev));
      const daily = keys.slice(from).map((_, i) => sumOf(items.map((it) => it.daily[from + i])));
      return { rows, total, prevTotal, daily, labels: keys.slice(from).map(dayLabel) };
    };

    // 마우스 위치에 세로선
    const crosshair = {
      id: 'crosshair',
      afterDatasetsDraw(chart) {
        const a = chart.tooltip && chart.tooltip.getActiveElements();
        if (!a || !a.length) return;
        const { ctx, chartArea } = chart;
        ctx.save(); ctx.strokeStyle = css('--faint'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(a[0].element.x, chartArea.top); ctx.lineTo(a[0].element.x, chartArea.bottom); ctx.stroke(); ctx.restore();
      }
    };
    const tooltip = () => ({
      backgroundColor: css('--ink'), titleColor: '#fff', bodyColor: '#fff', padding: 10, cornerRadius: 6, displayColors: false,
      titleFont: { family: 'Noto Sans KR', weight: '700' }, bodyFont: { family: 'Noto Sans KR' }
    });
    const tick = () => ({ color: css('--faint'), font: { size: 11 } });

    const drawLine = (labels, data) => {
      const mark = css('--accent');
      if (lineChart) lineChart.destroy();
      lineChart = new window.Chart($('[data-stats-line]'), {
        type: 'line',
        data: { labels, datasets: [{
          data, borderColor: mark, borderWidth: 2, backgroundColor: 'rgba(31,79,199,.1)', fill: true, tension: 0.25,
          pointRadius: (c) => (c.dataIndex === data.length - 1 ? 4 : 0), pointHoverRadius: 5,
          pointBackgroundColor: mark, pointBorderColor: '#fff', pointBorderWidth: 2
        }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { ...tooltip(), callbacks: { label: (i) => '조회 ' + fmtN(i.parsed.y) + '회' } } },
          scales: {
            x: { grid: { display: false }, border: { color: css('--line') }, ticks: { ...tick(), maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
            y: { beginAtZero: true, grid: { color: css('--line') }, border: { display: false }, ticks: { ...tick(), maxTicksLimit: 5, precision: 0 } }
          }
        },
        plugins: [crosshair]
      });
    };

    const drawBars = (rows) => {
      const box = $('[data-stats-bars-box]');
      box.style.height = Math.max(180, rows.length * 44 + 40) + 'px';
      const mark = css('--accent');
      if (barChart) barChart.destroy();
      barChart = new window.Chart($('[data-stats-bars]'), {
        type: 'bar',
        data: {
          labels: rows.map((r) => (r.title.length > 16 ? r.title.slice(0, 15) + '…' : r.title)),
          datasets: [{
            data: rows.map((r) => r.views),
            backgroundColor: rows.map((r) => (!selected || r.id === selected ? mark : '#C9D5F3')),
            borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: 'start', barThickness: 16
          }]
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
          layout: { padding: { right: 40 } },
          plugins: { legend: { display: false }, tooltip: { ...tooltip(), callbacks: {
            title: (i) => rows[i[0].dataIndex].title,
            label: (i) => '조회 ' + fmtN(rows[i.dataIndex].views) + '회 · 전체의 ' + Math.round(rows[i.dataIndex].views / (current.total || 1) * 100) + '%'
          } } },
          scales: {
            x: { beginAtZero: true, grid: { color: css('--line') }, border: { display: false }, ticks: { ...tick(), maxTicksLimit: 5, precision: 0 } },
            y: { grid: { display: false }, border: { color: css('--line') }, ticks: { color: css('--sub'), font: { size: 12 } } }
          },
          onClick: (e, els) => { if (els.length) select(selected === rows[els[0].index].id ? null : rows[els[0].index].id); },
          onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
        },
        plugins: [{
          id: 'tipValue', // 막대 끝에 값
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save(); ctx.fillStyle = css('--ink'); ctx.font = '500 12px "Noto Sans KR", sans-serif'; ctx.textBaseline = 'middle';
            chart.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(fmtN(rows[i].views), bar.x + 6, bar.y));
            ctx.restore();
          }
        }]
      });
    };

    const select = (id) => {
      selected = id && current.rows.some((r) => r.id === id) ? id : null;
      const row = selected && current.rows.find((r) => r.id === selected);
      $('[data-stats-target]').textContent = row ? row.title : '전체 글';
      $('[data-stats-reset]').hidden = !row;
      drawLine(current.labels, row ? row.series : current.daily);
      drawBars(current.rows);
    };

    const render = () => {
      current = summarize();
      const s = current;
      const empty = s.total === 0;
      $('[data-stats-empty]').hidden = !empty;
      $('[data-stats-charts]').hidden = empty;
      $('[data-stats-total]').textContent = fmtN(s.total);
      const d = $('[data-stats-delta]');
      if (s.prevTotal) {
        const diff = s.total - s.prevTotal;
        d.className = 'delta ' + (diff >= 0 ? 'up' : 'down');
        d.innerHTML = '';
        d.append((diff >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(diff / s.prevTotal * 100)) + '% ', el('span', null, '직전 ' + range + '일 대비'));
      } else {
        d.className = 'delta';
        d.innerHTML = '';
        d.append(el('span', null, '직전 ' + range + '일 기록 없음'));
      }
      $('[data-stats-avg]').textContent = (s.total / range).toFixed(1);
      $('[data-stats-days]').textContent = range + '일 기준';
      $('[data-stats-top]').textContent = s.rows[0] && s.rows[0].views ? s.rows[0].title : '—';
      $('[data-stats-topv]').textContent = s.rows[0] && s.rows[0].views ? '조회 ' + fmtN(s.rows[0].views) + '회' : '';
      $('[data-stats-range]').textContent = s.labels[0] + ' ~ ' + s.labels[s.labels.length - 1];
      const tbody = $('[data-stats-tbody]');
      tbody.innerHTML = '';
      s.rows.forEach((r, i) => {
        const tr = el('tr');
        const ch = r.prev ? Math.round((r.views - r.prev) / r.prev * 100) : null;
        const chip = el('span', 'stats-chip ' + (r.cat || ''), CATS[r.cat] || '-');
        const tdCat = el('td'); tdCat.appendChild(chip);
        const tdTitle = el('td'); const a = el('a', null, r.title); a.href = 'post.html?id=' + encodeURIComponent(r.id); tdTitle.appendChild(a);
        tr.append(el('td', null, String(i + 1)), tdTitle, tdCat, el('td', 'n', fmtN(r.views)),
          el('td', 'n', s.total ? Math.round(r.views / s.total * 100) + '%' : '-'),
          el('td', 'n', ch == null ? '-' : (ch >= 0 ? '+' : '') + ch + '%'));
        tbody.appendChild(tr);
      });
      if (!empty) select(selected);
    };

    if (loadError) {
      $('[data-stats-error]').hidden = false;
    } else if (!window.Chart) {
      $('[data-stats-error]').textContent = '그래프를 그리는 도구를 불러오지 못했어요. 새로고침해 주세요.';
      $('[data-stats-error]').hidden = false;
    } else {
      window.Chart.defaults.font.family = '"Noto Sans KR", system-ui, sans-serif';
      $$('[data-range]').forEach((b) => b.addEventListener('click', () => {
        range = Number(b.dataset.range);
        $$('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        render();
      }));
      $('[data-stats-reset]').addEventListener('click', () => select(null));
      $('[data-stats-table-toggle]').addEventListener('click', (e) => {
        const t = $('[data-stats-table]');
        const open = t.hidden;
        t.hidden = !open;
        e.currentTarget.setAttribute('aria-expanded', String(open));
        e.currentTarget.textContent = open ? '표 접기 ▴' : '표로 보기 ▾';
      });
      render();
    }
  }
}

// ================= 관리자 로그인 (구글) =================
const loginForm = $('[data-login-form]');
if (loginForm) {
  const done = $('[data-login-done]');
  const err = $('[data-login-error]');
  const google = $('[data-google]');
  const emailForm = $('[data-email-form]');
  const showDone = () => { loginForm.hidden = true; if (emailForm) emailForm.hidden = true; done.hidden = false; };
  const showUid = (u) => {
    if (adminReady || !u) return;
    $('[data-uid]').textContent = u.uid;
    $('[data-uid-box]').hidden = false;
  };

  if (!configured) {
    $('[data-not-configured]').hidden = false;
    google.disabled = true;
  } else if (admin) {
    showDone();
  } else if (user) {
    showUid(user);
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    google.disabled = true;
    try {
      const u = await signInGoogle($('[data-keep]').checked); // AC-17
      if (isAdmin(u)) { showDone(); return; } // AC-04
      showUid(u);
      await signOutNow();
      err.textContent = '관리자로 등록된 계정이 아니에요.'; // AC-15
      err.hidden = false;
    } catch (ex) {
      if (ex && ex.code !== 'auth/popup-closed-by-user' && ex.code !== 'auth/cancelled-popup-request') {
        err.textContent = ex.code === 'auth/unauthorized-domain'
          ? '이 주소가 Firebase 승인된 도메인에 없어요. (Authentication → 설정 → 승인된 도메인)'
          : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.';
        err.hidden = false;
        console.warn(ex);
      }
    }
    google.disabled = false;
  });

  // 테스트 계정 로그인 (이메일·비밀번호) — 관리자로 등록된 계정만 통과
  if (emailForm) {
    const eErr = $('[data-email-error]');
    const eBtn = $('[data-email-submit]');
    if (!configured) eBtn.disabled = true;
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      eErr.hidden = true;
      eBtn.disabled = true;
      try {
        const u = await signInEmail($('[data-email]').value.trim(), $('[data-password]').value, $('[data-keep]').checked);
        $('[data-password]').value = '';
        if (isAdmin(u)) { showDone(); return; }
        await signOutNow();
        eErr.textContent = '테스트 계정으로 등록되지 않은 계정이에요.';
        eErr.hidden = false;
      } catch (ex) {
        const c = ex && ex.code;
        eErr.textContent = (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email')
          ? '이메일이나 비밀번호가 맞지 않아요.'
          : c === 'auth/operation-not-allowed'
            ? '이메일 로그인이 아직 켜져 있지 않아요. (Firebase 콘솔 → Authentication → 로그인 방법)'
            : c === 'auth/too-many-requests'
              ? '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.'
              : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.';
        eErr.hidden = false;
        console.warn(ex);
      }
      eBtn.disabled = false;
    });
  }
}
