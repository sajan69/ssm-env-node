import { createServer } from 'node:http';
import handler from '../api/index.js';

createServer((req, res) => {
  if (req.url?.split('?')[0] !== '/api') {
    res.writeHead(404).end();
    return;
  }
  void handler(req, res);
}).listen(3000, '127.0.0.1', () => console.log('Listening at http://localhost:3000/api'));
