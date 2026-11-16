// Per-user cloud copy of the app's saved data in Firestore:
//   users/{uid}                 profile (name, email, photo, createdAt, lastLoginAt)
//   users/{uid}/kv/{key}        one document per saved item: { v: "<json string>", t: time }
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';
import { getNamespace, isSynced, setChangeHook, store } from './store.js';

const MAX_VALUE = 900000; // Firestore documents are limited to 1 MiB
let uidNow = null;
let pending = new Map(); // key -> string | null (null = delete)
let timer = null;
let flushing = Promise.resolve();
let statusCb = () => {};

export const onSyncStatus = (cb) => {
  statusCb = cb;
};
const idOf = (k) => encodeURIComponent(k);
const keyOf = (id) => decodeURIComponent(id);

async function flushNow() {
  const uid = uidNow;
  if (!uid || !pending.size) return;
  const batch = pending;
  pending = new Map();
  statusCb('saving');
  try {
    const entries = [...batch.entries()];
    for (let i = 0; i < entries.length; i += 400) {
      const wb = writeBatch(db);
      for (const [k, v] of entries.slice(i, i + 400)) {
        const ref = doc(db, 'users', uid, 'kv', idOf(k));
        if (v == null) wb.delete(ref);
        else if (v.length <= MAX_VALUE) wb.set(ref, { v, t: serverTimestamp() });
      }
      await wb.commit();
    }
    statusCb(pending.size ? 'saving' : 'saved');
  } catch (e) {
    console.warn('[cloud] save failed', e?.code || e);
    for (const [k, v] of batch) if (!pending.has(k)) pending.set(k, v); // try again later
    statusCb('error');
    schedule(15000);
  }
}
function schedule(ms = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    flushing = flushing.then(flushNow);
  }, ms);
}
export const flushCloud = () => {
  clearTimeout(timer);
  flushing = flushing.then(flushNow);
  return flushing;
};

// Called once after sign in, BEFORE the app is shown: gets this user's data into the browser.
export async function prepareUser(user, { signal } = {}) {
  const uid = user.uid;
  const prefix = `u_${uid}:`;
  // 1) profile
  const pref = doc(db, 'users', uid);
  const snap = await getDoc(pref);
  const profile = { name: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '', lastLoginAt: serverTimestamp() };
  if (!snap.exists()) profile.createdAt = serverTimestamp();
  await setDoc(pref, profile, { merge: true });
  // 2) saved data of this account
  const docs = await getDocs(collection(db, 'users', uid, 'kv'));
  if (signal?.aborted) throw new Error('aborted');
  const legacy = Object.keys(localStorage).filter((k) => k.startsWith('n50.')); // saved before accounts existed
  const toUpload = new Map();
  if (docs.empty) {
    // first time with this account: take over what was saved on this device before sign in
    for (const k of legacy) {
      const v = localStorage.getItem(k);
      if (v != null) {
        localStorage.setItem(prefix + k, v);
        if (isSynced(k)) toUpload.set(k, v);
      }
    }
  } else {
    docs.forEach((d) => {
      const k = keyOf(d.id);
      const v = d.data()?.v;
      if (typeof v === 'string') localStorage.setItem(prefix + k, v);
    });
  }
  legacy.forEach((k) => localStorage.removeItem(k)); // never leak one person's old data into the next account
  return { first: docs.empty, toUpload, hadRemote: !docs.empty };
}

export function startSync(uid, initialUpload) {
  uidNow = uid;
  pending = new Map(initialUpload || []);
  setChangeHook((k, v) => {
    if (!uidNow) return;
    pending.set(k, v);
    statusCb('saving');
    schedule();
  });
  if (pending.size) schedule(300);
  else statusCb('saved');
}
export function stopSync() {
  uidNow = null;
  pending = new Map();
  clearTimeout(timer);
  setChangeHook(null);
}
export const syncUid = () => uidNow;

// Delete this account's cloud copy of the app data (used by "Reset all")
export async function wipeCloud(uid) {
  const docs = await getDocs(collection(db, 'users', uid, 'kv'));
  const jobs = [];
  docs.forEach((d) => jobs.push(deleteDoc(d.ref)));
  await Promise.all(jobs);
}

if (typeof window !== 'undefined') {
  const bye = () => {
    if (uidNow && pending.size) flushCloud();
  };
  window.addEventListener('pagehide', bye);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && bye());
}
export { store, getNamespace };
