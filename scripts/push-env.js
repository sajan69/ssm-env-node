import { readFile } from 'node:fs/promises';
import { PutParameterCommand } from '@aws-sdk/client-ssm';
import { createClient } from '../src/aws.js';
import { KEYS, parseEnvFile, settings } from '../src/env-file.js';

async function main() {
  const config = parseEnvFile(await readFile('ENV.txt', 'utf8'));
  const { prefix } = settings();
  const overwrite = process.argv.includes('--overwrite');
  if (!process.argv.includes('--apply')) {
    console.log(`Dry run: ${KEYS.length} SecureString parameters under ${prefix}. No values displayed.`);
    console.log('Use --apply to create; add --overwrite to replace existing parameters.');
    return;
  }
  const client = createClient();
  try {
    // Sequential writes; SSM does not provide transactions. Failures can leave partial updates.
    for (const key of KEYS) {
      await client.send(new PutParameterCommand({
        Name: `${prefix}/${key}`, Value: config[key], Type: 'SecureString', Overwrite: overwrite,
        ...(process.env.SSM_KMS_KEY_ID ? { KeyId: process.env.SSM_KMS_KEY_ID } : {}),
      }), { abortSignal: AbortSignal.timeout(8000) });
      console.log(`Stored ${key}`);
    }
  } finally { client.destroy(); }
}

main().catch(() => {
  console.error('Upload failed. Check local configuration, AWS permissions, and existing parameter names. Some writes may have completed.');
  process.exitCode = 1;
});

