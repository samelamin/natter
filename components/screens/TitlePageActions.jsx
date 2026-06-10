'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo, Button } from '@/components/natter/index.jsx';
import { AuthModal } from '@/components/screens/AuthModal.jsx';
import { toWatchlistBody } from '@/lib/watchlistItem.js';

/**
 * TitlePageActions — a 'use client' island for the title detail page.
 *
 * Renders:
 *  - A lightweight nav bar: Natter logo (links home) + sign-in / watchlist link.
 *  - A primary CTA row: "Save to watchlist" button + muted helper line.
 *  - AuthModal when needed (signup on save-while-logged-out; signin from bar link).
 *
 * Props:
 *   item: { tmdbId, kind, title, poster, year, rating }
 */
export function TitlePageActions({ item }) {
  const [user, setUser] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [authOpen, setAuthOpen] = useState(null); // null | 'signin' | 'signup'
  const [error, setError] = useState(null);

  // Fetch current session on mount (alive-flag guard mirrors app/page.jsx:58-69)
  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setUser(d?.user || null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const body = toWatchlistBody(item);

  async function doSave() {
    if (!body || saved || saving) return;
    setError(null);
    setSaved(true); // optimistic
    setSaving(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setSaved(false);
        setError("Couldn't save — watchlist may be unavailable.");
      }
    } catch {
      setSaved(false);
      setError("Couldn't save — watchlist may be unavailable.");
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (!user) {
      setAuthOpen('signup');
      return;
    }
    doSave();
  }

  function handleAuthed(u) {
    setUser(u);
    setAuthOpen(null);
    doSave();
  }

  const authMode = authOpen || 'signup';
  const authNote =
    authOpen === 'signup'
      ? `Create a free account to save ${item?.title || 'this title'} and build your watchlist.`
      : undefined;

  return (
    <>
      {/* Lightweight nav bar — distinct from .topbar (no app-shell grid dependency) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px var(--gutter-lg, 32px)',
          backdropFilter: 'blur(var(--blur-md, 12px))',
          background: 'rgba(11,11,18,.54)',
          borderBottom: '1px solid var(--line-soft)',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex' }} aria-label="Natter home">
          <Logo size={26} />
        </Link>

        <div>
          {user ? (
            <Link
              href="/"
              style={{
                color: 'var(--text-mid)',
                fontSize: 'var(--text-sm)',
                textDecoration: 'none',
              }}
            >
              Your watchlist
            </Link>
          ) : (
            <Button variant="secondary" size="md" onClick={() => setAuthOpen('signin')}>
              Sign in
            </Button>
          )}
        </div>
      </div>

      {/* Primary CTA block */}
      {body && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 8,
            padding: '20px var(--gutter-lg, 32px) 0',
          }}
        >
          <Button
            variant="brand"
            size="lg"
            disabled={saved}
            onClick={handleSaveClick}
          >
            {saved ? 'Saved ✓' : 'Save to watchlist'}
          </Button>

          {error && (
            <p
              style={{
                margin: 0,
                color: 'var(--danger-500)',
                fontSize: 'var(--text-sm)',
              }}
            >
              {error}
            </p>
          )}

          <p
            style={{
              margin: 0,
              color: 'var(--text-mid)',
              fontSize: 'var(--text-sm)',
            }}
          >
            Free account — keep a watchlist and get picks for your streaming services.
          </p>
        </div>
      )}

      {/* Auth modal */}
      {authOpen && (
        <AuthModal
          mode={authMode}
          note={authNote}
          onClose={() => setAuthOpen(null)}
          onAuthed={handleAuthed}
        />
      )}
    </>
  );
}
