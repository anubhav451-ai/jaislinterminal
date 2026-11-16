import React, { useEffect, useRef, useState } from 'react';
import Icon, { ICONS } from './Icon.jsx';

// Three-dot button with a small pop-up menu. items: [{ label, onClick, danger?, hidden? }]
export default function RowMenu({ items, label = 'More options' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [open]);
  const shown = items.filter((i) => !i.hidden);
  return (
    <span className="rowmenu" ref={ref}>
      <span
        role="button"
        tabIndex={0}
        className="dots-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen((o) => !o);
          }
        }}
      >
        <Icon d={ICONS.dots} size={20} />
      </span>
      {open && (
        <div className="menu-pop" role="menu">
          {shown.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={it.danger ? 'danger' : ''}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
