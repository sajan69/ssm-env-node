import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCache } from '../scripts/evaluate.js';

test('controlled workload bounds reads across cold, warm and expired-cache request waves', async () => {
  const result = await evaluateCache();
  assert.equal(result.workload.totalConfigRequests, 300);
  assert.deepEqual(result.baseline.callsPerWave, [100, 100, 100]);
  assert.deepEqual(result.cached.callsPerWave, [1, 0, 1]);
  assert.equal(result.cached.totalCalls, 2);
  assert.equal(result.callReductionPercent, 99.33);
});
