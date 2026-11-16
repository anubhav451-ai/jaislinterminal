import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';
import { backtest, cfgLabel, normCfg } from '../lib/backtest.js';
import { useNowShift } from '../lib/hooks.js';
import { INTERVALS } from '../lib/time.js';

const PANEL_PERIODS = [
  ['today', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
];

// Small panel on the chart: how this strategy has done on THIS stock.
// Tap the title or the numbers -> full report screen. Arrow = fold / unfold. X = remove the panel
// (it can be brought back with the "+ strategy data" chip on the chart or from the strategy's 3-dot menu).
const MIN_W = 220;
const MIN_H = 90;

export default function StrategyStats({ def, params, candles, symbol, cfg, layout, onLayout, onOpen, onClose }) {
  const now = useNowShift(60000);
  const [open, setOpen] = useState(true);
  const c = normCfg(cfg);
  const r = useMemo(() => backtest(candles, def, params, now, { cfg: c }), [candles, def, params, now, JSON.stringify(c)]); // eslint-disable-line
  const box = useRef(null);
  const drag = useRef(null);
  const swallow = useRef(false); // a drag must not count as a click on the title / body
  // layout = { x, y, w, h } (px, inside the chart area) or null = default place at the top right of the chart
  const floating = !!layout && layout.x != null;

  const area = () => {
    const el = box.current?.closest('.stats-layer') || box.current?.offsetParent;
    return { W: el?.clientWidth || 800, H: el?.clientHeight || 600 };
  };
  const clampLayout = (l) => {
    const { W, H } = area();
    const w = Math.min(Math.max(MIN_W, l.w ?? 300), Math.max(MIN_W, W - 8));
    const h = l.h != null ? Math.min(Math.max(MIN_H, l.h), Math.max(MIN_H, H - 8)) : null;
    const x = Math.min(Math.max(0, l.x), Math.max(0, W - Math.min(w, W)));
    const y = Math.min(Math.max(0, l.y), Math.max(0, H - 40));
    return { x, y, w, h };
  };
  // keep a saved position on screen after a resize / rotation
  useLayoutEffect(() => {
    if (!floating) return undefined;
    const fix = () => {
      const n = clampLayout(layout);
      if (n.x !== layout.x || n.y !== layout.y || n.w !== layout.w || n.h !== layout.h) onLayout(n);
    };
    fix();
    window.addEventListener('resize', fix);
    return () => window.removeEventListener('resize', fix);
  }, [floating, layout?.x, layout?.y, layout?.w, layout?.h]); // eslint-disable-line

  const startDrag = (kind) => (e) => {
    if (e.button != null && e.button !== 0) return;
    if (kind === 'move' && e.target.closest?.('.ss-icon')) return; // fold / close buttons are plain buttons
    const el = box.current;
    const parent = el?.closest('.stats-layer') || el?.offsetParent;
    if (!el || !parent) return;
    const pr = parent.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    drag.current = {
      kind,
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      x: er.left - pr.left,
      y: er.top - pr.top,
      w: er.width,
      h: er.height,
      moved: false,
      target: e.currentTarget,
    };
    if (kind === 'resize') {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current.moved = true;
    }
  };
  const moveDrag = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return; // still a tap
      d.moved = true;
      d.target.setPointerCapture?.(e.pointerId);
    }
    const base = { x: d.x, y: d.y, w: d.w, h: layout?.h ?? null };
    if (d.kind === 'move') onLayout(clampLayout({ ...base, x: d.x + dx, y: d.y + dy }));
    else onLayout(clampLayout({ ...base, w: d.w + dx, h: d.h + dy }));
  };
  const endDrag = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved && d.kind === 'move') {
      swallow.current = true;
      setTimeout(() => (swallow.current = false), 0);
    }
    drag.current = null;
  };
  const guardClick = (fn) => (e) => {
    if (swallow.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    fn?.(e);
  };
  useEffect(() => () => (drag.current = null), []);

  const tf = INTERVALS.find((i) => i.id === params.interval)?.label || params.interval;
  const l10 = r.recent[10];
  const keyOpen = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      ref={box}
      className={`strat-stats ${floating ? 'floating' : ''} ${layout?.h != null && open ? 'sized' : ''}`}
      style={floating ? { left: layout.x, top: layout.y, width: layout.w, height: open && layout.h != null ? layout.h : undefined } : layout?.w ? { width: layout.w } : undefined}
      role="region"
      aria-label={`${def.name} data on ${symbol}`}
    >
      <div className="ss-head" onPointerDown={startDrag('move')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} title="Drag to move this panel" onDoubleClick={() => onLayout(null)}>
        <span className="ss-grip" aria-hidden="true">⋮⋮</span>
        <button className="ss-open" onClick={guardClick(onOpen)} title="Open full strategy report and settings">
          <Icon d={ICONS.strategy} size={15} />
          <span className="ss-title">
            {def.name} · {tf}
          </span>
          {r.winRate != null && <b className="ss-chip">{r.winRate.toFixed(0)}%</b>}
        </button>
        <button className="ss-icon" onClick={onOpen} aria-label="Strategy settings" title="Test settings (risk-reward, exit, stop-loss)">
          <span aria-hidden="true">⚙</span>
        </button>
        <button className="ss-icon" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Fold panel' : 'Unfold panel'}>
          <span className={`ss-caret ${open ? 'up' : ''}`}>▾</span>
        </button>
        <button className="ss-icon" onClick={onClose} aria-label="Remove this panel from the chart" title="Remove panel">
          <Icon d={ICONS.close} size={15} />
        </button>
      </div>
      {open && (
        <div className="ss-body ss-click" role="button" tabIndex={0} onClick={guardClick(onOpen)} onKeyDown={keyOpen} aria-label="Open full strategy report">
          {r.error ? (
            <p className="ss-note">Could not calculate: {r.error}</p>
          ) : r.total === 0 ? (
            <p className="ss-note">
              {r.bars < 3 ? 'Not enough candles loaded yet.' : 'No finished trades yet.'}
              {r.open ? ` ${r.open} trade still open.` : ''}
            </p>
          ) : (
            <>
              <div className="ss-main">
                <div>
                  <div className="ss-big">
                    {r.wins} <small>won</small> · {r.losses} <small>lost</small>
                  </div>
                  <div className="ss-sub">
                    of {r.total} trades · accuracy <b>{r.winRate.toFixed(1)}%</b>
                  </div>
                </div>
                <span className={`ss-verdict ${r.totalRet > 0 ? 'yes' : 'no'}`}>{r.totalRet > 0 ? 'Profitable' : 'Not profitable'}</span>
              </div>
              <div className="ss-bar" aria-hidden="true">
                <i style={{ width: `${r.winRate}%` }} />
              </div>
              <div className="ss-last">
                <span className="ss-lab">
                  Last {l10.n}: <b>{l10.w}/{l10.n}</b> won
                </span>
                {r.last10.map((w, i) => (
                  <i key={i} className={w ? 'w' : 'l'} title={w ? 'Won' : 'Lost'} />
                ))}
              </div>
            </>
          )}
          <div className="ss-periods">
            {PANEL_PERIODS.map(([id, label]) => {
              const p = r.periods[id];
              return (
                <div key={id} className="ss-per">
                  <small>{label}</small>
                  <b>
                    {p.trades} trade{p.trades === 1 ? '' : 's'}
                  </b>
                  <span>
                    <em className="up">{p.wins}W</em> · <em className="dn">{p.losses}L</em>
                    {p.open ? ` · ${p.open} open` : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <span className="ss-more">Test: {cfgLabel(c, !!def.levels)} · tap for report &amp; settings ›</span>
        </div>
      )}
      {open && (
        <span
          className="ss-resize"
          role="separator"
          aria-label="Resize panel"
          title="Drag to resize"
          onPointerDown={startDrag('resize')}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      )}
    </div>
  );
}
