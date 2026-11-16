import { API_BASE } from './config.js';

// One place for every backend call. There is no demo data. Order of sources:
//  1. the Node server (Angel One first, and the server itself falls back to Yahoo Finance when Angel is down)
//  2. if that server cannot be reached (for example the site is on Netlify and the server is asleep), the same
//     site's own /api (Netlify function), which answers with Yahoo Finance (15 min delayed)
// If nothing answers, the caller gets a clear error message and the app says so.
async function call(base, path) {
  let r;
  try {
    r = await fetch(`${base}${path}`);
  } catch {
    const e = new Error('Cannot reach the server. Is it running?');
    e.retry = true;
    throw e;
  }
  let j = null;
  try {
    j = await r.json();
  } catch {
    const e = new Error(`Server returned an unreadable answer (HTTP ${r.status})`);
    e.retry = true;
    throw e;
  }
  if (!r.ok) {
    const e = new Error(j?.error || `HTTP ${r.status}`);
    e.retry = r.status >= 500;
    throw e;
  }
  return j;
}

export async function apiJson(path) {
  try {
    return await call(API_BASE, path);
  } catch (e) {
    if (API_BASE && e.retry) {
      try {
        return await call('', path); // same-site Yahoo fallback
      } catch {
        /* report the first error */
      }
    }
    throw e;
  }
}
