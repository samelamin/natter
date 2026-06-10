'use client';

import { useState, useCallback, useRef } from 'react';
import { TopBar } from '@/components/screens/TopBar.jsx';
import { IdleScreen } from '@/components/screens/IdleScreen.jsx';
import { ListeningOverlay } from '@/components/screens/ListeningOverlay.jsx';
import { WorkingScreen } from '@/components/screens/WorkingScreen.jsx';
import { ResultsScreen } from '@/components/screens/ResultsScreen.jsx';
import { DetailModal } from '@/components/screens/DetailModal.jsx';
import { useRecorder } from '@/lib/useRecorder.js';

export default function Page() {
  const [screen, setScreen] = useState('idle'); // idle | listening | working | results
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [picks, setPicks] = useState([]);
  const [steps, setSteps] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  // Overlapping-search guards: only the latest request may touch state, and a
  // new search aborts the previous stream so it can't clobber fresh results.
  const searchSeqRef = useRef(0);
  const abortRef = useRef(null);

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
          } else if (event.type === 'done') {
            sawDone = true;
            setPicks(event.picks || []);
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
          applyEvent({ type: 'done', picks: data.picks, message: data.message });
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
  }, []);

  // Compute micState for idle PromptBar
  const promptMicState = micState === 'processing' ? 'processing' : screen === 'listening' ? 'listening' : 'idle';

  return (
    <div className="app-shell">
      <TopBar
        onHome={goHome}
        kind={kind}
        setKind={setKind}
        showFilter={screen === 'results'}
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
        {screen === 'working' && <WorkingScreen query={activeQuery} steps={steps} />}
        {screen === 'results' && (
          <ResultsScreen
            query={activeQuery}
            kind={kind}
            picks={picks}
            error={error}
            onOpen={setDetail}
            onNew={goHome}
          />
        )}
      </main>
      {screen === 'listening' && (
        <ListeningOverlay onStop={handleMicClick} level={level} status={micOverlayStatus} />
      )}
      {detail && (
        <DetailModal
          item={detail}
          picks={picks}
          onClose={() => setDetail(null)}
          onOpen={setDetail}
        />
      )}
    </div>
  );
}
