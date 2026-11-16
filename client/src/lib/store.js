// Browser storage with one separate area per signed-in user (so two accounts on one phone never mix),
// plus a hook that lets lib/cloud.js copy every change to Firestore.
let ns = '';
let onChange = null;
const SYNC_SKIP = new Set(['n50.seen', 'n50.watchw', 'n50.statpos', 'n50.navcol']); // device-only things

export const setNamespace = (uid) => {
  ns = uid ? `u_${uid}:` : '';
};
export const getNamespace = () => ns;
export const setChangeHook = (fn) => {
  onChange = fn;
};
export const isSynced = (k) => k.startsWith('n50.') && !SYNC_SKIP.has(k);

export const store = {
  getItem(k) {
    try {
      return localStorage.getItem(ns + k);
    } catch {
      return null;
    }
  },
  setItem(k, v) {
    try {
      localStorage.setItem(ns + k, v);
    } catch {}
    if (onChange && isSynced(k)) onChange(k, String(v));
  },
  removeItem(k) {
    try {
      localStorage.removeItem(ns + k);
    } catch {}
    if (onChange && isSynced(k)) onChange(k, null);
  },
  // keys of this user (without the prefix)
  keys() {
    try {
      return Object.keys(localStorage)
        .filter((k) => k.startsWith(ns + 'n50.') && (ns || !k.startsWith('u_')))
        .map((k) => k.slice(ns.length));
    } catch {
      return [];
    }
  },
};
