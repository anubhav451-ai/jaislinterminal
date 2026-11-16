import React, { useState } from 'react';
import { DAYS } from '../lib/conditions.js';

const ALL = [0, 1, 2, 3, 4, 5, 6];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

// Pick the weekdays the strategy may trade on and leave out single dates (holidays, news days ...).
export default function TradingDays({ value, onChange }) {
  const days = Array.isArray(value?.days) ? value.days : ALL;
  const skip = value?.skip || [];
  const [date, setDate] = useState('');
  const commit = (p) => onChange({ days, skip, ...p });
  const toggle = (d) => commit({ days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] });
  const addSkip = () => {
    if (date && !skip.includes(date)) commit({ skip: [...skip, date].sort() });
    setDate('');
  };
  return (
    <div className="td">
      <div className="cd-chips" role="group" aria-label="Trading days">
        {ORDER.map((d) => (
          <button key={d} type="button" className={days.includes(d) ? 'sel' : ''} onClick={() => toggle(d)} aria-pressed={days.includes(d)}>
            {DAYS[d]}
          </button>
        ))}
        <button type="button" onClick={() => commit({ days: [1, 2, 3, 4, 5] })}>
          Mon–Fri
        </button>
        <button type="button" onClick={() => commit({ days: ALL })}>
          All
        </button>
      </div>
      <div className="td-add">
        <label className="cd-f">
          <span>Leave out a date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn" onClick={addSkip} disabled={!date}>
          Leave out
        </button>
      </div>
      {skip.length > 0 && (
        <div className="cd-chips">
          {skip.map((s) => (
            <button key={s} type="button" className="sel td-skip" onClick={() => commit({ skip: skip.filter((x) => x !== s) })} title="Tap to put this date back">
              {s} ×
            </button>
          ))}
        </div>
      )}
      <small className="muted">
        {days.length === 0 ? 'No day is ticked, so no signal will count.' : days.length >= 7 && !skip.length ? 'All days count.' : `Signals count only on ${ORDER.filter((d) => days.includes(d)).map((d) => DAYS[d]).join(', ')}${skip.length ? `, except ${skip.length} date${skip.length > 1 ? 's' : ''}` : ''}.`}
      </small>
    </div>
  );
}
