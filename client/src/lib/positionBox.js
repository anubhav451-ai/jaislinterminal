// Long / Short position boxes drawn on the chart for every trade of a strategy (like the TradingView position tool).
// green zone = from entry to target, red zone = from entry to stop-loss. Long = target above entry, Short = target below.
const fmt = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : n.toFixed(2));
const pct = (a, b) => (((b - a) / a) * 100).toFixed(2);

export function drawPositions(ctx, env, list) {
  if (!list?.length) return;
  ctx.save();
  ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  for (const p of list) {
    const x0 = env.timeToX(p.t0);
    let x1 = p.t1 != null ? env.timeToX(p.t1) : null;
    if (x0 == null) continue;
    if (x1 == null) x1 = env.W;
    x1 = Math.max(x1, x0 + 16);
    if (x1 < 0 || x0 > env.W) continue;
    const yE = env.priceToY(p.entry);
    if (yE == null) continue;
    const w = x1 - x0;
    const zone = (price, fill, line, label) => {
      if (price == null) return;
      const y = env.priceToY(price);
      if (y == null) return;
      const top = Math.min(y, yE);
      const h = Math.abs(y - yE);
      ctx.fillStyle = fill;
      ctx.fillRect(x0, top, w, h);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      if (h > 13 && w > 60) {
        ctx.fillStyle = line;
        ctx.textAlign = 'left';
        ctx.fillText(label, Math.max(x0, 0) + 5, y + (y < yE ? 8 : -8));
      }
    };
    zone(p.target, 'rgba(38,166,154,0.22)', '#1f9d8e', `Target ${fmt(p.target)} (${p.side === 'buy' ? '+' : ''}${pct(p.entry, p.target)}%)`);
    zone(p.stop, 'rgba(239,83,80,0.22)', '#e0443f', `Stop ${fmt(p.stop)} (${pct(p.entry, p.stop)}%)`);
    // entry line + title
    ctx.strokeStyle = '#787b86';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, yE);
    ctx.lineTo(x1, yE);
    ctx.stroke();
    if (w > 70) {
      const res = p.open ? 'Open' : p.win ? `Win ${p.ret >= 0 ? '+' : ''}${p.ret.toFixed(2)}%` : `Loss ${p.ret.toFixed(2)}%`;
      ctx.fillStyle = p.open ? '#2962ff' : p.win ? '#1f9d8e' : '#e0443f';
      ctx.textAlign = 'left';
      ctx.fillText(`${p.side === 'buy' ? 'Long' : 'Short'} · ${fmt(p.entry)} · ${res}`, Math.max(x0, 0) + 5, yE + (p.side === 'buy' ? -9 : 9));
    }
    // exit dot
    if (!p.open && p.exit != null) {
      const yx = env.priceToY(p.exit);
      if (yx != null) {
        ctx.fillStyle = p.win ? '#1f9d8e' : '#e0443f';
        ctx.beginPath();
        ctx.arc(x1, yx, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
