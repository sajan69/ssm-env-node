import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KEYS, parseEnvFile } from '../src/env-file.js';
import { createConfigLoader } from '../src/config.js';

export async function evaluateCache() {
  const config = parseEnvFile(await readFile(new URL('../ENV.example.txt', import.meta.url), 'utf8'));
  const concurrency = 100;
  const waveTimesMs = [0, 100, 60000];
  async function run(shared) {
    let calls = 0; let clock = 0;
    const client = { async send() {
      calls++;
      await new Promise(resolve => setImmediate(resolve));
      return { Parameters: KEYS.map(key => ({ Name: `/evaluation/${key}`, Type: 'SecureString', Value: config[key] })) };
    } };
    const makeLoader = () => createConfigLoader({ client, prefix: '/evaluation', now: () => clock });
    const sharedLoad = makeLoader();
    const callsPerWave = [];
    for (const time of waveTimesMs) {
      clock = time;
      const before = calls;
      await Promise.all(Array.from({ length: concurrency }, () => shared ? sharedLoad() : makeLoader()()));
      callsPerWave.push(calls - before);
    }
    return { totalCalls: calls, callsPerWave };
  }
  const baseline = await run(false);
  const cached = await run(true);
  return {
    kind: 'synthetic-client-call-count-evaluation',
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    workload: { concurrency, waveTimesMs, totalConfigRequests: concurrency * waveTimesMs.length, parametersPerRead: KEYS.length, ttlMs: 60000 },
    baseline: { description: 'isolated loader per request, no shared cache', ...baseline },
    cached: { description: 'one shared loader per warm process', ...cached },
    callReductionPercent: Number(((1 - cached.totalCalls / baseline.totalCalls) * 100).toFixed(2)),
    limitations: ['Mock SSM only; no AWS requests or credentials.', 'One process, controlled clock, no network latency, retry or OIDC measurement.',
      'API-call reduction is not a measured cost, throughput or end-to-end latency improvement.'],
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await evaluateCache(), null, 2));
}
