// 블로그 화면 동작
import {
  configured, adminReady, CATS, isAdmin, currentUser, signInGoogle, signOutNow,
  listPosts, getPost, savePost, fmtDate, readTime
} from './data.js';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const params = new URLSearchParams(location.search);

// 로그인 상태 (설정 전이면 항상 방문자)
let user = null;
try { user = await currentUser(); } catch (e) { console.warn('로그인 확인 실패', e); }
const admin = isAdmin(user);

// 헤더 글쓰기 버튼: 관리자면 바로 글쓰기, 아니면 로그인 화면 (AC-01)
if (admin) $$('[data-write-link]').forEach((a) => { a.href = 'write.html'; });

$$('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
  await signOutNow();
  location.href = 'index.html'; // AC-16
}));

async function safeList() {
  try { return await listPosts(admin); } catch (e) { console.warn('글 목록을 불러오지 못했어요', e); return []; }
}
const postHref = (p) => (p.status === 'draft' ? 'write.html?id=' : 'post.html?id=') + encodeURIComponent(p.id);
const badge = (p) => {
  if (p.status === 'draft') return el('span', 'badge-private badge-draft', '임시저장');
  if (p.visibility === 'private') return el('span', 'badge-private', '나만 보기'); // AC-19
  return null;
};
const excerpt = (body) => body.replace(/\s+/g, ' ').trim().slice(0, 90);

// ---- 첫 화면 ----
const subForm = $('[data-subscribe-form]');
if (subForm) {
  subForm.addEventListener('submit', (e) => {
    e.preventDefault();
    subForm.hidden = true;
    $('[data-subscribe-done]').hidden = false;
  });
}
const recent = $('[data-recent]');
if (recent && configured) {
  const posts = (await safeList()).filter((p) => p.status === 'published').slice(0, 3);
  posts.reverse().forEach((p) => {
    const a = el('a', 'post-card');
    a.href = postHref(p);
    a.appendChild(el('div', 'cover placeholder tint-' + p.category, '커버 이미지'));
    const body = el('div', 'body');
    const cat = el('span', 'eyebrow', CATS[p.category] || '');
    const b = badge(p); if (b) cat.appendChild(b);
    body.append(cat, el('h3', null, p.title), el('span', 'meta', fmtDate(p.date) + ' · ' + readTime(p.body)));
    a.appendChild(body);
    recent.prepend(a);
  });
  $$('.post-card', recent).slice(3).forEach((n) => n.remove());
}

// ---- 글 목록: 카테고리·검색·정렬 ----
const list = $('[data-post-list]');
if (list) {
  const rowsBox = $('[data-rows]', list);
  if (admin) {
    $('[data-admin-note]', list).hidden = false;
    $('.chip[data-cat="draft"]', list).hidden = false; // AC-14
  }
  (await safeList()).forEach((p) => {
    const a = el('a', 'post-row');
    a.href = postHref(p);
    a.dataset.cat = p.status === 'draft' ? 'draft' : p.category;
    a.dataset.date = p.date.toISOString();
    const text = el('div', 'text');
    const cat = el('span', 'eyebrow', p.status === 'draft' ? (CATS[p.category] || '임시저장') : CATS[p.category]);
    const b = badge(p); if (b) cat.appendChild(b);
    text.append(cat, el('h2', null, p.title || '(제목 없음)'), el('p', null, excerpt(p.body)),
      el('span', 'meta', (p.status === 'draft' ? '임시저장 ' : '') + fmtDate(p.date) + ' · ' + (p.status === 'draft' ? '이어 쓰기' : readTime(p.body))));
    a.append(text, el('div', 'cover placeholder tint-' + (p.status === 'draft' ? 'draft' : p.category), '커버 이미지'));
    rowsBox.appendChild(a);
  });

  const rows = $$('.post-row', rowsBox);
  const chips = $$('.chip', list).filter((c) => !c.hidden);
  const search = $('[data-search]', list);
  const sort = $('[data-sort]', list);
  const state = { cat: chips.some((c) => c.dataset.cat === params.get('cat')) ? params.get('cat') : 'all', q: '' };

  const render = () => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === state.cat)));
    const q = state.q.trim();
    let shown = 0;
    rows.forEach((r) => {
      const okCat = state.cat === 'all' ? r.dataset.cat !== 'draft' : r.dataset.cat === state.cat;
      const okQ = !q || $('h2', r).textContent.includes(q);
      r.hidden = !(okCat && okQ);
      if (!r.hidden) shown++;
    });
    const dir = sort.value === 'old' ? 1 : -1;
    rows.slice().sort((a, b) => (a.dataset.date < b.dataset.date ? -dir : dir)).forEach((r) => rowsBox.appendChild(r));
    $('[data-count]', list).textContent = '글 ' + shown + '개';
    $('[data-empty]', list).hidden = shown !== 0;
  };
  chips.forEach((c) => c.addEventListener('click', () => { state.cat = c.dataset.cat; render(); }));
  search.addEventListener('input', () => { state.q = search.value; render(); });
  sort.addEventListener('change', render);
  $('[data-reset]', list).addEventListener('click', () => { state.cat = 'all'; state.q = ''; search.value = ''; render(); });
  render();
}

