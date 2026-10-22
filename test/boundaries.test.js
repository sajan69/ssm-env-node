import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, validatePrefix } from '../src/env-file.js';
import { createConfigLoader } from '../src/config.js';

const values = { APP_NAME: 'demo', DATABASE_URL: 'postgresql://u:p@localhost/db', API_KEY: 'synthetic-secret' };
const parameters = () => KEYS.map(key => ({ Name: `/demo/${key}`, Type: 'SecureString', Value: values[key] }));

test('prefix rejects root, reserved namespaces, ambiguous segments and excessive depth/length', () => {
  for (const prefix of ['/', '/demo/', '/aws/demo', '/SSM-demo', '/demo/../prod', '/demo/.', '/x'.repeat(15), '/' + 'x'.repeat(513)]) {
    assert.throws(() => validatePrefix(prefix));
  }
  assert.equal(validatePrefix('/demo/production-v2'), '/demo/production-v2');
});
test('loader rejects invalid cache settings and clients before requests', () => {
  for (const ttlMs of [-1, NaN, Infinity, 0.1, '100']) {
    assert.throws(() => createConfigLoader({ prefix: '/demo', client: { send() {} }, ttlMs }));
  }
  assert.throws(() => createConfigLoader({ prefix: '/demo', client: {} }));
});
test('loader fails closed for plaintext, duplicate, foreign and malformed parameters', async () => {
  const bad = [
    null, {}, { Parameters: {} }, { Parameters: [null] },
    { Parameters: [...parameters(), parameters()[0]] },
    { Parameters: parameters().map((p, i) => i ? p : { ...p, Type: 'String' }) },
    { Parameters: parameters().map((p, i) => i ? p : { ...p, Name: '/other/APP_NAME' }) },
    { Parameters: parameters().map((p, i) => i ? p : { ...p, Value: 123 }) },
  ];
  for (const result of bad) {
    const load = createConfigLoader({ prefix: '/demo', client: { send: async () => result } });
    await assert.rejects(load);
  }
});
test('response order is irrelevant and expiry boundary refreshes exactly at TTL', async () => {
  let calls = 0; let clock = 0;
  const load = createConfigLoader({ prefix: '/demo', ttlMs: 100, now: () => clock, client: { async send() {
    calls++; return { Parameters: parameters().reverse() };
  } } });
  await load(); clock = 99; await load(); assert.equal(calls, 1);
  clock = 100; assert.deepEqual(await load(), values); assert.equal(calls, 2);
});
test('zero TTL reloads on serial calls and still coalesces concurrent calls', async () => {
  let calls = 0;
  const load = createConfigLoader({ prefix: '/demo', ttlMs: 0, client: { async send() {
    calls++; return { Parameters: parameters() };
  } } });
  await Promise.all(Array.from({ length: 20 }, () => load())); assert.equal(calls, 1);
  await load(); assert.equal(calls, 2);
});
test('synchronous client failures redact errors and do not poison retries', async () => {
  let calls = 0;
  const load = createConfigLoader({ prefix: '/demo', client: { send() {
    if (++calls === 1) throw new Error('synthetic-secret');
    return Promise.resolve({ Parameters: parameters() });
  } } });
  await assert.rejects(load, { message: 'SSM configuration unavailable' });
  assert.equal((await load()).APP_NAME, 'demo');
});
