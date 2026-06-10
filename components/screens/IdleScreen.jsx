'use client';

import { PromptBar, Tag } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

const SUGGESTIONS = [
  'A cosy whodunnit',
  "Something that'll make us cry",
  'Under 90 minutes',
  'A proper hidden gem',
  'Tense but not gory',
];

export function IdleScreen({ query, setQuery, onSend, micState, onMic }) {
  return (
    <div className="fade-up">
      <div className="hero">
        <span className="eyebrow">Movie night, sorted</span>
        <h1>
          What are you
          <br />
          in the <em>mood</em> for?
        </h1>
        <div className="hero__prompt">
          <PromptBar
            value={query}
            onChange={setQuery}
            onSend={onSend}
            placeholder="Tell me what you fancy…"
            micState={micState}
            onMic={onMic}
          />
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <Tag key={s} onClick={() => { setQuery(s); onSend(s); }}>
                {s}
              </Tag>
            ))}
          </div>
          <div className="hero__hint">
            <Icons.mic /> Say it or type it — a vibe, an actor, a half-remembered plot.
          </div>
        </div>
      </div>
    </div>
  );
}
