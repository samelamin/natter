# Natter

Voice-driven recommendations for **films, TV, books, games, and recipes**. Say
what you're in the mood for — Natter transcribes it, an LLM agent reasons over
the right catalogue for the domain, and streams back recommendations with rich
detail. Pick a domain in the top bar, or just speak ("recommend a cosy mystery
novel", "something to cook for dinner") and Natter routes to the right one.

Built with Next.js (App Router) and React 19.

## How it works

1. **Speak** — record a request in the browser (the listening overlay).
2. **Transcribe** — audio → text via Groq Whisper (OpenAI as a fallback).
3. **Reason** — a tool-using agent (MiniMax M2 by default) searches TMDB for
   titles and people and pulls supplementary context.
4. **Recommend** — results stream back as NDJSON into the results screen; open a
   title for full detail.

## Domains

One voice flow, five content types. Each domain has its own data source, accent,
and detail layout; the same transcribe → reason → stream pipeline drives them all.

| Domain | Source | Key |
| --- | --- | --- |
| Films & TV | [TMDB](https://www.themoviedb.org/) | required (`TMDB_KEY`) |
| Books | [Google Books](https://developers.google.com/books) | optional (keyless works) |
| Games | [IGDB](https://api-docs.igdb.com/) (Twitch) | free Client ID + Secret (falls back to LLM-listed titles) |
| Recipes | [TheMealDB](https://www.themealdb.com/api.php) | keyless (`THEMEALDB_KEY=1`) |

Films & TV keep the full feature set (watchlist, streaming-provider availability,
Trakt sync, Stremio addon). Books / games / recipes support voice search, results,
rich detail, search history, and sharing; watchlist save is films/TV-only for now.

## Stack

- **Next.js 16 / React 19** — App Router, standalone output for Docker.
- **TMDB / Google Books / IGDB / TheMealDB** — per-domain catalogues via a
  pluggable provider interface (`lib/providers/`).
- **MiniMax M2** — the recommendation agent (OpenAI-compatible API).
- **Groq (Whisper)** — speech-to-text, with OpenAI as an optional fallback.
- **Brave Search** *(optional)* — supplementary web lookups + game fallback.

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
| `BRAVE_SEARCH_API_KEY` | no | Supplementary web search + game fallback |
| `GOOGLE_BOOKS_API_KEY` | no | Books — keyless works; key raises quota |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | no | Games — IGDB (Twitch); LLM-titles fallback without them |
| `THEMEALDB_KEY` | no | Recipes — defaults to the free test key `1` |
| `REDIS_URL` | no | L2 cache for searches + provider responses |

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
