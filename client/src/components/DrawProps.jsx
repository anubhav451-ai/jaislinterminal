import React from 'react';
import Icon, { ICONS } from './Icon.jsx';
import { DRAW_COLORS, TYPE_LABEL, colorOf } from '../lib/drawings.js';

const STYLES = [
  ['solid', 'Solid'],
  ['dashed', 'Dashed'],
  ['dotted', 'Dotted'],
];

function Swatches({ value, onPick, label }) {
  const v = (value || '').toLowerCase();
  return (
    <div className="dp-swatches">
      {DRAW_COLORS.map((c) => (
        <button key={c} className={`swatch ${c.toLowerCase() === v ? 'on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={`${label} ${c}`} />
      ))}
      <label className="swatch custom" title="Custom colour">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#2962ff'} onChange={(e) => onPick(e.target.value)} aria-label={`Custom ${label}`} />
      </label>
    </div>
  );
}

function Num({ label, value, onCommit }) {
  const commit = (el) => {
    const n = parseFloat(el.value);
    if (Number.isFinite(n) && n > 0) onCommit(n);
    else el.value = value.toFixed(2);
  };
  return (
    <label className="dp-num">
      <span>{label}</span>
      <input key={value} type="number" inputMode="decimal" step="0.05" defaultValue={value.toFixed(2)} onBlur={(e) => commit(e.target)} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
    </label>
  );
}

export default function DrawProps({ d, onChange, onDelete, onDuplicate, onClose }) {
  const color = colorOf(d);
  const twoPoint = ['trend', 'rect', 'fib', 'measure'].includes(d.type);
  const fillable = d.type === 'rect' || d.type === 'fib';
  return (
    <div className="draw-props" role="dialog" aria-label={`${TYPE_LABEL[d.type]} properties`}>
      <div className="dp-head">
        <b>{TYPE_LABEL[d.type]}</b>
        <span className="grow" />
        <button className={`dt-btn ${d.locked ? 'on' : ''}`} onClick={() => onChange({ locked: !d.locked })} aria-pressed={!!d.locked} title="Lock so it cannot be moved by accident">
          {d.locked ? 'Locked' : 'Lock'}
        </button>
        <button className="dt-btn" onClick={onClose} aria-label="Close properties">
          <Icon d={ICONS.close} size={16} />
        </button>
      </div>

      <div className="dp-row">
        <span className="dp-l">Colour</span>
        <Swatches value={color} onPick={(c) => onChange({ color: c })} label="Colour" />
      </div>

      {d.type !== 'text' && (
        <div className="dp-row">
          <span className="dp-l">Line</span>
          <div className="dp-seg">
            {[1, 2, 3, 4].map((w) => (
              <button key={w} className={`dt-btn ${(d.width || 2) === w ? 'on' : ''}`} onClick={() => onChange({ width: w })} aria-label={`Width ${w}`}>
                {w}
              </button>
            ))}
          </div>
          <div className="dp-seg">
            {STYLES.map(([id, label]) => (
              <button key={id} className={`dt-btn ${(d.style || 'solid') === id ? 'on' : ''}`} onClick={() => onChange({ style: id })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {d.type === 'trend' && (
        <div className="dp-row">
          <span className="dp-l">Extend</span>
          <div className="dp-seg">
            {[
              ['none', 'Segment'],
              ['ray', 'Ray'],
              ['both', 'Both ways'],
            ].map(([id, label]) => (
              <button key={id} className={`dt-btn ${(d.ext || 'none') === id ? 'on' : ''}`} onClick={() => onChange({ ext: id })}>
                {label}
              </button>
            ))}
          </div>
          <button className={`dt-btn ${d.arrow ? 'on' : ''}`} onClick={() => onChange({ arrow: !d.arrow })} aria-pressed={!!d.arrow}>
            Arrow head
          </button>
        </div>
      )}

      {fillable && (
        <div className="dp-row">
          <span className="dp-l">Fill</span>
          <Swatches value={d.fillColor || color} onPick={(c) => onChange({ fillColor: c })} label="Fill colour" />
          <label className="dp-range">
            <input type="range" min="0" max="60" value={Math.round((d.fillOpacity ?? (d.type === 'rect' ? 0.14 : 0.09)) * 100)} onChange={(e) => onChange({ fillOpacity: e.target.value / 100 })} aria-label="Fill opacity" />
            <span>{Math.round((d.fillOpacity ?? (d.type === 'rect' ? 0.14 : 0.09)) * 100)}%</span>
          </label>
        </div>
      )}

      {d.type === 'hline' && (
        <div className="dp-row">
          <Num label="Price" value={d.price} onCommit={(n) => onChange({ price: n })} />
          <button className={`dt-btn ${d.showPrice !== false ? 'on' : ''}`} onClick={() => onChange({ showPrice: d.showPrice === false })} aria-pressed={d.showPrice !== false}>
            Price label
          </button>
        </div>
      )}

      {twoPoint && (
        <div className="dp-row">
          <Num label="Price A" value={d.a.price} onCommit={(n) => onChange({ a: { ...d.a, price: n } })} />
          <Num label="Price B" value={d.b.price} onCommit={(n) => onChange({ b: { ...d.b, price: n } })} />
        </div>
      )}

      {d.type === 'text' ? (
        <div className="dp-row">
          <label className="dp-text">
            <span>Text</span>
            <input value={d.text || ''} maxLength={60} onChange={(e) => onChange({ text: e.target.value })} />
          </label>
        </div>
      ) : (
        d.type !== 'measure' && (
          <div className="dp-row">
            <label className="dp-text">
              <span>Label</span>
              <input value={d.label || ''} maxLength={40} placeholder="Optional name shown on chart" onChange={(e) => onChange({ label: e.target.value })} />
            </label>
          </div>
        )
      )}

      <div className="dp-actions">
        <button className="dt-btn" onClick={onDuplicate}>
          <Icon d={ICONS.copy} size={15} /> Duplicate
        </button>
        <button className="dt-btn danger" onClick={onDelete}>
          <Icon d={ICONS.trash} size={15} /> Delete
        </button>
        <button className="dt-btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
