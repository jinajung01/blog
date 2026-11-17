// Firebase 연결: 구글 로그인(관리자 1명)과 글 저장
import { firebaseConfig, ADMIN_UID } from './firebase-config.js';

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

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

export function isAdmin(user) {
  return !!(user && ADMIN_UID && user.uid === ADMIN_UID);
}

// 현재 로그인한 사용자 (30일이 지난 '로그인 유지'는 로그아웃 처리)
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

// 구글 로그인. keep=true면 브라우저를 닫아도 최대 30일 유지, false면 브라우저를 닫으면 로그아웃
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
    date
  };
}

// 글 목록: 방문자는 공개·발행 글만, 관리자는 나만 보기·임시저장까지 전부 (AC-13·14·19)
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

// 저장: publish=false면 임시저장, true면 발행. 글 id를 돌려줌
export async function savePost(id, data, publish) {
  const f = await fb();
  if (!f) throw new Error('not-configured');
  const now = f.F.serverTimestamp();
  const doc = {
    title: data.title,
    body: data.body,
    category: data.category,
    tags: data.tags,
    visibility: data.visibility,
    status: publish ? 'published' : 'draft',
    updatedAt: now
  };
  if (publish) doc.publishedAt = now;
  if (id) {
    await f.F.setDoc(f.F.doc(f.db, 'posts', id), doc, { merge: true });
    return id;
  }
  doc.createdAt = now;
  const ref = await f.F.addDoc(f.F.collection(f.db, 'posts'), doc);
  return ref.id;
}

// 화면 표시용 도우미
export function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
}
export function readTime(body) {
  return Math.max(1, Math.round(body.length / 500)) + '분 읽기';
}
