'use client';

import { useState, useEffect } from 'react';
import { PromptBar, Tag } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';
import { POOL } from '@/lib/suggestionPool.js';

function pickFive(pool) {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 5);
}

export function IdleScreen({ query, setQuery, onSend, micState, onMic }) {
  // Hydration-stable: start with first 5, randomise after mount
  const [chips, setChips] = useState(POOL.slice(0, 5));
  // Recent searches — empty until useEffect runs (hydration safety)
  const [recents, setRecents] = useState([]);
  // Trending chips from /api/suggestions — empty until fetched
  const [trendingChips, setTrendingChips] = useState([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChips(pickFive(POOL));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('natter.recent');
      if (raw) {
        const parsed = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(parsed)) setRecents(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetch('/api/suggestions')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.chips) && data.chips.length >= 3) {
          setTrendingChips(data.chips);
        }
      })
      .catch(() => {});
  }, []);

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
          {recents.length > 0 && (
            <div className="chips">
              <span style={{ color: 'var(--text-lo)', fontSize: 'var(--text-xs)', alignSelf: 'center', marginRight: 4 }}>
                Recent
              </span>
              {recents.map((s) => (
                <Tag key={s} onClick={() => { setQuery(s); onSend(s); }}>
                  {s}
                </Tag>
              ))}
            </div>
          )}
          {trendingChips.length >= 3 && (() => {
            const staticLower = new Set([...chips, ...recents].map((s) => s.toLowerCase()));
            const filtered = trendingChips.filter((c) => !staticLower.has(c.toLowerCase()));
            return filtered.length >= 3 ? (
              <div className="chips">
                <span style={{ color: 'var(--text-lo)', fontSize: 'var(--text-xs)', alignSelf: 'center', marginRight: 4 }}>
                  Trending near you
                </span>
                {filtered.map((c) => (
                  <Tag key={c} onClick={() => { setQuery(c); onSend(c); }}>
                    {c}
                  </Tag>
                ))}
              </div>
            ) : null;
          })()}
          <div className="chips">
            {chips.map((s) => (
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
