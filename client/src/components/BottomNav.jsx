import React from 'react';
import Icon, { ICONS } from './Icon.jsx';
import Logo from './Logo.jsx';

const ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: ICONS.dashboard },
  { id: 'chart', label: 'Chart', icon: ICONS.chart },
  { id: 'strategy', label: 'Strategy', icon: ICONS.strategy },
  { id: 'accounts', label: 'Accounts', icon: ICONS.wallet },
  { id: 'settings', label: 'Settings', icon: ICONS.settings },
];

// Phone portrait: bottom bar. PC / laptop / landscape: the same component becomes a left sidebar (see styles.css).
export default function BottomNav({ tab, onTab, badge = 0, collapsed = false, onToggle }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="side-brand">
        <span className="side-logo">
          <Logo />
        </span>
        <b>Jaislin Terminal</b>
      </div>
      {ITEMS.map((it, i) => (
        <button key={it.id} className={tab === it.id ? 'on' : ''} aria-current={tab === it.id ? 'page' : undefined} onClick={() => onTab(it.id)} title={`${it.label} (Alt+${i + 1})`}>
          <Icon d={it.icon} size={22} />
          <span>{it.label}</span>
          {it.id === 'strategy' && badge > 0 && <i className="nav-badge">{badge}</i>}
        </button>
      ))}
      <div className="side-grow" />
      <button className="side-toggle" onClick={onToggle} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
        <Icon d={ICONS.panel} size={20} />
        <span>{collapsed ? 'Expand' : 'Collapse'}</span>
      </button>
    </nav>
  );
}
