// Cloudflare Pages Function: answers /api/* with Yahoo Finance data (15 min delayed).
// Same code as netlify/functions/api.mjs, so the site works on Cloudflare Pages too.
import { handleApi } from '../../server/yahooApi.js';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const { status, json } = await handleApi(url.pathname, url.searchParams);
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
