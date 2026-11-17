// Firebase 연결: 구글 로그인(관리자 1명), 글·댓글·좋아요·구독 저장
import { firebaseConfig, ADMIN_UID } from './firebase-config.js?v=20261117f';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const LOGIN_AT = 'blog.loginAt';
const KEEP_DAYS = 30; // 로그인 상태 유지 최대 기간 (AC-17)

export const configured = !!(firebaseConfig && firebaseConfig.apiKey);
export const adminReady = !!ADMIN_UID;
export const CATS = { plan: '기획', design: '디자인', retro: '회고' };

let fbPromise = null;
function fb() {
  if (!configured) return Promise.resolve(null);
  if (!fbPromise) {
    fbPromise = Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]).then(([app, A, F]) => {
      const a = app.initializeApp(firebaseConfig);
      return { auth: A.getAuth(a), db: F.getFirestore(a), A, F };
    });
  }
  return fbPromise;
}

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

export function isAdmin(user) {
  return !!(user && ADMIN_UID && user.uid === ADMIN_UID);
}

// ---------- 로그인 ----------
export async function currentUser() {
  const f = await fb();
  if (!f) return null;
  const user = await new Promise((resolve) => {
    const stop = f.A.onAuthStateChanged(f.auth, (u) => { stop(); resolve(u); });
  });
  const at = Number(store.get(LOGIN_AT));
  if (user && at && Date.now() - at > KEEP_DAYS * 864e5) {
    await signOutNow();
    return null;
  }
  return user;
}

export async function signInGoogle(keep) {
  const f = await fb();
  if (!f) throw new Error('not-configured');
  await f.A.setPersistence(f.auth, keep ? f.A.browserLocalPersistence : f.A.browserSessionPersistence);
  const provider = new f.A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const res = await f.A.signInWithPopup(f.auth, provider);
  if (keep) store.set(LOGIN_AT, String(Date.now())); else store.del(LOGIN_AT);
  return res.user;
}

export async function signOutNow() {
  store.del(LOGIN_AT);
  const f = await fb();
  if (f) await f.A.signOut(f.auth);
}

// ---------- 글 ----------
function toPost(d) {
  const x = d.data();
  const t = (x.publishedAt || x.updatedAt || x.createdAt);
  const date = t && t.toDate ? t.toDate() : new Date();
  return {
    id: d.id,
    title: x.title || '',
    body: x.body || '',
    category: x.category || '',
    tags: Array.isArray(x.tags) ? x.tags : [],
    visibility: x.visibility === 'private' ? 'private' : 'public',
    status: x.status === 'draft' ? 'draft' : 'published',
    cover: typeof x.cover === 'string' ? x.cover : '',
    images: x.images && typeof x.images === 'object' ? x.images : {},
    likes: typeof x.likes === 'number' ? x.likes : 0,
    date
  };
}

// 방문자는 공개·발행 글만, 관리자는 나만 보기·임시저장까지 전부 (AC-13·14·19)
export async function listPosts(admin) {
  const f = await fb();
  if (!f) return [];
  const col = f.F.collection(f.db, 'posts');
  const q = admin ? col : f.F.query(col,
    f.F.where('status', '==', 'published'),
    f.F.where('visibility', '==', 'public'));
  const snap = await f.F.getDocs(q);
  return snap.docs.map(toPost).sort((a, b) => b.date - a.date);
}

export async function getPost(id) {
  const f = await fb();
  if (!f) return null;
  const d = await f.F.getDoc(f.F.doc(f.db, 'posts', id));
  return d.exists() ? toPost(d) : null;
}

// publish=false면 임시저장, true면 발행. firstPublish=true일 때만 발행일을 새로 기록
export async function savePost(id, data, publish, firstPublish) {
  const f = await fb();
  if (!f) throw new Error('not-configured');
  const now = f.F.serverTimestamp();
  const doc = {
    title: data.title,
    body: data.body,
    category: data.category,
    tags: data.tags,
    visibility: data.visibility,
    cover: data.cover || '',
    images: data.images || {},
    status: publish ? 'published' : 'draft',
    updatedAt: now
  };
  if (publish && firstPublish) doc.publishedAt = now;
  if (id) {
    // images는 통째로 바꿔야 지운 이미지가 남지 않음
    await f.F.setDoc(f.F.doc(f.db, 'posts', id), doc, { mergeFields: Object.keys(doc) });
    return id;
  }
  doc.createdAt = now;
  doc.likes = 0;
  const ref = await f.F.addDoc(f.F.collection(f.db, 'posts'), doc);
  return ref.id;
}

