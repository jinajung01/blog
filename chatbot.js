// AI 초안 도우미 (관리자 글쓰기 화면 전용)
// 수업 메모·실습 내용을 받아 빠진 맥락을 최대 3개 묻고, 블로그 글 초안으로 정리한다.
// - Firebase AI Logic(Gemini Developer API, 무료 등급) 사용. API 키는 Firebase 콘솔이 관리
// - 기존 로그인·글 저장과 섞이지 않도록 AI 전용 Firebase 앱을 따로 만든다
import { firebaseConfig, RECAPTCHA_ENTERPRISE_KEY } from './firebase-config.js?v=20261124a';

const SDK = 'https://www.gstatic.com/firebasejs/13.2.0/';
const MODEL = 'gemini-3.5-flash-lite';
const MAX_QUESTIONS = 3;
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

const SYSTEM = `너는 블로그 관리자의 "수업 기록 → 블로그 글 초안" 정리 도우미다.
관리자는 AI PM 과정 수강생이고, 강의 중 짧게 적은 메모나 실습한 내용을 떠올려 입력한다.

[입력 종류]
- lecture: 강의 메모 (키워드 위주로 짧음)
- practice: 실습 회상 (만든 것·순서·막힌 점·배운 점)
- mixed: 둘이 섞인 입력

[진행 규칙]
1. 첫 입력을 받으면 설명이 빠진 부분을 찾는다.
   - 강의: 설명 없이 키워드만 있는 부분
   - 실습: 만든 것, 순서, 막힌 점, 배운 점 중 빠진 것
2. 첫 입력에 설명 없는 키워드나 빠진 실습 단계가 하나라도 있으면, 초안을 쓰지 말고 반드시 먼저 질문한다.
   다른 항목에 설명이 많이 붙어 있어도, 설명 없는 제목·키워드가 한 줄이라도 있으면 질문한다.
   (예: "볶음밥 / 계란찜 - 약불로 10분 찌기" → "볶음밥"은 설명이 없으므로 질문한다. 이 경우 바로 초안을 쓰면 틀린 것)
   가장 중요한 것만 골라 한 번에 최대 ${MAX_QUESTIONS}개 묻는다. 질문은 짧고 구체적으로, 하나에 한 가지만 묻는다.
   강의 키워드는 "확인형"으로 묻는다: 그 개념의 일반적인 뜻을 한 줄로 제시하고, 수업에서도 그렇게 설명했는지 확인하며 덧붙일 예시를 묻는다.
   (예: "AS-IS/TO-BE는 '현재 상태와 바라는 상태를 비교해 개선점을 찾는 방법'으로 알고 있어요. 수업에서도 이렇게 설명했나요? 덧붙일 예시가 있나요?")
   실습은 "어떤 순서로 했나요?", "어디서 막혔나요?"처럼 빠진 단계를 직접 묻는다.
   질문 개수가 남으면 "이 내용에서 기억하고 싶은 점이나 써먹을 곳이 있나요?"처럼 느낀 점·배운 점을 1개 물어 마무리 문단 재료로 쓴다.
   모든 내용에 설명이 붙어 있을 때만 질문 없이 바로 초안을 쓴다.
3. 질문은 한 번만 한다. 관리자가 답하면 반드시 초안을 쓴다.
4. 관리자가 "그냥 써줘"라고 하면 질문 없이 바로 초안을 쓴다.
5. 관리자가 주지 않은 내용은 지어내지 않는다. 용어의 일반적인 사전 설명으로 빈칸을 채우지도 않는다.
   이 글은 "수업에서 무엇을 배웠는지"를 남기는 기록이다. 채우지 못한 부분은 본문에 "(설명 보충 필요)"라고만 표시한다.
   단, 확인형 질문에서 제시한 뜻을 관리자가 "맞다"고 확인하면 그 뜻은 본문에 써도 된다.
   관리자가 "그냥 써줘"로 질문을 건너뛰면 확인받지 못한 것이므로 일반 설명을 쓰지 않고 "(설명 보충 필요)"로 남긴다.
   관리자가 이름·용어만 답하면 본문에도 이름만 쓴다. 이름을 풀어 쓴 설명(뜻·역할·목적)을 덧붙이지 않는다.
   (예: 질문 "5단계가 각각 무엇인가요?" → 답 "1. 문제 발굴 2. 프로토타이핑"
    → 올바른 본문: "- 문제 발굴", "- 프로토타이핑"
    → 틀린 본문: "- 프로토타이핑: 시제품을 만들어 보는 단계" (관리자가 말하지 않은 설명))
   요약(summary)에도 관리자가 말하지 않은 평가·표현("~의 전체 흐름을 익혔다" 등)을 넣지 않는다.
6. 섞인 입력도 글 1개로 쓴다. 강의와 실습이 서로 관련 없으면 본문을 "## 강의", "## 실습" 소제목으로 나눈다.
7. 초안을 쓴 뒤 수정 요청을 받으면, 요청한 부분을 반드시 눈에 띄게 바꾼 초안 전체를 다시 쓴다.
   (예: "제목을 질문형으로" → 제목을 "~할까?", "~일까?"처럼 물음표로 끝나게. "더 짧게" → 분량을 절반 가까이로)
   reply에는 무엇을 바꿨는지 한 문장으로 쓴다.

[초안 형식]
- title: 핵심 키워드가 들어간 제목 (40자 이내). "정리", "요약", "기록" 같은 일반적인 말로 끝내지 않는다
  (예: "찌개 끓이는 법 정리" → "신 김치를 볶는 이유, 김치찌개 순서")
- summary: 이 글의 핵심을 1~2문장으로. "~를 정리했다"처럼 글을 소개하는 말이 아니라 내용 자체를 쓴다
  요약에는 "다뤘다", "정리했다", "배웠다", "알아봤다"를 쓰지 않는다 (이 말은 도입 문단에서만 쓴다)
  (예: "김치찌개는 신 김치를 먼저 볶아야 국물 맛이 깊어진다." — 형식만 참고하고, 예시의 말을 가져다 쓰지 않는다)
- body: 블로그 서식으로 쓴 본문. 쓸 수 있는 서식은 "## 소제목", "**굵게**", "- 목록", "> 인용"뿐이다. 요약은 본문에 다시 넣지 않는다.
  본문은 목록만 나열하지 말고 읽히는 글로 쓴다. 단, 새 정보는 더하지 않고 관리자가 준 내용만으로 문장을 만든다.
  - 맨 앞 도입 문단 1~2문장: 이번 수업에서 무엇을 다뤘는지 소제목 내용을 이어 소개한다 (예: "이번 수업에서는 찌개 끓이는 순서와 양념 비율을 다뤘다.")
    요약(summary)은 본문 맨 위에 함께 보이므로, 도입 문단이 요약과 같은 뜻이 되면 도입 문단을 쓰지 않는다
  - 연결 문장: 소제목이 2개 이상일 때만, 두 번째 소제목부터 앞 내용과 어떻게 이어지는지 한 문장으로 쓴다.
    관리자가 준 내용으로 이을 말이 없으면 쓰지 않는다. "이 부분은 흐름을 이어준다"처럼 내용 없는 문장은 금지
    (소제목이 1개뿐이면 소제목 없이 도입 문단 바로 뒤에 내용을 써도 된다)
  - 관리자가 설명을 준 항목은 목록 대신 문장으로 풀어 쓴다. 이름·짧은 짝(예: "소금: 간 맞추기")이 여러 개 나열된 것만 목록으로 둔다
  - 마무리 문단: 관리자가 말한 느낀 점·배운 점·활용 계획이 있으면 그것으로 쓰고, 없으면 "(배운 점 보충 필요)"만 남긴다
  - 연결 문장에도 관리자가 말하지 않은 뜻·평가·사례는 넣지 않는다
- category: "plan"(기획) 또는 "design"(디자인) 중 1개
  - design: 화면·UI·시각 디자인 작업이 중심인 글 (예: Figma로 화면 그리기, 디자인 시스템, UI 컴포넌트, 색·글꼴)
  - plan: 그 밖의 모든 글 (예: 문제 정의, PRD, 지표·데이터, GA, 개발·배포·도구 실습, AI 활용, 챗봇 만들기)
  - 강의와 실습이 섞이면 글 전체에서 더 비중이 큰 쪽, 애매하면 plan
- tags: 3~5개, # 없이. 글에 나온 개념·도구 이름을 먼저 쓴다 (예: GA4, Amplitude, 프로토타이핑)
  카테고리 이름(기획·디자인·회고)과 거의 모든 글에 붙을 말(PM, 수업, 정리)은 태그로 쓰지 않는다

[응답 형식] 항상 JSON으로만 답한다.
- kind: 입력 종류 (lecture / practice / mixed)
- reply: 관리자에게 하는 짧은 한마디 (1문장)
- questions: 질문할 때만 채운다. 초안을 쓸 때는 빈 배열
- draft: 초안을 쓸 때만 채운다. 질문할 때는 넣지 않는다`;

