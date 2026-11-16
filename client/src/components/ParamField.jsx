import React from 'react';
import NumField from './NumField.jsx';

// One editable indicator input (number / select / colour / checkbox).
export default function ParamField({ p, value, onChange }) {
  const val = value ?? p.def;
  if (p.type === 'select')
    return (
      <label>
        <span>{p.label}</span>
        <select value={val} onChange={(e) => onChange(e.target.value)}>
          {p.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  if (p.type === 'color')
    return (
      <label>
        <span>{p.label}</span>
        <input type="color" value={val} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  if (p.type === 'bool')
    return (
      <label className="chk">
        <input type="checkbox" checked={!!val} onChange={(e) => onChange(e.target.checked)} />
        <span>{p.label}</span>
      </label>
    );
  return (
    <label>
      <span>{p.label}</span>
      <NumField value={val} min={p.min} max={p.max} step={p.step || 1} onCommit={onChange} ariaLabel={p.label} />
    </label>
  );
}
