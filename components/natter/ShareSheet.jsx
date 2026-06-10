'use client';

import { useState, useCallback, useRef } from 'react';
import { buildTargets } from '@/lib/sharetext.js';

// ── Local SVG glyphs ──────────────────────────────────────────────────────────
// Monochrome, currentColor fill, 20×20 viewBox, consistent with Icons.jsx style.

function WhatsAppIcon(props) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M10 1C5.03 1 1 5.03 1 10c0 1.61.42 3.13 1.16 4.44L1 19l4.7-1.23A8.96 8.96 0 0 0 10 19c4.97 0 9-4.03 9-9s-4.03-9-9-9Zm4.49 12.38c-.19.53-.95 1-1.56 1.12-.41.08-.95.14-2.76-.59-2.32-.92-3.82-3.27-3.93-3.42-.11-.15-.93-1.24-.93-2.36 0-1.12.58-1.67.8-1.9.19-.21.43-.26.57-.26l.42.01c.13 0 .31-.05.49.37.19.44.65 1.58.71 1.69.06.12.1.26.02.4l-.3.45c-.08.12-.16.25-.07.48.38.76.9 1.41 1.56 1.93.38.3.79.56 1.24.77.22.1.36.09.5-.05l.53-.62c.14-.17.28-.12.47-.07l1.5.7c.22.11.37.16.42.25.06.1.06.55-.13 1.08Z" />
    </svg>
  );
}

function XIcon(props) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M15.27 2h2.6l-5.68 6.49L19 18h-5.23l-4.1-5.36L4.8 18H2.18l6.07-6.94L1 2h5.37l3.71 4.84L15.27 2ZM14.4 16.47h1.44L5.67 3.47H4.12l10.28 13Z" />
    </svg>
  );
}

function FacebookIcon(props) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M18 10c0-4.42-3.58-8-8-8S2 5.58 2 10c0 3.99 2.92 7.3 6.75 7.9v-5.59H6.72V10h2.03V8.24c0-2 1.19-3.1 3.01-3.1.87 0 1.78.15 1.78.15v1.96h-1c-.99 0-1.3.61-1.3 1.24V10h2.21l-.35 2.31H11.24v5.59C15.08 17.3 18 13.99 18 10Z" />
    </svg>
  );
}

// ── ShareSheet ────────────────────────────────────────────────────────────────

/**
 * Compact row of share controls: WhatsApp, X, Facebook, Copy link.
 *
 * Props:
 *   url      {string}    – the URL to share
 *   text     {string}    – the pre-built share text (use shareTextFor())
 *   onCopied {function}  – called after the clipboard write succeeds
 */
export function ShareSheet({ url, text, onCopied }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  const targets = buildTargets({ url: url || '', text: text || '' });

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url || '');
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
      onCopied?.();
    } catch {
      // clipboard blocked — nothing more we can do
    }
  }, [url, onCopied]);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <a
        href={targets.whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on WhatsApp"
        className="nat-ib nat-ib--solid nat-ib--md"
      >
        <WhatsAppIcon />
      </a>
      <a
        href={targets.x}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X"
        className="nat-ib nat-ib--solid nat-ib--md"
      >
        <XIcon />
      </a>
      <a
        href={targets.facebook}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Facebook"
        className="nat-ib nat-ib--solid nat-ib--md"
      >
        <FacebookIcon />
      </a>
      <button
        type="button"
        className="nat-ib nat-ib--solid nat-ib--md"
        style={{ width: 'auto', padding: '0 14px', fontSize: 'var(--text-sm)', fontWeight: 600 }}
        aria-label={copied ? 'Link copied' : 'Copy link'}
        onClick={handleCopy}
      >
        <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  );
}
