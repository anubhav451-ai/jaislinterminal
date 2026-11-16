import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';
import { store } from './lib/store.js';
import './styles.css';
import { LOGO_URL } from './components/Logo.jsx';

// use /logo.png as the browser tab icon when the file exists
{
  const img = new Image();
  img.onload = () => {
    let l = document.querySelector('link[rel~="icon"]');
    if (!l) {
      l = document.createElement('link');
      l.rel = 'icon';
      document.head.appendChild(l);
    }
    l.type = 'image/png';
    l.href = LOGO_URL;
  };
  img.src = LOGO_URL;
}

// If anything crashes, show the reason instead of a blank white screen.
class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    console.error('[app crash]', err, info?.componentStack);
  }
  render() {
    if (!this.state.err) return this.props.children;
    const msg = String(this.state.err?.stack || this.state.err?.message || this.state.err);
    return (
      <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif', color: '#d1d4dc', background: '#131722', minHeight: '100vh' }}>
        <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
        <p>The app hit an error. Your saved drawings and strategies are still in the browser. Try reload first.</p>
        <p>
          <button style={{ padding: '8px 14px', marginRight: 8 }} onClick={() => location.reload()}>
            Reload
          </button>
          <button
            style={{ padding: '8px 14px' }}
            onClick={() => {
              if (!window.confirm('Delete ALL saved data of this app (drawings, strategies, watchlist, settings)?')) return;
              try {
                store.keys().forEach((k) => store.removeItem(k));
              } catch {}
              location.reload();
            }}
          >
            Reset saved data
          </button>
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#1e222d', padding: 12, borderRadius: 8, overflow: 'auto' }}>{msg}</pre>
      </div>
    );
  }
}

window.addEventListener('error', (e) => console.error('[window error]', e.message));
createRoot(document.getElementById('root')).render(
  <Boundary>
    <AuthGate>
      <App />
    </AuthGate>
  </Boundary>
);