let modelPromise = null;
function loadModel() {
  if (!modelPromise) {
    modelPromise = Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-app-check.js'),
      import(SDK + 'firebase-ai.js')
    ]).then(([A, C, AI]) => {
      if (!LOCAL && !RECAPTCHA_ENTERPRISE_KEY) throw new Error('no-appcheck-key');
      const app = A.initializeApp(firebaseConfig, 'ai-draft');
      // 내 컴퓨터(localhost)에서 테스트할 때는 App Check 디버그 토큰 사용
      if (LOCAL) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      C.initializeAppCheck(app, {
        provider: new C.ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_KEY || 'local-debug'),
        isTokenAutoRefreshEnabled: true
      });
      const ai = AI.getAI(app, { backend: new AI.GoogleAIBackend() });
      const S = AI.Schema;
      const schema = S.object({
        properties: {
          kind: S.enumString({ enum: ['lecture', 'practice', 'mixed'] }),
          reply: S.string(),
          questions: S.array({ items: S.string() }),
          draft: S.object({
            properties: {
              title: S.string(),
              summary: S.string(),
              body: S.string(),
              category: S.enumString({ enum: ['plan', 'design'] }),
              tags: S.array({ items: S.string() })
            }
          })
        },
        optionalProperties: ['draft']
      });
      return AI.getGenerativeModel(ai, {
        model: MODEL,
        systemInstruction: SYSTEM,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema }
      });
    });
    modelPromise.catch(() => { modelPromise = null; });
  }
  return modelPromise;
}

