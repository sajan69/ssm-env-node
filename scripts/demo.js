import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { KEYS, parseEnvFile } from '../src/env-file.js';
import { createConfigLoader } from '../src/config.js';
import { startService } from '../src/local-server.js';

// Explicit mock injection: this entry point cannot call AWS or load credentials.
const config = parseEnvFile(await readFile(new URL('../ENV.example.txt', import.meta.url), 'utf8'));
let clock = 0; let unavailable = false; let calls = 0;
const load = createConfigLoader({ prefix: '/demo', now: () => clock, client: { async send() {
  calls++;
  if (unavailable) throw new Error('simulated outage');
  return { Parameters: KEYS.map(key => ({ Name: `/demo/${key}`, Type: 'SecureString', Value: config[key] })) };
} } });
const server = await startService({ getConfig: load, port: 0 });
try {
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const ready = await fetch(url);
  const body = await ready.text();
  assert.equal(ready.status, 200);
  assert.equal(body, '{"status":"ok","configurationLoaded":true}');
  const method = await fetch(url, { method: 'POST' });
  await method.text();
  assert.equal(method.status, 405);
  clock = 60000; unavailable = true;
  const failed = await fetch(url);
  await failed.text();
  assert.equal(failed.status, 503);
  unavailable = false;
  const recovered = await fetch(url);
  await recovered.text();
  assert.equal(recovered.status, 200);
  console.log(JSON.stringify({ mode: 'offline-mock-only', startup: 'validated-before-listen', ready: ready.status,
    unsupportedMethod: method.status, expiredCacheOutage: failed.status, recovered: recovered.status,
    mockSSMCalls: calls, responseContainsConfig: false }, null, 2));
} finally {
  server.close();
  await once(server, 'close');
}
