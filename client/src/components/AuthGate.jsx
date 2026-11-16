import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase.js';
import { flushCloud, onSyncStatus, prepareUser, startSync, stopSync } from '../lib/cloud.js';
import { setNamespace } from '../lib/store.js';
import { AuthContext } from '../lib/authContext.js';
import Logo from './Logo.jsx';

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('Timed out. Check your internet.'), { code: 'timeout' })), ms))]);

function explain(e) {
  const c = e?.code || '';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
  if (c === 'auth/unauthorized-domain') return `This website address (${location.hostname}) is not allowed yet. In Firebase Console open Authentication, Settings, Authorized domains and add ${location.hostname}.`;
  if (c === 'auth/network-request-failed') return 'No internet connection. Please try again.';
  if (c === 'auth/operation-not-allowed') return 'Google sign-in is not switched on in Firebase (Authentication, Sign-in method, Google).';
  if (c === 'permission-denied' || c === 'firestore/permission-denied') return 'Cloud storage refused the request. Publish the rules from firestore.rules in Firebase Console (Firestore Database, Rules).';
  return e?.message || 'Something went wrong. Please try again.';
}

const GoogleG = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

function LoginScreen({ error, busy, onGoogle }) {
  const [tab, setTab] = useState('in');
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo />
        </div>
        <h1>Jaislin Terminal</h1>
        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'in'} className={tab === 'in' ? 'on' : ''} onClick={() => setTab('in')}>
            Sign in
          </button>
          <button role="tab" aria-selected={tab === 'up'} className={tab === 'up' ? 'on' : ''} onClick={() => setTab('up')}>
            Register
          </button>
        </div>
        <p className="auth-text">
          {tab === 'in' ? 'Welcome back. Sign in to open your watchlist, strategies and drawings.' : 'Create your own account in one tap. No password to remember.'}
        </p>
        <button className="auth-google" onClick={onGoogle} disabled={busy}>
          <GoogleG />
          <span>{busy ? 'Please wait…' : 'Continue with Google'}</span>
        </button>
        {error && (
          <p className="auth-err" role="alert">
            {error}
          </p>
        )}
        <small className="auth-note">Every account has its own separate watchlist, strategies, drawings and settings, saved safely in the cloud so they follow you on any device.</small>
      </div>
    </div>
  );
}

function Busy({ text }) {
  return (
    <div className="auth-screen">
      <div className="auth-card auth-busy">
        <div className="auth-logo">
          <Logo />
        </div>
        <b>{text}</b>
        <div className="auth-spin" aria-hidden="true" />
      </div>
    </div>
  );
}

// Shows the sign-in screen until the user is signed in with Google, then loads that user's own data and opens the app.
export default function AuthGate({ children }) {
  const [phase, setPhase] = useState('loading'); // loading | out | syncing | sync-error | ready
  const [user, setUser] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [sync, setSync] = useState('off');
  const seq = useRef(0);

  useEffect(() => onSyncStatus((s) => setSync(s)), []);

  const openFor = useCallback(async (u) => {
    const my = ++seq.current;
    setUser(u);
    setErr('');
    setPhase('syncing');
    try {
      const res = await withTimeout(prepareUser(u), 20000);
      if (my !== seq.current) return;
      setNamespace(u.uid);
      startSync(u.uid, res.toUpload);
      setCloud(true);
      setPhase('ready');
    } catch (e) {
      if (my !== seq.current) return;
      console.warn('[auth] cloud load failed', e);
      setErr(explain(e));
      setPhase('sync-error');
    }
  }, []);

  useEffect(() => {
    getRedirectResult(auth).catch((e) => setErr(explain(e)));
    return onAuthStateChanged(auth, (u) => {
      if (u) openFor(u);
      else {
        seq.current++;
        stopSync();
        setNamespace('');
        setUser(null);
        setCloud(false);
        setSync('off');
        setPhase('out');
      }
    });
  }, [openFor]);

  const google = async () => {
    setBusy(true);
    setErr('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e?.code)) {
        try {
          await signInWithRedirect(auth, googleProvider); // page leaves and comes back signed in
          return;
        } catch (e2) {
          setErr(explain(e2));
        }
      } else setErr(explain(e));
    } finally {
      setBusy(false);
    }
  };

  const signOut = useCallback(async () => {
    try {
      await withTimeout(flushCloud(), 4000);
    } catch {}
    try {
      await fbSignOut(auth);
    } catch {}
    location.reload();
  }, []);

  const offline = () => {
    // continue on this device only (cloud storage not reachable / not set up yet)
    setNamespace(user.uid);
    stopSync();
    setCloud(false);
    setSync('off');
    setPhase('ready');
  };

  if (phase === 'loading') return <Busy text="Loading…" />;
  if (phase === 'out') return <LoginScreen error={err} busy={busy} onGoogle={google} />;
  if (phase === 'syncing') return <Busy text="Opening your account…" />;
  if (phase === 'sync-error')
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-logo">
            <Logo />
          </div>
          <h1>Could not load your data</h1>
          <p className="auth-err" role="alert">
            {err}
          </p>
          <button className="auth-google" onClick={() => openFor(user)}>
            <span>Try again</span>
          </button>
          <button className="auth-link" onClick={offline}>
            Continue on this device only
          </button>
          <button className="auth-link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  return (
    <AuthContext.Provider value={{ user, signOut, sync, cloud }}>
      <React.Fragment key={user?.uid}>{children}</React.Fragment>
    </AuthContext.Provider>
  );
}