// ---- 글 상세 ----
const postBody = $('[data-post-body]');
if (postBody && params.get('id')) {
  let p = null;
  try { p = await getPost(params.get('id')); } catch (e) { p = null; } // 권한 없음 = 보이지 않음 (AC-13)
  if (!p || p.status === 'draft') {
    const main = $('.post-main');
    main.innerHTML = '';
    const box = el('div', 'post-msg');
    box.append(el('strong', null, '글을 찾을 수 없어요'), el('p', 'meta', '삭제되었거나 공개되지 않은 글이에요.'));
    const back = el('a', 'btn btn-line', '글 목록으로'); back.href = 'posts.html';
    box.appendChild(back);
    main.appendChild(box);
  } else {
    document.title = p.title + ' - 내 블로그';
    const catName = CATS[p.category] || '';
    const crumb = $('[data-post-crumb]');
    crumb.textContent = catName; crumb.href = 'posts.html?cat=' + p.category;
    const cat = $('[data-post-cat]'); cat.textContent = catName;
    const b = badge(p); if (b) cat.appendChild(b);
    $('[data-post-title]').textContent = p.title;
    $('[data-post-meta]').textContent = fmtDate(p.date) + ' · ' + readTime(p.body);
    $('[data-post-cover]').className = 'post-cover placeholder tint-' + p.category;
    postBody.innerHTML = '';
    p.body.split(/\n{2,}/).forEach((para) => {
      const t = para.trim();
      if (t) postBody.appendChild(el('p', null, t));
    });
    $$('p', postBody).forEach((n) => { n.style.whiteSpace = 'pre-line'; });
    const tags = $('[data-post-tags]');
    tags.innerHTML = '';
    p.tags.forEach((t) => { const a = el('a', null, '#' + t); a.href = 'posts.html'; tags.appendChild(a); });
    $('[data-post-nav] a').remove();
  }
}
const like = $('[data-like]');
if (like) {
  const base = Number(like.dataset.count);
  like.addEventListener('click', () => {
    const on = like.getAttribute('aria-pressed') !== 'true';
    like.setAttribute('aria-pressed', String(on));
    $('span', like).textContent = '좋아요 ' + (base + (on ? 1 : 0));
  });
}
const copy = $('[data-copy]');
if (copy) {
  copy.addEventListener('click', () => {
    const label = $('span', copy);
    const done = () => {
      label.textContent = '복사했어요';
      setTimeout(() => { label.textContent = '링크 복사'; }, 1500);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
  });
}
const cForm = $('[data-comment-form]');
if (cForm) {
  cForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const box = $('textarea', cForm);
    const text = box.value.trim();
    if (!text) { box.focus(); return; }
    const item = el('div', 'comment');
    item.innerHTML = '<span class="avatar" aria-hidden="true"></span><div><div class="who"><strong>나</strong> <span>· 방금</span></div><p></p></div>';
    $('p', item).textContent = text;
    $('[data-comment-list]').appendChild(item);
    const count = $('[data-comment-count]');
    count.textContent = Number(count.textContent) + 1;
    box.value = '';
  });
}

