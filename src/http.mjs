import http from 'node:http';
import app from './app.mjs';

export function createHttpServer(env, upstreamFetch) {
  if (!env.CHATGPT_ACTION_TOKEN || env.CHATGPT_ACTION_TOKEN.length < 32) {
    throw new Error('CHATGPT_ACTION_TOKEN must contain at least 32 characters');
  }
  const publicOrigin = env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || 'http://127.0.0.1';
  const server = http.createServer(async (req, res) => {
    try {
      // The unauthenticated platform readiness check exposes no business data.
      if (req.url === '/ready' && req.method === 'GET') {
        const ready = Boolean(env.TEVALIS_DUBAI_GUID && env.TEVALIS_ABU_DHABI_GUID && env.TEVALIS_DEV_ID);
        res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ready }));
        return;
      }
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) { res.writeHead(413); res.end(); return; }
        chunks.push(chunk);
      }
      const request = new Request(new URL(req.url, publicOrigin), {
        method: req.method, headers: req.headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
      });
      const response = await app.fetch(request, env, undefined, upstreamFetch);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"Internal error"}');
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}
