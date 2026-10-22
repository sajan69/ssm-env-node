import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUploadOptions, uploadEnvironment } from '../src/upload.js';

const text = 'APP_NAME=demo\nDATABASE_URL=postgresql://u:p@localhost/db\nAPI_KEY=synthetic-secret';
const env = { SSM_REGION: 'ap-southeast-2', SSM_PREFIX: '/demo/development' };

test('dry run never constructs a client or exposes values', async () => {
  const result = await uploadEnvironment({ text, env, clientFactory: () => assert.fail('AWS accessed') });
  assert.deepEqual(result, { mode: 'dry-run', count: 3 });
  assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
});
test('unsafe, misspelled and duplicate options are rejected', () => {
  for (const args of [['--overwrite'], ['--aply'], ['--apply', '--apply'], ['--file'], ['--file', '--apply']]) {
    assert.throws(() => parseUploadOptions(args));
  }
  assert.equal(parseUploadOptions(['--file', 'ENV.local.txt']).file, 'ENV.local.txt');
});
test('invalid input is rejected before creating an AWS client', async () => {
  for (const options of [{ text: 'APP_NAME=x', env }, { text, env: {} }]) {
    await assert.rejects(uploadEnvironment({ ...options, argv: ['--apply'], clientFactory: () => assert.fail('AWS accessed') }));
  }
});
test('apply writes encrypted values sequentially and releases the client', async () => {
  let destroyed = 0; let active = 0; let peak = 0;
  const inputs = [];
  const result = await uploadEnvironment({ text, env: { ...env, SSM_KMS_KEY_ID: 'alias/demo' }, argv: ['--apply'], clientFactory: () => ({
    async send(command, options) {
      active++; peak = Math.max(peak, active);
      assert.ok(options.abortSignal);
      await new Promise(resolve => setImmediate(resolve));
      inputs.push(command.input); active--;
    }, destroy() { destroyed++; },
  }) });
  assert.equal(peak, 1); assert.equal(destroyed, 1); assert.equal(result.count, 3);
  assert.ok(inputs.every(input => input.Type === 'SecureString' && input.Overwrite === false && input.KeyId === 'alias/demo'));
  assert.deepEqual(inputs.map(x => x.Name), ['APP_NAME', 'DATABASE_URL', 'API_KEY'].map(key => `${env.SSM_PREFIX}/${key}`));
});
test('overwrite is explicit and partial failure reports only completed count', async () => {
  let calls = 0; let destroyed = false;
  await assert.rejects(uploadEnvironment({ text, env, argv: ['--apply', '--overwrite'], clientFactory: () => ({
    async send(command) {
      assert.equal(command.input.Overwrite, true);
      if (++calls === 2) throw new Error('synthetic-secret');
    }, destroy() { destroyed = true; },
  }) }), error => error.completed === 1 && error.message === 'Parameter upload failed' && !error.cause);
  assert.equal(calls, 2); assert.equal(destroyed, true);
});
test('CLI dry run works without credentials and errors redact input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ssm-env-test-'));
  try {
    const file = join(directory, 'ENV.txt');
    await writeFile(file, text);
    const cli = fileURLToPath(new URL('../scripts/push-env.js', import.meta.url));
    const options = { encoding: 'utf8', env: { ...env, PATH: process.env.PATH, AWS_EC2_METADATA_DISABLED: 'true' }, timeout: 5000 };
    const success = spawnSync(process.execPath, [cli, '--file', file], options);
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /dry-run: 3/);
    assert.ok(!success.stdout.includes('synthetic-secret'));
    await writeFile(file, 'synthetic-secret');
    const failure = spawnSync(process.execPath, [cli, '--file', file], options);
    assert.equal(failure.status, 1);
    assert.ok(!failure.stderr.includes('synthetic-secret'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
