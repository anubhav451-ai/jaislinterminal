// VITE_API_BASE: full URL of a separately hosted Node server (e.g. https://my-api.onrender.com).
// Leave empty when the API is served from the same site (local dev, single server, Netlify functions).
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
// Static hosts (Cloudflare, Netlify) have no WebSocket: poll right away instead of waiting for 3 failed tries.
const STATIC_HOST = typeof location !== 'undefined' && /(\.pages\.dev|\.workers\.dev|\.netlify\.app)$/i.test(location.hostname);
export const FORCE_POLL = (import.meta.env.VITE_POLL === '1' || STATIC_HOST) && !API_BASE;
export function wsUrl() {
  if (API_BASE) return `${API_BASE.replace(/^http/, 'ws')}/ws`;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}
