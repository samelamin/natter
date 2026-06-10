'use client';

import { useState, useEffect } from 'react';
import { Img } from '@/components/natter/index.jsx';
import { historyLabel } from '@/lib/history.js';

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
          const poster = entry.picks?.[0]?.poster || null;
          return (
            <button
              key={entry.id}
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
                  width: '100%',
                  borderRadius: 'var(--radius-poster, 8px)',
                  overflow: 'hidden',
                  background: poster ? undefined : 'var(--surface-card)',
                  border: '1px solid var(--line-soft)',
                }}
              >
                {poster ? (
                  <Img src={poster} alt={label} />
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
          );
        })}
      </div>
    </section>
  );
}
