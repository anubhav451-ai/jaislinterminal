// Drawing objects: geometry, rendering and hit-testing (all in pixel space).
// { id, type, a:{time,price}, b:{time,price}, price, color, width, style, ext, arrow,
//   fillColor, fillOpacity, label, text, showPrice, locked }
import { fmtNum } from './time.js';

export const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
export const DRAW_COLORS = ['#2962ff', '#26a69a', '#ef5350', '#f6a700', '#ab47bc', '#00bcd4', '#d1d4dc', '#787b86'];
export const FIB = [
  [0, '#787b86'],
  [0.236, '#f23645'],
  [0.382, '#ff9800'],
  [0.5, '#4caf50'],
  [0.618, '#089981'],
  [0.786, '#00bcd4'],
  [1, '#787b86'],
];

export const TYPE_LABEL = {
  trend: 'Trend line',
  hline: 'Horizontal line',
  vline: 'Vertical line',
  rect: 'Rectangle',
  fib: 'Fib retracement',
  text: 'Text note',
  measure: 'Measure',
  hray: 'Horizontal ray',
  cross: 'Cross line',
};

export const TOOL_SPECS = [
  { id: 'cursor', label: 'Cursor – pan, zoom, select drawings', icon: ['M5 3l14 8-6 2-2 6z'] },
  { id: 'trend', label: 'Trend line (2 taps)', type: 'trend', ext: 'none', points: 2, icon: ['M4 19L20 5', 'M4 19h.01', 'M20 5h.01'] },
  { id: 'ray', label: 'Ray (2 taps)', type: 'trend', ext: 'ray', points: 2, icon: ['M4 19L21 4', 'M4 19h.01'] },
  { id: 'arrow', label: 'Arrow (2 taps)', type: 'trend', ext: 'none', arrow: true, points: 2, icon: ['M5 19L19 5', 'M10 5h9v9'] },
  { id: 'extended', label: 'Extended line (2 taps)', type: 'trend', ext: 'both', points: 2, icon: ['M2 20L22 4', 'M9 14h.01', 'M15 9h.01'] },
  { id: 'hline', label: 'Horizontal line (1 tap)', type: 'hline', points: 1, icon: ['M3 12h18'] },
  { id: 'hray', label: 'Horizontal ray (1 tap)', type: 'hray', points: 1, icon: ['M5 12h16', 'M5 12h.01'] },
  { id: 'vline', label: 'Vertical line (1 tap)', type: 'vline', points: 1, icon: ['M12 3v18'] },
  { id: 'cross', label: 'Cross line (1 tap)', type: 'cross', points: 1, icon: ['M3 12h18', 'M12 3v18'] },
  { id: 'rect', label: 'Rectangle (2 taps)', type: 'rect', points: 2, icon: ['M5 6h14v12H5z'] },
  { id: 'fib', label: 'Fib retracement (2 taps)', type: 'fib', points: 2, icon: ['M3 5h18', 'M3 10h18', 'M3 15h18', 'M3 20h18'] },
  { id: 'measure', label: 'Measure price / % / bars (2 taps)', type: 'measure', points: 2, icon: ['M3 17L17 3l4 4L7 21z', 'M7 13l2 2', 'M10 10l2 2', 'M13 7l2 2'] },
  { id: 'text', label: 'Text note (1 tap)', type: 'text', points: 1, icon: ['M5 6h14', 'M12 6v13', 'M9 19h6'] },
];

const DEFAULT_COLOR = { hray: '#f6a700', cross: '#787b86', trend: '#2962ff', hline: '#f6a700', vline: '#ab47bc', rect: '#2962ff', text: '#f6a700', fib: '#787b86', measure: '#2962ff' };
export const colorOf = (d) => d.color || DEFAULT_COLOR[d.type] || '#2962ff';

