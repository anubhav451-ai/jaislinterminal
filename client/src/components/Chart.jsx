import RowMenu from './RowMenu.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { INDICATORS, indicatorTitle } from '../lib/registry.js';
import { heikinAshi } from '../lib/indicators.js';
import { IST, bucketStart, isIntraday, fmtTime, fmtNum, fmtVol } from '../lib/time.js';
import { TOOL_SPECS, drawOne, geometry, hitTest, hexToRgba, measureInfo } from '../lib/drawings.js';
import { drawPositions } from '../lib/positionBox.js';
import DrawProps from './DrawProps.jsx';

const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
const THEMES = {
  dark: { bg: '#131722', text: '#d1d4dc', grid: '#1e222d', border: '#2a2e39' },
  light: { bg: '#ffffff', text: '#0c1b3a', grid: '#eef3fc', border: '#d9e3f5' },
};

const themeOptions = (theme) => {
  const t = THEMES[theme];
  return {
    layout: { background: { type: 'solid', color: t.bg }, textColor: t.text, fontFamily: FONT, fontSize: 12, attributionLogo: false },
    grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
    rightPriceScale: { borderColor: t.border },
    timeScale: { borderColor: t.border },
  };
};
const createOptions = (theme, interval) => ({
  ...themeOptions(theme),
  timeScale: { ...themeOptions(theme).timeScale, timeVisible: isIntraday(interval), secondsVisible: false, rightOffset: 8, barSpacing: 8, minBarSpacing: 0.5 },
  crosshair: { mode: CrosshairMode.Normal },
});

