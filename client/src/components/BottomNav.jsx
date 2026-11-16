import React from 'react';
import Icon, { ICONS } from './Icon.jsx';

const ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { id: 'chart', label: 'Chart', icon: ICONS.chart },
  { id: 'strategy', label: 'Strategy', icon: ICONS.strategy },
  { id: 'settings', label: 'Settings', icon: ICONS.settings },
];

export default function BottomNav({ tab, onTab, badge = 0 }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {ITEMS.map((it) => (
        <button key={it.id} className={tab === it.id ? 'on' : ''} aria-current={tab === it.id ? 'page' : undefined} onClick={() => onTab(it.id)}>
          <Icon d={it.icon} size={22} />
          <span>{it.label}</span>
          {it.id === 'strategy' && badge > 0 && <i className="nav-badge">{badge}</i>}
        </button>
      ))}
    </nav>
  );
}
