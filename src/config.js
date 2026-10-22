import { GetParametersCommand } from '@aws-sdk/client-ssm';
import { performance } from 'node:perf_hooks';
import { KEYS, validateConfig, validatePrefix } from './env-file.js';

export function createConfigLoader({ client, prefix, ttlMs = 60000, now = () => performance.now() }) {
  validatePrefix(prefix);
  if (!client || typeof client.send !== 'function') throw new Error('SSM client is required');
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0) throw new Error('Invalid cache TTL');
  if (typeof now !== 'function') throw new Error('Invalid cache clock');
  if (KEYS.length > 10) throw new Error('Schema exceeds GetParameters batch limit');
  const names = KEYS.map(key => `${prefix}/${key}`);
  let cached;
  let expiresAt = 0;
  let pending;
  return async function getConfig() {
    if (cached && now() < expiresAt) return cached;
    if (!pending) {
      pending = (async () => {
        let result;
        try {
          result = await client.send(new GetParametersCommand({ Names: names, WithDecryption: true }),
            { abortSignal: AbortSignal.timeout(8000) });
        } catch { throw new Error('SSM configuration unavailable'); }
        if (!result || result.InvalidParameters?.length || !Array.isArray(result.Parameters)) {
          throw new Error('Required SSM parameters unavailable');
        }
        const byName = new Map();
        for (const parameter of result.Parameters) {
          if (!parameter || !names.includes(parameter.Name) || byName.has(parameter.Name) ||
              parameter.Type !== 'SecureString' || typeof parameter.Value !== 'string') {
            throw new Error('Unexpected SSM parameter response');
          }
          byName.set(parameter.Name, parameter.Value);
        }
        const config = validateConfig(Object.fromEntries(KEYS.map((key, i) => [key, byName.get(names[i])])));
        cached = config;
        expiresAt = now() + ttlMs;
        return config;
      })().finally(() => { pending = undefined; });
    }
    return pending;
  };
}

