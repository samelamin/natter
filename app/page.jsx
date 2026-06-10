'use client';

import { useState, useCallback } from 'react';
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

  const runSearch = useCallback(
    async (text, kindArg) => {
      const q = (typeof text === 'string' ? text : query).trim();
      if (!q) return;
      const effectiveKind = kindArg ?? kind;

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
        });

        // Stream NDJSON if body is readable, otherwise fall back to whole-JSON parse
        if (res.body && res.body.getReader) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Keep last (possibly incomplete) chunk in buffer
            buffer = lines.pop();
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const event = JSON.parse(trimmed);
                if (event.type === 'step') {
                  setSteps((prev) => [...prev, event.label]);
                } else if (event.type === 'done') {
                  setPicks(event.picks || []);
                  setScreen('results');
                  if (event.message && !event.picks?.length) {
                    setError(event.message);
                  }
                }
              } catch {
                // Malformed line — skip
              }
            }
          }
          // Handle any remaining buffer content
          if (buffer.trim()) {
            try {
              const event = JSON.parse(buffer.trim());
              if (event.type === 'done') {
                setPicks(event.picks || []);
                setScreen('results');
                if (event.message && !event.picks?.length) {
                  setError(event.message);
                }
              }
            } catch {
              // Ignore
            }
          }
        } else {
          // Fallback: whole-JSON parse
          const data = await res.json();
          if (data.steps) setSteps(data.steps);
          setPicks(data.picks || []);
          setScreen('results');
          if (data.message && !data.picks?.length) {
            setError(data.message);
          }
        }
      } catch (err) {
        console.error('[runSearch]', err);
        setError('Something went wrong — please try again.');
        setScreen('results');
        setPicks([]);
      }
    },
    [query, kind],
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
    setScreen('idle');
    setQuery('');
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
