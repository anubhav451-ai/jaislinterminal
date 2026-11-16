import React, { useMemo, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';
import StockPicker from './StockPicker.jsx';
import RowMenu from './RowMenu.jsx';
import StrategyEditor from './StrategyEditor.jsx';
import StrategySettings from './StrategySettings.jsx';
import { allStrategies, agoText, isFresh, downloadPy } from '../lib/strategy.js';
import { useNowShift } from '../lib/hooks.js';
import { fmtNum, INTERVALS } from '../lib/time.js';

const hhmm = (t) => {
  const d = new Date(t * 1000);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const SideBadge = ({ side }) => <span className={`badge ${side === 'sell' ? 'sell' : 'buy'}`}>{side === 'sell' ? 'SELL' : 'BUY'}</span>;

// Screen 2: only the stocks this strategy is applied to (newest setups first, highlighted)
function StocksPage({ def, applied, symbols, signals, history, scanState, onBack, onSettings, onAddStocks, onRemoveSymbol, onRescan, onOpenSetup }) {
  const now = useNowShift(30000);
  const nameOf = (sym) => symbols.find((s) => s.symbol === sym)?.name || '';
  const rows = useMemo(() => {
    const list = (applied?.symbols || []).map((symbol) => {
      const sig = (signals[symbol] || []).find((x) => x.strategyId === def.id) || null;
      const last = (history?.[symbol] || []).filter((x) => x.strategyId === def.id).sort((a, b) => b.formedAt - a.formedAt)[0] || null;
      return { symbol, sig, last, at: sig?.formedAt ?? last?.formedAt ?? 0 };
    });
    // most recent setup first (active ones are highlighted); stocks that never had one go last
    return list.sort((a, b) => b.at - a.at || a.symbol.localeCompare(b.symbol));
  }, [applied, signals, history, def.id]);
  const withSetup = rows.filter((r) => r.sig).length;

  return (
    <div className="strat-detail">
      <div className="detail-top">
        <button className="back-btn" onClick={onBack}>
          <Icon d={ICONS.back} size={18} /> Strategies
        </button>
        <button className="icon-btn" onClick={onSettings} aria-label="Strategy settings" title="Strategy settings">
          <Icon d={ICONS.cog} />
        </button>
      </div>
      <h1>{def.name}</h1>
      {def.error && <p className="test-box bad">File error: {def.error}. Open settings → Replace file.</p>}
      <div className="card-head">
        <p className="muted small" style={{ margin: 0 }}>
          {!applied ? 'No stocks added yet.' : withSetup ? `${withSetup} of ${applied.symbols.length} stocks have a setup – newest on top.` : scanState.scanning ? 'Scanning your stocks…' : `${applied.symbols.length} stocks · no setup right now`}
        </p>
        {applied && (
          <button className="btn" onClick={onRescan} disabled={scanState.scanning}>
            {scanState.scanning ? `${scanState.done}/${scanState.total}` : 'Re-scan'}
          </button>
        )}
      </div>

      {applied ? (
        <div className="setup-list">
          {rows.map(({ symbol, sig, last }) => (
            <div key={symbol} className={`setup-row ${sig ? (isFresh(sig, now) ? 'fresh' : 'hit') : 'idle'}`}>
              <button className="setup-main" onClick={() => onOpenSetup({ symbol, strategyId: def.id, interval: applied.params.interval, time: (sig || last)?.time })}>
                {sig || last ? <SideBadge side={(sig || last).side} /> : <span className="badge">–</span>}
                <span className="pr-main">
                  <b>{symbol}</b>
                  <small>{nameOf(symbol)} · {INTERVALS.find((i) => i.id === applied.params.interval)?.label || applied.params.interval}</small>
                </span>
                <span className="setup-meta">
                  {sig ? (
                    <>
                      <b>{fmtNum(sig.price)}</b>
                      <small>
                        {agoText(now - sig.formedAt)} · {hhmm(sig.formedAt)}
                      </small>
                    </>
                  ) : last ? (
                    <>
                      <b>{fmtNum(last.price)}</b>
                      <small>Last setup · {agoText(now - last.formedAt)}</small>
                    </>
                  ) : (
                    <small>No setup yet</small>
                  )}
                </span>
              </button>
              <button className="x-btn" aria-label={`Remove ${symbol} from this strategy`} title="Remove this stock" onClick={() => onRemoveSymbol(symbol)}>
                <Icon d={ICONS.close} size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Icon d={ICONS.strategy} size={34} />
          <p>Add the stocks you want this strategy to watch.</p>
        </div>
      )}
      {scanState.errors > 0 && !scanState.scanning && <p className="muted small">{scanState.errors} stock(s) could not be loaded. Tap Re-scan to retry.</p>}
      <button className="btn primary wide" onClick={onAddStocks}>
        {applied ? 'Add / remove stocks' : 'Add stocks'}
      </button>
    </div>
  );
}

export default function StrategyTab({ symbols, appliedList, signals, history, scanState, customList, names, stratDefaults, onApply, onRemove, onRemoveSymbol, onRescan, onOpenSetup, onSaveCustom, onDeleteCustom, onRename, onSaveParams, statsOn, onToggleStats, cfgOf, onCfg }) {
  const [route, setRoute] = useState({ page: 'list' }); // list | stocks | settings
  const [editor, setEditor] = useState(null); // { mode, id?, ... }  full-screen add / rename / replace
  const [picking, setPicking] = useState(false);
  const now = useNowShift(30000);
  const list = allStrategies();
  const def = route.id ? list.find((s) => s.id === route.id) : null;
  const applied = def ? appliedList.find((a) => a.strategyId === def.id) : null;
  const baseParams = (d) => ({ ...d.defaults, ...(stratDefaults?.[d.id] || {}), ...(appliedList.find((a) => a.strategyId === d.id)?.params || {}) });

  const openEditor = (s, mode) => {
    const c = customList.find((x) => x.id === s.id);
    setEditor({ mode, id: s.id, nameOnly: s.builtin, initial: { name: s.name, code: c?.code || '', fileName: c?.fileName || '', meta: c?.meta || null } });
  };
  const doRemoveAll = (s) => {
    const a = appliedList.find((x) => x.strategyId === s.id);
    if (a && window.confirm(`Remove "${s.name}" from all ${a.symbols.length} stocks? Its marks and indicators disappear from their charts.`)) onRemove(s.id);
  };
  const doDelete = (s) => {
    if (!window.confirm(`Delete "${s.name}" completely? It is also removed from every stock.`)) return;
    setRoute({ page: 'list' });
    onDeleteCustom(s.id);
  };
  const actions = (s) => ({
    rename: () => openEditor(s, 'rename'),
    download: () => downloadPy(s),
    replace: () => openEditor(s, 'rename'),
    removeAll: () => doRemoveAll(s),
    delete: () => doDelete(s),
  });

  const menuFor = (s) => {
    const a = appliedList.find((x) => x.strategyId === s.id);
    return (
      <RowMenu
        label={`${s.name} options`}
        items={[
          { label: 'Settings', onClick: () => setRoute({ page: 'settings', id: s.id, from: 'list' }) },
          { label: 'Rename', onClick: () => openEditor(s, 'rename') },
          { label: 'Download Python file', onClick: () => downloadPy(s) },
          { label: 'Remove from all stocks', hidden: !a, onClick: () => doRemoveAll(s) },
          { label: 'Reset name', hidden: !names[s.id], onClick: () => onRename(s.id, '') },
          { label: 'Delete strategy', danger: true, hidden: s.builtin, onClick: () => doDelete(s) },
        ]}
      />
    );
  };

  const overlays = (
    <>
      {editor && (
        <StrategyEditor
          mode={editor.mode}
          nameOnly={editor.nameOnly}
          initial={editor.initial}
          onClose={() => setEditor(null)}
          onSave={(v) => {
            if (editor.nameOnly) onRename(editor.id, v.name);
            else {
              const id = onSaveCustom({ id: editor.id, ...v });
              if (!editor.id) setRoute({ page: 'stocks', id });
            }
            setEditor(null);
          }}
        />
      )}
      {route.page === 'settings' && def && (
        <StrategySettings
          key={def.id}
          def={def}
          applied={applied}
          baseParams={baseParams(def)}
          menuActions={actions(def)}
          onSaveParams={(p) => onSaveParams(def.id, p)}
          statsOn={statsOn}
          onToggleStats={onToggleStats}
          cfg={cfgOf?.(def.id)}
          onCfg={onCfg ? (patch) => onCfg(def.id, patch) : undefined}
          onBack={() => setRoute(route.from === 'list' ? { page: 'list' } : { page: 'stocks', id: def.id })}
        />
      )}
      {picking && def && (
        <StockPicker
          symbols={symbols}
          initial={applied?.symbols || []}
          title={def.name}
          onCancel={() => setPicking(false)}
          onSave={(sel) => {
            setPicking(false);
            if (sel.length) onApply(def.id, { symbols: sel, params: baseParams(def) });
            else if (applied) onApply(def.id, null);
          }}
        />
      )}
    </>
  );

  if (route.page === 'stocks' && def) {
    return (
      <div className="strategy">
        <StocksPage
          def={def}
          applied={applied}
          symbols={symbols}
          signals={signals}
          history={history}
          scanState={scanState}
          onBack={() => setRoute({ page: 'list' })}
          onSettings={() => setRoute({ page: 'settings', id: def.id, from: 'stocks' })}
          onAddStocks={() => setPicking(true)}
          onRemoveSymbol={(sym) => onRemoveSymbol(def.id, sym)}
          onRescan={onRescan}
          onOpenSetup={onOpenSetup}
        />
        {overlays}
      </div>
    );
  }

  return (
    <div className="strategy">
      <div className="card-head">
        <h1>Strategies</h1>
        <button className="btn primary" onClick={() => setEditor({ mode: 'add', id: null, initial: null })}>
          <Icon d={ICONS.plus} size={16} /> Add strategy
        </button>
      </div>
      <p className="muted">Open a strategy to see the stocks added to it.</p>
      <div className="strat-list">
        {list.map((s) => {
          const a = appliedList.find((x) => x.strategyId === s.id);
          const sigs = Object.entries(signals).flatMap(([sym, l]) => l.filter((x) => x.strategyId === s.id).map((x) => ({ sym, ...x })));
          const newest = [...sigs].sort((x, y) => y.formedAt - x.formedAt)[0];
          return (
            <div key={s.id} className="strat-card">
              <button className="strat-open" onClick={() => setRoute({ page: 'stocks', id: s.id })}>
                <span className="strat-ico">
                  <Icon d={s.builtin ? ICONS.strategy : ICONS.code} size={22} />
                </span>
                <span className="strat-main">
                  <b>{s.name}</b>
                  <small>{s.short}</small>
                  <span className="strat-meta">
                    <span className="badge buy">{s.side === 'buy' ? 'BUY' : s.side === 'sell' ? 'SELL' : 'BUY/SELL'}</span>
                    <span className="badge">{(a?.params.interval || s.defaults.interval).toUpperCase()}</span>
                    {!s.builtin && <span className="badge">PYTHON</span>}
                    {a ? <span className="badge on">{a.symbols.length} stocks</span> : <span className="badge">No stocks</span>}
                    {sigs.length > 0 && (
                      <span className="badge buy">
                        {sigs.length} setup{sigs.length > 1 ? 's' : ''} · {agoText(now - newest.formedAt)}
                      </span>
                    )}
                    {s.error && <span className="badge sell">File error</span>}
                  </span>
                </span>
              </button>
              {menuFor(s)}
            </div>
          );
        })}
      </div>
      {overlays}
    </div>
  );
}
