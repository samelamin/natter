/**
 * lib/agent.js — server-only ReAct agent (Reason + Act loop).
 * NEVER import from client-side code.
 */

import OpenAI from 'openai';
import { braveSearch } from './brave.js';
import {
  tmdbSearch,
  tmdbDiscover,
  tmdbPersonCredits,
  MOVIE_GENRE_IDS,
  TV_GENRE_IDS,
} from './tmdb.js';

// Agent runs on MiniMax (OpenAI-SDK compatible) to avoid OpenAI costs.
// MiniMax-M2 is an agentic model with native OpenAI-style tool calling.
// Lazily constructed so the deterministic helpers below can be imported
// (and unit-tested) without MiniMax credentials present.
let _client;
function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1',
    });
  }
  return _client;
}
const MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2';
const CURRENT_YEAR = new Date().getFullYear();

// ── Compact meta (what we feed the model) ─────────────────────────────────

/** Strip everything the model doesn't need — keep token count low. */
function toCompact(pick) {
  return {
    id: pick.id,
    title: pick.title,
    year: pick.year,
    rating: pick.rating,
    genres: pick.genres,
    type: pick.kind, // 'film' | 'tv'
    hasPoster: !!pick.poster,
  };
}

// ── Tool definitions ───────────────────────────────────────────────────────

const MOVIE_GENRE_NAMES = Object.keys(MOVIE_GENRE_IDS).filter(
  (k) => k !== 'Sci-Fi' && k !== 'Science Fiction',
).concat('Sci-Fi');

const TV_GENRE_NAMES = Object.keys(TV_GENRE_IDS).filter(
  (k) => k !== 'Sci-Fi' && k !== 'Sci-Fi & Fantasy' && k !== 'Science Fiction',
).concat('Sci-Fi');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for current information about films, shows, actors, or themes. Use this to discover candidate titles (e.g. "best Will Ferrell comedies", "movies like Interstellar") — grounded in real, current data rather than training memory.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query string.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tmdb_search',
      description:
        'Search TMDB for a specific film or TV show by title. Use after web_search identifies candidates, or to look up a concrete title directly.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['film', 'tv'],
            description: 'Content type.',
          },
          title: { type: 'string', description: 'Title to search for.' },
        },
        required: ['kind', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tmdb_discover',
      description:
        'Discover content from TMDB by genre, year range, and popularity. Use for mood/genre/era queries when you do not have specific titles in mind. Era queries (e.g. "2010s comedies") work natively — pass yearMin/yearMax.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['film', 'tv'],
            description: 'Content type.',
          },
          genre: {
            type: 'string',
            description: `Genre name. Movie genres: ${MOVIE_GENRE_NAMES.join(', ')}. TV genres: ${TV_GENRE_NAMES.join(', ')}`,
          },
          yearMin: {
            type: 'number',
            description: 'Earliest release year (inclusive).',
          },
          yearMax: {
            type: 'number',
            description: 'Latest release year (inclusive).',
          },
          originCountry: {
            type: 'string',
            description: 'ISO 3166-1 country code to filter by origin country (e.g. "GB" for UK).',
          },
          sort: {
            type: 'string',
            enum: ['popularity.desc', 'vote_average.desc', 'primary_release_date.desc'],
            description: 'Sort order (default: popularity.desc).',
          },
        },
        required: ['kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'person_credits',
      description:
        'Fetch film and TV credits for an actor or director by name from TMDB. Use when the query mentions a specific person.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Full name of the actor or director.' },
          kind: {
            type: 'string',
            enum: ['film', 'tv', 'all'],
            description: 'Limit to films, TV, or all (default: all).',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize',
      description:
        'End the loop and declare your final picks. Aim for 8–24 picks; finalize with fewer only if genuinely unavailable. Every pick must be an id returned by tmdb_search, tmdb_discover, or person_credits.',
      parameters: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            description: 'One-sentence summary of what the user wants.',
          },
          steps: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Short British sentence-case labels describing what you did (3–5). E.g. ["Searching the web for Will Ferrell comedies", "Looking up Step Brothers", "Checking runtimes"]',
          },
          exactTitles: {
            type: 'boolean',
            description:
              'Set true when the request has a SPECIFIC qualifier where padding with generic genre titles would be wrong: a named actor/director/franchise/title, OR a specific setting/theme/comparison (e.g. "comedies starring Steve Carell", "films by Nolan", "a comedy set in the UK", "movies about grief", "something like Inception"). Leave false/unset only for plain genre/mood/era queries ("a feel-good comedy", "tense thrillers", "2010s dramas").',
          },
          picks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'TMDB id (e.g. "tmdb:603") from a prior tool call.' },
                reason: { type: 'string', description: 'One sentence why this fits the request.' },
              },
              required: ['id', 'reason'],
            },
            description: 'Ordered list of recommended items (best first). Max 24.',
          },
        },
        required: ['intent', 'steps', 'picks'],
      },
    },
  },
];

// ── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Natter's recommendation agent. The user describes what they want to watch.

Your job: reason about their intent, use your tools efficiently, then finalize recommendations in 3–4 rounds total.

DETECTING QUERY TYPE:
- If the user mentions a SPECIFIC TITLE (e.g. "the matrix", "inception", "breaking bad") → immediately call tmdb_search for that exact title + 2-3 closely related sequels/films. Do NOT web_search for a specific title lookup.
- If the user mentions an ACTOR or DIRECTOR (e.g. "Will Ferrell comedies", "films by Nolan") → call person_credits first, then web_search if you need more candidates.
- If the user mentions a THEME, SETTING, or MOOD (e.g. "animation for kids", "a comedy set in the UK") → call web_search first to discover current candidates.
- If the user wants GENRE/ERA/TRENDING (e.g. "popular 2020s dramas", "latest sci-fi", "feel-good 2010s comedies") → call tmdb_discover with genre + yearMin/yearMax. Era queries work natively — do NOT use web_search for era browsing.

WORKFLOW FOR ACTOR/DIRECTOR QUERIES:
1. Call person_credits for the named person (kind matches what user wants).
2. If that returns few candidates, call web_search for more titles, then tmdb_search for each.
3. Call finalize with the relevant titles (aim for 6–10). Relevance over quantity.

WORKFLOW FOR THEME/SETTING/SPECIFIC QUERIES (named setting, theme, or "like X"):
1. Call web_search for the timeless angle (e.g. "best comedy movies set in the UK") — do NOT append the current year unless the user explicitly asked for new/latest releases. If the first search yields few titles, search again with broader phrasing (e.g. "classic British comedy films").
2. Look up at least 6–8 of the candidates with tmdb_search (max 4 per round). Do NOT finalize with only 1–2 results — gather a proper set first.
3. Call finalize with the relevant titles (aim for 6–10). Relevance over quantity — do NOT pad with generic genre discovery.

WORKFLOW FOR GENRE/ERA/MOOD QUERIES (no specific actor, setting, or franchise):
1. Make 2–3 tmdb_discover calls to build a wide pool (~40–60 titles). Use genre + yearMin/yearMax directly.
2. For era queries (e.g. "2010s comedies"), set yearMin=2010 and yearMax=2019 on tmdb_discover — this is era-accurate for BOTH films AND TV.
3. If kind is "all" (films AND TV), make discover calls for BOTH film and tv so the pool has both types.
4. Call finalize with 18–24 picks. Finalize with fewer only if genuinely unavailable.

RULES:
- Every pick in finalize MUST be an id returned by a tool call in this session (format: "tmdb:<number>").
- Respect kind: film → film only, tv → tv only, all → both films AND TV series.
- Prefer picks with hasPoster: true and higher rating.
- Aim to finalize with 18–24 picks for genre/era/mood queries; actor/franchise queries can finalize with fewer but still relevant titles.
- Finalize after round 3 at the latest.
- Only look up titles that actually exist — do not invent or speculate about unreleased films.
- Set exactTitles:true in finalize when the request has a SPECIFIC qualifier — a named person (actor/director), franchise/title, OR a specific setting/theme/comparison (e.g. "set in the UK", "about grief", "like Inception"). For these, return ONLY the relevant titles — do NOT pad with generic genre discovery.
- Set exactTitles:false ONLY for plain genre/mood/era queries ("a feel-good comedy", "tense thrillers", "2010s dramas") — for those, use 2–3 discover calls to build a wider pool.
- Respect the content type in the wording: if the user says "movie"/"film", return only films; if "show"/"series"/"sitcom"/"TV", return only series.

