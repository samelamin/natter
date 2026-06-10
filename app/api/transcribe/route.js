import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { logUsage } from '@/lib/usage.js';

// 10 MB cap
const MAX_BYTES = 10 * 1024 * 1024;

// Prefer Groq (free, OpenAI-compatible Whisper) when configured; otherwise OpenAI.
// Both speak the same audio.transcriptions API — only the client + model names differ.
function getTranscriber() {
  if (process.env.GROQ_API_KEY) {
    return {
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      }),
      models: ['whisper-large-v3-turbo', 'whisper-large-v3'],
    };
  }
  return {
    client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    models: ['gpt-4o-transcribe', 'whisper-1'],
  };
}

export async function POST(request) {
  const startedAt = Date.now();
  try {
    const formData = await request.formData();
    const file = formData.get('audio');

    if (!file) {
      return NextResponse.json({ error: 'audio field is required' }, { status: 422 });
    }

    // Check size
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Audio file too large (max 10 MB)' }, { status: 422 });
    }

    // Create a Blob/File with correct name for the API
    const audioFile = new File([arrayBuffer], file.name || 'audio.webm', { type: file.type || 'audio/webm' });

    const { client, models } = getTranscriber();

    let transcription;
    try {
      transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: models[0],
      });
    } catch {
      // Fallback to the provider's secondary model
      transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: models[1],
      });
    }

    // Don't log the transcribed text (it's user voice content); just the event.
    logUsage({ request, route: 'transcribe', ok: true, ms: Date.now() - startedAt });
    return NextResponse.json({ text: transcription.text });
  } catch (err) {
    console.error('[/api/transcribe]', err);
    logUsage({ request, route: 'transcribe', ok: false, ms: Date.now() - startedAt });
    return NextResponse.json({ error: err.message || 'Transcription failed' }, { status: 422 });
  }
}
