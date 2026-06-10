'use client';

import { Img } from '@/components/natter/index.jsx';

/**
 * IdleWatchlistRow — purely presentational watchlist strip for the idle screen.
 *
 * Props:
 *   items     — array from the page's watchlist state (each: { tmdbId, kind, title, poster, year, ... })
 *   onOpen    — callback(item) called when a tile is clicked
 *   onViewAll — callback called when the "View all" button is clicked
 *
 * Renders null when items is falsy or empty.
 * NO fetching — page.jsx owns the data.
 */
export function IdleWatchlistRow({ items, onOpen, onViewAll }) {
  if (!items || items.length === 0) return null;

  const visible = items.slice(0, 6);

  return (
    <section style={{ marginTop: 'var(--space-6, 24px)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-3, 12px)',
          paddingLeft: 2,
        }}
      >
        <span
          style={{
            color: 'var(--text-lo)',
            fontSize: 'var(--text-xs)',
          }}
        >
          Your watchlist · {items.length}
        </span>
        <button
          type="button"
          onClick={onViewAll}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--text-mid)',
            fontSize: 'var(--text-sm)',
          }}
        >
          View all
        </button>
      </div>
      <div className="strip">
        {visible.map((item) => {
          const poster = item.poster || null;
          return (
            <button
              key={`${item.kind}:${item.tmdbId}`}
              type="button"
              aria-label={`Open ${item.title}`}
              onClick={() => onOpen && onOpen(item)}
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
                  <Img src={poster} alt={item.title} />
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
                      {item.title}
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
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {item.title}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
