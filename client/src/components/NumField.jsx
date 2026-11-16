import React, { useEffect, useState } from 'react';

// Number input that lets you type "1." / "1.5" / "-" without the value jumping back.
export default function NumField({ value, onCommit, min, max, step = 1, className, ariaLabel }) {
  const [draft, setDraft] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setDraft(String(value));
  }, [value, focus]);
  const tryCommit = (txt) => {
    const v = parseFloat(txt);
    if (Number.isFinite(v) && (min == null || v >= min) && (max == null || v <= max)) onCommit(v);
  };
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      data-step={step}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        const v = parseFloat(draft);
        if (!Number.isFinite(v) || (min != null && v < min) || (max != null && v > max)) setDraft(String(value));
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        tryCommit(e.target.value);
      }}
    />
  );
}
