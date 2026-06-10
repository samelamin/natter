# Natter

Voice-driven movie & TV recommendations. Say what you're in the mood for —
Natter transcribes it, an LLM agent reasons over [TMDB](https://www.themoviedb.org/)
(and optionally web search) to find titles, and streams back recommendations
with rich detail.

Built with Next.js (App Router) and React 19.

## How it works

1. **Speak** — record a request in the browser (the listening overlay).
2. **Transcribe** — audio → text via Groq Whisper (OpenAI as a fallback).
3. **Reason** — a tool-using agent (MiniMax M2 by default) searches TMDB for
   titles and people and pulls supplementary context.
4. **Recommend** — results stream back as NDJSON into the results screen; open a
   title for full detail.

## Stack

- **Next.js 16 / React 19** — App Router, standalone output for Docker.
- **TMDB** — catalogue and metadata.
- **MiniMax M2** — the recommendation agent (OpenAI-compatible API).
- **Groq (Whisper)** — speech-to-text, with OpenAI as an optional fallback.
- **Brave Search** *(optional)* — supplementary web lookups.

## Getting started

Requires Node ≥ 20.9 (see [.nvmrc](.nvmrc)).

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `TMDB_KEY` | yes | TMDB API key (catalogue + metadata) |
| `MINIMAX_API_KEY` | yes | Recommendation agent |
| `GROQ_API_KEY` | yes\* | Speech-to-text (Whisper) |
| `OPENAI_API_KEY` | yes\* | Fallback transcription provider |
| `MINIMAX_MODEL` | no | Agent model (default `MiniMax-M2`) |
| `MINIMAX_BASE_URL` | no | Agent API base URL (default `https://api.minimax.io/v1`) |
| `BRAVE_SEARCH_API_KEY` | no | Supplementary web search |

\* At least one of `GROQ_API_KEY` / `OPENAI_API_KEY` is needed for voice input.

See [.env.example](.env.example) for the full template.

## Tests

```bash
npm test
```

## Deployment

Docker-based. See [deploy/README.md](deploy/README.md) for a self-hosting guide
(reverse proxy + optional usage dashboards via Loki/Grafana).

## License

[Apache-2.0](LICENSE).
