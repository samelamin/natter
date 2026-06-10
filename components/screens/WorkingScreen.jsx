'use client';

import { AgentStatus, AgentSteps, PosterSkeleton } from '@/components/natter/index.jsx';

const PLACEHOLDER_STEPS = [
  'Reading your request',
  'Searching the web',
  'Comparing titles',
  'Putting picks in order',
];

export function WorkingScreen({ query, steps }) {
  // Use live steps if we have them, otherwise show placeholders
  const displaySteps = steps && steps.length > 0 ? steps : PLACEHOLDER_STEPS;
  // The last received step is "active"; if no live steps yet, show index 0
  const activeIndex = steps && steps.length > 0 ? steps.length - 1 : 0;

  const state =
    activeIndex === 0 ? 'thinking' : activeIndex === displaySteps.length - 1 ? 'comparing' : 'searching';

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
      </div>
      <div className="poster-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <PosterSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
