'use client';

import { useState, useEffect } from 'react';
import { Button, PosterCard } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';
import { pickHydrationTargets, createLimiter } from '@/lib/hydrateQueue.js';

// Module-level cache: `${kind}:${tmdbId}` → watch object | null
// null = fetched but nothing available / failed; do not refetch.
// Survives tab toggles and remounts within the session.
const watchCache = new Map();

const hydrateLimiter = createLimiter(4);

export function WatchlistScreen({ items, onOpen, onRemove, onToggleWatched, onBrowse }) {
  const [filter, setFilter] = useState('towatch');
  const [hydratedTick, setHydratedTick] = useState(0);

  const toWatchItems = items.filter((p) => !p.watched);
  const watchedItems = items.filter((p) => p.watched);
  const visibleItems = filter === 'towatch' ? toWatchItems : watchedItems;

  useEffect(() => {
    if (!items.length) return;

    const targets = pickHydrationTargets(visibleItems, new Set(watchCache.keys()), 12);
    if (!targets.length) return;

    let alive = true;

    const tasks = targets.map((p) => async () => {
      // /api/title requires kind 'movie' or 'tv'; watchlist stores 'film' for movies
      const apiKind = p.kind === 'tv' ? 'tv' : 'movie';
      const key = `${p.kind}:${p.tmdbId}`;
      try {
        const res = await fetch('/api/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId: p.tmdbId, kind: apiKind }),
        });
        if (res.ok) {
          const data = await res.json();
          watchCache.set(key, data.watch ?? null);
        } else {
          watchCache.set(key, null);
        }
      } catch {
        watchCache.set(key, null);
      }
    });

    hydrateLimiter(tasks).then(() => {
      if (alive) setHydratedTick((t) => t + 1);
    });

    return () => {
      alive = false;
    };
  }, [items, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  let emptyMessage = null;
  if (visibleItems.length === 0) {
    if (filter === 'towatch') {
      emptyMessage =
        watchedItems.length > 0
          ? 'All caught up — everything here is marked watched.'
          : 'Nothing saved yet — tap the + on any pick to keep it here.';
    } else {
      emptyMessage = 'Nothing watched yet — tap "Mark watched" when you finish something.';
    }
  }

  return (
    <div className="fade-up">
      <div className="results-head">
        <h1>
          Your <span className="q">watchlist</span>
        </h1>
        <div className="refine">
          <Button variant="secondary" size="md" iconLeft={<Icons.search />} onClick={onBrowse}>
            Find something new
          </Button>
          {items.length > 0 && (
            <Button as="a" variant="secondary" size="md" href="/api/watchlist/export" download>
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <Button
            variant={filter === 'towatch' ? 'brand' : 'secondary'}
            size="sm"
            onClick={() => setFilter('towatch')}
          >
            To watch ({toWatchItems.length})
          </Button>
          <Button
            variant={filter === 'watched' ? 'brand' : 'secondary'}
            size="sm"
            onClick={() => setFilter('watched')}
          >
            Watched ({watchedItems.length})
          </Button>
        </div>
      )}

      {emptyMessage ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-mid)' }}>
          {emptyMessage}
        </div>
      ) : (
        <div className="poster-grid">
          {visibleItems.map((p) => {
            const watch = watchCache.get(`${p.kind}:${p.tmdbId}`);
            return (
              <div key={`${p.kind}:${p.tmdbId}`}>
                <PosterCard
                  item={watch ? { ...p, watch } : p}
                  onClick={() => onOpen(p)}
                  onPlay={() => onOpen(p)}
                  onAdd={() => onRemove(p)}
                />
                <div style={{ marginTop: 4 }}>
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '2px 0',
                      cursor: p.watched ? 'default' : 'pointer',
                      color: 'var(--text-mid)',
                      fontSize: 'var(--text-xs, 0.75rem)',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleWatched && onToggleWatched(p);
                    }}
                  >
                    {p.watched ? 'Watched ✓' : 'Mark watched'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