// ---- 글쓰기 (관리자만) ----
if (document.body.classList.contains('write-page')) {
  if (!admin) {
    location.replace('login.html'); // AC-12
  } else {
    let postId = params.get('id');
    let tags = [];
    const title = $('[data-title]');
    const body = $('[data-body]');
    const catSel = $('[data-cat-select]');
    const visBtns = $$('[data-vis]');
    const errBox = $('[data-write-error]');
    const saveState = $('[data-save-state]');
    const tagList = $('[data-tag-list]');
    const tagForm = $('[data-tag-form]');

    const setVis = (v) => visBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.vis === v)));
    const getVis = () => (visBtns.find((b) => b.getAttribute('aria-checked') === 'true') || visBtns[0]).dataset.vis;
    const count = () => { $('[data-char-count]').textContent = body.value.length; }; // AC-06
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

    // 임시저장 글 이어 쓰기 (AC-18)
    if (postId) {
      try {
        const p = await getPost(postId);
        if (p) {
          title.value = p.title; body.value = p.body; catSel.value = p.category;
          tags = p.tags.slice(); setVis(p.visibility);
          saveState.textContent = p.status === 'draft' ? '임시저장 글 · ' + fmtDate(p.date) : '발행된 글 수정 중';
        } else postId = null;
      } catch (e) { postId = null; }
    }
    count(); drawTags();
    document.body.removeAttribute('data-guard');

    body.addEventListener('input', count);
    tagForm.addEventListener('submit', (e) => { // AC-08
      e.preventDefault();
      const input = $('input', tagForm);
      const t = input.value.trim().replace(/^#/, '');
      if (t && !tags.includes(t)) tags.push(t);
      input.value = '';
      drawTags();
    });
    visBtns.forEach((b) => b.addEventListener('click', () => setVis(b.dataset.vis))); // AC-07

    const collect = () => ({ title: title.value.trim(), body: body.value, category: catSel.value, tags, visibility: getVis() });
    const showError = (msg) => { errBox.textContent = msg; errBox.hidden = !msg; };
    const busy = (on) => $$('[data-save], [data-publish]').forEach((b) => { b.disabled = on; });

    $('[data-save]').addEventListener('click', async () => { // AC-09
      showError(''); busy(true);
      try {
        postId = await savePost(postId, collect(), false);
        history.replaceState(null, '', 'write.html?id=' + encodeURIComponent(postId));
        const d = new Date();
        saveState.textContent = '임시저장됨 · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' · 임시저장 카테고리에 보관';
      } catch (e) {
        showError('저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
        console.warn(e);
      }
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
        postId = await savePost(postId, data, true);
        location.href = 'post.html?id=' + encodeURIComponent(postId); // AC-10
      } catch (e) {
        showError('발행하지 못했어요. 잠시 후 다시 시도해 주세요.');
        console.warn(e);
        busy(false);
      }
    });
  }
}

// ---- 관리자 로그인 (구글) ----
const loginForm = $('[data-login-form]');
if (loginForm) {
  const done = $('[data-login-done]');
  const err = $('[data-login-error]');
  const google = $('[data-google]');
  const showDone = () => { loginForm.hidden = true; done.hidden = false; };
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
        err.textContent = '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.';
        err.hidden = false;
        console.warn(ex);
      }
    }
    google.disabled = false;
  });
}
