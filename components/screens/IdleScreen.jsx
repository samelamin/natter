'use client';

import { useState, useEffect } from 'react';
import { PromptBar, Tag } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';
import { POOL, POOL_BY_DOMAIN } from '@/lib/suggestionPool.js';

function pickFive(pool) {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 5);
}

// Per-domain hero copy + prompt placeholder. `all` keeps the original
// "movie night" wording; new domains get their own eyebrow/title/placeholder.
const COPY = {
  all: {
    eyebrow: 'Movie night, sorted',
    title: ['What are you', { br: true }, 'in the ', { em: 'mood' }, ' for?'],
    placeholder: 'Tell me what you fancy…',
  },
  film: {
    eyebrow: 'Movie night, sorted',
    title: ['What are you', { br: true }, 'in the ', { em: 'mood' }, ' for?'],
    placeholder: 'Tell me what you fancy…',
  },
  tv: {
    eyebrow: 'Your next binge',
    title: ['What do you', { br: true }, 'want to ', { em: 'watch' }, '?'],
    placeholder: 'Tell me what you want to watch…',
  },
  book: {
    eyebrow: 'Your next great read',
    title: ['What do you', { br: true }, 'want to ', { em: 'read' }, '?'],
    placeholder: 'Tell me what you want to read…',
  },
  game: {
    eyebrow: 'Your next obsession',
    title: ['What do you', { br: true }, 'want to ', { em: 'play' }, '?'],
    placeholder: 'Tell me what you want to play…',
  },
  recipe: {
    eyebrow: "What's for dinner?",
    title: ['What do you', { br: true }, 'want to ', { em: 'cook' }, '?'],
    placeholder: "Tell me what you're craving…",
  },
};

function poolForKind(kind) {
  return POOL_BY_DOMAIN[kind] || POOL;
}

export function IdleScreen({ kind = 'all', query, setQuery, onSend, micState, onMic, onFeedback }) {
  // Hydration-stable: start with first 5 of the active pool, randomise after mount.
  const [chips, setChips] = useState(poolForKind(kind).slice(0, 5));
  // Recent searches — empty until useEffect runs (hydration safety)
  const [recents, setRecents] = useState([]);
  // Trending chips from /api/suggestions — empty until fetched
  const [trendingChips, setTrendingChips] = useState([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChips(pickFive(poolForKind(kind)));
  }, [kind]);

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

  const copy = COPY[kind] || COPY.all;

  return (
    <div className="fade-up">
      <div className="hero">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>
          {copy.title.map((part, i) => {
            if (typeof part === 'string') return <span key={i}>{part}</span>;
            if (part.br) return <br key={i} />;
            if (part.em) return <em key={i}>{part.em}</em>;
            return null;
          })}
        </h1>
        <div className="hero__prompt">
          <PromptBar
            value={query}
            onChange={setQuery}
            onSend={onSend}
            placeholder={copy.placeholder}
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
            <Icons.mic /> Say it or type it — a vibe, an author, a half-remembered plot.
          </div>
          {onFeedback && (
            <button className="feedback-entry" type="button" onClick={onFeedback}>
              <Icons.sparkles />
              Suggest an improvement
            </button>
          )}
        </div>
      </div>
    </div>
  );
}