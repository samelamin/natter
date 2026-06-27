'use client';

import { useEffect, useRef, useState } from 'react';
import { Logo, SegmentedToggle, IconButton, Avatar, Button } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

const KIND_OPTS = [
  { value: 'all', label: 'Everything', icon: <Icons.layers /> },
  { value: 'film', label: 'Films', icon: <Icons.film /> },
  { value: 'tv', label: 'TV', icon: <Icons.tv /> },
  { value: 'book', label: 'Books', icon: <Icons.book /> },
  { value: 'game', label: 'Games', icon: <Icons.gamepad /> },
  { value: 'recipe', label: 'Recipes', icon: <Icons.chef /> },
];

const menuStyle = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  minWidth: 200,
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
  borderRadius: 12,
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 80,
  boxShadow: '0 12px 40px rgba(0,0,0,.45)',
};

const itemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'none',
  border: 'none',
  color: 'var(--text-hi)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
  textAlign: 'left',
};

function initialsOf(email = '') {
  const name = email.split('@')[0] || '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  const init = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  return init || '?';
}

export function TopBar({ onHome, kind, setKind, showFilter, user, onSignIn, onWatchlist, onServices, onSignOut }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <header className="topbar">
      <span onClick={onHome} style={{ cursor: 'pointer' }}>
        <Logo />
      </span>
      {showFilter ? (
        <SegmentedToggle options={KIND_OPTS} value={kind} onChange={setKind} />
      ) : (
        <span />
      )}
      <div className="topbar__right">
        <IconButton variant="ghost" label="Search" icon={<Icons.search />} onClick={onHome} />
        {user ? (
          <span ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
            <span
              onClick={() => setMenuOpen((v) => !v)}
              style={{ cursor: 'pointer' }}
              role="button"
              aria-label="Account menu"
            >
              <Avatar initials={initialsOf(user.email)} />
            </span>
            {menuOpen && (
              <div style={menuStyle}>
                <div style={{ ...itemStyle, cursor: 'default', color: 'var(--text-mid)', fontSize: 'var(--text-xs)' }}>
                  {user.email}
                </div>
                <button style={itemStyle} onClick={() => { setMenuOpen(false); onWatchlist(); }}>
                  <Icons.bookmark /> Watchlist
                </button>
                <button style={itemStyle} onClick={() => { setMenuOpen(false); onServices(); }}>
                  <Icons.tv /> My services
                </button>
                <button style={{ ...itemStyle, color: 'var(--text-mid)' }} onClick={() => { setMenuOpen(false); onSignOut(); }}>
                  <Icons.x /> Sign out
                </button>
              </div>
            )}
          </span>
        ) : (
          <Button variant="secondary" size="md" onClick={onSignIn}>
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}
