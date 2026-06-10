'use client';

import { useRef, useState, useCallback } from 'react';

/**
 * useRecorder — microphone recording hook.
 * Returns { micState, level, startRecording, stopRecording }
 *
 * micState: 'idle' | 'listening' | 'processing'
 * level: 0-1 RMS amplitude for waveform/mic animation
 */
export function useRecorder({ onTranscript, onError }) {
  const [micState, setMicState] = useState('idle');
  const [level, setLevel] = useState(0);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const streamRef = useRef(null);

  const stopAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setLevel(0);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Web Audio analyser for real RMS levels
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);

      // Voice-activity auto-stop: once the user has spoken, stop after a short
      // silence so they don't have to tap the mic. Thresholds are tunable.
      const SPEECH_RMS = 0.04; // above this = speaking
      const SILENCE_RMS = 0.02; // below this = silence
      const SILENCE_HOLD_MS = 1600; // stop after this much continuous silence following speech
      const GRACE_MS = 600; // ignore the very start (mic warm-up)
      const MAX_MS = 30000; // hard safety cap
      const startTime = performance.now();
      let speechStarted = false;
      let silenceSince = 0;

      const autoStop = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop(); // → onstop → transcribe
        }
      };

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 4)); // amplify a bit

        const now = performance.now();
        const elapsed = now - startTime;
        if (elapsed > GRACE_MS) {
          if (rms > SPEECH_RMS) {
            speechStarted = true;
            silenceSince = 0; // reset on any speech
          } else if (speechStarted && rms < SILENCE_RMS) {
            if (!silenceSince) silenceSince = now;
            else if (now - silenceSince > SILENCE_HOLD_MS) {
              autoStop();
              return;
            }
          }
        }
        if (elapsed > MAX_MS) {
          autoStop();
          return;
        }

        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();

      // MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopAnalyser();
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();

        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setMicState('processing');

        try {
          const formData = new FormData();
          formData.append('audio', blob, 'audio.webm');
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
          const { text } = await res.json();
          setMicState('idle');
          if (text && text.trim()) {
            onTranscript(text.trim());
          } else {
            onError && onError('Could not hear anything — please try again.');
          }
        } catch (err) {
          setMicState('idle');
          onError && onError(err.message || 'Transcription failed.');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setMicState('listening');
    } catch (err) {
      setMicState('idle');
      stopAnalyser();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        onError && onError('I need mic access — or just type it');
      } else {
        onError && onError(err.message || 'Could not access microphone.');
      }
    }
  }, [onTranscript, onError, stopAnalyser]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { micState, level, startRecording, stopRecording };
}
