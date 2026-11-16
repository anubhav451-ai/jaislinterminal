import React from 'react';
import Icon, { ICONS } from './Icon.jsx';
import { useAuth } from '../lib/authContext.js';

const PRESETS = [
  ['Blue / Navy', '#1a56db', '#0b2a6f'],
  ['Blue / Red', '#1a56db', '#e5484d'],
  ['Green / Red', '#26a69a', '#ef5350'],
];

function Row({ title, hint, children }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <span>{title}</span>
        {hint && <small className="muted">{hint}</small>}
      </div>
      <div className="set-ctl">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export default function Settings({ settings, onSettings, health, status, indicatorsCount, onOpenIndicators, drawingsCount, onClearDrawings, onResetAll }) {
  const { user, signOut, sync, cloud } = useAuth();
  const s = settings;
  return (
    <div className="settings">
      <h1>Settings</h1>

      {user && (
        <section>
          <h2>Account</h2>
          <div className="acct">
            {user.photoURL ? <img className="acct-pic" src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="acct-pic acct-none">{(user.displayName || user.email || '?').slice(0, 1).toUpperCase()}</span>}
            <div className="acct-text">
              <b>{user.displayName || 'Signed in'}</b>
              <small className="muted">{user.email}</small>
              <small className="muted">{!cloud ? 'Saved on this device only' : sync === 'saving' ? 'Saving to cloud…' : sync === 'error' ? 'Cloud save failed, will retry' : 'All changes saved to your account'}</small>
            </div>
            <button className="btn" onClick={signOut}>
              Sign out
            </button>
          </div>
        </section>
      )}
      <section>
        <h2>Appearance</h2>
        <Row title="Up / down colours" hint="Used on charts, lists and prices">
          <div className="presets">
            {PRESETS.map(([label, up, down]) => (
              <button key={label} className={`preset ${s.upColor === up && s.downColor === down ? 'on' : ''}`} onClick={() => onSettings({ upColor: up, downColor: down })} aria-label={label} title={label}>
                <i style={{ background: up }} />
                <i style={{ background: down }} />
              </button>
            ))}
            <label className="swatch custom" title="Up colour">
              <input type="color" value={s.upColor} onChange={(e) => onSettings({ upColor: e.target.value })} aria-label="Up colour" />
            </label>
            <label className="swatch custom" title="Down colour">
              <input type="color" value={s.downColor} onChange={(e) => onSettings({ downColor: e.target.value })} aria-label="Down colour" />
            </label>
          </div>
        </Row>
      </section>

      <section>
        <h2>Chart</h2>
        <Row title="Show volume bars">
          <Toggle on={s.showVolume} onChange={(v) => onSettings({ showVolume: v })} label="Show volume" />
        </Row>
        <Row title="Indicators on chart" hint={`${indicatorsCount} active`}>
          <button className="btn" onClick={onOpenIndicators}>
            Manage
          </button>
        </Row>
      </section>

      <section>
        <h2>Drawing tools – defaults for new drawings</h2>
        <Row title="Colour">
          <input type="color" className="color-input" value={s.drawColor} onChange={(e) => onSettings({ drawColor: e.target.value })} aria-label="Default drawing colour" />
        </Row>
        <Row title="Line width">
          <div className="seg small">
            {[1, 2, 3, 4].map((w) => (
              <button key={w} className={s.drawWidth === w ? 'on' : ''} onClick={() => onSettings({ drawWidth: w })}>
                {w}px
              </button>
            ))}
          </div>
        </Row>
        <Row title="Line style">
          <div className="seg small">
            {['solid', 'dashed', 'dotted'].map((st) => (
              <button key={st} className={s.drawStyle === st ? 'on' : ''} onClick={() => onSettings({ drawStyle: st })}>
                {st}
              </button>
            ))}
          </div>
        </Row>
        <Row title="Magnet" hint="New points and handles snap to the nearest candle open / high / low / close">
          <Toggle on={!!s.magnet} onChange={(v) => onSettings({ magnet: v })} label="Magnet" />
        </Row>
        <Row title="Saved drawings" hint={`${drawingsCount} across all stocks. On the chart: tap a drawing to move it, double-tap for its properties.`}>
          <button className="btn danger-btn" disabled={!drawingsCount} onClick={onClearDrawings}>
            Delete all
          </button>
        </Row>
      </section>

      <section>
        <h2>Data</h2>
        <Row title="Source" hint={health?.delayed ? 'Angel One is not connected, so Yahoo Finance is used (15 min delayed). Angel One takes over by itself when its server connects.' : 'Angel One is the first choice. If it disconnects, Yahoo Finance (15 min delayed) is used.'}>
          <span className="muted">{health?.label || '—'}</span>
        </Row>
        <Row title="Connection">
          <span className={status === 'live' ? 'up' : 'down'}>{status === 'live' ? 'Connected' : 'Offline'}</span>
        </Row>
      </section>

      <section>
        <h2>About</h2>
        <Row title="Charts" hint="Charts are drawn with the open-source Lightweight Charts library by TradingView, Inc.">
          <a className="btn" href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
            tradingview.com
          </a>
        </Row>
      </section>

      <section>
        <h2>App</h2>
        <Row title="Reset everything" hint="Clears saved settings, open charts, indicators and drawings in this browser.">
          <button className="btn danger-btn" onClick={onResetAll}>
            Reset
          </button>
        </Row>
      </section>
    </div>
  );
}
