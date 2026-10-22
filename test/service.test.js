import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startService } from '../src/local-server.js';

test('startup rejects unavailable configuration before trying to bind an occupied port', async () => {
  const occupied = createServer(); occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  try {
    await assert.rejects(startService({ port: occupied.address().port, getConfig: async () => { throw new Error('config refused'); } }),
      { message: 'config refused' });
  } finally { occupied.close(); await once(occupied, 'close'); }
});
test('real HTTP service handles routes, methods and outage recovery without exposing values', async () => {
  let unavailable = false;
  const server = await startService({ port: 0, getConfig: async () => {
    if (unavailable) throw new Error('synthetic-secret');
    return { API_KEY: 'synthetic-secret' };
  } });
  const root = `http://127.0.0.1:${server.address().port}`;
  try {
    const ready = await fetch(root + '/api?check=1');
    assert.equal(ready.status, 200); assert.equal(ready.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await ready.json(), { status: 'ok', configurationLoaded: true });
    const missing = await fetch(root + '/other'); assert.equal(missing.status, 404); await missing.text();
    const method = await fetch(root + '/api', { method: 'POST' });
    assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'GET'); await method.text();
    unavailable = true;
    const failed = await fetch(root + '/api'); assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes('synthetic-secret'));
    unavailable = false;
    const recovered = await fetch(root + '/api'); assert.equal(recovered.status, 200); await recovered.text();
  } finally { server.close(); await once(server, 'close'); }
});
test('credential-free demo runs the startup, outage and recovery scenarios', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/demo.js', import.meta.url))],
    { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'offline-mock-only'); assert.equal(output.mockSSMCalls, 3);
  assert.equal(output.expiredCacheOutage, 503); assert.equal(output.recovered, 200);
});
