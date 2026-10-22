export function createHandler(getConfig) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
    try {
      await getConfig();
      // Pass config.DATABASE_URL / config.API_KEY to your server-side clients here.
      // This demo deliberately does not return configuration values.
      res.statusCode = 200;
      return res.end(JSON.stringify({ status: 'ok', configurationLoaded: true }));
    } catch {
      console.error('configuration_unavailable');
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
    }
  };
}