function makeSeries(chart, type, up, down) {
  switch (type) {
    case 'line':
      return chart.addLineSeries({ color: '#1a56db', lineWidth: 2 });
    case 'area':
      return chart.addAreaSeries({ lineColor: '#1a56db', topColor: 'rgba(26,86,219,0.30)', bottomColor: 'rgba(41,98,255,0.02)', lineWidth: 2 });
    case 'bars':
      return chart.addBarSeries({ upColor: up, downColor: down });
    case 'hollow':
      return chart.addCandlestickSeries({ upColor: 'rgba(0,0,0,0)', downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down, borderVisible: true });
    default:
      return chart.addCandlestickSeries({ upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
  }
}
const pointFor = (type, c) => (type === 'line' || type === 'area' ? { time: c.time, value: c.close } : { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });

function addIndSeries(chart, s) {
  if (s.type === 'hist') return chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
  return chart.addLineSeries({ color: s.color, lineWidth: s.width || 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
}

function bsearch(data, time) {
  let lo = 0;
  let hi = data.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (data[mid].time === time) return data[mid];
    if (data[mid].time < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}
const valueAt = (data, time) => (!data.length ? null : time == null ? data[data.length - 1].value : bsearch(data, time)?.value ?? null);
const candleAt = (data, time) => (!data.length ? null : time == null ? data[data.length - 1] : bsearch(data, time));

// Real spacing between bars. The old "average over the whole history" step was inflated by overnight and
// weekend gaps, so a drawing placed to the right of the last candle landed at the wrong time and jumped.
function barStep(data) {
  const n = data.length;
  if (n < 2) return 60;
  const diffs = [];
  for (let i = Math.max(1, n - 61); i < n; i++) {
    const d = data[i].time - data[i - 1].time;
    if (d > 0) diffs.push(d);
  }
  if (!diffs.length) return 60;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

export default function Chart({
  symbol,
  interval,
  intervalLabel,
  candles,
  chartType,
  indicators,
  theme,
  showVolume,
  upColor,
  downColor,
  feed,
  tool,
  onToolDone,
  onDrawn,
  drawings,
  onDrawingsChange,
  drawDefaults,
  onDrawDefaults,
  magnet,
  hideDrawings,
  markers,
  positions,
  onRemoveIndicator,
  strategies,
  onRemoveStrategy,
  onOpenStrategy,
  overlay,
  statsOn,
  onToggleStats,
  onOpenIndicators,
}) {
  const stackEl = useRef(null);
  const wrapEl = useRef(null);
  const mainEl = useRef(null);
  const canvasEl = useRef(null);
  const paneEls = useRef({});
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volRef = useRef(null);
  const dataRef = useRef([]);
  const haRef = useRef([]);
  const overlayRef = useRef(new Map());
  const panesRef = useRef(new Map());
  const lastVolRef = useRef(null);
  const lastCandlesRef = useRef(null);
  const syncing = useRef(false);
  const schedRef = useRef(null);
  const indicatorsRef = useRef(indicators);
  const drawingsRef = useRef(drawings);
  const changeRef = useRef(onDrawingsChange);
  const defaultsRef = useRef(drawDefaults);
  const toolRef = useRef(tool);
  const pendingRef = useRef(null);
  const dragRef = useRef(null);
  const tapRef = useRef(null); // tap on a drawing that is NOT selected yet (selects it on release, never moves it)
  const draftRef = useRef(null); // live position of the drawing being dragged (committed on release)
  const downRef = useRef(null); // pointer-down position while creating a drawing
  const selectedRef = useRef(null);
  const envRef = useRef(() => null);
  const xyToPointRef = useRef(() => null);
  const [hoverTime, setHoverTime] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [propsId, setPropsId] = useState(null);
  const magnetRef = useRef(false);
  const hideRef = useRef(false);
  const lastTapRef = useRef(null);
  const emptyTapRef = useRef(null);
  const propsRef = useRef(null);
  const colorsRef = useRef({});
  const positionsRef = useRef([]);
  positionsRef.current = positions || [];
  const [, setN] = useState(0);
  const bump = useCallback(() => setN((n) => n + 1), []);

  indicatorsRef.current = indicators;
  drawingsRef.current = drawings;
  changeRef.current = onDrawingsChange;
  defaultsRef.current = drawDefaults;
  toolRef.current = tool;
  selectedRef.current = selectedId;
  propsRef.current = propsId;
  magnetRef.current = !!magnet;
  hideRef.current = !!hideDrawings;
  colorsRef.current = { up: upColor, down: downColor };

  const mainInds = indicators.filter((i) => INDICATORS[i.type].pane === 'main');
  const subInds = indicators.filter((i) => INDICATORS[i.type].pane === 'sub');
  const propsDrawing = drawings.find((d) => d.id === propsId) || null;

  const syncRange = useCallback((source, range) => {
    if (!range || syncing.current) return;
    syncing.current = true;
    try {
      const all = [chartRef.current, ...[...panesRef.current.values()].map((p) => p.chart)];
      for (const c of all) if (c && c !== source) c.timeScale().setVisibleLogicalRange(range);
    } finally {
      syncing.current = false;
    }
  }, []);

  // ---------- create main chart once ----------
  useEffect(() => {
    const el = mainEl.current;
    const chart = createChart(el, { ...createOptions(theme, interval), width: Math.max(1, el.clientWidth), height: Math.max(1, el.clientHeight) });
    chartRef.current = chart;
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => syncRange(chart, r));
    chart.subscribeCrosshairMove((p) => setHoverTime(p.time ?? null));

    const resizeCanvas = () => {
      const cv = canvasEl.current;
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
    };
    const ro = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return; // hidden tab
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      resizeCanvas();
    });
    ro.observe(el);
    const ro2 = new ResizeObserver(() => {
      panesRef.current.forEach((p) => p.el.clientWidth && p.chart.applyOptions({ width: p.el.clientWidth, height: p.el.clientHeight }));
    });
    ro2.observe(stackEl.current);
    resizeCanvas();

    return () => {
      ro.disconnect();
      ro2.disconnect();
      panesRef.current.forEach((p) => p.chart.remove());
      panesRef.current.clear();
      overlayRef.current.clear();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volRef.current = null;
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const o = { ...themeOptions(theme), timeScale: { ...themeOptions(theme).timeScale, timeVisible: isIntraday(interval) } };
    chart.applyOptions(o);
    panesRef.current.forEach((p) => p.chart.applyOptions(o));
  }, [theme, interval]);

  // ---------- price series ----------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) chart.removeSeries(seriesRef.current);
    seriesRef.current = makeSeries(chart, chartType, upColor, downColor);
    const isNew = lastCandlesRef.current !== candles;
    lastCandlesRef.current = candles;
    dataRef.current = candles.map((c) => ({ ...c }));
    haRef.current = chartType === 'heikin' ? heikinAshi(dataRef.current) : [];
    seriesRef.current.setData(chartType === 'heikin' ? haRef.current.map((c) => pointFor('candles', c)) : dataRef.current.map((c) => pointFor(chartType, c)));
    if (isNew) {
      lastVolRef.current = null;
      const n = dataRef.current.length;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 130), to: n + 8 });
    }
    bump();
  }, [candles, chartType, upColor, downColor, bump]);

  // strategy BUY marks: only on candles that exist in the loaded data
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const times = new Set(dataRef.current.map((c) => c.time));
    series.setMarkers((markers || []).filter((m) => times.has(m.time)).sort((a, b) => a.time - b.time));
  }, [markers, candles, chartType, upColor, downColor]);

  const volColor = useCallback((c) => (c.close >= c.open ? upColor : downColor) + '66', [upColor, downColor]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (volRef.current) {
      chart.removeSeries(volRef.current);
      volRef.current = null;
    }
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.06, bottom: showVolume ? 0.2 : 0.06 } });
    if (!showVolume) return;
    volRef.current = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volRef.current.setData(dataRef.current.map((c) => ({ time: c.time, value: c.volume || 0, color: volColor(c) })));
  }, [candles, showVolume, volColor]);

  // ---------- indicators ----------
  const updateIndicatorData = useCallback(() => {
    const ctx = { interval };
    for (const ind of indicatorsRef.current) {
      const def = INDICATORS[ind.type];
      const desc = def.compute(dataRef.current, ind.params, ind.color, ctx);
      const list = def.pane === 'main' ? overlayRef.current.get(ind.id) : panesRef.current.get(ind.id)?.list;
      if (!list) continue;
      list.forEach((item, i) => {
        if (desc.series[i]) {
          item.series.setData(desc.series[i].data);
          item.desc = desc.series[i];
        }
      });
    }
  }, [interval]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    overlayRef.current.forEach((list) => list.forEach((s) => chart.removeSeries(s.series)));
    overlayRef.current.clear();
    panesRef.current.forEach((p) => p.chart.remove());
    panesRef.current.clear();

    const ctx = { interval };
    const subs = indicators.filter((i) => INDICATORS[i.type].pane === 'sub');
    indicators.forEach((ind) => {
      const def = INDICATORS[ind.type];
      const desc = def.compute(dataRef.current, ind.params, ind.color, ctx);
      if (def.pane === 'main') {
        const list = desc.series.map((s) => {
          const series = addIndSeries(chart, s);
          series.setData(s.data);
          return { series, desc: s };
        });
        overlayRef.current.set(ind.id, list);
        return;
      }
      const el = paneEls.current[ind.id];
      if (!el) return;
      const isLast = subs[subs.length - 1]?.id === ind.id;
      const base = createOptions(theme, interval);
      const pc = createChart(el, { ...base, width: Math.max(1, el.clientWidth), height: Math.max(1, el.clientHeight), timeScale: { ...base.timeScale, visible: isLast } });
      const list = desc.series.map((s) => {
        const series = addIndSeries(pc, s);
        series.setData(s.data);
        return { series, desc: s };
      });
      const first = list.find((l) => l.desc.type === 'line') || list[0];
      if (first) {
        (desc.levels || []).forEach((lv) => first.series.createPriceLine({ price: lv, color: '#787b86', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false }));
        if (desc.range) first.series.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: desc.range[0], maxValue: desc.range[1] } }) });
      }
      pc.timeScale().subscribeVisibleLogicalRangeChange((r) => syncRange(pc, r));
      pc.subscribeCrosshairMove((p) => setHoverTime(p.time ?? null));
      panesRef.current.set(ind.id, { chart: pc, list, el });
    });
    chart.applyOptions({ timeScale: { visible: subs.length === 0 } });
    const r = chart.timeScale().getVisibleLogicalRange();
    if (r) syncRange(chart, r);
    bump();
    // eslint-disable-next-line
  }, [indicators, interval, theme, candles, chartType]);

  // ---------- live ticks ----------
  useEffect(() => {
    lastVolRef.current = null;
    const applyTick = (t) => {
      const data = dataRef.current;
      if (!data.length || !seriesRef.current) return false;
      const b = bucketStart(t.t + IST, interval);
      const last = data[data.length - 1];
      let dv = 0;
      if (t.v != null) {
        if (lastVolRef.current != null && t.v >= lastVolRef.current) dv = t.v - lastVolRef.current;
        lastVolRef.current = t.v;
      }
      let cd;
      const isNewBar = b > last.time;
      if (isNewBar) {
        cd = { time: b, open: t.p, high: t.p, low: t.p, close: t.p, volume: dv };
        data.push(cd);
      } else if (b === last.time) {
        cd = last;
        cd.high = Math.max(cd.high, t.p);
        cd.low = Math.min(cd.low, t.p);
        cd.close = t.p;
        cd.volume = (cd.volume || 0) + dv;
      } else return false;

      if (chartType === 'heikin') {
        const ha = haRef.current;
        const prev = isNewBar ? ha[ha.length - 1] : ha[ha.length - 2];
        const close = (cd.open + cd.high + cd.low + cd.close) / 4;
        const open = prev ? (prev.open + prev.close) / 2 : (cd.open + cd.close) / 2;
        const h = { time: cd.time, open, close, high: Math.max(cd.high, open, close), low: Math.min(cd.low, open, close) };
        if (isNewBar) ha.push(h);
        else ha[ha.length - 1] = h;
        seriesRef.current.update(h);
      } else seriesRef.current.update(pointFor(chartType, cd));
      volRef.current?.update({ time: cd.time, value: cd.volume || 0, color: volColor(cd) });
      return true;
    };
    const off = feed.onTicks((ticks) => {
      let changed = false;
      for (const t of ticks) if (t.s === symbol && t.p) changed = applyTick(t) || changed;
      if (changed && !schedRef.current) {
        schedRef.current = setTimeout(() => {
          schedRef.current = null;
          updateIndicatorData();
          bump();
        }, 700);
      }
    });
    return () => {
      off();
      clearTimeout(schedRef.current);
      schedRef.current = null;
    };
  }, [feed, symbol, interval, chartType, updateIndicatorData, bump, volColor]);

  // ---------- drawing coordinate helpers ----------
  const idxOf = useCallback((time) => {
    const data = dataRef.current;
    if (!data.length) return null;
    const step = barStep(data);
    if (time <= data[0].time) return (time - data[0].time) / step;
    if (time >= data[data.length - 1].time) return data.length - 1 + (time - data[data.length - 1].time) / step;
    let lo = 0;
    let hi = data.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (data[mid].time <= time) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }, []);

  const timeToX = useCallback(
    (time) => {
      const chart = chartRef.current;
      const idx = idxOf(time);
      if (!chart || idx == null) return null;
      return chart.timeScale().logicalToCoordinate(idx);
    },
    [idxOf]
  );

  // snap=true lets the magnet pull the price to the nearest candle open/high/low/close
  const xyToPoint = useCallback((x, y, snap = true) => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const data = dataRef.current;
    if (!chart || !series || !data.length) return null;
    const l = chart.timeScale().coordinateToLogical(x);
    let price = series.coordinateToPrice(y);
    if (l == null || price == null) return null;
    const idx = Math.round(l);
    const step = barStep(data);
    let time;
    if (idx < 0) time = data[0].time + idx * step;
    else if (idx >= data.length) time = data[data.length - 1].time + (idx - data.length + 1) * step;
    else time = data[idx].time;
    if (snap && magnetRef.current && idx >= 0 && idx < data.length) {
      const c = data[idx];
      let best = null;
      for (const v of [c.open, c.high, c.low, c.close]) {
        const yy = series.priceToCoordinate(v);
        if (yy == null) continue;
        const dist = Math.abs(yy - y);
        if (dist < 18 && (!best || dist < best.dist)) best = { v, dist };
      }
      if (best) price = best.v;
    }
    return { time, price };
  }, []);
  xyToPointRef.current = xyToPoint;

  envRef.current = () => {
    const cv = canvasEl.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!cv || !chart || !series) return null;
    return {
      timeToX,
      idxOf,
      priceToY: (p) => series.priceToCoordinate(p),
      W: cv.clientWidth - (chart.priceScale('right').width?.() ?? 56),
      H: cv.clientHeight - (chart.timeScale().height?.() ?? 28),
    };
  };

  // ---------- draw loop ----------
  useEffect(() => {
    let raf;
    // light fill between the Bollinger upper and lower band (like TradingView)
    const lowerBound = (arr, t) => {
      let lo = 0;
      let hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].time < t) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const drawBands = (ctx, inds) => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      const ts = chart.timeScale();
      const vr = ts.getVisibleRange();
      for (const ind of inds) {
        const lists = overlayRef.current.get(ind.id);
        if (!lists || lists.length < 3) continue;
        const up = lists[0].desc?.data || [];
        const lo = lists[2].desc?.data || [];
        const n = Math.min(up.length, lo.length);
        if (n < 2) continue;
        let i0 = 0;
        let i1 = n - 1;
        if (vr) {
          i0 = Math.max(0, lowerBound(up, vr.from) - 1);
          i1 = Math.min(n - 1, lowerBound(up, vr.to) + 1);
        }
        const xs = [];
        const yu = [];
        const yl = [];
        for (let i = i0; i <= i1; i++) {
          const x = ts.timeToCoordinate(up[i].time);
          const a = series.priceToCoordinate(up[i].value);
          const b = series.priceToCoordinate(lo[i].value);
          if (x == null || a == null || b == null) continue;
          xs.push(x);
          yu.push(a);
          yl.push(b);
        }
        if (xs.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(xs[0], yu[0]);
        for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], yu[i]);
        for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], yl[i]);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(ind.params.cBasis || '#2962ff', 0.08);
        ctx.fill();
      }
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cv = canvasEl.current;
      const env = envRef.current();
      if (!cv || !env) return;
      const ctx = cv.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
      const list = hideRef.current ? [] : drawingsRef.current;
      const pending = pendingRef.current;
      const bandInds = indicatorsRef.current.filter((i) => i.type === 'bb' && i.params.fill !== false);
      const posList = hideRef.current ? [] : positionsRef.current;
      if (!list.length && !pending && !bandInds.length && !posList.length) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, env.W, env.H);
      ctx.clip();
      drawBands(ctx, bandInds);
      drawPositions(ctx, env, posList);
      const draft = draftRef.current;
      for (const d0 of pending ? [...list, pending] : list) {
        const d = draft && draft.id === d0.id ? { ...d0, ...draft.patch } : d0;
        const g = geometry(d, env);
        if (g) {
          const extra = { up: colorsRef.current.up, down: colorsRef.current.down };
          if (d.type === 'measure') extra.info = measureInfo(d, env.idxOf);
          drawOne(ctx, d, g, d.id === selectedRef.current, extra);
        }
      }
      ctx.restore();
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- select / move / resize existing drawings ----------
  // single tap  -> select (handles) ; drag -> move / resize ; tap empty area -> deselect
  // double tap / double click -> open the properties panel at the top
  useEffect(() => {
    const wrap = wrapEl.current;
    const local = (cx, cy) => {
      const r = wrap.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    const ignore = (e) => e.target.closest?.('.draw-props, .legend button, .lg-strat, .strat-stats, .ss-restore, .go-latest, input, select');
    const hitAt = (cx, cy, touch) => {
      const env = envRef.current();
      if (!env || hideRef.current) return null;
      const { x, y } = local(cx, cy);
      return hitTest(drawingsRef.current, selectedRef.current, x, y, touch ? 16 : 8, env);
    };
    const guard = (e, cx, cy, touch) => {
      if (toolRef.current !== 'cursor' || ignore(e)) return null;
      const h = hitAt(cx, cy, touch);
      if (!h) return null;
      // Only the SELECTED drawing is grabbed (so it can be moved). A drawing that is not selected lets the
      // touch go through to the chart: dragging over it pans the chart, a tap on it just selects it.
      if (h.id !== selectedRef.current) return { id: h.id, pending: true };
      e.stopPropagation(); // keep the chart from panning
      if (e.cancelable) e.preventDefault();
      return h;
    };
    const onPointerDown = (e) => {
      if (toolRef.current !== 'cursor' || ignore(e)) return;
      const h = guard(e, e.clientX, e.clientY, e.pointerType === 'touch');
      const { x, y } = local(e.clientX, e.clientY);
      if (!h) {
        emptyTapRef.current = { x, y, t: Date.now() };
        return;
      }
      if (h.pending) {
        emptyTapRef.current = null;
        tapRef.current = { id: h.id, x, y, t: Date.now() };
        return;
      }
      emptyTapRef.current = null;
      setSelectedId(h.id);
      selectedRef.current = h.id;
      if (propsRef.current && propsRef.current !== h.id) setPropsId(null);
      const d = drawingsRef.current.find((q) => q.id === h.id);
      dragRef.current = { id: h.id, mode: h.mode, sx: x, sy: y, moved: false, g: geometry(d, envRef.current()), d };
      // freeze chart pan/zoom while a drawing is being dragged so the two can never fight each other
      chartRef.current?.applyOptions({ handleScroll: false, handleScale: false });
    };
    const onMouseDown = (e) => guard(e, e.clientX, e.clientY, false);
    const onTouchStart = (e) => {
      const t = e.touches[0];
      if (t) guard(e, t.clientX, t.clientY, true);
    };

    const BOX = ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'];
    const onMove = (e) => {
      const dr = dragRef.current;
      if (!dr) return;
      const { x, y } = local(e.clientX, e.clientY);
      const dx = x - dr.sx;
      const dy = y - dr.sy;
      if (!dr.moved && Math.hypot(dx, dy) < (e.pointerType === 'touch' ? 10 : 4)) return; // small finger wobble never moves a drawing
      dr.moved = true;
      if (dr.d.locked) return;
      e.preventDefault?.();
      const { d, g } = dr;
      const toPt = xyToPointRef.current;
      // nothing is saved while dragging: the new position lives in draftRef and is committed once on release,
      // so a bad intermediate point can never delete or corrupt the drawing
      const patch = (id, p) => {
        const ok = Object.values(p).every((v) => (v && typeof v === 'object' ? Number.isFinite(v.time) && Number.isFinite(v.price) : typeof v === 'number' ? Number.isFinite(v) : true));
        if (ok) draftRef.current = { id, patch: p };
      };
      if (BOX.includes(dr.mode)) {
        let l = Math.min(g.x1, g.x2), r = Math.max(g.x1, g.x2), t = Math.min(g.y1, g.y2), b = Math.max(g.y1, g.y2);
        if (dr.mode.includes('l')) l = x;
        if (dr.mode.includes('r')) r = x;
        if (dr.mode.includes('t')) t = y;
        if (dr.mode.includes('b')) b = y;
        const pa = toPt(Math.min(l, r), Math.min(t, b));
        const pb = toPt(Math.max(l, r), Math.max(t, b));
        if (pa && pb) patch(dr.id, { a: pa, b: pb });
      } else if (dr.mode === 'a' || dr.mode === 'b') {
        const p = toPt(x, y);
        if (p) patch(dr.id, { [dr.mode]: p });
      } else if (d.type === 'hline') {
        const price = seriesRef.current.coordinateToPrice(g.y + dy);
        if (price != null) patch(dr.id, { price });
      } else if (d.type === 'vline') {
        const p = toPt(g.x + dx, 0, false);
        if (p) patch(dr.id, { a: { ...d.a, time: p.time } });
      } else if (d.type === 'text' || d.type === 'hray' || d.type === 'cross') {
        const p = toPt(g.x + dx, g.y + dy);
        if (p) patch(dr.id, { a: p });
      } else {
        const pa = toPt(g.x1 + dx, g.y1 + dy, false);
        const pb = toPt(g.x2 + dx, g.y2 + dy, false);
        if (pa && pb) patch(dr.id, { a: pa, b: pb });
      }
    };
    const commitDraft = () => {
      const draft = draftRef.current;
      draftRef.current = null;
      if (!draft) return;
      if (!drawingsRef.current.some((q) => q.id === draft.id)) return;
      const next = drawingsRef.current.map((q) => (q.id === draft.id ? { ...q, ...draft.patch } : q));
      drawingsRef.current = next; // visible immediately, before React re-renders
      changeRef.current(next);
    };
    const onUp = (e) => {
      const dr = dragRef.current;
      dragRef.current = null;
      if (dr) chartRef.current?.applyOptions({ handleScroll: true, handleScale: true });
      commitDraft();
      const now = Date.now();
      const tp = tapRef.current;
      tapRef.current = null;
      if (tp && !dr) {
        const { x, y } = local(e.clientX ?? tp.x, e.clientY ?? tp.y);
        if (Math.hypot(x - tp.x, y - tp.y) < 8 && now - tp.t < 500) {
          setSelectedId(tp.id); // a clean tap selects the drawing; moving it needs a second drag
          selectedRef.current = tp.id;
          const lt = lastTapRef.current;
          if (lt && lt.id === tp.id && now - lt.t < 400) {
            setPropsId(tp.id);
            lastTapRef.current = null;
          } else lastTapRef.current = { id: tp.id, t: now };
        }
      }
      if (dr && !dr.moved) {
        const lt = lastTapRef.current;
        if (lt && lt.id === dr.id && now - lt.t < 400) {
          setPropsId(dr.id); // double tap / double click
          lastTapRef.current = null;
        } else lastTapRef.current = { id: dr.id, t: now };
      } else if (dr) lastTapRef.current = null;
      const et = emptyTapRef.current;
      emptyTapRef.current = null;
      if (et && now - et.t < 500) {
        const { x, y } = local(e.clientX ?? et.x, e.clientY ?? et.y);
        if (Math.hypot(x - et.x, y - et.y) < 6) {
          setSelectedId(null);
          setPropsId(null);
        }
      }
    };

    wrap.addEventListener('pointerdown', onPointerDown, true);
    wrap.addEventListener('mousedown', onMouseDown, true);
    wrap.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      wrap.removeEventListener('pointerdown', onPointerDown, true);
      wrap.removeEventListener('mousedown', onMouseDown, true);
      wrap.removeEventListener('touchstart', onTouchStart, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // deselect when the stock or tool changes; keyboard: Esc closes panel/selection, Delete removes
  useEffect(() => {
    setSelectedId(null);
    setPropsId(null);
  }, [symbol]);
  useEffect(() => {
    pendingRef.current = null;
    if (tool !== 'cursor') {
      setSelectedId(null);
      setPropsId(null);
    }
  }, [tool]);
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        pendingRef.current = null;
        if (propsRef.current) setPropsId(null);
        else setSelectedId(null);
        onToolDone();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current) {
        removeSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, [onToolDone]);

  // ---------- create new drawings ----------
  const spec = TOOL_SPECS.find((t) => t.id === tool);
  const localPos = (e) => {
    const r = canvasEl.current.getBoundingClientRect();
    return xyToPoint(e.clientX - r.left, e.clientY - r.top);
  };
  // a finished drawing is saved right away, stays selected (handles visible) and can be dragged at once
  const finish = (d) => {
    const next = [...drawingsRef.current, d];
    drawingsRef.current = next;
    changeRef.current(next);
    pendingRef.current = null;
    downRef.current = null;
    setSelectedId(d.id);
    selectedRef.current = d.id;
    (onDrawn || onToolDone)();
  };
  const baseDrawing = () => {
    const df = defaultsRef.current;
    return {
      id: `${Date.now()}${Math.floor(Math.random() * 100000)}`,
      type: spec.type,
      ...(spec.ext ? { ext: spec.ext } : {}),
      ...(spec.arrow ? { arrow: true } : {}),
      ...(spec.type === 'fib' || spec.type === 'measure' ? {} : { color: df.color }),
      width: df.width,
      style: df.style,
    };
  };
  const rawXY = (e) => {
    const r = canvasEl.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // Works like TradingView: tap, then tap again  OR  press, drag and release.
  const onCanvasDown = (e) => {
    if (!spec || tool === 'cursor') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = localPos(e);
    if (!p) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}
    downRef.current = rawXY(e);
    if (spec.points === 1) {
      if (spec.type === 'hline') return finish({ ...baseDrawing(), price: p.price });
      if (spec.type === 'text') {
        const text = window.prompt('Text note:');
        if (!text) return onToolDone();
        return finish({ ...baseDrawing(), a: p, text: text.slice(0, 60) });
      }
      return finish({ ...baseDrawing(), a: p }); // vline, hray, cross
    }
    if (!pendingRef.current) {
      pendingRef.current = { ...baseDrawing(), a: p, b: p, fresh: true };
      return;
    }
    const first = pendingRef.current;
    const a = rawPoint(first.a);
    const here = rawXY(e);
    if (a && Math.hypot(a.x - here.x, a.y - here.y) < 4) return; // same spot twice: ignore
    const { fresh, ...d } = first;
    finish({ ...d, b: p });
  };
  const rawPoint = (pt) => {
    const env = envRef.current();
    if (!env || !pt) return null;
    const x = env.timeToX(pt.time);
    const y = env.priceToY(pt.price);
    return x == null || y == null ? null : { x, y };
  };
  const onCanvasMove = (e) => {
    if (!pendingRef.current) return;
    const p = localPos(e);
    if (p) pendingRef.current = { ...pendingRef.current, b: p };
  };
  const onCanvasUp = (e) => {
    const pend = pendingRef.current;
    const down = downRef.current;
    downRef.current = null;
    if (!pend || !down || !pend.fresh) return;
    const here = rawXY(e);
    if (Math.hypot(here.x - down.x, here.y - down.y) >= 8) {
      // press-drag-release: the drawing ends where the finger/mouse was lifted
      const p = localPos(e);
      const { fresh, ...d } = pend;
      if (p) finish({ ...d, b: p });
    } else {
      pendingRef.current = { ...pend, fresh: false }; // simple tap: wait for the second tap
    }
  };

  // ---------- edit via properties panel ----------
  const updateProps = (p) => {
    const id = propsRef.current;
    if (!id) return;
    changeRef.current(drawingsRef.current.map((q) => (q.id === id ? { ...q, ...p } : q)));
    if (p.color) onDrawDefaults({ color: p.color });
    if (p.width) onDrawDefaults({ width: p.width });
    if (p.style) onDrawDefaults({ style: p.style });
  };
  function removeSelected() {
    const id = selectedRef.current || propsRef.current;
    changeRef.current(drawingsRef.current.filter((q) => q.id !== id));
    setSelectedId(null);
    setPropsId(null);
  }
  const duplicateProps = () => {
    const d = drawingsRef.current.find((q) => q.id === propsRef.current);
    if (!d) return;
    const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const shift = (pt) => (pt ? { ...pt, price: pt.price * 0.99 } : pt);
    const copy = d.type === 'hline' ? { ...d, id, price: d.price * 0.99, locked: false } : { ...d, id, a: shift(d.a), b: shift(d.b), locked: false };
    changeRef.current([...drawingsRef.current, copy]);
    setSelectedId(id);
    setPropsId(id);
  };

  const goLatest = () => {
    const n = dataRef.current.length;
    chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 130), to: n + 8 });
  };

  // ---------- legends ----------
  const data = dataRef.current;
  const c = candleAt(data, hoverTime) || data[data.length - 1];
  const idx = c ? data.indexOf(c) : -1;
  const prevClose = idx > 0 ? data[idx - 1].close : c?.open;
  const chg = c && prevClose ? c.close - prevClose : null;
  const chgPct = chg != null && prevClose ? (chg / prevClose) * 100 : null;
  const dir = chg == null ? '' : chg >= 0 ? 'up' : 'down';

  const legendVals = (ind, list) =>
    (list || [])
      .filter((l) => l.desc.type === 'line' || l.desc.type === 'hist')
      .map((l, i) => {
        const v = valueAt(l.desc.data, hoverTime);
        const col = l.desc.data.length && l.desc.data[l.desc.data.length - 1].color ? undefined : l.desc.color;
        return (
          <span key={i} style={{ color: col }}>
            {fmtNum(v)}
          </span>
        );
      });

  return (
    <div className="chart-stack" ref={stackEl}>
      <div className="main-wrap" ref={wrapEl}>
        <div className="legend">
          <div className="lg-row">
            <b>{symbol}</b>
            <span className="muted">{intervalLabel}</span>
            {c && (
              <>
                <span className="muted">O</span>
                <span className={dir}>{fmtNum(c.open)}</span>
                <span className="muted">H</span>
                <span className={dir}>{fmtNum(c.high)}</span>
                <span className="muted">L</span>
                <span className={dir}>{fmtNum(c.low)}</span>
                <span className="muted">C</span>
                <span className={dir}>{fmtNum(c.close)}</span>
                {chg != null && (
                  <span className={dir}>
                    {chg >= 0 ? '+' : ''}
                    {fmtNum(chg)} ({chgPct >= 0 ? '+' : ''}
                    {chgPct.toFixed(2)}%)
                  </span>
                )}
                {showVolume && c.volume > 0 && (
                  <>
                    <span className="muted">Vol</span>
                    <span className={dir}>{fmtVol(c.volume)}</span>
                  </>
                )}
              </>
            )}
          </div>
          {c && hoverTime != null && <div className="lg-row muted small">{fmtTime(c.time, interval)}</div>}
          {mainInds.map((ind) => (
            <div className="lg-row lg-ind" key={ind.id}>
              <button className="lg-name" onClick={onOpenIndicators} title="Edit indicator">
                {indicatorTitle(ind)}
              </button>
              {legendVals(ind, overlayRef.current.get(ind.id))}
              {!ind.locked && (
                <button className="lg-x" onClick={() => onRemoveIndicator(ind.id)} aria-label={`Remove ${indicatorTitle(ind)}`}>
                  ×
                </button>
              )}
            </div>
          ))}
          {(strategies || []).map((st) => (
            <div className="lg-row lg-strat" key={st.id}>
              {st.action ? (
                <button className="lg-strat-text" onClick={st.action}>
                  {st.name} {st.note}
                </button>
              ) : (
                <button className="lg-strat-text" onClick={() => onOpenStrategy?.(st.id)} title="Tap to change settings and colours">
                  {st.name} · {st.note}
                </button>
              )}
              <RowMenu
                label={`${st.name} options`}
                items={[
                  { label: statsOn?.[st.id] === false ? 'Show strategy data (accuracy)' : 'Remove strategy data panel', onClick: () => onToggleStats?.(st.id) },
                  {
                    label: 'Remove strategy',
                    danger: true,
                    onClick: () => {
                      if (window.confirm(`Are you sure you want to remove "${st.name}" from ${symbol}?\nIts indicators and BUY/SELL marks will disappear from this chart.`)) onRemoveStrategy(st.id);
                    },
                  },
                ]}
              />
            </div>
          ))}
        </div>
        {overlay}
        <div ref={mainEl} className="main-chart" />
        <canvas ref={canvasEl} className={`draw-layer ${tool !== 'cursor' ? 'active' : ''}`} onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerCancel={onCanvasUp} />
        <button className="go-latest" onClick={goLatest} title="Jump to latest candle" aria-label="Jump to latest candle">
          ⏭
        </button>
        {propsDrawing && tool === 'cursor' && (
          <DrawProps d={propsDrawing} onChange={updateProps} onDelete={removeSelected} onDuplicate={duplicateProps} onClose={() => setPropsId(null)} />
        )}
      </div>
      {subInds.map((ind) => (
        <div className="pane" key={ind.id}>
          <div className="pane-legend">
            <button className="lg-name" onClick={onOpenIndicators} title="Edit indicator">
              {indicatorTitle(ind)}
            </button>
            {legendVals(ind, panesRef.current.get(ind.id)?.list)}
            <button className="lg-x" onClick={() => onRemoveIndicator(ind.id)} aria-label={`Remove ${indicatorTitle(ind)}`}>
              ×
            </button>
          </div>
          <div
            className="pane-chart"
            ref={(el) => {
              if (el) paneEls.current[ind.id] = el;
              else delete paneEls.current[ind.id];
            }}
          />
        </div>
      ))}
    </div>
  );
}
