'use client';

import { useState } from 'react';
import { Button, PosterCard, Billboard, PromptBar } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

export function ResultsScreen({
  query,
  kind,
  picks,
  error,
  providers = [],
  onOpen,
  onNew,
  onToggleSave,
  onSearch,
  onRefine,
  onRetry,
  onShareSet,
  finishing,
  intent,
}) {
  const [refine, setRefine] = useState('');
  const shown = (picks || []).filter((p) => kind === 'all' || p.kind === kind);
  const featured = shown[0];
  const rest = shown.slice(1);
  const save = onToggleSave || (() => {});

  // Prefer onRefine when present, fall back to onSearch for compatibility
  const handleRefineSubmit = () => {
    const q = refine.trim();
    if (!q) return;
    setRefine('');
    if (onRefine) {
      onRefine(q);
    } else if (onSearch) {
      onSearch(q);
    }
  };

  // Show intent subhead only when it's a non-empty string that differs meaningfully from query
  const showIntent =
    intent &&
    typeof intent === 'string' &&
    intent.trim().length > 0 &&
    intent.trim().toLowerCase() !== (query || '').trim().toLowerCase();

  return (
    <div className="fade-up">
      <div className="results-head">
        <h1>
          {shown.length} pick{shown.length !== 1 ? 's' : ''} for{' '}
          <span dir="auto" className="q">&ldquo;{query}&rdquo;</span>
        </h1>
        <div className="refine">
          {onShareSet && shown.length > 0 && (
            <Button variant="secondary" size="md" iconLeft={<Icons.share />} onClick={onShareSet}>
              Share these picks
            </Button>
          )}
          <Button variant="secondary" size="md" iconLeft={<Icons.refresh />} onClick={onNew}>
            New search
          </Button>
        </div>
      </div>
      {showIntent && (
        <div dir="auto" style={{ color: 'var(--text-mid)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
          {intent}
        </div>
      )}
      {finishing && (
        <div style={{ color: 'var(--text-mid)', fontSize: 'var(--text-sm)', marginTop: 6 }}>
          Adding more + checking where to watch…
        </div>
      )}
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
                ? `No ${kind === 'tv' ? 'TV series' : 'films'} in this set — try "Everything".`
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
          <div className="reveal-item" style={{ '--i': 0 }}>
            <Billboard
              item={featured}
              onPlay={() => onOpen(featured)}
              onDetails={() => onOpen(featured)}
              onAdd={() => save(featured)}
            />
          </div>
          {rest.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 44 }}>
                <h2>More matches</h2>
              </div>
              <div key={query} className="poster-grid poster-grid--reveal">
                {rest.map((p, i) => (
                  <div key={p.id || p.title} className="reveal-item" style={{ '--i': i }}>
                    <PosterCard
                      item={p}
                      onClick={() => onOpen(p)}
                      onPlay={() => onOpen(p)}
                      onAdd={() => save(p)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {(onSearch || onRefine) && (
        <div style={{ margin: '40px auto 8px', maxWidth: 640 }}>
          <div
            style={{ color: 'var(--text-mid)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 10 }}
          >
            Not quite it? Tell me what to change.
          </div>
          <PromptBar
            value={refine}
            onChange={setRefine}
            onSend={handleRefineSubmit}
            placeholder='Refine these — "more like #2", "funnier", "nothing before 2010"…'
          />
        </div>
      )}
    </div>
  );
}
