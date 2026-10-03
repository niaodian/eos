// AC1.1 — node:test. The JUnit reporter is built in (Node >= 20.8); see project.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const USERS = new Map([['alice', { verify: (attempt) => attempt.length >= 12 }]]);
const login = (user, attempt) => (USERS.get(user)?.verify(attempt) ? { session: 'abc' } : null);

test('valid password logs the user in', () => {
  assert.ok(login('alice', 'twelve chars+')?.session);
});

test('a wrong password does not', () => {
  assert.equal(login('alice', 'short'), null);
});
