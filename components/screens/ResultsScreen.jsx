'use client';

import { Button, PosterCard, Billboard } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

export function ResultsScreen({ query, kind, picks, onOpen, onNew }) {
  const shown = (picks || []).filter((p) => kind === 'all' || p.kind === kind);
  const featured = shown[0];
  const rest = shown.slice(1);

  return (
    <div className="fade-up">
      <div className="results-head">
        <h1>
          {shown.length} pick{shown.length !== 1 ? 's' : ''} for{' '}
          <span className="q">&ldquo;{query}&rdquo;</span>
        </h1>
        <div className="refine">
          <Button variant="secondary" size="md" iconLeft={<Icons.refresh />} onClick={onNew}>
            New search
          </Button>
        </div>
      </div>
      {shown.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-mid)' }}>
          Nothing quite fit. Want to loosen the filters?
        </div>
      ) : (
        <>
          <Billboard
            item={featured}
            onPlay={() => onOpen(featured)}
            onDetails={() => onOpen(featured)}
            onAdd={() => {}}
          />
          {rest.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 44 }}>
                <h2>More matches</h2>
              </div>
              <div className="poster-grid">
                {rest.map((p) => (
                  <PosterCard
                    key={p.id || p.title}
                    item={p}
                    onClick={() => onOpen(p)}
                    onPlay={() => onOpen(p)}
                    onAdd={() => {}}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
