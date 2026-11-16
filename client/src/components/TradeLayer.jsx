import React, { useEffect, useRef, useState } from 'react';
import { unrealized } from '../lib/paper.js';
import { fmtNum } from '../lib/time.js';
import { money } from '../lib/paper.js';

const LEVERAGE = [0, 2, 5, 10, 20];
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);

// Small BUY / SELL order ticket (opens from the buttons next to the stock name on the chart)
export function OrderTicket({ side, setSide, symbol, price, account, onOrder, onClose, onOpenAccounts }) {
  const [qty, setQty] = useState('1');
  const [lev, setLev] = useState('0'); // 0 = no leverage (default)
  const [err, setErr] = useState('');
  const L = Math.max(1, num(lev, 0));
  const q = Math.floor(num(qty, 0));
  const notional = price && q > 0 ? price * q : 0;
  const margin = notional / L;
  const place = () => {
    setErr('');
    const e = onOrder({ symbol, side, qty: q, lev: num(lev, 0) });
    if (e) setErr(e);
    else onClose();
  };
  return (
    <div className="ticket" role="dialog" aria-label="Paper order" onPointerDown={(e) => e.stopPropagation()}>
      <div className="tk-head">
        <b>
          {symbol} <small className="muted">· paper</small>
        </b>
        <button className="tk-x" onClick={onClose} aria-label="Close order ticket">
          ×
        </button>
      </div>
      {!account ? (
        <>
          <p className="muted small">Open a paper trading account first (name + balance), then you can buy and sell on the chart.</p>
          <button className="btn primary wide" onClick={onOpenAccounts}>
            Open paper account
          </button>
        </>
      ) : (
        <>
          <div className="dm-side" role="group" aria-label="Buy or sell">
            <button className={side === 'buy' ? 'on buy' : ''} onClick={() => setSide('buy')}>
              BUY
            </button>
            <button className={side === 'sell' ? 'on sell' : ''} onClick={() => setSide('sell')}>
              SELL
            </button>
          </div>
          <div className="tk-row">
            <label>
              <span>Quantity</span>
              <input type="number" inputMode="numeric" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label>
              <span>Leverage (0 = none)</span>
              <select value={lev} onChange={(e) => setLev(e.target.value)}>
                {LEVERAGE.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? '0 · no leverage' : `${v}x`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="tk-info muted small">
            <span>Price {price ? fmtNum(price) : '…'}</span>
            <span>Value {money(notional)}</span>
            <span>Margin {money(margin)}</span>
            <span>Free cash {money(account.cash)}</span>
          </div>
          <p className="muted small">After the order, drag the SL / TP buttons on the entry line to set stop-loss and target.</p>
          {err && <p className="auth-err">{err}</p>}
          <button className={`btn wide dm-place ${side}`} onClick={place} disabled={!price}>
            {side === 'buy' ? 'BUY' : 'SELL'} {q || 0} × {symbol}
          </button>
        </>
      )}
    </div>
  );
}

// Lines on the chart for the open paper positions of this stock: entry line with live profit/loss,
// SL / TP buttons that are dragged up or down to set the stop-loss and the target.
export default function TradeLayer({ seriesRef, wrapRef, symbol, feed, positions, onSetLevels, onClose, interval }) {
  const [, setTick] = useState(0);
  const [drag, setDrag] = useState(null); // { id, kind: 'stop'|'target', price }
  const lastKey = useRef('');
  useEffect(() => {
    if (!positions.length) return undefined;
    // price scale / zoom can change at any time: re-read the y positions a few times a second
    const t = setInterval(() => {
      const s = seriesRef.current;
      if (!s) return;
      const key = positions.map((p) => [p.entry, p.stop, p.target].map((v) => (v == null ? '' : Math.round((s.priceToCoordinate(v) ?? 0) * 2))).join(',')).join('|') + `|${feed.quotes[symbol]?.p}`;
      if (key !== lastKey.current) {
        lastKey.current = key;
        setTick((n) => n + 1);
      }
    }, 150);
    return () => clearInterval(t);
  }, [positions, seriesRef, feed, symbol]);

  if (!positions.length) return null;
  const series = seriesRef.current;
  const px = feed.quotes[symbol]?.p ?? null;
  const yOf = (v) => (series && v != null ? series.priceToCoordinate(v) : null);

  const startDrag = (e, p, kind) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: p.id, kind, price: null });
  };
  const moveDrag = (e) => {
    if (!drag || !series || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const price = series.coordinateToPrice(e.clientY - r.top);
    if (price != null) setDrag((d) => (d ? { ...d, price } : d));
  };
  const endDrag = () => {
    if (!drag) return;
    const p = positions.find((x) => x.id === drag.id);
    const price = drag.price;
    setDrag(null);
    if (!p || price == null) return;
    const long = p.side === 'buy';
    // stop-loss must be on the losing side of the entry, target on the winning side
    const okStop = long ? price < p.entry : price > p.entry;
    const okTarget = long ? price > p.entry : price < p.entry;
    if (drag.kind === 'stop' && okStop) onSetLevels(p.id, { stop: price });
    if (drag.kind === 'target' && okTarget) onSetLevels(p.id, { target: price });
  };

  return (
    <div className="trade-layer" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {positions.map((p) => {
        const ye = yOf(p.entry);
        if (ye == null) return null;
        const pl = unrealized(p, px);
        const plPct = (pl / (p.margin || p.qty * p.entry)) * 100;
        const dir = pl > 0 ? 'pos' : pl < 0 ? 'neg' : '';
        const dragging = drag && drag.id === p.id ? drag : null;
        const stopPrice = dragging?.kind === 'stop' && dragging.price != null ? dragging.price : p.stop;
        const targetPrice = dragging?.kind === 'target' && dragging.price != null ? dragging.price : p.target;
        const ys = yOf(stopPrice);
        const yt = yOf(targetPrice);
        const lvl = (kind, price, y) =>
          y == null ? null : (
            <div key={kind} className={`tl-line ${kind}`} style={{ top: y }}>
              <span className="tl-tag" onPointerDown={(e) => startDrag(e, p, kind)} title="Drag up / down to move">
                {kind === 'stop' ? 'SL' : 'TP'} {fmtNum(price)} · {money(unrealized(p, price))}
              </span>
              {!(dragging && dragging.kind === kind) && (
                <button className="tl-x" onClick={() => onSetLevels(p.id, { [kind]: null })} aria-label={`Remove ${kind === 'stop' ? 'stop-loss' : 'target'}`}>
                  ×
                </button>
              )}
            </div>
          );
        return (
          <React.Fragment key={p.id}>
            <div className={`tl-line entry ${p.side}`} style={{ top: ye }}>
              <span className={`tl-tag entry ${dir}`}>
                <b>{p.side === 'buy' ? 'BUY' : 'SELL'}</b> {p.qty}
                {p.lev ? ` · ${p.lev}x` : ''} @ {fmtNum(p.entry)} · <b>{money(pl)}</b> ({plPct >= 0 ? '+' : ''}
                {plPct.toFixed(2)}%)
              </span>
              {p.stop == null && (
                <button className={`tl-btn sl ${dragging && dragging.kind === 'stop' ? 'ghost' : ''}`} onPointerDown={(e) => startDrag(e, p, 'stop')} title="Drag down (for BUY) to set the stop-loss">
                  SL
                </button>
              )}
              {p.target == null && (
                <button className={`tl-btn tp ${dragging && dragging.kind === 'target' ? 'ghost' : ''}`} onPointerDown={(e) => startDrag(e, p, 'target')} title="Drag up (for BUY) to set the target">
                  TP
                </button>
              )}
              <button className="tl-btn close" onClick={() => onClose(p.id)} title="Close this position at the market price">
                Close
              </button>
            </div>
            {lvl('stop', stopPrice, ys)}
            {lvl('target', targetPrice, yt)}
          </React.Fragment>
        );
      })}
    </div>
  );
}
