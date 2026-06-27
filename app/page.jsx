'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { TopBar } from '@/components/screens/TopBar.jsx';
import { IdleScreen } from '@/components/screens/IdleScreen.jsx';
import { ListeningOverlay } from '@/components/screens/ListeningOverlay.jsx';
import { WorkingScreen } from '@/components/screens/WorkingScreen.jsx';
import { ResultsScreen } from '@/components/screens/ResultsScreen.jsx';
import { WatchlistScreen } from '@/components/screens/WatchlistScreen.jsx';
import { RecentPicks } from '@/components/screens/RecentPicks.jsx';
import { IdleWatchlistRow } from '@/components/screens/IdleWatchlistRow.jsx';
import { TmdbAttribution } from '@/components/natter/TmdbAttribution.jsx';
import { DetailModal } from '@/components/screens/DetailModal.jsx';
import { AuthModal } from '@/components/screens/AuthModal.jsx';
import { ServicesModal } from '@/components/screens/ServicesModal.jsx';
import { FeedbackModal } from '@/components/screens/FeedbackModal.jsx';
import { useRecorder } from '@/lib/useRecorder.js';
import { mergePinnedPicks } from '@/lib/pinPicks.js';
import { DOMAIN_META } from '@/lib/providers/index.js';

const VALID_KINDS = new Set(['all', 'film', 'tv', 'book', 'game', 'recipe']);
const IRIS_ACCENT = '#7C6CFF';

function isValidKind(k) {
  return typeof k === 'string' && VALID_KINDS.has(k);
}

function accentForKind(kind) {
  // DOMAIN_META.film/tv both use the iris accent; everything else falls back
  // to the brand default so the result view never looks unstyled.
  if (isValidKind(kind) && DOMAIN_META[kind]) return DOMAIN_META[kind].accent;
  return IRIS_ACCENT;
}

