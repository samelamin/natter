'use client';

import { useState, useCallback, useRef } from 'react';
import { Icons } from './Icons.jsx';
import { shareUrlFor } from '@/lib/share.js';

/**
 * Share affordance for a pick: native share sheet where available (mobile), else
 * copy-link with an aria-live confirmation. Renders nothing when the pick has no
 * tmdbId (so we never emit a broken "/title/film/undefined" link).
 */
export function ShareButton({ item, variant = 'solid', size = 'md', round = false, onActivate }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const path = shareUrlFor(item);

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

  return (
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
}
