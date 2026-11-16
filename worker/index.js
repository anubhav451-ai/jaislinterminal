// Cloudflare Worker (static assets + API).
//  - /api/*  -> Yahoo Finance data (15 min delayed), same code as netlify/functions and functions/api
//  - /ws     -> there is no WebSocket on this host: answer at once so the app switches to polling
//  - others  -> the built website (client/dist), served by the ASSETS binding
import { handleApi } from '../server/yahooApi.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') return new Response('No WebSocket on this host', { status: 404 });
    if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
      try {
        const { status, json } = await handleApi(url.pathname, url.searchParams);
        return new Response(JSON.stringify(json), {
          status,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 502, headers: { 'content-type': 'application/json' } });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
