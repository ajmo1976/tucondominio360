import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateToken, hashToken, AUTH_TOKEN_TTL_MS } from './auth';

test('hashToken es sha256 hex determinista de 64 chars', () => {
  const t = 'abc';
  assert.equal(hashToken(t), hashToken(t));
  assert.equal(hashToken(t).length, 64);
  assert.notEqual(hashToken(t), t);
});
test('generateToken produce base64url distinto cada vez', () => {
  const a = generateToken(), b = generateToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});
test('TTL: invitacion 7d, reset 1h, verificacion 24h', () => {
  assert.equal(AUTH_TOKEN_TTL_MS.INVITATION, 7 * 24 * 3600_000);
  assert.equal(AUTH_TOKEN_TTL_MS.PASSWORD_RESET, 3600_000);
  assert.equal(AUTH_TOKEN_TTL_MS.EMAIL_VERIFICATION, 24 * 3600_000);
});
