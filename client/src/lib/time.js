// Same logic as server/utils.js. Times are unix seconds shifted by +5:30 (IST).
export const IST = 19800;
export const STEP = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };
export const TF_LONG = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '1h': '1 hour', '4h': '4 hours', '1d': '1 day', '1w': '1 week' };
export const INTERVALS = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
];
const SESSION_START = 33300; // 09:15

export function bucketStart(ts, interval) {
  if (interval === '1d') return Math.floor(ts / 86400) * 86400;
  if (interval === '1w') {
    const off = 4 * 86400;
    return Math.floor((ts - off) / 604800) * 604800 + off;
  }
  const step = STEP[interval];
  const day = Math.floor(ts / 86400) * 86400;
  const sod = ts - day;
  if (sod < SESSION_START) return day + Math.floor(sod / step) * step;
  return day + SESSION_START + Math.floor((sod - SESSION_START) / step) * step;
}

export const isIntraday = (interval) => interval !== '1d' && interval !== '1w';

export function fmtTime(time, interval) {
  const d = new Date(time * 1000);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (!isIntraday(interval)) return date;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

export const fmtNum = (n, d = 2) =>
  n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtVol = (v) => {
  if (v == null || !Number.isFinite(v)) return '–';
  if (v >= 1e7) return (v / 1e7).toFixed(2) + ' Cr';
  if (v >= 1e5) return (v / 1e5).toFixed(2) + ' L';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + ' K';
  return String(Math.round(v));
};
