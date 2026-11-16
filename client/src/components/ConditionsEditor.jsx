import React, { useState } from 'react';
import NumField from './NumField.jsx';
import { COND_TYPES, DAYS, describe, MONTHS, newCondition, typeInfo } from '../lib/conditions.js';

const OPS_PRICE = [['above', 'Above'], ['below', 'Below']];

function Sel({ label, value, onChange, options }) {
  return (
    <label className="cd-f">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
function Num({ label, value, onChange, min, max, step }) {
  return (
    <label className="cd-f">
      <span>{label}</span>
      <NumField value={value} min={min} max={max} step={step} onCommit={onChange} ariaLabel={label} />
    </label>
  );
}
function Chips({ items, value, onChange }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="cd-chips">
      {items.map(([v, t]) => (
        <button key={v} type="button" className={value.includes(v) ? 'sel' : ''} onClick={() => toggle(v)}>
          {t}
        </button>
      ))}
    </div>
  );
}

function Fields({ c, set }) {
  switch (c.type) {
    case 'date':
      return (
        <div className="cd-row">
          <label className="cd-f">
            <span>From</span>
            <input type="date" value={c.from} max={c.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className="cd-f">
            <span>To</span>
            <input type="date" value={c.to} min={c.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </label>
        </div>
      );
    case 'weekday':
      return <Chips items={[1, 2, 3, 4, 5, 6, 0].map((d) => [d, DAYS[d]])} value={c.days || []} onChange={(days) => set({ days })} />;
    case 'month':
      return <Chips items={MONTHS.map((m, i) => [i + 1, m])} value={c.months || []} onChange={(months) => set({ months })} />;
    case 'time':
      return (
        <div className="cd-row">
          <label className="cd-f">
            <span>From</span>
            <input type="time" value={c.from} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className="cd-f">
            <span>To</span>
            <input type="time" value={c.to} onChange={(e) => set({ to: e.target.value })} />
          </label>
        </div>
      );
    case 'price':
      return (
        <div className="cd-row">
          <Sel label="Close is" value={c.op} onChange={(op) => set({ op })} options={OPS_PRICE} />
          <Num label="Price" value={c.value} onChange={(value) => set({ value })} min={0} step={0.05} />
        </div>
      );
    case 'ma':
      return (
        <div className="cd-row">
          <Sel label="Close is" value={c.op} onChange={(op) => set({ op })} options={OPS_PRICE} />
          <Sel label="Average" value={c.kind} onChange={(kind) => set({ kind })} options={[['ema', 'EMA'], ['sma', 'SMA']]} />
          <Num label="Length" value={c.length} onChange={(length) => set({ length })} min={1} max={500} />
        </div>
      );
    case 'trend':
      return (
        <div className="cd-row">
          <Sel label="Trend" value={c.op} onChange={(op) => set({ op })} options={[['up', 'Up (fast above slow)'], ['down', 'Down (fast below slow)']]} />
          <Num label="Fast EMA" value={c.fast} onChange={(fast) => set({ fast })} min={1} max={500} />
          <Num label="Slow EMA" value={c.slow} onChange={(slow) => set({ slow })} min={2} max={500} />
        </div>
      );
    case 'rsi':
      return (
        <div className="cd-row">
          <Sel label="RSI is" value={c.op} onChange={(op) => set({ op })} options={OPS_PRICE} />
          <Num label="Level" value={c.value} onChange={(value) => set({ value })} min={0} max={100} />
          <Num label="Length" value={c.length} onChange={(length) => set({ length })} min={2} max={100} />
        </div>
      );
    case 'volume':
      return (
        <div className="cd-row">
          <Num label="At least × average" value={c.mult} onChange={(mult) => set({ mult })} min={0.1} step={0.1} />
          <Num label="Average of last" value={c.length} onChange={(length) => set({ length })} min={2} max={200} />
        </div>
      );
    case 'candle':
      return (
        <div className="cd-row">
          <Sel label="Signal candle is" value={c.color} onChange={(color) => set({ color })} options={[['green', 'Green (up)'], ['red', 'Red (down)']]} />
        </div>
      );
    case 'move':
      return (
        <div className="cd-row">
          <Num label="Body at least (%)" value={c.min} onChange={(min) => set({ min })} min={0} step={0.1} />
        </div>
      );
    case 'atr':
      return (
        <div className="cd-row">
          <Sel label="ATR % is" value={c.op} onChange={(op) => set({ op })} options={OPS_PRICE} />
          <Num label="Percent" value={c.value} onChange={(value) => set({ value })} min={0} step={0.1} />
          <Num label="Length" value={c.length} onChange={(length) => set({ length })} min={2} max={100} />
        </div>
      );
    case 'breakout':
      return (
        <div className="cd-row">
          <Sel label="Close beyond" value={c.op} onChange={(op) => set({ op })} options={[['high', 'Highest high'], ['low', 'Lowest low']]} />
          <Num label="Last N candles" value={c.length} onChange={(length) => set({ length })} min={2} max={500} />
        </div>
      );
    default:
      return null;
  }
}

// "Add condition": any number of extra rules that decide which BUY / SELL signals count.
export default function ConditionsEditor({ value, onChange }) {
  const [adding, setAdding] = useState(false);
  const items = value?.items || [];
  const match = value?.match === 'any' ? 'any' : 'all';
  const commit = (next) => onChange({ match, items, ...next });
  const patch = (id, p) => commit({ items: items.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const active = items.filter((c) => c.enabled !== false).length;

  return (
    <div className="cd">
      {items.length > 1 && (
        <div className="cd-match">
          <span className="muted small">A signal counts when</span>
          <div className="rp-seg" role="group" aria-label="How the conditions combine">
            <button className={match === 'all' ? 'on' : ''} onClick={() => commit({ match: 'all' })}>
              ALL conditions match
            </button>
            <button className={match === 'any' ? 'on' : ''} onClick={() => commit({ match: 'any' })}>
              ANY one matches
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && <p className="muted small">No extra conditions. Every signal of the strategy counts. Add dates, days, RSI, trend and more to filter the BUY / SELL signals.</p>}

      {items.map((c) => (
        <div key={c.id} className={`cd-item ${c.enabled === false ? 'off' : ''}`}>
          <div className="cd-head">
            <label className="cd-on">
              <input type="checkbox" checked={c.enabled !== false} onChange={(e) => patch(c.id, { enabled: e.target.checked })} aria-label="Condition on or off" />
              <b>{typeInfo(c.type)?.label || c.type}</b>
            </label>
            <button className="cd-x" onClick={() => commit({ items: items.filter((x) => x.id !== c.id) })} aria-label="Remove this condition" title="Remove">
              ×
            </button>
          </div>
          <Fields c={c} set={(p) => patch(c.id, p)} />
          <div className="cd-row">
            <Sel label="Applies to" value={c.scope || 'both'} onChange={(scope) => patch(c.id, { scope })} options={[['both', 'BUY and SELL'], ['buy', 'BUY only'], ['sell', 'SELL only']]} />
            <Sel label="Rule" value={c.invert ? 'skip' : 'allow'} onChange={(v) => patch(c.id, { invert: v === 'skip' })} options={[['allow', 'Allow only when this is true'], ['skip', 'Skip when this is true']]} />
          </div>
          <small className="cd-sum">{describe(c)}</small>
        </div>
      ))}

      {adding ? (
        <div className="cd-pick">
          <div className="cd-pick-head">
            <b>Choose a condition</b>
            <button className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
          <div className="cd-types">
            {COND_TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => {
                  commit({ items: [...items, newCondition(t.type)] });
                  setAdding(false);
                }}
              >
                <b>{t.label}</b>
                <small>{t.hint}</small>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button className="btn wide cd-add" onClick={() => setAdding(true)}>
          + Add condition{active ? ` (${active} active)` : ''}
        </button>
      )}
    </div>
  );
}
