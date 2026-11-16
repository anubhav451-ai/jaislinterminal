import React from 'react';
import { normCfg, SL_CHIPS, TP_CHIPS } from '../lib/backtest.js';

// Stop-loss % and Target % for the accuracy test. Each one can be switched off with its checkbox.
function Row({ label, on, value, chips, onToggle, onValue, tone }) {
  return (
    <div className={`rf-row ${on ? '' : 'off'}`}>
      <label className="rf-top">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        <b>{label}</b>
        <span className="rf-input">
          <input type="number" min="0.05" step="0.05" inputMode="decimal" disabled={!on} value={value} onChange={(e) => Number(e.target.value) > 0 && onValue(Number(e.target.value))} aria-label={`${label} percent`} />
          <em>%</em>
        </span>
      </label>
      {on && (
        <div className="rf-chips">
          {chips.map((x) => (
            <button key={x} type="button" className={value === x ? `sel ${tone}` : ''} onClick={() => onValue(x)}>
              {x}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RiskFields({ cfg, onCfg, hasOwn = false }) {
  const c = normCfg(cfg);
  return (
    <div className="rf">
      {hasOwn && (
        <label className="rf-own">
          <input type="checkbox" checked={c.own} onChange={(e) => onCfg({ own: e.target.checked })} />
          <span>
            <b>Use this strategy's own stop-loss and target</b>
            <small>Stop-loss and target are set by the strategy for every signal. The % below are used only when you switch this off or the strategy gives none.</small>
          </span>
        </label>
      )}
      <Row label="Stop-loss" tone="sl" on={c.slOn} value={c.sl} chips={SL_CHIPS} onToggle={(v) => onCfg({ slOn: v })} onValue={(v) => onCfg({ sl: v })} />
      <Row label="Target" tone="tp" on={c.tpOn} value={c.tp} chips={TP_CHIPS} onToggle={(v) => onCfg({ tpOn: v })} onValue={(v) => onCfg({ tp: v })} />
      <p className="muted small rf-note">
        {c.slOn || c.tpOn
          ? `Entry at the signal candle's close. A BUY ${c.slOn ? `loses if the price falls ${c.sl}%` : ''}${c.slOn && c.tpOn ? ', ' : ''}${c.tpOn ? `wins if it rises ${c.tp}%` : ''} (whichever comes first); SELL is the opposite. Both in one candle = stop counts. The opposite signal also closes a trade.`
          : 'Both are off, so a trade only ends when the opposite signal comes (BUY closes at the next SELL signal and the other way round). Win = closed in profit. A strategy that gives only BUY or only SELL signals never finishes a trade this way, so keep a stop-loss or target on for it.'}
      </p>
    </div>
  );
}
