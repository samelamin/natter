'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Icons } from './Icons.jsx';
import { ShareSheet } from './ShareSheet.jsx';
import { shareUrlFor } from '@/lib/share.js';
import { shareTextFor } from '@/lib/sharetext.js';

/**
 * Share affordance for a pick: native share sheet where available (mobile), else
 * copy-link with an aria-live confirmation. Renders nothing when the pick has no
 * tmdbId (so we never emit a broken "/title/film/undefined" link).
 *
 * `targets` (opt-in): on clients WITHOUT navigator.share (desktop), also render
 * explicit WhatsApp/X/Facebook/copy targets. Decided post-mount so the server
 * markup never depends on client capabilities.
 */
export function ShareButton({ item, variant = 'solid', size = 'md', round = false, onActivate, targets = false }) {
  const [copied, setCopied] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const timer = useRef(null);
  const path = shareUrlFor(item);

  useEffect(() => {
    // Must be post-mount: navigator.share is a client capability, and deciding
    // during render would desync SSR markup from the client (hydration error).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (targets && typeof navigator !== 'undefined' && !navigator.share) setShowTargets(true);
  }, [targets]);

  const share = useCallback(
    async (e) => {
      if (e) e.stopPropagation();
      if (onActivate) onActivate(e);
      if (!path) return;
      const url =
        typeof window !== 'undefined' ? new URL(path, window.location.origin).href : path;
      try {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ title: item.title, url });
          return;
        }
      } catch {
        // user dismissed the native sheet — fall through to copy
      }
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        // clipboard blocked — nothing more we can do
      }
    },
    [path, item, onActivate],
  );

  if (!path) return null;

  const button = (
    <button
      type="button"
      className={`nat-ib nat-ib--${variant} nat-ib--${size} ${round ? 'nat-ib--round' : ''}`}
      aria-label={copied ? 'Link copied' : `Share ${item.title}`}
      title={copied ? 'Link copied' : 'Share'}
      onClick={share}
    >
      {copied ? <Icons.check /> : <Icons.share />}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Link copied to clipboard' : ''}
      </span>
    </button>
  );

  if (!showTargets) return button;
  // Only reached client-side (post-mount state), so window is available.
  const absUrl = new URL(path, window.location.origin).href;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {button}
      <ShareSheet url={absUrl} text={shareTextFor(item)} />
    </span>
  );
}
