'use client';

import { useState, useEffect, useRef } from 'react';
import { Button, Tag } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';
import { PROVIDERS } from '@/lib/providers.js';

const card = {
  width: 'min(460px, 92vw)',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
  borderRadius: 18,
  padding: '28px 26px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

// ── Trakt integration section ─────────────────────────────────────────────────

function TraktSection() {
  const [status, setStatus] = useState(null); // null = loading, false = error/not configured
  const [connecting, setConnecting] = useState(false);
  const [flowData, setFlowData] = useState(null); // {device_code, user_code, verification_url, expires_in, interval}
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null); // {pushed, watchedImported, markedWatched} | 'error'
  const [connectedMsg, setConnectedMsg] = useState(false);

  const pollTimerRef = useRef(null);
  const expireTimerRef = useRef(null);

  // Fetch status on mount
  useEffect(() => {
    fetch('/api/trakt/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || data.configured === false) {
          setStatus(false); // not configured — render nothing
        } else {
          setStatus(data);
        }
      })
      .catch(() => setStatus(false));
  }, []);

  // Clear polling timers on unmount or when flow ends
  function clearTimers() {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => clearTimers();
  }, []);

  function stopFlow() {
    clearTimers();
    setFlowData(null);
    setConnecting(false);
  }

  function startPolling(flow) {
    let intervalMs = (flow.interval || 5) * 1000;

    // Stop polling when the device code expires
    expireTimerRef.current = setTimeout(() => {
      stopFlow();
    }, (flow.expires_in || 600) * 1000);

    function poll() {
      fetch('/api/trakt/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: flow.device_code }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.connected) {
            clearTimers();
            setFlowData(null);
            setConnecting(false);
            setConnectedMsg(true);
            setStatus((prev) => ({
              ...prev,
              configured: true,
              connected: true,
              traktUser: data.traktUser,
            }));
            setTimeout(() => setConnectedMsg(false), 4000);
          } else if (data.pending) {
            if (data.slowDown) {
              intervalMs += 5000; // back off on 429
            }
            pollTimerRef.current = setTimeout(poll, intervalMs);
          } else {
            // error: expired | denied | invalid
            stopFlow();
          }
        })
        .catch(() => {
          pollTimerRef.current = setTimeout(poll, intervalMs);
        });
    }

    pollTimerRef.current = setTimeout(poll, intervalMs);
  }

  async function handleConnect() {
    setConnecting(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/trakt/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.device_code) {
        setConnecting(false);
        return;
      }
      setFlowData(data);
      startPolling(data);
    } catch {
      setConnecting(false);
    }
  }

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/trakt/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSyncResult(data);
        // Update lastSync timestamp
        setStatus((prev) => ({ ...prev, lastSync: new Date().toISOString() }));
      } else {
        setSyncResult('error');
      }
    } catch {
      setSyncResult('error');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    try {
      await fetch('/api/trakt/disconnect', { method: 'POST' });
    } catch {
      // ignore
    }
    stopFlow();
    setSyncResult(null);
    setStatus((prev) => ({ ...prev, connected: false, traktUser: null }));
  }

  // Not configured or error — render nothing
  if (status === false) return null;
  // Loading
  if (status === null) return null;

  const connected = status.connected;

  return (
    <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-mid)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Integrations
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/trakt.png" alt="" width={20} height={20} style={{ borderRadius: 4 }} />
          <span style={{ fontWeight: 600, color: 'var(--text-hi)', fontSize: 'var(--text-sm)' }}>Trakt</span>
        </div>

        {connectedMsg && (
          <div style={{ color: 'var(--success-500, #22c55e)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
            Connected ✓
          </div>
        )}

        {!connected && !flowData && (
          <>
            <p style={{ margin: 0, color: 'var(--text-mid)', fontSize: 'var(--text-sm)' }}>
              Sync your watchlist to Trakt and hide things you&apos;ve already watched.
            </p>
            <Button variant="secondary" size="sm" onClick={handleConnect} loading={connecting}>
              Connect Trakt
            </Button>
          </>
        )}

        {!connected && flowData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 28,
                letterSpacing: '0.18em',
                fontWeight: 700,
                color: 'var(--text-hi)',
                textAlign: 'center',
                padding: '8px 0',
              }}
            >
              {flowData.user_code}
            </div>
            <p style={{ margin: 0, color: 'var(--text-mid)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
              Go to{' '}
              <a
                href={flowData.verification_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-500, #e8002d)' }}
              >
                trakt.tv/activate
              </a>{' '}
              and enter the code.
            </p>
            <p style={{ margin: 0, color: 'var(--text-lo)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
              Waiting for approval…
            </p>
            <button
              type="button"
              onClick={stopFlow}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-mid)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                textDecoration: 'underline',
                alignSelf: 'center',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {connected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, color: 'var(--text-mid)', fontSize: 'var(--text-sm)' }}>
              Connected as <strong style={{ color: 'var(--text-hi)' }}>{status.traktUser || 'Trakt user'}</strong>
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="secondary" size="sm" onClick={handleSync} loading={syncing} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
            {syncResult && syncResult !== 'error' && (
              <p style={{ margin: 0, color: 'var(--text-mid)', fontSize: 'var(--text-sm)' }}>
                Pushed {syncResult.pushed} · imported {syncResult.watchedImported} watched · marked {syncResult.markedWatched} watched here
              </p>
            )}
            {syncResult === 'error' && (
              <p style={{ margin: 0, color: 'var(--danger-500)', fontSize: 'var(--text-sm)' }}>
                Sync failed — try again.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function ServicesModal({ user, onClose, onSaved }) {
  const [selected, setSelected] = useState(new Set(user?.services || []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // ESC key closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    const saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = saved; };
  }, []);

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save — please try again.');
        return;
      }
      onSaved(data.user);
    } catch {
      setError('Could not save — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={card} role="dialog" aria-modal="true" aria-label="My services" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', color: 'var(--text-hi)' }}>My services</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--text-mid)', cursor: 'pointer' }}
          >
            <Icons.x />
          </button>
        </div>
        <p style={{ margin: 0, color: 'var(--text-mid)', fontSize: 'var(--text-sm)' }}>
          Pick what you can watch. Recommendations will put titles on your services first and skip
          the rest. Leave everything unticked to see it all.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PROVIDERS.map((p) => (
            <Tag key={p.key} selected={selected.has(p.key)} onClick={() => toggle(p.key)}>
              {p.label}
            </Tag>
          ))}
        </div>
        {error && <div style={{ color: 'var(--danger-500)', fontSize: 'var(--text-sm)' }}>{error}</div>}
        <Button variant="brand" size="lg" onClick={save} loading={busy}>
          Save
        </Button>
        <TraktSection />
      </div>
    </div>
  );
}
