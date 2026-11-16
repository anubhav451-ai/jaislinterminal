import React from 'react';

export default function Icon({ d, size = 20, fill = 'none' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

export const ICONS = {
  dashboard: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  chart: ['M7 3v3', 'M7 16v4', 'M5 6h4v10H5z', 'M17 2v4', 'M17 15v5', 'M15 6h4v9h-4z'],
  settings: ['M4 7h9', 'M17 7h3', 'M13 4v6', 'M4 17h3', 'M11 17h9', 'M7 14v6'],
  list: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  sun: ['M12 3v2', 'M12 19v2', 'M3 12h2', 'M19 12h2', 'M5.6 5.6l1.4 1.4', 'M17 17l1.4 1.4', 'M5.6 18.4L7 17', 'M17 7l1.4-1.4', 'M12 8a4 4 0 100 8 4 4 0 000-8z'],
  moon: ['M21 13A9 9 0 1111 3a7 7 0 0010 10z'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 010 12h-3'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  copy: ['M9 9h11v11H9z', 'M5 15V4h11'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  magnet: ['M6 3v8a6 6 0 0012 0V3', 'M6 7h4', 'M14 7h4'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 9a3 3 0 100 6 3 3 0 000-6z'],
  eyeOff: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 9a3 3 0 100 6 3 3 0 000-6z', 'M3 3l18 18'],
  strategy: ['M3 17l6-6 4 4 8-9', 'M15 6h6v6'],
  check: ['M5 12l5 5 9-10'],
  back: ['M15 5l-7 7 7 7'],
  bell: ['M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7', 'M10 20a2 2 0 004 0'],
  search: ['M11 4a7 7 0 100 14 7 7 0 000-14z', 'M20 20l-4-4'],
};

ICONS.dots = ['M12 5h.01', 'M12 12h.01', 'M12 19h.01'];
ICONS.star = ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'];
ICONS.code = ['M8 8l-4 4 4 4', 'M16 8l4 4-4 4', 'M14 5l-4 14'];
ICONS.pin = ['M12 17v5', 'M9 3h6l-1 6 3 3H7l3-3z'];
ICONS.cog = ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'];
ICONS.warn = ['M12 3l10 18H2z', 'M12 10v4', 'M12 17h.01'];
