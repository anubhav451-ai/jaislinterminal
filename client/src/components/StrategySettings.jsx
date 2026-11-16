import React, { useMemo, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';
import NumField from './NumField.jsx';
import ParamField from './ParamField.jsx';
import { INDICATORS, indicatorTitle } from '../lib/registry.js';
import { indicatorsFor } from '../lib/strategy.js';
import RiskFields from './RiskFields.jsx';
import ConditionsEditor from './ConditionsEditor.jsx';
import TradingDays from './TradingDays.jsx';

// Full-screen settings of one strategy: name, inputs, indicators, source code, danger zone.
export default function StrategySettings({ def, applied, baseParams, menuActions, onSaveParams, onBack, statsOn, onToggleStats, cfg, onCfg }) {
  const [draft, setDraft] = useState(() => ({ ...def.defaults, ...baseParams }));
  const [dirty, setDirty] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const inds = useMemo(() => indicatorsFor(def, draft), [def, draft]);
  const setInd = (k, patch) => {
    setDraft((d) => {
      const cur = d.ind?.[k] || {};
      return { ...d, ind: { ...(d.ind || {}), [k]: { ...cur, ...patch, params: { ...(cur.params || {}), ...(patch.params || {}) } } } };
    });
    setDirty(true);
  };
  const lines = def.code ? def.code.split('\n').length : 0;

  return (
    <div className="page" role="dialog" aria-label={`${def.name} settings`}>
      <header className="page-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon d={ICONS.back} />
        </button>
        <h1>Strategy settings</h1>
        <button
          className="btn primary"
          disabled={!dirty}
          onClick={() => {
            onSaveParams(draft);
            setDirty(false);
          }}
        >
          Save
        </button>
      </header>
      <div className="page-body pb-cols">
        <div className="pb-grid">
          <div className="pb-col">
        <section className="card">
          <h2>Name</h2>
          <div className="name-row">
            <b>{def.name}</b>
            {menuActions.rename && (
              <button className="btn" onClick={menuActions.rename}>
                Rename
              </button>
            )}
          </div>
          <p className="muted small">{def.short}</p>
        </section>

        <section className="card">
          <h2>Strategy data</h2>
          <label className="chk toggle-row">
            <input type="checkbox" checked={statsOn?.[def.id] !== false} onChange={() => onToggleStats?.(def.id)} />
            <span>
              <b>Show strategy panel on the chart</b>
              <small className="muted">A small panel on the chart with accuracy, last 10 trades and today / week / month results. Tap the panel for the full report. You can remove it any time and switch it on again here.</small>
            </span>
          </label>
        </section>

        {onCfg && (
          <section className="card">
            <h2>Stop-loss &amp; Target</h2>
            <p className="muted small">Used to check this strategy's accuracy on the chart panel and report. Tick off what you do not need.</p>
            <RiskFields cfg={cfg} onCfg={onCfg} hasOwn={!!def.levels} />
          </section>
        )}

        <section className="card">
          <h2>Trading days</h2>
          <p className="muted small">Choose which days this strategy may trade and which dates to leave out. Press Save to apply.</p>
          <TradingDays value={draft.tradingDays} onChange={(v) => set('tradingDays', v)} />
        </section>

        <section className="card">
          <h2>Conditions</h2>
          <p className="muted small">Add rules that a BUY / SELL signal must pass: dates, days, time, RSI, trend, volume and more. Press Save to apply.</p>
          <ConditionsEditor value={draft.conditions} onChange={(v) => set('conditions', v)} />
        </section>

        <section className="card">
          <h2>Inputs</h2>
          <div className="form-grid">
            {def.fields.map((f) => (
              <label key={f.key} className={`field ${f.type === 'bool' ? 'chk' : ''}`}>
                {f.type !== 'bool' && <span>{f.label}</span>}
                {f.type === 'select' ? (
                  <select value={draft[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {f.labels?.[o] || o}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'bool' ? (
                  <>
                    <input type="checkbox" checked={!!draft[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                    <span>{f.label}</span>
                  </>
                ) : f.type === 'text' ? (
                  <input value={draft[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
                ) : (
                  <NumField value={draft[f.key] ?? 0} min={f.min} max={f.max} step={f.step} onCommit={(v) => set(f.key, v)} ariaLabel={f.label} />
                )}
              </label>
            ))}
          </div>
          <p className="muted small">{applied ? 'Saving re-scans all stocks with the new inputs.' : 'These inputs are used when you add stocks.'}</p>
        </section>

          </div>
          <div className="pb-col">
        <section className="card">
          <h2>Indicators on the chart</h2>
          {inds.length === 0 ? (
            <p className="muted">This strategy draws no indicator.</p>
          ) : (
            <>
              {inds.map((ind, k) => {
                const d = INDICATORS[ind.type];
                return (
                  <div className="ind-active" key={ind.id}>
                    <div className="ind-active-top">
                      <span className="ind-name">{indicatorTitle(ind)}</span>
                      <span className="muted small">{d.pane === 'main' ? 'on price' : 'own pane'}</span>
                      {d.usesColor && <input type="color" value={ind.color} onChange={(e) => setInd(k, { color: e.target.value })} aria-label="Colour" />}
                    </div>
                    {d.params.length > 0 && (
                      <div className="ind-params">
                        {d.params.map((p) => (
                          <ParamField key={p.key} p={p} value={ind.params[p.key]} onChange={(v) => setInd(k, { params: { [p.key]: v } })} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="muted small">Changes here only change how the indicator is drawn. BUY/SELL signals follow the strategy inputs above.</p>
            </>
          )}
        </section>

        <section className="card">
          <h2>Source</h2>
          {def.builtin ? (
            <>
              <p className="muted small">Built-in strategy. Logic:</p>
              <ul className="rules">
                {def.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <button className="btn wide" onClick={menuActions.download}>
                Download Python file
              </button>
            </>
          ) : (
            <>
              <div className="name-row">
                <span>
                  <b>{def.fileName || 'strategy.py'}</b> <span className="muted small">{lines} lines · Python</span>
                </span>
                {menuActions.replace && (
                  <button className="btn" onClick={menuActions.replace}>
                    Replace file
                  </button>
                )}
              </div>
              <button className="btn wide" onClick={menuActions.download}>
                Download Python file
              </button>
              <button className="btn wide" onClick={() => setShowCode((v) => !v)}>
                {showCode ? 'Hide source code' : 'Show source code'}
              </button>
              {showCode && <pre className="code-view">{def.code}</pre>}
              <ul className="rules">
                {def.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card danger-zone">
          <h2>Manage</h2>
          {applied && menuActions.removeAll && (
            <button className="btn wide" onClick={menuActions.removeAll}>
              Remove from all stocks
            </button>
          )}
          {!def.builtin && menuActions.delete && (
            <button className="btn wide danger" onClick={menuActions.delete}>
              Delete strategy
            </button>
          )}
          {def.builtin && !applied && <p className="muted small">Nothing to remove.</p>}
        </section>
          </div>
        </div>
      </div>
    </div>
  );
}
