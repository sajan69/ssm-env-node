export const KEYS = Object.freeze(['APP_NAME', 'DATABASE_URL', 'API_KEY']);

export function validateConfig(config) {
  for (const key of KEYS) {
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      throw new Error(`Missing required configuration: ${key}`);
    }
  }
  let url;
  try { url = new URL(config.DATABASE_URL); } catch { throw new Error('Invalid DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  return Object.freeze(Object.fromEntries(KEYS.map(key => [key, config[key]])));
}

export function parseEnvFile(text) {
  const values = {};
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid assignment on line ${index + 1}`);
    const [, key, encoded] = match;
    if (!KEYS.includes(key)) throw new Error(`Unknown configuration key on line ${index + 1}`);
    if (Object.hasOwn(values, key)) throw new Error(`Duplicate configuration key: ${key}`);
    let value = encoded.trim();
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { throw new Error(`Invalid quoted value on line ${index + 1}`); }
    }
    if (typeof value !== 'string') throw new Error(`Invalid value on line ${index + 1}`);
    values[key] = value;
  }
  return validateConfig(values);
}

export function settings(env = process.env) {
  const region = env.SSM_REGION;
  const prefix = env.SSM_PREFIX;
  if (!region || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) throw new Error('Invalid SSM_REGION');
  if (!prefix || !/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(prefix)) throw new Error('Invalid SSM_PREFIX');
  if (env.VERCEL && !env.AWS_ROLE_ARN) throw new Error('AWS_ROLE_ARN is required on Vercel');
  return { region, prefix };
}
