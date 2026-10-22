import { PutParameterCommand } from '@aws-sdk/client-ssm';
import { KEYS, parseEnvFile, settings } from './env-file.js';

export function parseUploadOptions(argv) {
  const options = { apply: false, overwrite: false, file: 'ENV.txt' };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) throw new Error('Duplicate upload option');
    seen.add(flag);
    if (flag === '--apply') options.apply = true;
    else if (flag === '--overwrite') options.overwrite = true;
    else if (flag === '--file' && argv[i + 1] && !argv[i + 1].startsWith('--')) options.file = argv[++i];
    else throw new Error('Invalid upload option');
  }
  if (options.overwrite && !options.apply) throw new Error('--overwrite requires --apply');
  return Object.freeze(options);
}

export async function uploadEnvironment({ text, env, argv = [], clientFactory }) {
  const options = parseUploadOptions(argv);
  const config = parseEnvFile(text);
  const { prefix } = settings(env);
  if (!options.apply) return { mode: 'dry-run', count: KEYS.length };
  let client;
  let completed = 0;
  try {
    client = clientFactory(env);
    for (const key of KEYS) {
      await client.send(new PutParameterCommand({
        Name: `${prefix}/${key}`, Value: config[key], Type: 'SecureString', Overwrite: options.overwrite,
        ...(env.SSM_KMS_KEY_ID ? { KeyId: env.SSM_KMS_KEY_ID } : {}),
      }), { abortSignal: AbortSignal.timeout(8000) });
      completed++;
    }
    return { mode: 'uploaded', count: completed };
  } catch {
    const error = new Error('Parameter upload failed');
    error.completed = completed;
    throw error;
  } finally { client?.destroy(); }
}
