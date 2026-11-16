import { useEffect, useRef, useState } from 'react';
import { nowIST } from './delay.js';

// Re-renders the caller about once a second while ticks arrive and returns
// { SYMBOL: 'up' | 'down' } for rows whose price just changed (for flash animation).
export function useTickRender(feed) {
  const [, force] = useState(0);
  const flash = useRef({});
  const prev = useRef({});
  useEffect(() => {
    let dirty = false;
    let clear;
    const off = feed.onTicks((ticks) => {
      for (const t of ticks) {
        const old = prev.current[t.s];
        if (old != null && t.p !== old) flash.current[t.s] = t.p > old ? 'up' : 'down';
        prev.current[t.s] = t.p;
      }
      dirty = true;
    });
    const id = setInterval(() => {
      if (!dirty) return;
      dirty = false;
      force((n) => n + 1);
      clearTimeout(clear);
      clear = setTimeout(() => (flash.current = {}), 700);
    }, 1000);
    return () => {
      off();
      clearInterval(id);
      clearTimeout(clear);
    };
  }, [feed]);
  return flash.current;
}

export function changeOf(q) {
  if (!q?.p || !q?.pc) return { ch: null, pct: null, dir: '' };
  const ch = q.p - q.pc;
  return { ch, pct: (ch / q.pc) * 100, dir: ch >= 0 ? 'up' : 'down' };
}

// "now" on the same clock as candle times (unix seconds + 5:30). Re-renders the caller every `ms`.
export function useNowShift(ms = 30000) {
  const [n, setN] = useState(() => nowIST());
  useEffect(() => {
    const id = setInterval(() => setN(nowIST()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

// clipboard with a fallback for sandboxed iframes
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
