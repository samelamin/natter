'use client';

import { useState, useEffect } from 'react';
import { Img } from '@/components/natter/index.jsx';
import { historyLabel } from '@/lib/history.js';
import { Icons } from '@/components/natter/Icons.jsx';

/**
 * RecentPicks — shows the user's last 6 recommendation sessions.
 *
 * Props:
 *   user       — the signed-in user object (or null/undefined)
 *   onOpenSet  — callback(entry) to reopen a history entry
 *
 * When !user → renders nothing.
 * Non-ok / 401 / empty items / fetch error → renders nothing.
 * No retries, no loading spinners.
 */
export function RecentPicks({ user, onOpenSet }) {
  // Keyed to the user it was fetched for, so a sign-out (or a different user
  // signing in) never flashes someone else's history while the fetch runs.
  const [loaded, setLoaded] = useState(null); // { email, items }

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch('/api/history')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data && Array.isArray(data.items) && data.items.length > 0) {
          setLoaded({ email: user.email, items: data.items });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user]);

  const items = user && loaded && loaded.email === user.email ? loaded.items : [];
  if (items.length === 0) return null;

  const visible = items.slice(0, 6);

  function handleRemove(entry) {
    // Optimistic removal — update state immediately, fire-and-forget the request.
    setLoaded((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.filter((it) => it.id !== entry.id) };
    });
    fetch('/api/history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id }),
    }).catch(() => {});
    // On failure, do NOT restore — next mount will refetch truth.
  }

  return (
    <section style={{ marginTop: 'var(--space-6, 24px)' }}>
      <div
        style={{
          color: 'var(--text-lo)',
          fontSize: 'var(--text-xs)',
          marginBottom: 'var(--space-3, 12px)',
          paddingLeft: 2,
        }}
      >
        Pick up where you left off
      </div>
      <div className="strip">
        {visible.map((entry) => {
          const label = historyLabel(entry);
          const posterPicks = (entry.picks || []).filter((p) => p && p.poster).slice(0, 4);
          const posterCount = posterPicks.length;
          return (
            // Outer wrapper is a <div> so we can have two sibling <button>s.
            <div
              key={entry.id}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                width: '100%',
              }}
            >
              {/* Main tile button — poster + caption */}
              <button
                type="button"
                aria-label={`Reopen picks for "${label}"`}
                onClick={() => onOpenSet && onOpenSet(entry)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <div
                  className="nat-poster__art"
                  style={{
                    position: 'relative',
                    width: '100%',
                    borderRadius: 'var(--radius-poster, 8px)',
                    overflow: 'hidden',
                    background: posterCount === 0 ? 'var(--surface-card)' : undefined,
                    border: '1px solid var(--line-soft)',
                  }}
                >
                  {posterCount >= 2 ? (
                    // 2×2 mini-grid of up to 4 posters
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gridTemplateRows: '1fr 1fr',
                        gap: 2,
                      }}
                    >
                      {Array.from({ length: 4 }, (_, i) => {
                        const p = posterPicks[i];
                        return (
                          <div
                            key={i}
                            style={{
                              position: 'relative',
                              overflow: 'hidden',
                              background: p ? undefined : 'var(--surface-card)',
                            }}
                          >
                            {p && <Img src={p.poster} alt={p.title || label} />}
                          </div>
                        );
                      })}
                    </div>
                  ) : posterCount === 1 ? (
                    <Img src={posterPicks[0].poster} alt={label} />
                  ) : (
                    <div
                      className="nat-poster__ph"
                      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: 10 }}
                    >
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-lo)',
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-mid)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {label}
                </div>
              </button>

              {/* Remove button — absolutely positioned over the poster, top-right */}
              <button
                type="button"
                aria-label={`Remove "${label}" from history`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(entry);
                }}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  background: 'rgba(0,0,0,.55)',
                  border: '1px solid var(--line-soft)',
                  borderRadius: 999,
                  width: 24,
                  height: 24,
                  lineHeight: 1,
                  color: 'var(--text-mid)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  fontSize: 12,
                }}
              >
                <Icons.x width={12} height={12} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
