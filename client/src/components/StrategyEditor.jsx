import React, { useRef, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';
import { inspectPython, pyEvaluate } from '../lib/py.js';
import { testStrategy } from '../lib/strategy.js';
import { fetchCandles } from '../lib/candles.js';

const prettyName = (file) => file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());

// Full-screen page for "Add strategy" and "Rename".
//  mode 'add'     : name at the top, then upload a Python file
//  mode 'rename'  : name at the top (file upload optional, to replace the code)
//  nameOnly       : built-in strategy, only the name can change
export default function StrategyEditor({ mode = 'add', nameOnly = false, initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [code, setCode] = useState(initial?.code || '');
  const [fileName, setFileName] = useState(initial?.fileName || '');
  const [meta, setMeta] = useState(initial?.meta || null);
  const [state, setState] = useState(initial?.meta ? { ok: true, existing: true } : null);
  const input = useRef(null);

  const check = async (text) => {
    setState({ busy: true });
    const r = await inspectPython(text);
    if (!r.ok) {
      setMeta(null);
      setState({ error: r.error });
      return;
    }
    try {
      const body = { id: 'test', defaults: { interval: '1d', validBars: 1, ...(r.meta.defaults || {}) }, indicators: () => [], evaluate: (c, p) => pyEvaluate(text, c, p) };
      // dry run on REAL candles from Angel One, so mistakes show up now. If the server is not connected the code is still accepted.
      let test = null;
      try {
        const candles = await fetchCandles('HDFCBANK', body.defaults.interval);
        test = testStrategy(body, candles);
        if (!test.ok) throw new Error(test.error);
      } catch (e) {
        if (test && !test.ok) throw e;
        test = null;
      }
      setMeta(r.meta);
      setState({ ok: true, test });
    } catch (e) {
      setMeta(null);
      setState({ error: String(e?.message || e) });
    }
  };

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/\.py$/i.test(f.name)) return setState({ error: 'Please choose a Python file (.py).' });
    if (f.size > 300 * 1024) return setState({ error: 'File is too large (max 300 KB).' });
    const text = await f.text();
    setCode(text);
    setFileName(f.name);
    if (!name.trim()) setName(prettyName(f.name));
    check(text);
  };

  const filled = nameOnly ? true : !!code && state?.ok && !state?.busy;
  const canSave = !!name.trim() && filled;
  const title = mode === 'rename' ? 'Rename strategy' : 'Add strategy';

  return (
    <div className="page" role="dialog" aria-label={title}>
      <header className="page-top">
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon d={ICONS.close} />
        </button>
        <h1>{title}</h1>
        <button className="btn primary" disabled={!canSave} onClick={() => onSave({ name: name.trim(), code, lang: 'py', meta, fileName })}>
          {mode === 'rename' ? 'Save' : 'Add'}
        </button>
      </header>
      <div className="page-body">
        <label className="field big">
          <span>Strategy name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. EMA 9/21 crossover" maxLength={60} onKeyDown={(e) => e.key === 'Enter' && canSave && onSave({ name: name.trim(), code, lang: 'py', meta, fileName })} />
        </label>

        {!nameOnly && (
          <>
            <input ref={input} type="file" accept=".py,text/x-python,text/plain" hidden onChange={pick} />
            <button className={`upload-drop ${fileName ? 'has' : ''}`} onClick={() => input.current?.click()} disabled={state?.busy}>
              <Icon d={ICONS.code} size={28} />
              <b>{fileName || 'Upload Python file'}</b>
              <small>{fileName ? 'Tap to choose a different file' : '.py file with your strategy'}</small>
            </button>
            {state?.busy && (
              <div className="test-box info" role="status">
                <span className="spinner" /> Checking your file… The first time, the Python engine downloads (about 10 MB).
              </div>
            )}
            {state?.error && (
              <div className="test-box bad" role="alert">
                {state.error}
              </div>
            )}
            {state?.ok && !state.busy && !state.existing && (
              <div className="test-box ok" role="status">
                File is valid.{state.test ? ` Test run on ${state.test.bars} real HDFCBANK candles: ${state.test.buys} BUY, ${state.test.sells} SELL.` : ' Not test-run on real candles (the server is not connected right now).'}
                {meta?.description ? <div className="small">{meta.description}</div> : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
