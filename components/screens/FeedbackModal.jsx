'use client';

import { useEffect, useState } from 'react';
import { Button, IconButton } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

const CATEGORIES = [
  { value: 'idea', label: 'Idea' },
  { value: 'bug', label: 'Bug' },
  { value: 'confusing', label: 'Confusing' },
  { value: 'praise', label: 'Praise' },
];

export function FeedbackModal({ onClose, onSubmitted }) {
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('idea');
  const [contact, setContact] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || state === 'sending') return;

    setState('sending');
    setError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          category,
          contact: contact.trim(),
          page: `${window.location.pathname}${window.location.search}`,
          userAgent: navigator.userAgent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send feedback');
      setState('sent');
      onSubmitted?.();
    } catch (err) {
      setError(err.message || 'Could not send feedback');
      setState('idle');
    }
  };

  return (
    <div className="modal-backdrop feedback-backdrop" onClick={onClose}>
      <div className="feedback-modal" role="dialog" aria-modal="true" aria-label="Suggest an improvement" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-modal__top">
          <div>
            <span className="eyebrow">Suggestion</span>
            <h2>Help shape Natter</h2>
          </div>
          <IconButton variant="ghost" round label="Close feedback" icon={<Icons.x />} onClick={onClose} />
        </div>

        {state === 'sent' ? (
          <div className="feedback-modal__sent">
            <span className="feedback-modal__sent-icon"><Icons.check /></span>
            <h3>Thank you</h3>
            <p>I read these regularly and fold the good ones into the queue.</p>
            <Button variant="brand" size="md" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={submit}>
            <label>
              <span>What should be better?</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={2000}
                placeholder="A feature idea, something confusing, a bug, or a thing you liked..."
                autoFocus
                required
              />
            </label>

            <div className="feedback-form__row">
              <label>
                <span>Type</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Contact (optional)</span>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  maxLength={240}
                  placeholder="email or handle"
                />
              </label>
            </div>

            {error && <div className="feedback-form__error">{error}</div>}

            <div className="feedback-form__actions">
              <Button variant="ghost" size="md" type="button" onClick={onClose}>Cancel</Button>
              <Button variant="brand" size="md" type="submit" loading={state === 'sending'} disabled={!message.trim()}>
                Send suggestion
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