// 카테고리 이름은 태그와 겹치므로 태그에서 뺀다
const CATEGORY_TAGS = ['기획', '디자인', '회고'];

// 모델 응답(JSON 글자)을 화면에서 쓰는 모양으로 정리
export function parseReply(text) {
  let x;
  try { x = JSON.parse(text); } catch (e) { throw new Error('bad-json'); }
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const questions = Array.isArray(x.questions) ? x.questions.map(str).filter(Boolean).slice(0, MAX_QUESTIONS) : [];
  let draft = null;
  if (x.draft && typeof x.draft === 'object' && str(x.draft.body)) {
    const d = x.draft;
    draft = {
      title: str(d.title).slice(0, 100),
      summary: str(d.summary),
      body: str(d.body),
      category: d.category === 'design' ? 'design' : 'plan',
      tags: Array.isArray(d.tags)
        ? [...new Set(d.tags.map((t) => str(t).replace(/^#/, '').slice(0, 30))
            .filter((t) => t && !CATEGORY_TAGS.includes(t)))].slice(0, 20)
        : []
    };
  }
  return { kind: str(x.kind), reply: str(x.reply), questions: draft ? [] : questions, draft };
}

function errorText(e) {
  const m = String((e && (e.message || e.code)) || e);
  if (m === 'no-appcheck-key') return 'App Check 키가 설정되지 않아 AI를 부를 수 없어요. firebase-config.js의 RECAPTCHA_ENTERPRISE_KEY를 확인해 주세요.';
  if (/api-not-enabled/i.test(m)) return 'Firebase 콘솔에서 AI Logic이 아직 켜지지 않았어요. (켠 직후라면 몇 분 뒤 다시 시도해 주세요.)';
  if (/appCheck|app-check|PERMISSION_DENIED|403/i.test(m)) return 'App Check 확인에 실패했어요. (내 컴퓨터에서는 콘솔에 나온 디버그 토큰을 Firebase 콘솔에 등록해야 해요.)';
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(m)) return '오늘 AI 사용 한도를 다 썼어요. 한국 시간 오후 5시쯤 다시 시도해 주세요.';
  if (m === 'bad-json') return 'AI 답변을 읽지 못했어요. 한 번 더 보내 주세요.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '인터넷 연결을 확인해 주세요.';
  return 'AI 답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.';
}

const CAT_LABEL = { plan: '기획', design: '디자인' };
const KIND_LABEL = { lecture: '강의', practice: '실습', mixed: '강의+실습' };

// 글마다 대화 기록을 이 브라우저(localStorage)에 저장한다. 저장 전 새 글은 'new' 칸에 두었다가 저장되면 글 ID로 옮긴다.
const CHAT_KEY = 'blog.aiChat.';
const chatStore = {
  get(id) { try { const v = localStorage.getItem(CHAT_KEY + id); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(id, v) { try { localStorage.setItem(CHAT_KEY + id, JSON.stringify(v)); } catch (e) {} },
  del(id) { try { localStorage.removeItem(CHAT_KEY + id); } catch (e) {} }
};

// applyDraft(draft): 글쓰기 칸에 초안을 넣는 함수, getPostId(): 지금 글 ID (main.js가 넘겨줌)
export function initChatbot({ applyDraft, track, getPostId }) {
  const $ = (s, r) => (r || document).querySelector(s);
  const panel = $('[data-ai-panel]');
  const openBtn = $('[data-ai-open]');
  if (!panel || !openBtn) return;
  const log = $('[data-ai-log]', panel);
  const form = $('[data-ai-form]', panel);
  const input = $('[data-ai-input]', panel);
  const sendBtn = $('[data-ai-send]', panel);
  const skipBtn = $('[data-ai-skip]', panel);
  const INTRO = log.innerHTML;

  let chat = null;
  let asked = false;     // 질문을 이미 한 번 했는지
  let hasDraft = false;  // 초안을 한 번이라도 받았는지
  let busy = false;
  let history = [];      // AI에게 보낸 대화 (이어서 대화할 때 사용): { role: 'user' | 'model', text }
  let entries = [];      // 화면에 보인 대화 (다시 그릴 때 사용)
  let restoreBar = null; // 새 글에서 '지난 대화 불러오기' 버튼 줄
  let startedAsNew = false; // 이 대화가 저장 전 새 글에서 시작했는지
  const key = () => (getPostId && getPostId()) || 'new';
  const save = () => chatStore.set(key(), { v: 1, at: Date.now(), asked, hasDraft, history, entries });
  const record = (e) => { entries.push(e); save(); };

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const say = (who, text) => {
    const b = el('div', 'ai-msg ai-' + who);
    b.textContent = text;
    log.appendChild(b);
    scroll();
    return b;
  };
  const setBusy = (on) => {
    busy = on;
    sendBtn.disabled = on; skipBtn.disabled = on;
    sendBtn.textContent = on ? '답변 기다리는 중…' : '보내기';
  };
  const refreshSkip = () => { skipBtn.hidden = !entries.length || hasDraft; };

  // 패널 안에 보이는 확인 줄 (브라우저 confirm 창 대신)
  const ask = (text, okLabel, onOk, onCancel) => {
    const box = el('div', 'ai-confirm');
    box.setAttribute('role', 'alertdialog');
    box.appendChild(el('p', null, text));
    const row = el('div', 'ai-confirm-row');
    const no = el('button', 'btn btn-soft', '취소');
    const ok = el('button', 'btn btn-accent', okLabel);
    no.type = 'button'; ok.type = 'button';
    no.addEventListener('click', () => { box.remove(); if (onCancel) onCancel(); });
    ok.addEventListener('click', () => { box.remove(); onOk(); });
    row.append(no, ok);
    box.appendChild(row);
    setTimeout(() => ok.focus(), 0);
    return box;
  };

  const drawDraft = (d) => {
    const card = el('div', 'ai-draft');
    card.appendChild(el('p', 'ai-draft-label', '초안'));
    card.appendChild(el('h3', 'ai-draft-title', d.title || '(제목 없음)'));
    if (d.summary) card.appendChild(el('p', 'ai-draft-summary', d.summary));
    const meta = el('p', 'ai-draft-meta');
    meta.textContent = CAT_LABEL[d.category] + (d.tags.length ? ' · ' + d.tags.map((t) => '#' + t).join(' ') : '');
    card.appendChild(meta);
    card.appendChild(el('div', 'ai-draft-body', d.body));
    const use = el('button', 'btn btn-accent', '이 초안 넣기');
    use.type = 'button';
    const done = () => {
      use.textContent = '다시 넣기';
      use.classList.replace('btn-accent', 'btn-soft');
      const t = '글쓰기 칸에 넣었어요. 확인한 뒤 임시저장이나 발행을 눌러 주세요. 더 고치고 싶으면 여기서 말해 주세요.';
      say('bot', t);
      record({ t: 'bot', text: t });
      track('ai_draft_apply');
    };
    use.addEventListener('click', () => {
      const r = applyDraft(d, false);
      if (r === true) { done(); return; }
      if (r !== 'confirm') return;
      // 쓰던 내용이 있으면 카드 안에서 한 번 더 확인
      use.hidden = true;
      card.appendChild(ask('지금 쓰던 제목·본문을 이 초안으로 바꿀까요?', '바꾸기', () => {
        use.hidden = false;
        if (applyDraft(d, true) === true) done();
      }, () => { use.hidden = false; }));
      scroll();
    });
    card.appendChild(use);
    log.appendChild(card);
    scroll();
  };

  // 질문 묶음 말풍선
  const drawQuestions = (kindKey, reply, questions) => {
    const kind = KIND_LABEL[kindKey] ? '(' + KIND_LABEL[kindKey] + ' 내용으로 이해했어요) ' : '';
    const b = say('bot', kind + (reply || '몇 가지만 물어볼게요.'));
    const ol = el('ol', 'ai-questions');
    questions.forEach((q) => ol.appendChild(el('li', null, q)));
    b.appendChild(ol);
    b.appendChild(el('p', 'ai-hint', '한 번에 답해 주세요. 바로 쓰려면 "그냥 써줘"를 누르세요.'));
    scroll();
  };

  // 저장된 대화 한 줄을 화면에 다시 그림
  const drawEntry = (e) => {
    if (e.t === 'me') say('me', e.text);
    else if (e.t === 'bot') say('bot', e.text);
    else if (e.t === 'q') drawQuestions(e.kind, e.reply, e.questions || []);
    else if (e.t === 'draft') { if (e.reply) say('bot', e.reply); drawDraft(e.d); }
  };

  async function send(text, skip) {
    if (busy) return;
    const msg = text.trim();
    if (!msg && !skip) { input.focus(); return; }
    const shown = skip ? '그냥 써줘' : msg;
    if (restoreBar) { restoreBar.remove(); restoreBar = null; } // 불러오지 않고 새로 시작하면 지난 대화는 이 대화로 바뀜
    if (!entries.length && key() === 'new') startedAsNew = true;
    say('me', shown);
    input.value = '';
    setBusy(true);
    const wait = say('bot ai-wait', '생각하는 중…');
    try {
      const model = await loadModel();
      // 이전 대화가 있으면 그 내용을 이어서 대화
      if (!chat) chat = model.startChat(history.length ? { history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })) } : undefined);
      let prompt = msg;
      if (skip) prompt = '그냥 써줘. 질문하지 말고 지금까지의 내용으로 바로 초안을 써줘.';
      else if (asked && !hasDraft) prompt = msg + '\n\n(질문은 이미 했으니 이번에는 반드시 초안을 써줘.)';
      const res = await chat.sendMessage(prompt);
      const raw = res.response.text();
      const r = parseReply(raw);
      wait.remove();
      history.push({ role: 'user', text: prompt }, { role: 'model', text: raw });
      entries.push({ t: 'me', text: shown });
      if (r.draft) {
        if (r.reply) say('bot', r.reply);
        drawDraft(r.draft);
        hasDraft = true;
        entries.push({ t: 'draft', reply: r.reply, d: r.draft });
        track('ai_draft_create', { input_kind: r.kind, asked: asked ? 1 : 0 });
      } else if (r.questions.length && !asked) {
        asked = true;
        drawQuestions(r.kind, r.reply, r.questions);
        entries.push({ t: 'q', kind: r.kind, reply: r.reply, questions: r.questions });
      } else {
        const t2 = r.reply || '다시 한 번 말해 주세요.';
        say('bot', t2);
        entries.push({ t: 'bot', text: t2 });
      }
      save();
    } catch (e) {
      wait.remove();
      say('bot ai-error', errorText(e));
      console.warn('AI 초안 오류', e);
    }
    setBusy(false);
    refreshSkip();
    input.focus();
  }

  const reset = () => {
    chat = null; asked = false; hasDraft = false;
    history = []; entries = [];
    chatStore.del(key());
    restoreBar = null;
    log.innerHTML = INTRO;
    input.value = '';
    refreshSkip();
  };

  // 이전 대화 불러오기 (보기 + 이어서 대화)
  const stamp = (at) => {
    const w = new Date(at || Date.now());
    return (w.getMonth() + 1) + '/' + w.getDate() + ' ' + String(w.getHours()).padStart(2, '0') + ':' + String(w.getMinutes()).padStart(2, '0');
  };
  const restore = (s) => {
    history = Array.isArray(s.history) ? s.history : [];
    entries = s.entries;
    asked = !!s.asked; hasDraft = !!s.hasDraft;
    log.appendChild(el('p', 'ai-note', '이전 대화를 불러왔어요 · ' + stamp(s.at) + ' · 이어서 말하면 이 대화에 이어져요'));
    entries.forEach(drawEntry);
    refreshSkip();
  };
  const saved = chatStore.get(key());
  const hasSaved = saved && Array.isArray(saved.entries) && saved.entries.length;
  if (hasSaved && key() !== 'new') {
    // 기존 글 수정: 그 글의 대화를 바로 불러옴
    restore(saved);
  } else if (hasSaved) {
    // 새 글: 깨끗한 화면으로 시작하고, 글을 저장하지 않고 나간 지난 대화는 버튼으로 불러옴
    restoreBar = el('div', 'ai-restore');
    restoreBar.appendChild(el('span', null, '저장 전에 나간 대화 · ' + stamp(saved.at)));
    const btn = el('button', 'ai-restore-link', '지난 대화 불러오기');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      restoreBar.remove(); restoreBar = null;
      startedAsNew = true;
      restore(saved);
      scroll();
      input.focus();
    });
    restoreBar.appendChild(btn);
    log.appendChild(restoreBar);
  }

  const open = (on) => {
    panel.hidden = !on;
    openBtn.setAttribute('aria-expanded', String(on));
    document.body.classList.toggle('ai-open', on);
    if (on) input.focus(); else openBtn.focus();
  };
  openBtn.hidden = false;
  openBtn.addEventListener('click', () => open(panel.hidden));
  $('[data-ai-close]', panel).addEventListener('click', () => open(false));
  $('[data-ai-reset]', panel).addEventListener('click', () => {
    if (!entries.length) return; // 아직 대화가 없으면 지울 것도 없음 (지난 대화 버튼은 그대로 둠)
    if ($('.ai-confirm-reset', panel)) return; // 이미 묻는 중
    const box = ask('지금 대화를 지우고 새로 시작할까요? (글쓰기 칸에 넣은 내용은 그대로 남아요)', '새로 시작', reset);
    box.classList.add('ai-confirm-reset');
    form.before(box);
  });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value, false); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(input.value, false); }
  });
  skipBtn.addEventListener('click', () => send('', true));
  refreshSkip();

  return {
    // 글이 저장되면 이번 대화를 그 글 ID 칸에 저장 (새 글에서 시작한 대화면 임시 칸은 비움)
    onSaved(id) {
      if (!id || !entries.length) return; // 이번에 대화하지 않았으면 지난 대화는 그대로 둠
      save();
      if (startedAsNew) { chatStore.del('new'); startedAsNew = false; }
    }
  };
}
