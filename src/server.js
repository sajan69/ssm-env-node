import { createClient } from './aws.js';
import { createConfigLoader } from './config.js';
import { settings } from './env-file.js';
import { startService } from './local-server.js';

let client;
try {
  const { prefix } = settings();
  const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
  client = createClient();
  const server = await startService({ getConfig: createConfigLoader({ client, prefix }), port });
  console.log(`Listening at http://127.0.0.1:${server.address().port}/api`);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(() => { client.destroy(); });
    });
  }
} catch {
  client?.destroy();
  console.error('startup_failed: configuration unavailable or port could not be bound');
  process.exitCode = 1;
}