export const hexToRgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(41,98,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const dashOf = (style, w) => (style === 'dashed' ? [w * 4 + 2, w * 3 + 2] : style === 'dotted' ? [w, w * 2 + 1] : []);

let mctx = null;
export function measureText(text) {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  mctx.font = `600 13px ${FONT}`;
  return mctx.measureText(text).width;
}

export function measureInfo(d, idxOf) {
  const delta = d.b.price - d.a.price;
  const pct = d.a.price ? (delta / d.a.price) * 100 : 0;
  const bars = Math.round(Math.abs((idxOf(d.b.time) ?? 0) - (idxOf(d.a.time) ?? 0)));
  const s = Math.abs(d.b.time - d.a.time);
  const dur = s >= 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.round(s / 60)}m`;
  return [`${delta >= 0 ? '+' : ''}${fmtNum(delta)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`, `${bars} bars · ${dur}`];
}

// ---------- geometry ----------
export function geometry(d, env) {
  const g = geometryRaw(d, env);
  if (g) g.priceToY = env.priceToY;
  return g;
}

function geometryRaw(d, env) {
  const { timeToX, priceToY, W, H } = env;
  if (d.type === 'hline') {
    const y = priceToY(d.price);
    return y == null ? null : { type: 'hline', y, W, H };
  }
  const x1 = d.a ? timeToX(d.a.time) : null;
  if (x1 == null) return null;
  if (d.type === 'vline') return { type: 'vline', x: x1, W, H };
  const y1 = priceToY(d.a.price);
  if (y1 == null) return null;
  if (d.type === 'hray' || d.type === 'cross') return { type: d.type, x: x1, y: y1, W, H };
  if (d.type === 'text') return { type: 'text', x: x1, y: y1, W, H };
  const x2 = timeToX(d.b.time);
  const y2 = priceToY(d.b.price);
  if (x2 == null || y2 == null) return null;
  return { type: d.type, x1, y1, x2, y2, W, H };
}

function extSeg(g, ext) {
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  const k = 6000 / (Math.hypot(dx, dy) || 1);
  let ax = g.x1, ay = g.y1, bx = g.x2, by = g.y2;
  if (ext === 'ray' || ext === 'both') {
    bx = g.x2 + dx * k;
    by = g.y2 + dy * k;
  }
  if (ext === 'both') {
    ax = g.x1 - dx * k;
    ay = g.y1 - dy * k;
  }
  return [ax, ay, bx, by];
}

const isBox = (t) => t === 'rect' || t === 'measure';
export function handlesOf(d, g) {
  if (isBox(d.type)) {
    const l = Math.min(g.x1, g.x2), r = Math.max(g.x1, g.x2), t = Math.min(g.y1, g.y2), b = Math.max(g.y1, g.y2);
    const mx = (l + r) / 2, my = (t + b) / 2;
    return [
      { key: 'tl', x: l, y: t }, { key: 'tr', x: r, y: t }, { key: 'bl', x: l, y: b }, { key: 'br', x: r, y: b },
      { key: 't', x: mx, y: t }, { key: 'b', x: mx, y: b }, { key: 'l', x: l, y: my }, { key: 'r', x: r, y: my },
    ];
  }
  if (d.type === 'trend' || d.type === 'fib') return [{ key: 'a', x: g.x1, y: g.y1 }, { key: 'b', x: g.x2, y: g.y2 }];
  if (d.type === 'hline') return [{ key: 'move', x: g.W * 0.5, y: g.y }];
  if (d.type === 'hray' || d.type === 'cross') return [{ key: 'a', x: g.x, y: g.y }];
  if (d.type === 'vline') return [{ key: 'move', x: g.x, y: g.H * 0.5 }];
  return [];
}

// ---------- rendering ----------
function arrowHead(ctx, x1, y1, x2, y2, size) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(ang - 0.45), y2 - size * Math.sin(ang - 0.45));
  ctx.lineTo(x2 - size * Math.cos(ang + 0.45), y2 - size * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fill();
}

function tag(ctx, lines, x, y, bg) {
  ctx.save();
  ctx.font = `600 12px ${FONT}`;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
  const h = lines.length * 16 + 6;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffffff';
  lines.forEach((l, i) => ctx.fillText(l, x + 6, y + 15 + i * 16));
  ctx.restore();
}

export function drawOne(ctx, d, g, selected, extra = {}) {
  const color = colorOf(d);
  const lw = d.width || 2;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.setLineDash(dashOf(d.style, lw));
  ctx.font = `12px ${FONT}`;

  const seg = (ax, ay, bx, by) => {
    if (selected) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = lw + 7;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };

  if (g.type === 'hline') {
    seg(0, g.y, g.W, g.y);
    if (d.showPrice !== false) tag(ctx, [fmtNum(d.price)], g.W - 70, g.y - 21, color);
    if (d.label) tag(ctx, [d.label], 8, g.y - 21, color);
  } else if (g.type === 'hray') {
    seg(g.x, g.y, g.W, g.y);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(g.x, g.y, 3, 0, Math.PI * 2);
    ctx.fill();
    if (d.showPrice !== false) tag(ctx, [fmtNum(d.a.price)], g.W - 70, g.y - 21, color);
    if (d.label) tag(ctx, [d.label], Math.max(8, g.x + 6), g.y - 21, color);
  } else if (g.type === 'cross') {
    seg(0, g.y, g.W, g.y);
    seg(g.x, 0, g.x, g.H);
    if (d.label) tag(ctx, [d.label], g.x + 6, 6, color);
  } else if (g.type === 'vline') {
    seg(g.x, 0, g.x, g.H);
    if (d.label) tag(ctx, [d.label], g.x + 6, 6, color);
  } else if (g.type === 'trend') {
    const [ax, ay, bx, by] = extSeg(g, d.ext);
    seg(ax, ay, bx, by);
    ctx.setLineDash([]);
    if (d.arrow) arrowHead(ctx, g.x1, g.y1, g.x2, g.y2, 8 + lw * 2);
    else if (!selected) {
      [[g.x1, g.y1], [g.x2, g.y2]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    if (d.label) tag(ctx, [d.label], (g.x1 + g.x2) / 2 + 4, (g.y1 + g.y2) / 2 - 24, color);
  } else if (g.type === 'rect') {
    const l = Math.min(g.x1, g.x2), r = Math.max(g.x1, g.x2), t = Math.min(g.y1, g.y2), b = Math.max(g.y1, g.y2);
    ctx.fillStyle = hexToRgba(d.fillColor || color, d.fillOpacity ?? 0.14);
    ctx.fillRect(l, t, r - l, b - t);
    seg(l, t, r, t);
    seg(r, t, r, b);
    seg(r, b, l, b);
    seg(l, b, l, t);
    if (d.label) tag(ctx, [d.label], l + 4, t + 4, color);
  } else if (g.type === 'measure') {
    const up = d.b.price >= d.a.price;
    const c = d.color || (up ? extra.up : extra.down) || color;
    const l = Math.min(g.x1, g.x2), r = Math.max(g.x1, g.x2), t = Math.min(g.y1, g.y2), b = Math.max(g.y1, g.y2);
    ctx.fillStyle = hexToRgba(c, 0.15);
    ctx.fillRect(l, t, r - l, b - t);
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.lineWidth = Math.min(lw, 2);
    ctx.setLineDash(dashOf(d.style, 1.5));
    ctx.strokeRect(l, t, r - l, b - t);
    ctx.setLineDash([]);
    seg(g.x1, g.y1, g.x2, g.y2);
    arrowHead(ctx, g.x1, g.y1, g.x2, g.y2, 9);
    if (extra.info) tag(ctx, extra.info, Math.max(4, (l + r) / 2 - 56), up ? Math.max(4, t - 46) : b + 8, c);
  } else if (g.type === 'fib') {
    const xa = Math.min(g.x1, g.x2), xb = Math.max(g.x1, g.x2);
    let prevY = null;
    for (const [lv, lvColor] of FIB) {
      const price = d.b.price + (d.a.price - d.b.price) * lv;
      const y = g.priceToY(price);
      if (y == null) continue;
      const c = d.color || lvColor;
      if (prevY != null) {
        ctx.fillStyle = hexToRgba(d.fillColor || c, d.fillOpacity ?? 0.09);
        ctx.fillRect(xa, Math.min(y, prevY), xb - xa, Math.abs(y - prevY));
      }
      prevY = y;
      ctx.strokeStyle = c;
      seg(xa, y, xb, y);
      ctx.fillStyle = c;
      ctx.save();
      ctx.setLineDash([]);
      ctx.fillText(`${lv}  (${fmtNum(price)})`, xa + 4, y - 3);
      ctx.restore();
    }
    ctx.strokeStyle = '#787b86';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y1);
    ctx.lineTo(g.x2, g.y2);
    ctx.stroke();
    if (d.label) tag(ctx, [d.label], xa + 4, Math.min(g.y1, g.y2) - 22, color);
  } else if (g.type === 'text') {
    const w = measureText(d.text || 'Text') + 14;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = hexToRgba(color, 0.2);
    ctx.fillRect(g.x, g.y - 18, w, 24);
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(g.x, g.y - 18, w, 24);
    ctx.fillStyle = color;
    ctx.fillText(d.text || 'Text', g.x + 7, g.y - 1);
  }
  ctx.restore();

  if (selected) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = d.locked ? '#787b86' : color;
    ctx.fillStyle = '#ffffff';
    for (const h of handlesOf(d, g)) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, isBox(d.type) && h.key.length === 1 ? 5 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------- hit testing ----------
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function bodyHit(d, g, x, y, tol) {
  switch (g.type) {
    case 'hline':
      return Math.abs(y - g.y) <= tol;
    case 'vline':
      return Math.abs(x - g.x) <= tol;
    case 'hray':
      return Math.abs(y - g.y) <= tol && x >= g.x - tol;
    case 'cross':
      return Math.abs(y - g.y) <= tol || Math.abs(x - g.x) <= tol;
    case 'trend': {
      const [ax, ay, bx, by] = extSeg(g, d.ext);
      return distToSeg(x, y, ax, ay, bx, by) <= tol;
    }
    case 'rect':
    case 'measure': {
      const l = Math.min(g.x1, g.x2), r = Math.max(g.x1, g.x2), t = Math.min(g.y1, g.y2), b = Math.max(g.y1, g.y2);
      if (g.type === 'measure' && distToSeg(x, y, g.x1, g.y1, g.x2, g.y2) <= tol) return true;
      return [[l, t, r, t], [r, t, r, b], [r, b, l, b], [l, b, l, t]].some((s) => distToSeg(x, y, ...s) <= tol);
    }
    case 'fib': {
      const xa = Math.min(g.x1, g.x2), xb = Math.max(g.x1, g.x2);
      if (distToSeg(x, y, g.x1, g.y1, g.x2, g.y2) <= tol) return true;
      return FIB.some(([lv]) => {
        const yy = g.priceToY(d.b.price + (d.a.price - d.b.price) * lv);
        return yy != null && Math.abs(y - yy) <= tol && x >= xa - tol && x <= xb + tol;
      });
    }
    case 'text': {
      const w = measureText(d.text || 'Text') + 14;
      return x >= g.x - tol && x <= g.x + w + tol && y >= g.y - 18 - tol && y <= g.y + 6 + tol;
    }
    default:
      return false;
  }
}

export function hitTest(drawings, selectedId, x, y, tol, env) {
  if (x > env.W || y > env.H) return null; // price / time axis area
  const cache = new Map();
  const geo = (d) => {
    if (!cache.has(d.id)) cache.set(d.id, geometry(d, env));
    return cache.get(d.id);
  };
  if (selectedId) {
    const d = drawings.find((q) => q.id === selectedId);
    const g = d && geo(d);
    if (g) for (const h of handlesOf(d, g)) if (Math.hypot(x - h.x, y - h.y) <= tol + 4) return { id: d.id, mode: h.key };
  }
  for (let i = drawings.length - 1; i >= 0; i--) {
    const g = geo(drawings[i]);
    if (g && bodyHit(drawings[i], g, x, y, tol)) return { id: drawings[i].id, mode: 'move' };
  }
  return null;
}
