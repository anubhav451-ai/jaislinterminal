import React, { useState } from 'react';
import NumField from './NumField.jsx';
import { INDICATOR_LIST, INDICATORS, PALETTE, defaultParams, indicatorTitle } from '../lib/registry.js';
import { GROUP_ORDER } from '../lib/registryMore.js';

export default function IndicatorModal({ indicators, onChange, onClose }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const list = INDICATOR_LIST.filter((i) => !term || i.label.toLowerCase().includes(term) || i.short.toLowerCase().includes(term));

  const add = (type) => {
    const used = indicators.filter((i) => i.type === type).length + indicators.length;
    onChange([...indicators, { id: `${type}-${Date.now()}`, type, params: defaultParams(type), color: PALETTE[used % PALETTE.length] }]);
  };
  const update = (id, patch) => onChange(indicators.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id) => onChange(indicators.filter((i) => i.id !== id));

  const renderParam = (ind, p) => {
    const val = ind.params[p.key] ?? p.def;
    const set = (v) => update(ind.id, { params: { ...ind.params, [p.key]: v } });
    if (p.type === 'select') {
      return (
        <label key={p.key}>
          <span>{p.label}</span>
          <select value={val} onChange={(e) => set(e.target.value)}>
            {p.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    }
    if (p.type === 'color') {
      return (
        <label key={p.key}>
          <span>{p.label}</span>
          <input type="color" value={val} onChange={(e) => set(e.target.value)} />
        </label>
      );
    }
    if (p.type === 'bool') {
      return (
        <label key={p.key} className="chk">
          <input type="checkbox" checked={!!val} onChange={(e) => set(e.target.checked)} />
          <span>{p.label}</span>
        </label>
      );
    }
    return (
      <label key={p.key}>
        <span>{p.label}</span>
        <NumField value={val} min={p.min} max={p.max} step={p.step || 1} onCommit={set} ariaLabel={p.label} />
      </label>
    );
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Indicators" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Indicators</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <input className="search" placeholder="Search indicators…" value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="modal-body">
          {indicators.length > 0 && !term && (
            <section>
              <h3>On chart</h3>
              {indicators.map((ind) => {
                const def = INDICATORS[ind.type];
                return (
                  <div className="ind-active" key={ind.id}>
                    <div className="ind-active-top">
                      <span className="ind-name">{indicatorTitle(ind)}</span>
                      <span className="muted small">{def.pane === 'main' ? 'on price' : 'own pane'}</span>
                      {def.usesColor && (
                        <input type="color" value={ind.color} onChange={(e) => update(ind.id, { color: e.target.value })} aria-label="Colour" />
                      )}
                      <button className="link-danger" onClick={() => remove(ind.id)}>
                        Remove
                      </button>
                    </div>
                    {def.params.length > 0 && <div className="ind-params">{def.params.map((p) => renderParam(ind, p))}</div>}
                  </div>
                );
              })}
            </section>
          )}
          <section>
            <h3>{term ? 'Results' : 'Add indicator'}</h3>
            {(term ? [[null, list]] : GROUP_ORDER.map((g) => [g, list.filter((i) => i.group === g)])).map(([g, items]) =>
              items.length ? (
                <div key={g || 'r'} className="ind-group">
                  {g && <h4>{g} <span className="muted small">({items.length})</span></h4>}
                  {items.map((i) => (
                    <button className="ind-row" key={i.id} onClick={() => add(i.id)}>
                      <span>{i.label}</span>
                      <span className="muted small">{i.pane === 'main' ? 'on price' : 'own pane'}</span>
                    </button>
                  ))}
                </div>
              ) : null
            )}
            {!list.length && <p className="empty">No indicator matches "{q}".</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
