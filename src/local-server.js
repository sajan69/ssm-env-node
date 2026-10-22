import { createServer } from 'node:http';
import { createHandler } from './handler.js';

export async function startService({ getConfig, port = 3000, host = '127.0.0.1' }) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid service port');
  // Fail before opening a socket. Later refresh failures are still handled as 503.
  await getConfig();
  const handler = createHandler(getConfig);
  const server = createServer((req, res) => {
    if (req.url?.split('?')[0] !== '/api') {
      res.writeHead(404, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    void handler(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return server;
}
