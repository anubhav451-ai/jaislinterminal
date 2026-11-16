import React, { useState } from 'react';

export default function NameDialog({ title, value, onSave, onClose }) {
  const [v, setV] = useState(value || '');
  const go = () => v.trim() && onSave(v.trim());
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal small-dialog" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <input autoFocus value={v} maxLength={60} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} aria-label={title} />
        <div className="editor-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={go} disabled={!v.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
