'use client';

import { Badge, Waveform, MicButton } from '@/components/natter/index.jsx';

export function ListeningOverlay({ onStop, level, status }) {
  // status: 'listening' | 'transcribing'
  const isTranscribing = status === 'transcribing';

  return (
    <div className="overlay">
      <Badge variant="live" dot>
        {isTranscribing ? 'Got it' : 'Now listening'}
      </Badge>
      <Waveform active={!isTranscribing} bars={13} color="signal" height={56} />
      <div className="overlay__transcript">
        {isTranscribing ? 'Transcribing…' : 'Listening…'}
        <span className="caret">{isTranscribing ? '' : ''}</span>
      </div>
      <MicButton
        state={isTranscribing ? 'processing' : 'listening'}
        size="xl"
        level={level}
        onClick={onStop}
      />
      <div className="overlay__hint">
        {isTranscribing ? 'One moment…' : 'Just stop talking when you\'re done — or tap the mic'}
      </div>
    </div>
  );
}
