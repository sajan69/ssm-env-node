import { readFile } from 'node:fs/promises';
import { createClient } from '../src/aws.js';
import { parseUploadOptions, uploadEnvironment } from '../src/upload.js';

async function main() {
  const argv = process.argv.slice(2);
  const { file } = parseUploadOptions(argv);
  const text = await readFile(file, 'utf8');
  const result = await uploadEnvironment({ text, env: process.env, argv, clientFactory: createClient });
  console.log(`${result.mode}: ${result.count} SecureString parameters. No values displayed.`);
  if (result.mode === 'dry-run') console.log('Use --apply to create; add --overwrite to replace existing parameters.');
}

main().catch(error => {
  // Never serialize AWS errors, filenames, credentials or parameter values.
  const count = Number.isInteger(error.completed) ? error.completed : 0;
  console.error(`Upload failed. ${count} writes completed. Check input, permissions and existing parameters; writes are not transactional.`);
  process.exitCode = 1;
});

