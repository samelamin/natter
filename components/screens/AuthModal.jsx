'use client';

import { useState, useEffect } from 'react';
import { Button, Logo } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

const card = {
  width: 'min(420px, 92vw)',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
  borderRadius: 18,
  padding: '28px 26px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-sunken)',
  color: 'var(--text-hi)',
  fontSize: 'var(--text-md)',
  outline: 'none',
};

export function AuthModal({ mode: initialMode = 'signin', note, onClose, onAuthed }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // ESC key closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    const saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = saved; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong — please try again.');
        return;
      }
      onAuthed(data.user);
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form style={card} role="dialog" aria-modal="true" aria-label="Sign in or create an account" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo size={22} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--text-mid)', cursor: 'pointer' }}
          >
            <Icons.x />
          </button>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', color: 'var(--text-hi)' }}>
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-mid)', fontSize: 'var(--text-sm)' }}>
            {note || 'Save titles to your watchlist and tell us which services you have.'}
          </p>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--text-mid)' }}>
          Email
          <input
            style={inputStyle}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--text-mid)' }}>
          Password
          <input
            style={inputStyle}
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <div style={{ color: 'var(--danger-500)', fontSize: 'var(--text-sm)' }}>{error}</div>
        )}

        <Button variant="brand" size="lg" type="submit" loading={busy}>
          {mode === 'signup' ? 'Sign up' : 'Sign in'}
        </Button>

        <div style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-mid)' }}>
          {mode === 'signup' ? (
            <>Already have an account?{' '}
              <a style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => { setMode('signin'); setError(null); }}>
                Sign in
              </a>
            </>
          ) : (
            <>New here?{' '}
              <a style={{ color: 'var(--accent)', cursor: 'pointer' }} onClick={() => { setMode('signup'); setError(null); }}>
                Create an account
              </a>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
