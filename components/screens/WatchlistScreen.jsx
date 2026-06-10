'use client';

import { Button, PosterCard } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

export function WatchlistScreen({ items, onOpen, onRemove, onBrowse }) {
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
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-mid)' }}>
          Nothing saved yet — tap the + on any pick to keep it here.
        </div>
      ) : (
        <div className="poster-grid">
          {items.map((p) => (
            <PosterCard
              key={`${p.kind}:${p.tmdbId}`}
              item={p}
              onClick={() => onOpen(p)}
              onPlay={() => onOpen(p)}
              onAdd={() => onRemove(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
