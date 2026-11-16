// Netlify serverless function: answers /api/* with Yahoo Finance data (15 min delayed).
// Netlify cannot run the long-lived Node + Angel One server, so this keeps the site working with real data.
// When you run the full server (Render / VPS / your own device) the site uses Angel One first, see client/.env.example.
import { handleApi } from '../../server/yahooApi.js';

export default async (req) => {
  const url = new URL(req.url);
  const { status, json } = await handleApi(url.pathname, url.searchParams);
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};

export const config = { path: '/api/*' };
