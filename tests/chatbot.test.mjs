// AI 초안 도우미 단위테스트 — 실행: node --test tests/
// AI 답변(JSON)을 화면에 보여 주기 전에 규칙대로 정리하는지 확인한다 (PRD "6. 기능적 요구사항"의 AI 규칙)
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { hostname: 'localhost' }; // chatbot.js가 브라우저 주소를 읽어서 필요
const { parseReply } = await import('../chatbot.js');
const reply = (x) => parseReply(JSON.stringify(x));

test('F4 질문은 최대 3개까지만 보여 준다', () => {
  const r = reply({ kind: 'lecture', reply: 'q', questions: ['a', 'b', 'c', 'd', 'e'] });
  assert.equal(r.questions.length, 3);
  assert.equal(r.draft, null);
});

test('F6 초안이 있으면 질문은 무시한다', () => {
  const r = reply({ kind: 'mixed', reply: 'd', questions: ['x'], draft: { title: 't', summary: 's', body: '## 강의', category: 'plan', tags: [] } });
  assert.ok(r.draft);
  assert.equal(r.questions.length, 0);
});

test('F6 카테고리는 기획·디자인만 (그 밖의 값은 기획으로)', () => {
  const r = reply({ kind: 'lecture', reply: '', questions: [], draft: { title: 't', summary: '', body: 'b', category: 'retro', tags: [] } });
  assert.equal(r.draft.category, 'plan');
  const d = reply({ kind: 'lecture', reply: '', questions: [], draft: { title: 't', summary: '', body: 'b', category: 'design', tags: [] } });
  assert.equal(d.draft.category, 'design');
});

test('F6 태그는 # 제거, 빈 값·중복 제거', () => {
  const r = reply({ kind: 'lecture', reply: '', questions: [], draft: { title: 't', summary: '', body: 'b', category: 'plan', tags: ['#a', 'a', 'b', ''] } });
  assert.deepEqual(r.draft.tags, ['a', 'b']);
});

test('F6 카테고리 이름(기획·디자인·회고)은 태그에서 뺀다', () => {
  const r = reply({ kind: 'lecture', reply: '', questions: [], draft: { title: 't', summary: '', body: 'b', category: 'plan', tags: ['#기획', 'GA4', '디자인', '회고', 'Amplitude'] } });
  assert.deepEqual(r.draft.tags, ['GA4', 'Amplitude']);
});

test('본문이 비어 있으면 초안으로 보지 않는다', () => {
  const r = reply({ kind: 'practice', reply: '', questions: [], draft: { title: 't', summary: '', body: '  ', category: 'design', tags: [] } });
  assert.equal(r.draft, null);
});

test('JSON이 아닌 답변은 오류로 처리한다', () => {
  assert.throws(() => parseReply('not json'), { message: 'bad-json' });
});
