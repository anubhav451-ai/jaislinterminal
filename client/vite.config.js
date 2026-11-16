import http from 'node:http';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` without the Node server: /api/* is answered with Yahoo Finance (15 min delayed) instead of failing.
// When the server on :8080 is running, requests go to it (Angel One first, Yahoo second).
function yahooWhenNoServer() {
  return {
    name: 'yahoo-when-no-server',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        const proxy = http.request({ host: '127.0.0.1', port: 8080, path: `/api${req.url}`, method: req.method, headers: req.headers }, (up) => {
          res.writeHead(up.statusCode || 502, up.headers);
          up.pipe(res);
        });
        proxy.on('error', async () => {
          try {
            const { handleApi } = await import('../server/yahooApi.js');
            const u = new URL(`/api${req.url}`, 'http://localhost');
            const { status, json } = await handleApi(u.pathname, u.searchParams);
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(json));
          } catch (e) {
            res.writeHead(502, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        req.pipe(proxy);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), yahooWhenNoServer()],
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