Current year: ${CURRENT_YEAR}
`;

// ── Dedup by normalized title ─────────────────────────────────────────────

function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/^the\s+/, '') // strip leading "the"
    .replace(/[^a-z0-9]/g, '') // strip non-alphanumeric
    .trim();
}

/**
 * Dedupe picks by id, preferring entries with poster and higher rating.
 */
function dedupeById(picks) {
  const seen = new Map();
  for (const p of picks) {
    const existing = seen.get(p.id);
    if (!existing) {
      seen.set(p.id, p);
    } else {
      const newScore = (p.poster ? 100 : 0) + (p.rating || 0);
      const exScore = (existing.poster ? 100 : 0) + (existing.rating || 0);
      if (newScore > exScore) seen.set(p.id, p);
    }
  }
  return Array.from(seen.values());
}

/**
 * Dedupe picks by normalized title (collapses "Old School" duplicates etc.)
 * Prefers entry with poster, then higher rating, then higher vote_count.
 */
function dedupeByTitle(picks) {
  // First dedupe by id
  const byId = dedupeById(picks);

  // Then dedupe by normalized title
  const seen = new Map();
  for (const p of byId) {
    const key = normalizeTitle(p.title);
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, p);
    } else {
      const newScore =
        (p.poster ? 1000 : 0) + (p.rating || 0) * 10 + (p._vote_count || 0) / 1000;
      const exScore =
        (existing.poster ? 1000 : 0) +
        (existing.rating || 0) * 10 +
        (existing._vote_count || 0) / 1000;
      if (newScore > exScore) seen.set(key, p);
    }
  }
  return Array.from(seen.values());
}

// ── Post-filter helpers ────────────────────────────────────────────────────

/** Parse a runtime string like "2h 16m" or "52m" into minutes. Returns null if unparseable. */
function runtimeMinutes(rt) {
  if (!rt) return null;
  const s = String(rt);
  const hm = s.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/);
  if (!hm) return null;
  const h = parseInt(hm[1] || 0);
  const m = parseInt(hm[2] || 0);
  const total = h * 60 + m;
  return total > 0 ? total : null;
}

/**
 * Alias-aware genre match. TMDB display names differ across media —
 * film 878 → "Sci-Fi", tv 10765 → "Sci-Fi & Fantasy" — so plain equality
 * misses. Substring-match both directions catches the whole family.
 */
function pickMatchesGenre(pick, genre) {
  if (!genre) return true;
  const rg = genre.toLowerCase();
  return (pick.genres || []).some((g) => {
    const pg = g.toLowerCase();
    return pg.includes(rg) || rg.includes(pg);
  });
}

/**
 * Comparator factory: titles matching any boost genre sort first, then by
 * rating, then vote_count. With no boosts it degrades to pure rating order.
 */
function byScore(boostGenres = []) {
  const boosted = (p) => boostGenres.some((g) => pickMatchesGenre(p, g));
  return (a, b) => {
    const d = (boosted(b) ? 1 : 0) - (boosted(a) ? 1 : 0);
    if (d !== 0) return d;
    const r = (b.rating || 0) - (a.rating || 0);
    if (r !== 0) return r;
    return (b._vote_count || 0) - (a._vote_count || 0);
  };
}

export function applyFilters(picks, kind, constraints) {
  let out = picks;

  // Kind filter
  if (kind === 'film') out = out.filter((p) => p.kind === 'film');
  else if (kind === 'tv') out = out.filter((p) => p.kind === 'tv');

  // Runtime constraint
  if (constraints.runtimeMaxMin != null) {
    out = out.filter((p) => {
      const mins = runtimeMinutes(p.runtime);
      return mins == null || mins <= constraints.runtimeMaxMin;
    });
  }

  // Year constraints
  if (constraints.yearMin != null) {
    out = out.filter((p) => p.year == null || p.year >= constraints.yearMin);
  }
  if (constraints.yearMax != null) {
    out = out.filter((p) => p.year == null || p.year <= constraints.yearMax);
  }

  // Genre constraint — hard-require only the PRIMARY genre (first parsed).
  // Secondary genres are ranking boosts, not filters: a "sci-fi thriller"
  // must still surface sci-fi TV, which has no "Thriller" genre in TMDB.
  if (constraints.requireGenres && constraints.requireGenres.length > 0) {
    const primary = constraints.requireGenres[0];
    out = out.filter((p) => pickMatchesGenre(p, primary));
  }

  return out;
}

// ── Constraints extractor ─────────────────────────────────────────────────

export function extractConstraints(query) {
  const constraints = {};
  const q = query.toLowerCase();

  // Runtime: "under 2 hours", "less than 90 min"
  const runtimeHours = q.match(/under\s+(\d+)\s*h(?:our|r)?s?/i);
  if (runtimeHours) {
    constraints.runtimeMaxMin = parseInt(runtimeHours[1]) * 60;
  }
  const rtMinutes = q.match(/(?:less than|under|max|maximum)\s+(\d{2,3})\s*(?:min|minutes?)/i);
  if (rtMinutes && !constraints.runtimeMaxMin) {
    constraints.runtimeMaxMin = parseInt(rtMinutes[1]);
  }

  // Year: "past N years", "last N years"
  const pastYears = q.match(/past\s+(\d+)\s+years?/i) || q.match(/last\s+(\d+)\s+years?/i);
  if (pastYears) {
    constraints.yearMin = CURRENT_YEAR - parseInt(pastYears[1]);
  }

  // Decade: "past/last decade", "the 2010s", "1990s", "the 80s", "nineties"
  if (/\b(?:past|last)\s+decade\b/.test(q)) {
    if (constraints.yearMin == null) constraints.yearMin = CURRENT_YEAR - 10;
  } else {
    let decadeStart = null;
    const four = q.match(/\b((?:19|20)\d0)s\b/); // 2010s, 1990s
    const two = q.match(/(?:^|\s|')(\d0)s\b/); // 90s, '80s, 10s
    const words = { sixties: 1960, seventies: 1970, eighties: 1980, nineties: 1990 };
    if (four) {
      decadeStart = parseInt(four[1], 10);
    } else if (two) {
      const d = parseInt(two[1], 10); // 00..90
      decadeStart = d >= 30 ? 1900 + d : 2000 + d; // 30s–90s → 19xx; 00s/10s/20s → 20xx
    } else {
      for (const [w, y] of Object.entries(words)) {
        if (q.includes(w)) {
          decadeStart = y;
          break;
        }
      }
    }
    if (decadeStart) {
      constraints.yearMin = decadeStart;
      constraints.yearMax = decadeStart + 9;
    }
  }

  // Genre mapping — order matters: more-specific checks first
  const genreMap = [
    // Must be before 'science fiction' check
    { terms: ['sci-fi', 'scifi', 'science fiction'], genre: 'Sci-Fi' },
    { terms: ['animat'], genre: 'Animation' },
    { terms: ['romcom', 'romantic comedy', 'rom-com'], genre: 'Romance' },
    { terms: ['thriller'], genre: 'Thriller' },
    { terms: ['horror'], genre: 'Horror' },
    { terms: ['comedy', 'comedies'], genre: 'Comedy' },
    { terms: ['drama', 'dramas'], genre: 'Drama' },
    { terms: ['action'], genre: 'Action' },
    { terms: ['crime'], genre: 'Crime' },
    { terms: ['fantasy'], genre: 'Fantasy' },
    { terms: ['documentary', 'documentaries'], genre: 'Documentary' },
    { terms: ['romance', 'romantic'], genre: 'Romance' },
    { terms: ['family'], genre: 'Family' },
  ];

  for (const { terms, genre } of genreMap) {
    if (terms.some((t) => q.includes(t))) {
      if (!constraints.requireGenres) {
        constraints.requireGenres = [genre];
      } else if (!constraints.requireGenres.includes(genre)) {
        constraints.requireGenres.push(genre);
      }
    }
  }

  return constraints;
}

// ── Ranking + badge assignment ─────────────────────────────────────────────

/**
 * Compute a match % from rank position and rating.
 * Top pick → ~95%, descending by ~2 pts per rank, then clamped 60–99.
 * Rating contributes a small bonus so higher-rated items score a touch higher.
 */
function computeMatch(rank, rating) {
  const base = 95 - rank * 2;
  const ratingBonus = rating ? (rating - 7) * 0.5 : 0;
  return Math.round(Math.min(99, Math.max(60, base + ratingBonus)));
}

export function rankAndBadge(picks, maxPicks = 24, boostGenres = []) {
  const sorted = [...picks].sort(byScore(boostGenres));

  return sorted.slice(0, maxPicks).map((p, i) => {
    const badge =
      i === 0 && (p.rating || 0) >= 7.5
        ? { label: 'Top pick', variant: 'gold' }
        : p.year === CURRENT_YEAR
          ? { label: 'New', variant: 'solid' }
          : undefined;
    const { _vote_count: _, ...rest } = p;
    const match = computeMatch(i, p.rating);
    return badge ? { ...rest, badge, match } : { ...rest, match };
  });
}

// ── Fallback ───────────────────────────────────────────────────────────────

async function fallbackSearch(query, kind) {
  console.log('[agent] using fallback search');
  const constraints = extractConstraints(query);
  const genre = constraints.requireGenres?.[0];

  const fetches = [];
  if (kind !== 'tv') {
    fetches.push(
      tmdbDiscover({
        kind: 'film',
        genre,
        yearMin: constraints.yearMin,
        yearMax: constraints.yearMax,
        limit: 20,
      }),
    );
  }
  if (kind !== 'film') {
    fetches.push(
      tmdbDiscover({
        kind: 'tv',
        genre,
        yearMin: constraints.yearMin,
        yearMax: constraints.yearMax,
        limit: 20,
      }),
    );
  }

  const results = await Promise.allSettled(fetches);
  let all = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  const deduped = dedupeByTitle(all);
  return {
    intent: query,
    steps: ['Reading your request', 'Searching for matches', 'Putting picks in order'],
    picks: rankAndBadge(deduped),
  };
}

// ── Main ReAct loop ────────────────────────────────────────────────────────

// Broader: any SPECIFIC qualifier (named person, setting, theme, or comparison) where
// padding with generic genre titles would be wrong. Superset of PERSON_QUERY_RE.
const SPECIFIC_QUERY_RE =
  /\b(starring|featuring|with|directed by)\s+[A-Z][a-z]+|\b(set in|based on|about|like|similar to|in the style of)\b/i;

// Derive content type from the query wording ("comedy movie" → film, "sitcom" → tv).
// Returns the explicit type when the query names one, else the caller's fallback (the toggle).
function kindFromQuery(query, fallback = 'all') {
  const q = (query || '').toLowerCase();
  const film = /\b(movie|movies|film|films|feature)\b/.test(q);
  const tv = /\b(tv|telly|television|show|shows|series|sitcom|sitcoms|mini-?series|episode|episodes)\b/.test(q);
  if (film && !tv) return 'film';
  if (tv && !film) return 'tv';
  return fallback;
}

/**
 * recommend({ query, kind, onStep }) → { intent, steps, picks }
 * onStep(label) is called as each tool action starts (for streaming).
 */
export async function recommend({ query, kind: kindArg = 'all', onStep }) {
  const constraints = extractConstraints(query);
  // Secondary genres (e.g. "thriller" in "sci-fi thriller") rank-boost, not filter.
  const boostGenres = (constraints.requireGenres || []).slice(1);
  // The query wording overrides the toggle: "comedy movie" → films only, "sitcom" → TV only.
  const kind = kindFromQuery(query, kindArg);
  const kindHint =
    kind === 'film' ? 'film (movie type only)' : kind === 'tv' ? 'TV series only' : 'both films and TV';

  // Per-request cache — scoped here to avoid cross-request pollution
  const metaCache = new Map();

  function cachePick(pick) {
    metaCache.set(pick.id, pick);
  }
  function cacheAll(arr) {
    for (const p of arr) cachePick(p);
  }

  // Tool executor (closes over metaCache)
  async function executeTool(name, args) {
    console.log(`[agent] tool call: ${name}`, JSON.stringify(args));

    if (name === 'web_search') {
      if (onStep) onStep(`Searching the web for "${args.query}"`);
      const results = await braveSearch(args.query, 8);
      return JSON.stringify(results);
    }

    if (name === 'tmdb_search') {
      if (onStep) onStep(`Looking up ${args.title}`);
      const picks = await tmdbSearch({ title: args.title, kind: args.kind || 'film', limit: 8 });
      cacheAll(picks);
      return JSON.stringify(picks.map(toCompact));
    }

    if (name === 'tmdb_discover') {
      const label = [
        args.genre,
        args.kind === 'tv' ? 'shows' : 'films',
        args.yearMin && args.yearMax ? `(${args.yearMin}–${args.yearMax})` : args.yearMin ? `(from ${args.yearMin})` : args.yearMax ? `(up to ${args.yearMax})` : '',
        args.originCountry ? `from ${args.originCountry}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (onStep) onStep(`Discovering ${label || (args.kind === 'tv' ? 'shows' : 'films')}`);
      const picks = await tmdbDiscover({
        kind: args.kind || 'film',
        genre: args.genre,
        yearMin: args.yearMin,
        yearMax: args.yearMax,
        sort: args.sort,
        originCountry: args.originCountry,
        limit: 20,
      });
      cacheAll(picks);
      return JSON.stringify(picks.map(toCompact));
    }

    if (name === 'person_credits') {
      if (onStep) onStep(`Looking up ${args.name}'s credits`);
      const picks = await tmdbPersonCredits({
        name: args.name,
        kind: args.kind || 'all',
        limit: 20,
      });
      cacheAll(picks);
      return JSON.stringify(picks.map(toCompact));
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Find recommendations for: "${query}"\nKind: ${kindHint}`,
    },
  ];

  let finalizeResult = null;
  const MAX_ITERATIONS = 8;

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const response = await getClient().chat.completions.create({
        model: MODEL,
        tools: TOOLS,
        tool_choice: 'auto',
        messages,
        temperature: 0.3,
      });

      const msg = response.choices[0].message;
      messages.push(msg);

      // No tool calls → model gave a text response; treat as end
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        console.log('[agent] no tool calls, stopping loop');
        break;
      }

      // Check if finalize is among the calls
      const finalizeCall = msg.tool_calls.find((tc) => tc.function.name === 'finalize');

      // Execute non-finalize tools; cap tmdb_search at 4 per round
      const MAX_SEARCH_PER_ROUND = 4;
      let searchCallCount = 0;
      const otherCalls = msg.tool_calls
        .filter((tc) => tc.function.name !== 'finalize')
        .filter((tc) => {
          if (tc.function.name === 'tmdb_search') {
            if (searchCallCount >= MAX_SEARCH_PER_ROUND) {
              console.log('[agent] capping tmdb_search, skipping', tc.function.arguments);
              return false;
            }
            searchCallCount++;
          }
          return true;
        });

      const toolResults = await Promise.all(
        otherCalls.map(async (tc) => {
          const args = JSON.parse(tc.function.arguments);
          const result = await executeTool(tc.function.name, args);
          return { id: tc.id, result };
        }),
      );

      // Append tool results to messages
      for (const { id, result } of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: id,
          content: result,
        });
      }

      // Handle finalize
      if (finalizeCall) {
        if (onStep) onStep('Putting picks in order');
        const args = JSON.parse(finalizeCall.function.arguments);
        console.log('[agent] finalize called with', args.picks?.length, 'picks, exactTitles:', args.exactTitles);
        messages.push({
          role: 'tool',
          tool_call_id: finalizeCall.id,
          content: JSON.stringify({ ok: true }),
        });
        finalizeResult = args;
        break;
      }
    }

    // If no finalize, synthesize from what's cached
    if (!finalizeResult) {
      console.log('[agent] no finalize — synthesizing from cache');
      const cachedIds = Array.from(metaCache.keys());
      if (cachedIds.length === 0) {
        return await fallbackSearch(query, kind);
      }
      finalizeResult = {
        intent: query,
        steps: ['Reading your request', 'Searching for titles', 'Comparing results', 'Putting picks in order'],
        picks: cachedIds.slice(0, 40).map((id) => ({ id, reason: 'Matches your request.' })),
      };
    }

    // Detect exactTitles: from agent flag OR server-side regex fallback
    const isExactTitles = !!(finalizeResult.exactTitles || SPECIFIC_QUERY_RE.test(query));

    // Resolve picks from cache
    const { intent, steps, picks: rawPicks } = finalizeResult;

    let resolvedPicks = [];
    for (const { id, reason } of rawPicks) {
      let meta = metaCache.get(id);

      // Try to recover if not cached — try a tmdb_search by the id itself as a title
      if (!meta) {
        console.log(`[agent] id ${id} not in cache, attempting recovery`);
        const recovered = await tmdbSearch({ title: id, kind: 'film', limit: 3 });
        if (recovered.length > 0) {
          meta = recovered[0];
          cachePick(meta);
        }
      }

      if (meta) {
        resolvedPicks.push({ ...meta, reason });
      }
    }

    // Dedupe by title (handles "Old School" duplicates etc.)
    resolvedPicks = dedupeByTitle(resolvedPicks);

    // Apply hard constraints (runtime, year, genre) extracted from query
    let filtered = applyFilters(resolvedPicks, kind, constraints);

    // Per-type fill: bring EACH requested type (films / TV) up to a healthy depth so the
    // Films/TV toggle is balanced — "TV just as good as movies". Only deficient types get
    // topped up. Skipped for exactTitles (actor/franchise), where genre padding is wrong.
    if (!isExactTitles && constraints.requireGenres && constraints.requireGenres.length > 0) {
      const types = kind === 'tv' ? ['tv'] : kind === 'film' ? ['film'] : ['film', 'tv'];
      const PER_TYPE_TARGET = kind === 'all' ? 18 : 22;
      // Top up by the PRIMARY genre only — the secondary (e.g. "Thriller") has no
      // TV taxonomy entry, so discovering by it just pulls generic popular TV that
      // the primary filter then discards. Thriller-ness is applied later as a boost.
      const primaryGenre = constraints.requireGenres[0];

      for (const t of types) {
        const have = filtered.filter((p) => p.kind === t).length;
        if (have >= PER_TYPE_TARGET) continue; // already deep enough

        if (onStep) onStep(`Finding ${t === 'tv' ? 'shows' : 'films'} — ${primaryGenre}`);
        const more = await tmdbDiscover({
          kind: t,
          genre: primaryGenre,
          yearMin: constraints.yearMin,
          yearMax: constraints.yearMax,
          limit: 30,
        });
        cacheAll(more);
        filtered = dedupeByTitle([...filtered, ...applyFilters(more, kind, constraints)]);
        console.log(
          `[agent] per-type fill ${t}: had ${have}, now ${filtered.filter((p) => p.kind === t).length}`,
        );
      }
    }

    // Relax if too few results — but NOT for exactTitles (return honest empty instead of padding)
    if (!isExactTitles && filtered.length < 3 && Object.keys(constraints).length > 0) {
      console.log('[agent] relaxing constraints, got only', filtered.length);
      filtered = applyFilters(resolvedPicks, kind, {});
    }

    // Fallback if still empty — but NOT for exactTitles (honest empty state, not generic padding)
    if (filtered.length === 0 && !isExactTitles) {
      return await fallbackSearch(query, kind);
    }

    // Balance the final set for "Everything" so ranking doesn't re-skew to films:
    // keep the top ~20 of each type, then rankAndBadge interleaves by rating.
    let finalPicks = filtered;
    if (kind === 'all') {
      const score = byScore(boostGenres);
      const films = filtered.filter((p) => p.kind === 'film').sort(score).slice(0, 20);
      const tv = filtered.filter((p) => p.kind === 'tv').sort(score).slice(0, 20);
      finalPicks = [...films, ...tv];
    }
    const rankedPicks = rankAndBadge(finalPicks, kind === 'all' ? 40 : 24, boostGenres);

    return { intent, steps, picks: rankedPicks };
  } catch (err) {
    console.error('[agent] loop error:', err.message);
    return await fallbackSearch(query, kind);
  }
}
