'use client';

import { AgentStatus, AgentSteps, PosterSkeleton, Img, Button } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

const PLACEHOLDER_STEPS = [
  'Reading your request',
  'Searching the web',
  'Comparing titles',
  'Putting picks in order',
];

export function WorkingScreen({ query, steps, candidates = [], onCancel }) {
  // Use live steps if we have them, otherwise show placeholders
  const displaySteps = steps && steps.length > 0 ? steps : PLACEHOLDER_STEPS;
  // The last received step is "active"; if no live steps yet, show index 0
  const activeIndex = steps && steps.length > 0 ? steps.length - 1 : 0;

  const state =
    activeIndex === 0 ? 'thinking' : activeIndex === displaySteps.length - 1 ? 'comparing' : 'searching';

  // Fill the grid: real candidate posters first, skeletons for the rest
  const slots = 6;
  const shown = candidates.slice(-slots);

  return (
    <div className="working fade-in">
      <div className="working__aside">
        <h1>
          Right, let me
          <br />
          have a look…
        </h1>
        <div style={{ marginBottom: 22 }}>
          <AgentStatus state={state} />
        </div>
        <AgentSteps steps={displaySteps} activeIndex={activeIndex} />
        <div
          style={{
            marginTop: 22,
            color: 'var(--text-lo)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          &ldquo;{query}&rdquo;
        </div>
        <div style={{ marginTop: 10, color: 'var(--text-lo)', fontSize: 'var(--text-xs)' }}>
          Usually takes about 30 seconds.
        </div>
        {onCancel && (
          <div style={{ marginTop: 18 }}>
            <Button variant="secondary" size="md" iconLeft={<Icons.x />} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>
      <div>
        {shown.length > 0 && (
          <div
            className="section-label"
            style={{ marginBottom: 12, color: 'var(--text-mid)', fontSize: 'var(--text-sm)' }}
          >
            Considering…
          </div>
        )}
        <div className="poster-grid">
          {shown.map((c) => (
            <div key={c.id} className="nat-poster" style={{ pointerEvents: 'none' }}>
              <div className="nat-poster__art">
                <Img src={c.poster} alt={c.title} />
              </div>
              <div className="nat-poster__body">
                <div className="nat-poster__title">{c.title}</div>
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, slots - shown.length) }).map((_, i) => (
            <PosterSkeleton key={`s${i}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
