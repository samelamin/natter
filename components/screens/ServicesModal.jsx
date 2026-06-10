'use client';

import { useState } from 'react';
import { Button, Tag } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';
import { PROVIDERS } from '@/lib/providers.js';

const card = {
  width: 'min(460px, 92vw)',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
  borderRadius: 18,
  padding: '28px 26px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

export function ServicesModal({ user, onClose, onSaved }) {
  const [selected, setSelected] = useState(new Set(user?.services || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save — please try again.');
        return;
      }
      onSaved(data.user);
    } catch {
      setError('Could not save — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', color: 'var(--text-hi)' }}>My services</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--text-mid)', cursor: 'pointer' }}
          >
            <Icons.x />
          </button>
        </div>
        <p style={{ margin: 0, color: 'var(--text-mid)', fontSize: 'var(--text-sm)' }}>
          Pick what you can watch. Recommendations will put titles on your services first and skip
          the rest. Leave everything unticked to see it all.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PROVIDERS.map((p) => (
            <Tag key={p.key} selected={selected.has(p.key)} onClick={() => toggle(p.key)}>
              {p.label}
            </Tag>
          ))}
        </div>
        {error && <div style={{ color: 'var(--danger-500)', fontSize: 'var(--text-sm)' }}>{error}</div>}
        <Button variant="brand" size="lg" onClick={save} loading={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}