export async function deletePost(id) {
  const f = await fb();
  const comments = await f.F.getDocs(f.F.collection(f.db, 'posts', id, 'comments'));
  await Promise.all(comments.docs.map((c) => f.F.deleteDoc(c.ref)));
  await f.F.deleteDoc(f.F.doc(f.db, 'posts', id));
}

// ---------- 좋아요 (브라우저마다 1번) ----------
const LIKED = 'blog.liked';
export function hasLiked(id) {
  return (store.get(LIKED) || '').split(',').includes(id);
}
export async function toggleLike(id) {
  const f = await fb();
  const on = !hasLiked(id);
  await f.F.updateDoc(f.F.doc(f.db, 'posts', id), { likes: f.F.increment(on ? 1 : -1) });
  const set = new Set((store.get(LIKED) || '').split(',').filter(Boolean));
  if (on) set.add(id); else set.delete(id);
  store.set(LIKED, Array.from(set).join(','));
  return on;
}

// ---------- 댓글 ----------
export async function listComments(postId) {
  const f = await fb();
  const snap = await f.F.getDocs(f.F.collection(f.db, 'posts', postId, 'comments'));
  return snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, name: x.name || '익명', text: x.text || '', date: x.createdAt && x.createdAt.toDate ? x.createdAt.toDate() : new Date() };
  }).sort((a, b) => a.date - b.date);
}
export async function addComment(postId, name, text) {
  const f = await fb();
  await f.F.addDoc(f.F.collection(f.db, 'posts', postId, 'comments'), {
    name, text, createdAt: f.F.serverTimestamp()
  });
}
export async function deleteComment(postId, id) {
  const f = await fb();
  await f.F.deleteDoc(f.F.doc(f.db, 'posts', postId, 'comments', id));
}

// ---------- 구독 (이메일 주소를 문서 이름으로 써서 중복 신청을 막음) ----------
export async function subscribe(email) {
  const f = await fb();
  if (!f) throw new Error('not-configured');
  try {
    await f.F.setDoc(f.F.doc(f.db, 'subscribers', email), { email, createdAt: f.F.serverTimestamp() });
  } catch (e) {
    if (e && e.code === 'permission-denied') return 'already'; // 이미 신청한 주소
    throw e;
  }
  return 'ok';
}

// ---------- 이미지: 브라우저에서 줄여 JPEG 글자 데이터로 (글 1개 저장 한도 1MB) ----------
export async function compressImage(file, maxBytes = 700000, maxWidth = 1600) {
  if (!file || !/^image\//.test(file.type)) throw new Error('not-image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('bad-image'));
      i.src = url;
    });
    let width = Math.min(maxWidth, img.naturalWidth);
    for (let tries = 0; tries < 6; tries++) {
      const scale = width / img.naturalWidth;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.82, 0.7, 0.58]) {
        const data = c.toDataURL('image/jpeg', q);
        if (data.length <= maxBytes) return data;
      }
      width = Math.round(width * 0.75);
    }
    throw new Error('too-big');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- 본문 서식 ----------
// 지원: ## 소제목, > 인용, - 목록, **굵게**, *기울임*, [글자](https://주소), ![설명](img:번호)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
export function renderBody(body, images) {
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
  const flushList = () => { if (list) { out.push('<ul>' + list.map((t) => '<li>' + inline(t) + '</li>').join('') + '</ul>'); list = null; } };
  body.replace(/\r/g, '').split('\n').forEach((line) => {
    const t = line.trim();
    let m;
    if (!t) { flushPara(); flushList(); return; }
    if ((m = t.match(/^!\[([^\]]*)\]\(img:([\w-]+)\)$/))) {
      flushPara(); flushList();
      const src = images && images[m[2]];
      if (src && /^data:image\/jpeg;base64,/.test(src)) out.push('<figure><img src="' + src + '" alt="' + esc(m[1]) + '" loading="lazy"></figure>');
      return;
    }
    if ((m = t.match(/^##\s+(.*)$/))) { flushPara(); flushList(); out.push('<h2>' + inline(m[1]) + '</h2>'); return; }
    if ((m = t.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); return; }
    if ((m = t.match(/^[-*]\s+(.*)$/))) { flushPara(); (list = list || []).push(m[1]); return; }
    flushList();
    para.push(t);
  });
  flushPara(); flushList();
  return out.join('\n');
}
// 서식 기호를 뺀 순수 글자 (요약·글자 수·읽는 시간용)
export function plainText(body) {
  return body
    .replace(/!\[[^\]]*\]\(img:[\w-]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*(##|>|[-*])\s?/gm, '')
    .replace(/\*\*|\*/g, '');
}

// ---------- 화면 표시용 도우미 ----------
export function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
}
export function readTime(body) {
  return Math.max(1, Math.round(plainText(body).length / 500)) + '분 읽기';
}
