import React from 'react';
import Icon, { ICONS } from './Icon.jsx';

export default function Toasts({ items, onClose, onClick }) {
  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          <button className="toast-body" onClick={() => onClick?.(t)}>
            <Icon d={t.kind === 'setup' ? ICONS.bell : t.kind === 'warn' ? ICONS.warn : ICONS.check} size={18} />
            <span>
              <b>{t.title}</b>
              {t.text && <small>{t.text}</small>}
            </span>
          </button>
          <button className="toast-x" onClick={() => onClose(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
