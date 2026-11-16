import React, { useState } from 'react';

// Shows /logo.png (put your file in client/public/logo.png). If it is missing, the blue "J" is shown.
export const LOGO_URL = `${import.meta.env.BASE_URL || '/'}logo.png`;
export default function Logo({ className = '', letter = 'J' }) {
  const [ok, setOk] = useState(true);
  return ok ? (
    <img className={`logo-img ${className}`} src={LOGO_URL} alt="" onError={() => setOk(false)} draggable="false" />
  ) : (
    <span className={`logo-letter ${className}`} aria-hidden="true">
      {letter}
    </span>
  );
}
