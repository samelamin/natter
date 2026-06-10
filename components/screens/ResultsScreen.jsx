'use client';

import { useState } from 'react';
import { Button, PosterCard, Billboard, PromptBar } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

export function ResultsScreen({ query, kind, picks, error, providers = [], onOpen, onNew, onToggleSave, onSearch, onRetry }) {
  const [refine, setRefine] = useState('');
  const shown = (picks || []).filter((p) => kind === 'all' || p.kind === kind);
  const featured = shown[0];
  const rest = shown.slice(1);
  const save = onToggleSave || (() => {});

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
      {providers.length > 0 && (
        <div style={{ margin: '-6px 0 14px', color: 'var(--text-mid)', fontSize: 'var(--text-sm)' }}>
          <Icons.tv /> Only what you can watch on {providers.join(', ')}
        </div>
      )}
      {shown.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-mid)' }}>
          <div>
            {error
              ? error
              : (picks || []).length > 0
                ? `No ${kind === 'tv' ? 'TV series' : 'films'} in this set — try “Everything”.`
                : 'Nothing quite fit. Want to loosen the filters?'}
          </div>
          {error && onRetry && (
            <div style={{ marginTop: 16 }}>
              <Button variant="brand" size="md" iconLeft={<Icons.refresh />} onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <Billboard
            item={featured}
            onPlay={() => onOpen(featured)}
            onDetails={() => onOpen(featured)}
            onAdd={() => save(featured)}
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
                    onAdd={() => save(p)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
      {onSearch && (
        <div style={{ margin: '40px auto 8px', maxWidth: 640 }}>
          <div
            style={{ color: 'var(--text-mid)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 10 }}
          >
            Not quite it? Tell me what to change.
          </div>
          <PromptBar
            value={refine}
            onChange={setRefine}
            onSend={() => {
              const q = refine.trim();
              if (q) {
                setRefine('');
                onSearch(q);
              }
            }}
            placeholder="Try another ask — “lighter”, “more recent”, “something like #2”…"
          />
        </div>
      )}
    </div>
  );
}