const DEFAULT_PAGE_STATE = { all: 1, film: 1, tv: 1, book: 1, game: 1, recipe: 1 };
function withKind(pageState, kind, page) {
  // Always remembers a slot for the active kind so the toggle lands on a
  // sensible page after switching tabs.
  return { ...pageState, [kind]: page };
}

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
  const [finishing, setFinishing] = useState(false);
  const [intent, setIntent] = useState('');
  const [appendedCount, setAppendedCount] = useState(0);
  // Per-tab current page (reset on a new search, preserved across tab switches).
  const [pageState, setPageState] = useState(DEFAULT_PAGE_STATE);
  // True while deeper pages are still streaming in — drives the "of N+" hint.
  const [deepening, setDeepening] = useState(false);

  // Account state
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(null); // null | 'signin' | 'signup'
  const [servicesOpen, setServicesOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [watchItems, setWatchItems] = useState([]);

  // Toast state
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  // Overlapping-search guards: only the latest request may touch state, and a
  // new search aborts the previous stream so it can't clobber fresh results.
  const searchSeqRef = useRef(0);
  const abortRef = useRef(null);
  // A signed-out "+ watchlist" tap remembers the pick and completes the save
  // right after sign-up/sign-in.
  const pendingSaveRef = useRef(null);
  // Candidate posters streamed while the agent works (id → light item).
  const [candidates, setCandidates] = useState([]);

  // Refs to avoid stale closures in the popstate listener
  const detailRef = useRef(detail);
  const screenRef = useRef(screen);
  useEffect(() => { detailRef.current = detail; }, [detail]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  // runSearch closes over state at call time — the history write needs the
  // CURRENT user, not the one captured when the search started.
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Guard for the ?q= deep link — only run once on mount
  const deepLinkFiredRef = useRef(false);

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

  // Toast helper — clears previous timer and auto-clears after 2.5s
  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

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
      showToast('Added to your watchlist');
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
    [refreshWatchlist, showToast],
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
      showToast('Removed from your watchlist');
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
    [user, watchKeys, persistSave, refreshWatchlist, showToast],
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

  // Shared reset logic used by goHome and the popstate handler
  const resetToHome = useCallback(() => {
    searchSeqRef.current++; // invalidate any in-flight search
    abortRef.current?.abort();
    setScreen('idle');
    setQuery('');
    setKind('all');
    setDetail(null);
    setError(null);
    setPicks([]);
    setResultProviders([]);
    setFinishing(false);
    setIntent('');
    setAppendedCount(0);
    setPageState(DEFAULT_PAGE_STATE);
    setDeepening(false);
  }, []);

  const runSearch = useCallback(
    async (text, kindArg, opts) => {
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
      setFinishing(false);
      setIntent('');
      setAppendedCount(0);
      setPageState(DEFAULT_PAGE_STATE);
      setDeepening(false);

      // Push a history entry so back works
      history.pushState({ n: 'app' }, '', '');

      // Pin-partial-order state lives with THIS stream: the first 'partial'
      // pins the visible order; later events patch in place and append. A new
      // search gets fresh locals, and an aborted stream's state simply dies
      // with its closure (no refs to reset, StrictMode-safe).
      let streamPicks = [];
      let streamPinned = [];

      try {
        const body = { query: q, kind: effectiveKind };
        if (opts?.prior) body.prior = opts.prior;

        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
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
          } else if (event.type === 'partial') {
            const m = mergePinnedPicks(streamPicks, event.picks || [], streamPinned);
            streamPicks = m.picks;
            streamPinned = m.pinnedIds;
            setPicks(m.picks);
            setAppendedCount(m.appendedCount);
            // Land on the tab the wording asked for — accepts all domains now
            // (film | tv | book | game | recipe). Unknown values fall back to 'all'.
            setKind(isValidKind(event.kind) ? event.kind : 'all');
            setScreen('results');
            setFinishing(true);
            if (event.phase === 'deepening') setDeepening(true);
            if (event.intent) setIntent(event.intent);
          } else if (event.type === 'done') {
            sawDone = true;
            const m = mergePinnedPicks(streamPicks, event.picks || [], streamPinned);
            streamPicks = m.picks;
            streamPinned = m.pinnedIds;
            setPicks(m.picks);
            setAppendedCount(m.appendedCount);
            // Land on the tab the wording asked for ("a comedy movie" → Films);
            // for book/game/recipe the classifier switches kinds. The auto-switch
            // path sets `switched: true` on the event and we surface a toast.
            const landedKind = isValidKind(event.kind) ? event.kind : 'all';
            setKind(landedKind);
            if (event.switched) {
              const label = (DOMAIN_META[landedKind] && DOMAIN_META[landedKind].label) || landedKind;
              showToast(`Switched to ${label}`);
            }
            setResultProviders(Array.isArray(event.providers) ? event.providers : []);
            setScreen('results');
            setFinishing(false);
            setDeepening(false);
            if (event.intent) setIntent(event.intent);
            if (event.message && !event.picks?.length) {
              setError(event.message);
            }
            // Persist recent search
            if ((event.picks || []).length > 0) {
              try {
                const raw = localStorage.getItem('natter.recent');
                const prev = raw ? JSON.parse(raw) : [];
                const filtered = Array.isArray(prev)
                  ? prev.filter((r) => r.toLowerCase() !== q.toLowerCase())
                  : [];
                const updated = [q, ...filtered].slice(0, 8);
                localStorage.setItem('natter.recent', JSON.stringify(updated));
              } catch {
                // ignore
              }
              // Signed-in: also save the pick set server-side (fire-and-forget;
              // never blocks the stream or the paint).
              if (userRef.current) {
                const historyQuery = opts?.prior?.query
                  ? `${opts.prior.query} → ${q}`.slice(0, 500)
                  : q;
                import('@/lib/history.js')
                  .then(({ sanitizeHistoryPicks }) =>
                    fetch('/api/history', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        query: historyQuery,
                        intent: event.intent || null,
                        kind: event.kind || null,
                        picks: sanitizeHistoryPicks(event.picks),
                      }),
                    }),
                  )
                  .catch(() => {});
              }
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
            intent: data.intent,
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

  // Refine: sends current results as prior context
  const picksRef = useRef(picks);
  const activeQueryRef = useRef(activeQuery);
  useEffect(() => { picksRef.current = picks; }, [picks]);
  useEffect(() => { activeQueryRef.current = activeQuery; }, [activeQuery]);

  const runRefine = useCallback(
    (text) => {
      const currentPicks = picksRef.current;
      const currentQuery = activeQueryRef.current;
      runSearch(text, undefined, {
        prior: {
          query: currentQuery,
          picks: currentPicks.slice(0, 10).map((p) => ({
            id: p.id,
            title: p.title,
            year: p.year,
            kind: p.kind,
          })),
        },
      });
    },
    [runSearch],
  );

  // openDetail helper — centralises setDetail + history push. Only the FIRST
  // open pushes an entry; switching titles inside the modal replaces content,
  // so one Back (or one close) always consumes exactly one entry.
  const openDetail = useCallback((item) => {
    if (!detailRef.current) history.pushState({ n: 'detail' }, '', '');
    setDetail(item);
  }, []);

  // Manual close (X / Escape / backdrop) goes through history so the pushed
  // entry is consumed — otherwise the next Back would skip past results.
  const closeDetail = useCallback(() => {
    if (detailRef.current) history.back();
    else setDetail(null);
  }, []);

  // popstate: back button handling
  useEffect(() => {
    const handlePop = () => {
      if (detailRef.current) {
        setDetail(null);
      } else if (screenRef.current !== 'idle') {
        resetToHome();
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [resetToHome]);

  // ?q= deep link: run once on mount
  useEffect(() => {
    if (deepLinkFiredRef.current) return;
    deepLinkFiredRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const k = params.get('kind');
    if (q && q.trim()) {
      history.replaceState(null, '', '/');
      // Pre-select the kind (defaults to 'all') before running the search so
      // the chips, hero copy, and accent reflect the recipient's link context.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isValidKind(k) && k !== 'all') setKind(k);
      runSearch(q.trim(), isValidKind(k) ? k : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    resetToHome();
  }, [resetToHome]);

  const openWatchlist = useCallback(() => {
    refreshWatchlist();
    setDetail(null);
    setScreen('watchlist');
  }, [refreshWatchlist]);

  // Reopen a saved history entry: instant, deterministic — no /api/recommend.
  // Mirrors runSearch's history.pushState + in-flight invalidation so Back and
  // stray streams behave identically to a real search.
  const openHistorySet = useCallback((entry) => {
    if (!entry) return;
    searchSeqRef.current++;
    abortRef.current?.abort();
    history.pushState({ n: 'app' }, '', '');
    setActiveQuery(entry.query || '');
    setIntent(entry.intent || '');
    setKind(isValidKind(entry.kind) ? entry.kind : 'all');
    setPicks(Array.isArray(entry.picks) ? entry.picks : []);
    setError(null);
    setResultProviders([]);
    setFinishing(false);
    setAppendedCount(0);
    setPageState(DEFAULT_PAGE_STATE);
    setDeepening(false);
    setScreen('results');
  }, []);

  // Compute micState for idle PromptBar
  const promptMicState = micState === 'processing' ? 'processing' : screen === 'listening' ? 'listening' : 'idle';

  // Stamp saved-state onto picks so cards can show ✓ instead of +
  const displayPicks = useMemo(
    () => picks.map((p) => (watchKeys.has(`${p.kind}:${p.tmdbId}`) ? { ...p, inWatchlist: true } : p)),
    [picks, watchKeys],
  );

  // Share the CURRENTLY VISIBLE picks as a snapshot link (/s/<id>). Mirrors
  // ShareButton's native-sheet-then-clipboard behavior. For film/tv we
  // additionally narrow to that kind so a mixed-pick set never mixes
  // providers across domains in one share.
  const shareSet = useCallback(async () => {
    let visible;
    if (kind === 'film' || kind === 'tv') {
      visible = displayPicks.filter((p) => p.kind === kind);
    } else if (kind === 'book' || kind === 'game' || kind === 'recipe') {
      visible = displayPicks.filter((p) => p.domain === kind);
    } else {
      visible = displayPicks;
    }
    const p = visible.slice(0, 8);
    if (p.length === 0) return;
    let url;
    try {
      const r = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: activeQuery, intent, kind, picks: p }),
      });
      if (r.status === 503) {
        showToast('Sharing is unavailable right now — try a single title instead');
        return;
      }
      if (!r.ok) throw new Error(`share failed: ${r.status}`);
      const { id } = await r.json();
      url = new URL(`/s/${id}`, window.location.origin).href;
    } catch {
      showToast('Could not create a link — please try again');
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: `${p.length} picks for "${activeQuery}"`, url });
        return;
      }
    } catch {
      // user dismissed the native sheet — fall through to copy
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied — share your picks');
    } catch {
      // clipboard blocked — nothing more we can do
    }
  }, [displayPicks, kind, activeQuery, intent, showToast]);

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
        watched: i.watched === true,
      })),
    [watchItems],
  );

  // Flip watched/unwatched on a saved item (optimistic; reconcile on failure).
  const toggleWatched = useCallback(
    async (item) => {
      if (!item?.tmdbId) return;
      const key = `${item.kind}:${item.tmdbId}`;
      const next = !item.watched;
      setWatchItems((prev) =>
        prev.map((i) => (`${i.kind}:${i.tmdbId}` === key ? { ...i, watched: next } : i)),
      );
      try {
        const res = await fetch('/api/watchlist', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId: item.tmdbId, kind: item.kind, watched: next }),
        });
        if (!res.ok) refreshWatchlist();
      } catch {
        refreshWatchlist();
      }
    },
    [refreshWatchlist],
  );

  return (
    <div
      className="app-shell"
      style={{
        // Per-domain accent — overrides --accent on the app root so buttons,
        // badges, and accents throughout the result view pick up the active
        // domain's color without touching every component.
        '--accent': accentForKind(kind),
        '--accent-domain': accentForKind(kind),
      }}
    >
      <TopBar
        onHome={goHome}
        kind={kind}
        setKind={setKind}
        showFilter={screen === 'idle' || screen === 'results'}
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
          <>
            <IdleScreen
              kind={kind}
              query={query}
              setQuery={setQuery}
              onSend={runSearch}
              micState={promptMicState}
              onMic={handleMicClick}
              onFeedback={() => setFeedbackOpen(true)}
            />
            <RecentPicks user={user} onOpenSet={openHistorySet} />
            <IdleWatchlistRow
              items={watchlistAsPicks}
              onOpen={openDetail}
              onViewAll={openWatchlist}
            />
          </>
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
            onOpen={openDetail}
            onNew={goHome}
            onToggleSave={toggleWatchlist}
            onSearch={runSearch}
            onRefine={runRefine}
            onRetry={() => runSearch(activeQuery)}
            onShareSet={shareSet}
            finishing={finishing}
            intent={intent}
            appendedCount={appendedCount}
            page={pageState[kind] || 1}
            onPageChange={(p) => setPageState((s) => withKind(s, kind, p))}
            deepening={deepening}
          />
        )}
        {screen === 'watchlist' && (
          <WatchlistScreen
            items={watchlistAsPicks}
            onOpen={openDetail}
            onRemove={toggleWatchlist}
            onToggleWatched={toggleWatched}
            onBrowse={goHome}
          />
        )}
        {(screen === 'idle' || screen === 'results' || screen === 'watchlist') && (
          <div style={{ margin: '48px 0 10px' }}>
            <TmdbAttribution />
          </div>
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
          onClose={closeDetail}
          onOpen={openDetail}
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
      {feedbackOpen && (
        <FeedbackModal
          onClose={() => setFeedbackOpen(false)}
          onSubmitted={() => showToast('Thanks — suggestion sent')}
        />
      )}
      <div aria-live="polite">
        {toast && (
          <div
            style={{
              position: 'fixed',
              bottom: 28,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-default)',
              borderRadius: 999,
              padding: '10px 18px',
              color: 'var(--text-hi)',
              fontSize: 'var(--text-sm)',
              zIndex: 90,
              boxShadow: '0 12px 40px rgba(0,0,0,.45)',
              whiteSpace: 'nowrap',
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
