'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TopBar } from '@/components/screens/TopBar.jsx';
import { IdleScreen } from '@/components/screens/IdleScreen.jsx';
import { ListeningOverlay } from '@/components/screens/ListeningOverlay.jsx';
import { WorkingScreen } from '@/components/screens/WorkingScreen.jsx';
import { ResultsScreen } from '@/components/screens/ResultsScreen.jsx';
import { WatchlistScreen } from '@/components/screens/WatchlistScreen.jsx';
import { DetailModal } from '@/components/screens/DetailModal.jsx';
import { AuthModal } from '@/components/screens/AuthModal.jsx';
import { ServicesModal } from '@/components/screens/ServicesModal.jsx';
import { useRecorder } from '@/lib/useRecorder.js';

export default function Page() {
  const [screen, setScreen] = useState('idle'); // idle | listening | working | results | watchlist
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [picks, setPicks] = useState([]);
  const [steps, setSteps] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [resultProviders, setResultProviders] = useState([]);

  // Account state
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(null); // null | 'signin' | 'signup'
  const [servicesOpen, setServicesOpen] = useState(false);
  const [watchItems, setWatchItems] = useState([]);

  // Overlapping-search guards: only the latest request may touch state, and a
  // new search aborts the previous stream so it can't clobber fresh results.
  const searchSeqRef = useRef(0);
  const abortRef = useRef(null);
  // A signed-out "+ watchlist" tap remembers the pick and completes the save
  // right after sign-up/sign-in.
  const pendingSaveRef = useRef(null);
  // Candidate posters streamed while the agent works (id → light item).
  const [candidates, setCandidates] = useState([]);

  // Who's signed in? (cookie session — one cheap call on mount)
  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.user) setUser(d.user);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const refreshWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist');
      if (!res.ok) return;
      const data = await res.json();
      setWatchItems(data.items || []);
    } catch {
      // Non-fatal — watchlist stays as-is
    }
  }, []);

  // Sign-out clears the list itself; this only loads it when a user appears.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch('/api/watchlist')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setWatchItems(d.items || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user]);

  const watchKeys = useMemo(
    () => new Set(watchItems.map((i) => `${i.kind}:${i.tmdbId}`)),
    [watchItems],
  );

  const persistSave = useCallback(
    async (item) => {
      const key = `${item.kind}:${item.tmdbId}`;
      setWatchItems((prev) => [
        {
          tmdbId: item.tmdbId,
          kind: item.kind,
          title: item.title,
          poster: item.poster || item.posterSrc || null,
          year: item.year,
          rating: item.rating,
        },
        ...prev.filter((i) => `${i.kind}:${i.tmdbId}` !== key),
      ]);
      try {
        const res = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tmdbId: item.tmdbId,
            kind: item.kind,
            title: item.title,
            poster: item.poster || item.posterSrc || null,
            year: Number.isInteger(item.year) ? item.year : null,
            rating: typeof item.rating === 'number' ? item.rating : null,
          }),
        });
        if (!res.ok) refreshWatchlist();
      } catch {
        refreshWatchlist();
      }
    },
    [refreshWatchlist],
  );

  const toggleWatchlist = useCallback(
    async (item) => {
      if (!item?.tmdbId) return;
      if (!user) {
        pendingSaveRef.current = item;
        setAuthOpen('signup');
        return;
      }
      const key = `${item.kind}:${item.tmdbId}`;
      if (!watchKeys.has(key)) {
        persistSave(item);
        return;
      }
      // Remove (optimistic; reconcile on failure)
      setWatchItems((prev) => prev.filter((i) => `${i.kind}:${i.tmdbId}` !== key));
      try {
        const res = await fetch('/api/watchlist', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId: item.tmdbId, kind: item.kind }),
        });
        if (!res.ok) refreshWatchlist();
      } catch {
        refreshWatchlist();
      }
    },
    [user, watchKeys, persistSave, refreshWatchlist],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Cookie clear is best-effort; local state resets regardless
    }
    setUser(null);
    setWatchItems([]);
    setScreen((s) => (s === 'watchlist' ? 'idle' : s));
  }, []);

  const runSearch = useCallback(
    async (text, kindArg) => {
      const q = (typeof text === 'string' ? text : query).trim();
      if (!q) return;
      // A fresh search always fetches the full pool — the TopBar toggle is a
      // display filter for the CURRENT results. Reusing it here silently
      // narrowed the next fetch (films vanished after picking TV).
      const effectiveKind = kindArg ?? 'all';

      const seq = ++searchSeqRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const isStale = () => searchSeqRef.current !== seq;

      setKind(effectiveKind);
      setActiveQuery(q);
      setQuery(q);
      setScreen('working');
      setError(null);
      setSteps([]);
      setCandidates([]);
      setResultProviders([]);

      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, kind: effectiveKind }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Recommend failed: HTTP ${res.status}`);

        let sawDone = false;
        const applyEvent = (event) => {
          if (event.type === 'step') {
            setSteps((prev) => [...prev, event.label]);
          } else if (event.type === 'candidates') {
            // Posters the agent is considering — make the wait feel alive.
            setCandidates((prev) => {
              const seen = new Set(prev.map((c) => c.id));
              const fresh = (event.items || []).filter((c) => c.poster && !seen.has(c.id));
              return fresh.length ? [...prev, ...fresh].slice(0, 24) : prev;
            });
          } else if (event.type === 'done') {
            sawDone = true;
            setPicks(event.picks || []);
            // Land on the tab the wording asked for ("a comedy movie" → Films);
            // the other tab is stocked with the same genre, one tap away.
            setKind(event.kind === 'film' || event.kind === 'tv' ? event.kind : 'all');
            setResultProviders(Array.isArray(event.providers) ? event.providers : []);
            setScreen('results');
            if (event.message && !event.picks?.length) {
              setError(event.message);
            }
          }
        };

        // Stream NDJSON if body is readable, otherwise fall back to whole-JSON parse
        if (res.body && res.body.getReader) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (isStale()) return; // superseded — leave state to the newer search
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Keep last (possibly incomplete) chunk in buffer
            buffer = lines.pop();
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                applyEvent(JSON.parse(trimmed));
              } catch {
                // Malformed line — skip
              }
            }
          }
          // Handle any remaining buffer content
          if (buffer.trim()) {
            try {
              applyEvent(JSON.parse(buffer.trim()));
            } catch {
              // Ignore
            }
          }
        } else {
          // Fallback: whole-JSON parse
          const data = await res.json();
          if (isStale()) return;
          if (data.steps) setSteps(data.steps);
          applyEvent({
            type: 'done',
            picks: data.picks,
            message: data.message,
            kind: data.kind,
            providers: data.providers,
          });
        }

        // A stream that ends without a 'done' event (proxy error page, dropped
        // connection) must not leave the user on the working screen forever.
        if (!sawDone) throw new Error('Stream ended without a result');
      } catch (err) {
        if (isStale() || err.name === 'AbortError') return;
        console.error('[runSearch]', err);
        setError('Something went wrong — please try again.');
        setScreen('results');
        setPicks([]);
      }
    },
    [query],
  );

  // Recorder hook
  const { micState, level, startRecording, stopRecording } = useRecorder({
    onTranscript: (text) => {
      setScreen('idle');
      setQuery(text);
      runSearch(text);
    },
    onError: (msg) => {
      setScreen('idle');
      setError(msg);
    },
  });

  // Compute overlay status directly from micState (no effect needed)
  const micOverlayStatus = micState === 'processing' ? 'transcribing' : 'listening';

  const handleMicClick = useCallback(() => {
    if (screen === 'listening') {
      stopRecording();
    } else {
      setScreen('listening');
      startRecording();
    }
  }, [screen, startRecording, stopRecording]);

  const goHome = useCallback(() => {
    searchSeqRef.current++; // invalidate any in-flight search
    abortRef.current?.abort();
    setScreen('idle');
    setQuery('');
    setKind('all');
    setDetail(null);
    setError(null);
    setPicks([]);
    setResultProviders([]);
  }, []);

  const openWatchlist = useCallback(() => {
    refreshWatchlist();
    setDetail(null);
    setScreen('watchlist');
  }, [refreshWatchlist]);

  // Compute micState for idle PromptBar
  const promptMicState = micState === 'processing' ? 'processing' : screen === 'listening' ? 'listening' : 'idle';

  // Stamp saved-state onto picks so cards can show ✓ instead of +
  const displayPicks = useMemo(
    () => picks.map((p) => (watchKeys.has(`${p.kind}:${p.tmdbId}`) ? { ...p, inWatchlist: true } : p)),
    [picks, watchKeys],
  );

  const watchlistAsPicks = useMemo(
    () =>
      watchItems.map((i) => ({
        id: `tmdb:${i.tmdbId}`,
        tmdbId: i.tmdbId,
        kind: i.kind,
        title: i.title,
        poster: i.poster,
        year: i.year,
        rating: i.rating,
        inWatchlist: true,
      })),
    [watchItems],
  );

  return (
    <div className="app-shell">
      <TopBar
        onHome={goHome}
        kind={kind}
        setKind={setKind}
        showFilter={screen === 'results'}
        user={user}
        onSignIn={() => setAuthOpen('signin')}
        onWatchlist={openWatchlist}
        onServices={() => setServicesOpen(true)}
        onSignOut={signOut}
      />
      <main className="app-main">
        {error && screen === 'idle' && (
          <div
            style={{
              color: 'var(--danger-500)',
              fontSize: 'var(--text-sm)',
              textAlign: 'center',
              padding: '8px 0',
            }}
          >
            {error}
          </div>
        )}
        {screen === 'idle' && (
          <IdleScreen
            query={query}
            setQuery={setQuery}
            onSend={runSearch}
            micState={promptMicState}
            onMic={handleMicClick}
          />
        )}
        {screen === 'working' && (
          <WorkingScreen query={activeQuery} steps={steps} candidates={candidates} onCancel={goHome} />
        )}
        {screen === 'results' && (
          <ResultsScreen
            query={activeQuery}
            kind={kind}
            picks={displayPicks}
            error={error}
            providers={resultProviders}
            onOpen={setDetail}
            onNew={goHome}
            onToggleSave={toggleWatchlist}
            onSearch={runSearch}
            onRetry={() => runSearch(activeQuery)}
          />
        )}
        {screen === 'watchlist' && (
          <WatchlistScreen
            items={watchlistAsPicks}
            onOpen={setDetail}
            onRemove={toggleWatchlist}
            onBrowse={goHome}
          />
        )}
      </main>
      {screen === 'listening' && (
        <ListeningOverlay onStop={handleMicClick} level={level} status={micOverlayStatus} />
      )}
      {detail && (
        <DetailModal
          item={detail}
          picks={displayPicks}
          saved={watchKeys.has(`${detail.kind}:${detail.tmdbId}`)}
          onToggleSave={toggleWatchlist}
          onClose={() => setDetail(null)}
          onOpen={setDetail}
        />
      )}
      {authOpen && (
        <AuthModal
          mode={authOpen}
          note={authOpen === 'signup' ? 'Create a free account to keep a watchlist and get picks from your own services.' : undefined}
          onClose={() => setAuthOpen(null)}
          onAuthed={(u) => {
            setUser(u);
            setAuthOpen(null);
            // Complete the save that triggered the sign-up prompt
            if (pendingSaveRef.current) {
              const pending = pendingSaveRef.current;
              pendingSaveRef.current = null;
              persistSave(pending);
            }
          }}
        />
      )}
      {servicesOpen && user && (
        <ServicesModal
          user={user}
          onClose={() => setServicesOpen(false)}
          onSaved={(u) => {
            setUser(u);
            setServicesOpen(false);
          }}
        />
      )}
    </div>
  );
}
