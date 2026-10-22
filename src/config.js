import { GetParametersCommand } from '@aws-sdk/client-ssm';
import { KEYS, validateConfig } from './env-file.js';

export function createConfigLoader({ client, prefix, ttlMs = 60000, now = Date.now }) {
  let cached;
  let expiresAt = 0;
  let pending;
  return async function getConfig() {
    if (cached && now() < expiresAt) return cached;
    if (!pending) {
      pending = (async () => {
        const names = KEYS.map(key => `${prefix}/${key}`);
        const result = await client.send(new GetParametersCommand({ Names: names, WithDecryption: true }),
          { abortSignal: AbortSignal.timeout(8000) });
        if (result.InvalidParameters?.length) throw new Error('Required SSM parameters unavailable');
        const byName = new Map((result.Parameters ?? []).map(p => [p.Name, p.Value]));
        const config = validateConfig(Object.fromEntries(KEYS.map((key, i) => [key, byName.get(names[i])])));
        cached = config;
        expiresAt = now() + ttlMs;
        return config;
      })().finally(() => { pending = undefined; });
    }
    return pending;
  };
}
