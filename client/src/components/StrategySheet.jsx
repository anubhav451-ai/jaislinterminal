import React from 'react';
import Icon, { ICONS } from './Icon.jsx';
import { allStrategies } from '../lib/strategy.js';

// "Add strategy" on the chart: pick any saved strategy and apply it to the stock that is open.
export default function StrategySheet({ symbol, appliedList, onAdd, onClose }) {
  const list = allStrategies();
  const has = (id) => appliedList.some((a) => a.strategyId === id && a.symbols.includes(symbol));
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Add strategy" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Add strategy to {symbol}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon d={ICONS.close} />
          </button>
        </div>
        <div className="sheet-list">
          {list.map((s) => (
            <button key={s.id} className="sheet-row" disabled={has(s.id) || !!s.error} onClick={() => onAdd(s.id)}>
              <span className="pr-main">
                <b>{s.name}</b>
                <small>{s.error ? 'File error – open Strategy tab' : s.short}</small>
              </span>
              <span className={`badge ${has(s.id) ? 'on' : 'buy'}`}>{has(s.id) ? 'Added' : 'Add'}</span>
            </button>
          ))}
          {!list.length && <p className="empty">No strategies yet. Add one in the Strategy tab.</p>}
        </div>
      </div>
    </div>
  );
}
