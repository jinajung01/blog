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
   가장 중요한 것만 골라 한 번에 최대 ${MAX_QUESTIONS}개 묻는다. 질문은 짧고 구체적으로, 하나에 한 가지만 묻는다.
   (예: "AS-IS/TO-BE는 수업에서 어떤 예시로 설명했나요?")
   모든 내용에 설명이 붙어 있을 때만 질문 없이 바로 초안을 쓴다.
3. 질문은 한 번만 한다. 관리자가 답하면 반드시 초안을 쓴다.
4. 관리자가 "그냥 써줘"라고 하면 질문 없이 바로 초안을 쓴다.
5. 관리자가 주지 않은 내용은 지어내지 않는다. 용어의 일반적인 사전 설명으로 빈칸을 채우지도 않는다.
   이 글은 "수업에서 무엇을 배웠는지"를 남기는 기록이다. 채우지 못한 부분은 본문에 "(설명 보충 필요)"라고만 표시한다.
6. 섞인 입력도 글 1개로 쓴다. 강의와 실습이 서로 관련 없으면 본문을 "## 강의", "## 실습" 소제목으로 나눈다.
7. 초안을 쓴 뒤 수정 요청을 받으면, 요청한 부분을 반드시 눈에 띄게 바꾼 초안 전체를 다시 쓴다.
   (예: "제목을 질문형으로" → 제목을 "~할까?", "~일까?"처럼 물음표로 끝나게. "더 짧게" → 분량을 절반 가까이로)
   reply에는 무엇을 바꿨는지 한 문장으로 쓴다.

[초안 형식]
- title: 내용을 드러내는 제목 (40자 이내)
- summary: 1~2문장 요약
- body: 블로그 서식으로 쓴 본문. 쓸 수 있는 서식은 "## 소제목", "**굵게**", "- 목록", "> 인용"뿐이다. 요약은 본문에 다시 넣지 않는다.
- category: "plan"(기획) 또는 "design"(디자인) 중 내용에 맞는 1개
- tags: 3~5개, # 없이

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
        ? [...new Set(d.tags.map((t) => str(t).replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 20)
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

// applyDraft(draft): 글쓰기 칸에 초안을 넣는 함수 (main.js가 넘겨줌)
export function initChatbot({ applyDraft, track }) {
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
  const refreshSkip = () => { skipBtn.hidden = !chat || hasDraft; };

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
      say('bot', '글쓰기 칸에 넣었어요. 확인한 뒤 임시저장이나 발행을 눌러 주세요. 더 고치고 싶으면 여기서 말해 주세요.');
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

  async function send(text, skip) {
    if (busy) return;
    const msg = text.trim();
    if (!msg && !skip) { input.focus(); return; }
    if (skip) say('me', '그냥 써줘');
    else say('me', msg);
    input.value = '';
    setBusy(true);
    const wait = say('bot ai-wait', '생각하는 중…');
    try {
      const model = await loadModel();
      if (!chat) chat = model.startChat();
      let prompt = msg;
      if (skip) prompt = '그냥 써줘. 질문하지 말고 지금까지의 내용으로 바로 초안을 써줘.';
      else if (asked && !hasDraft) prompt = msg + '\n\n(질문은 이미 했으니 이번에는 반드시 초안을 써줘.)';
      const res = await chat.sendMessage(prompt);
      const r = parseReply(res.response.text());
      wait.remove();
      if (r.draft) {
        if (r.reply) say('bot', r.reply);
        drawDraft(r.draft);
        hasDraft = true;
        track('ai_draft_create', { input_kind: r.kind, asked: asked ? 1 : 0 });
      } else if (r.questions.length && !asked) {
        asked = true;
        const kind = KIND_LABEL[r.kind] ? '(' + KIND_LABEL[r.kind] + ' 내용으로 이해했어요) ' : '';
        const b = say('bot', kind + (r.reply || '몇 가지만 물어볼게요.'));
        const ol = el('ol', 'ai-questions');
        r.questions.forEach((q) => ol.appendChild(el('li', null, q)));
        b.appendChild(ol);
        b.appendChild(el('p', 'ai-hint', '한 번에 답해 주세요. 바로 쓰려면 "그냥 써줘"를 누르세요.'));
        scroll();
      } else {
        say('bot', r.reply || '다시 한 번 말해 주세요.');
      }
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
    log.innerHTML = INTRO;
    input.value = '';
    refreshSkip();
  };

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
    if (log.children.length <= 1) { reset(); return; }
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
}
