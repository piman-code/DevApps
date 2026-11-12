// 확인 명령: node --test test/*.test.mjs
// 공개 대문 앱 순서·숨김의 서버 검사(lib/home.js sanitize)와 화면 적용(site/arrange.js arrangeApps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitize, MAX_ITEMS } from '../lib/home.js';
import '../site/arrange.js';

const arrange = globalThis.arrangeApps;
const apps = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }));
const ids = list => list.map(x => (x.hidden ? '-' : '') + x.app.id).join(' ');

test('sanitize: 올바른 값은 그대로, hidden은 order 순서로', () => {
  assert.deepEqual(sanitize({ order: ['c', 'a', 'b'], hidden: ['b', 'c'] }), { order: ['c', 'a', 'b'], hidden: ['c', 'b'] });
  assert.deepEqual(sanitize({ order: ['a'] }), { order: ['a'], hidden: [] });
});

test('sanitize: 틀린 형식은 null', () => {
  for (const bad of [
    null, [], 'x', {}, { order: [] }, { order: 'a' }, { order: ['a'], hidden: 'a' },
    { order: ['a', 'a'] },                      // 중복
    { order: ['A'] }, { order: ['-a'] }, { order: [''] }, { order: [1] }, { order: ['a b'] }, { order: ['../x'] },
    { order: ['a'.repeat(41)] },
    { order: ['a', 'b'], hidden: ['c'] },       // order에 없는 숨김
    { order: ['a', 'b'], hidden: ['a', 'a'] },  // 숨김 중복
    { order: ['a', 'b'], hidden: ['a', 'b'] },  // 전부 숨김
    { order: ['a'], hidden: ['a'] },
    { order: Array.from({ length: MAX_ITEMS + 1 }, (_, i) => 'x' + i) },
  ]) assert.equal(sanitize(bad), null, JSON.stringify(bad));
});

test('sanitize: 지금 apps.json의 id는 모두 받는다', () => {
  const real = JSON.parse(readFileSync(new URL('../site/apps.json', import.meta.url), 'utf8')).apps.map(a => a.id);
  assert.deepEqual(sanitize({ order: real, hidden: [] }).order, real);
});

test('arrange: 저장이 없거나 이상하면 파일 순서', () => {
  assert.equal(ids(arrange(apps, null)), 'a b c d');
  assert.equal(ids(arrange(apps, { order: 'x' })), 'a b c d');
  assert.equal(ids(arrange(apps, { order: null, hidden: [] })), 'a b c d');
  assert.deepEqual(arrange(null, null), []);
});

test('arrange: 저장한 순서와 숨김을 적용', () => {
  assert.equal(ids(arrange(apps, { order: ['d', 'b', 'a', 'c'], hidden: ['b'] })), 'd -b a c');
});

test('arrange: 새 앱은 맨 위, 사라진 id는 무시', () => {
  assert.equal(ids(arrange(apps, { order: ['c', 'gone', 'a'], hidden: ['gone', 'a'] })), 'b d c -a');
});

test('arrange: 남은 앱이 전부 숨김이면 숨김을 무시', () => {
  assert.equal(ids(arrange(apps.slice(0, 2), { order: ['b', 'a', 'z'], hidden: ['a', 'b'] })), 'b a');
});

test('arrange: 이상한 값이 섞여도 죽지 않는다', () => {
  assert.equal(ids(arrange(apps, { order: ['b', 5, null, 'b', '__proto__'], hidden: [{}, 'c'] })), 'a -c d b');
  assert.equal(ids(arrange([{ id: '__proto__' }, { id: 'a' }], { order: ['a', '__proto__'], hidden: [] })), 'a __proto__');
});
