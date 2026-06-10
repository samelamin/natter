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
  tmdbWatchProviders,
  MOVIE_GENRE_IDS,
  TV_GENRE_IDS,
} from './tmdb.js';
import { providersFromQuery, providerByKey, PROVIDERS } from './providers.js';

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
          originalLanguage: {
            type: 'string',
            description:
              'ISO 639-1 code — return only content ORIGINALLY made in this language (e.g. "ar" Arabic, "fr" French, "ko" Korean). Set this when the query is written in a non-English language or asks for a specific cinema (e.g. "Bollywood" → "hi").',
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
        'End the loop and declare your final picks. Return 8-12 picks, ordered best-first, each with a one-sentence reason. Depth is added automatically afterwards — quality of the head matters, not quantity. Every pick must be an id returned by tmdb_search, tmdb_discover, or person_credits.',
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
            // Accept up to 24; the description guides the model toward 8–12.
            description: 'Ordered list of recommended items (best first). Aim for 8–12; max 24.',
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
4. Call finalize with 8–12 picks. Depth is added automatically afterwards — quality of the head matters, not quantity.

RULES:
- Every pick in finalize MUST be an id returned by a tool call in this session (format: "tmdb:<number>").
- Respect kind: film → film only, tv → tv only, all → both films AND TV series.
- Prefer picks with hasPoster: true and higher rating.
- Aim to finalize with 8–12 picks — the pipeline fills the rest automatically.
- Finalize after round 3 at the latest.
- Only look up titles that actually exist — do not invent or speculate about unreleased films.
- Set exactTitles:true in finalize when the request has a SPECIFIC qualifier — a named person (actor/director), franchise/title, OR a specific setting/theme/comparison (e.g. "set in the UK", "about grief", "like Inception"). For these, return ONLY the relevant titles — do NOT pad with generic genre discovery.
- Set exactTitles:false ONLY for plain genre/mood/era queries ("a feel-good comedy", "tense thrillers", "2010s dramas") — for those, use 2–3 discover calls to build a wider pool.
- Content type: follow the Kind field above — it already reflects the wording. When Kind names a single type ("film (movie type only)" / "TV series only"), return ONLY that type. When Kind says to include BOTH, return strong films AND TV series even if the user wrote "film" or "show" — they want options in both tabs.
- LOCALE: queries can arrive in any language. A non-English query means the user wants content ORIGINALLY in that language — pass originalLanguage (ISO 639-1) to tmdb_discover and look up titles from that language's films/TV. The same applies to wording like "French films" or "Bollywood". Exception: if the query names a foreign-language title to compare against (e.g. an Arabic query asking for something like an English-language show), match the comparison title's language instead.

Current year: ${CURRENT_YEAR}
`;

// ── Dedup by normalized title ─────────────────────────────────────────────

function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/^the\s+/, '') // strip leading "the"
    // Strip punctuation/whitespace but keep letters and digits in ANY script —
    // [^a-z0-9] reduced Arabic/CJK/Cyrillic titles to '' and dedupe dropped them.
    .replace(/[^\p{L}\p{N}]/gu, '')
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
 * Exported for unit tests.
 */
export function dedupeByTitle(picks) {
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
 * Comparator factory with a 3-tier sort: boost-genre matches first, demote-genre
 * matches last, everything else in the middle — then rating, then vote_count.
 * A title that is both boosted and demoted nets to neutral. Empty lists degrade
 * to pure rating order.
 */
function byScore(boostGenres = [], demoteGenres = []) {
  const tier = (p) =>
    (boostGenres.some((g) => pickMatchesGenre(p, g)) ? 1 : 0) -
    (demoteGenres.some((g) => pickMatchesGenre(p, g)) ? 1 : 0);
  return (a, b) => {
    const t = tier(b) - tier(a);
    if (t !== 0) return t;
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

  // Genre mapping — order matters: more-specific checks first. Arabic terms
  // sit alongside English so the deterministic gate (and the per-type fill it
  // drives) works for Arabic queries too; other languages rely on the LLM.
  const genreMap = [
    // Must be before 'science fiction' check. Spoken/transcribed queries
    // rarely hyphenate, so the spaced forms matter for a voice-first app.
    { terms: ['sci-fi', 'scifi', 'sci fi', 'science fiction', 'خيال علمي'], genre: 'Sci-Fi' },
    { terms: ['animat', 'انمي', 'أنمي', 'كرتون', 'رسوم متحركة'], genre: 'Animation' },
    { terms: ['romcom', 'romantic comedy', 'rom-com', 'rom com'], genre: 'Romance' },
    { terms: ['thriller', 'إثارة', 'اثارة', 'تشويق'], genre: 'Thriller' },
    { terms: ['horror', 'رعب'], genre: 'Horror' },
    { terms: ['comedy', 'comedies', 'كوميدي'], genre: 'Comedy' },
    { terms: ['drama', 'dramas', 'دراما'], genre: 'Drama' },
    { terms: ['action', 'أكشن', 'اكشن'], genre: 'Action' },
    { terms: ['crime', 'جريمة'], genre: 'Crime' },
    { terms: ['fantasy', 'فانتازيا'], genre: 'Fantasy' },
    { terms: ['documentary', 'documentaries', 'وثائقي'], genre: 'Documentary' },
    { terms: ['romance', 'romantic', 'رومانسي'], genre: 'Romance' },
    { terms: ['family', 'عائلي'], genre: 'Family' },
  ];

  // Left word-boundary match: plain includes() would find "rom com" inside
  // "from comedy". Terms stay prefix-style on the right ('animat' → animated).
  const matchesTerm = (t) =>
    new RegExp(`(?:^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(q);

  for (const { terms, genre } of genreMap) {
    if (terms.some(matchesTerm)) {
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

/**
 * Genres to down-rank for a query. Sci-fi TV ("Sci-Fi & Fantasy") is heavy with
 * popular animation/anime, which buries live-action picks; demote Animation by
 * default so tense live-action surfaces first — unless the user asked for it.
 */
export function demoteGenresFor(query) {
  const q = query || '';
  // \b doesn't work around Arabic letters (they're not \w) — separate test.
  const asksForAnimation =
    /\b(animat\w*|anime|cartoon)\b/i.test(q) || /انمي|أنمي|كرتون|رسوم متحركة/.test(q);
  return asksForAnimation ? [] : ['Animation'];
}

export function rankAndBadge(picks, maxPicks = 24, boostGenres = [], demoteGenres = []) {
  const sorted = [...picks].sort(byScore(boostGenres, demoteGenres));

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

// ── Streaming availability ─────────────────────────────────────────────────

/**
 * Attach GB availability to picks: which of the asked-for providers carry each
 * title (subscription/free/ads tiers). Sets on/onLogo to the first match so
 * cards show where to watch. Batched to stay polite to TMDB; responses cache.
 */
async function annotateAvailability(picks, providers) {
  const wanted = new Map(providers.map((p) => [p.tmdbId, p.label]));
  const out = [];
  const BATCH = 12;
  for (let i = 0; i < picks.length; i += BATCH) {
    const batch = await Promise.all(
      picks.slice(i, i + BATCH).map(async (p) => {
        const offers = await tmdbWatchProviders({ tmdbId: p.tmdbId, kind: p.kind });
        const mine = offers.filter((o) => wanted.has(o.id));
        const first = mine[0] || null;
        return {
          ...p,
          available: mine.length > 0,
          providersOn: mine.map((o) => wanted.get(o.id)),
          on: first ? wanted.get(first.id) : (p.on ?? null),
          onLogo: first ? first.logo : (p.onLogo ?? null),
        };
      }),
    );
    out.push(...batch);
  }
  return out;
}

// ── Fallback ───────────────────────────────────────────────────────────────

async function fallbackSearch(query, kind) {
  console.log('[agent] using fallback search');
  const constraints = extractConstraints(query);
  const genre = constraints.requireGenres?.[0];
  // Same relevance shaping as the main path: secondary genres boost the
  // ranking, animation is demoted (and excluded from the TV pool) unless asked for.
  const boostGenres = (constraints.requireGenres || []).slice(1);
  const demoteGenres = demoteGenresFor(query);
  const tvExclude = demoteGenres.map((g) => TV_GENRE_IDS[g]).filter(Boolean);
  // Non-English query → originally-that-language content, localized metadata.
  const lang = languageFromQuery(query);

  const fetches = [];
  if (kind !== 'tv') {
    fetches.push(
      tmdbDiscover({
        kind: 'film',
        genre,
        yearMin: constraints.yearMin,
        yearMax: constraints.yearMax,
        originalLanguage: lang,
        language: lang,
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
        withoutGenres: tvExclude,
        originalLanguage: lang,
        language: lang,
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
  let picks = rankAndBadge(deduped, 24, boostGenres, demoteGenres);
  if (lang) picks = picks.map((p) => ({ ...p, lang }));
  return {
    intent: query,
    steps: ['Reading your request', 'Searching for matches', 'Putting picks in order'],
    picks,
    lang,
  };
}

// ── Main ReAct loop ────────────────────────────────────────────────────────

// Co-viewing companions — "watch with my mum / the kids / friends" names WHO
// you're watching with, not an actor, so it must NOT read as a specific
// named-person query. Excluded from the "with <Name>" branch below. (The /i
// flag deliberately makes the [A-Z][a-z]+ name matcher case-insensitive so
// lowercase voice transcripts like "starring tom hanks" still match — which is
// also why a plain "with <word>" over-matched these before this guard.)
const CO_VIEWING =
  'my|your|our|the|a|his|her|their|some|me|him|it|us|them|' +
  'friends?|family|mates?|kids?|mum|mom|dad|parents?|partner|wife|husband|' +
  'girlfriend|boyfriend|gf|bf|grandma|grandpa|nan';

// Broader: any SPECIFIC qualifier (named person, setting, theme, or comparison) where
// padding with generic genre titles would be wrong. Superset of PERSON_QUERY_RE.
// Exported for unit testing.
export const SPECIFIC_QUERY_RE = new RegExp(
  '\\b(?:starring|featuring|directed by)\\s+[A-Z][a-z]+' + // unambiguous credit markers
    `|\\bwith\\s+(?!(?:${CO_VIEWING})\\b)[A-Z][a-z]+` + // "with <Actor>", not co-viewing
    '|\\b(?:set in|based on|about|like|similar to|in the style of)\\b', // setting/theme/comparison
  'i',
);

// Detect the query's language from its Unicode script — deterministic and
// dependency-free, but only for non-Latin scripts. Latin-script languages
// (French, Spanish…) return null; the LLM covers those via the
// originalLanguage tool param. Kana is checked before Han so Japanese text
// (which mixes both) isn't read as Chinese.
const SCRIPT_LANGS = [
  [/[؀-ۿݐ-ݿ]/, 'ar', 'Arabic'],
  [/[֐-׿]/, 'he', 'Hebrew'],
  [/[Ѐ-ӿ]/, 'ru', 'Russian'],
  [/[぀-ヿ]/, 'ja', 'Japanese'],
  [/[가-힯]/, 'ko', 'Korean'],
  [/[一-鿿]/, 'zh', 'Chinese'],
  [/[฀-๿]/, 'th', 'Thai'],
  [/[ऀ-ॿ]/, 'hi', 'Hindi'],
  [/[Ͱ-Ͽ]/, 'el', 'Greek'],
];

export function languageFromQuery(query) {
  for (const [re, lang] of SCRIPT_LANGS) {
    if (re.test(query || '')) return lang;
  }
  return null;
}

function languageName(code) {
  const hit = SCRIPT_LANGS.find(([, lang]) => lang === code);
  return hit ? hit[2] : code;
}

// Derive content type from the query wording ("comedy movie" → film, "sitcom" → tv).
// Returns the explicit type when the query names one, else the caller's fallback (the toggle).
function kindFromQuery(query, fallback = 'all') {
  const q = (query || '').toLowerCase();
  // Arabic words tested separately — \b has no effect next to Arabic letters.
  const film = /\b(movie|movies|film|films|feature)\b/.test(q) || /فيلم|أفلام|افلام/.test(q);
  const tv =
    /\b(tv|telly|television|show|shows|series|sitcom|sitcoms|mini-?series|episode|episodes)\b/.test(q) ||
    /مسلسل|مسلسلات/.test(q);
  if (film && !tv) return 'film';
  if (tv && !film) return 'tv';
  return fallback;
}

// Which TYPES to fetch — usually the same as the landing tab (requestedKind),
// but broadened to 'all' for a genre-less "vibe" query that merely *mentions* a
// type ("a film to watch with my mum"): the wording still picks the tab the user
// lands on, it just shouldn't leave the other tab a dead end. Genre/era queries
// keep the focused fetch (the per-type fill already stocks their other tab by
// genre); specific queries (actor/title/"like X") stay focused too. An explicit
// toggle (kindArg) with no type word in the query is respected, not broadened.
// Exported for unit testing.
export function searchKindFor(query, kindArg = 'all') {
  const wording = kindFromQuery(query, 'all'); // 'film'/'tv' only if the QUERY said so
  if (wording === 'all') return kindFromQuery(query, kindArg); // toggle/none decides
  const hasGenre = !!extractConstraints(query).requireGenres?.length;
  if (!hasGenre && !SPECIFIC_QUERY_RE.test(query || '')) return 'all';
  return wording;
}

/**
 * True for plain genre/era/mood queries with no specific qualifier and no
 * refinement context — these skip the ReAct loop in favour of a single LLM
 * completion. Exported so the fast-path detection can be unit-tested.
 */
export function isPlainQuery(query, constraints, prior) {
  if (prior) return false; // refinements always need the full loop
  const hasConstraint = !!(constraints.requireGenres?.length || constraints.yearMin != null);
  if (!hasConstraint) return false;
  return !SPECIFIC_QUERY_RE.test(query);
}

/**
 * recommend({ query, kind, services, onStep, onCandidates, onPartial, prior, excludeIds })
 * → { intent, steps, picks, kind, lang, providers }
 * onStep(label)      — called as each action starts (for streaming).
 * onPartial({kind, picks}) — called with provisional picks before fill/provider.
 * prior              — { query, picks } from previous turn (conversational refine).
 * excludeIds         — Set<string> of 'kind:tmdbId' to exclude (watchlist).
 */
export async function recommend({ query, kind: kindArg = 'all', services = [], onStep, onCandidates, onPartial, prior, excludeIds }) {
  const constraints = extractConstraints(query);
  // Secondary genres (e.g. "thriller" in "sci-fi thriller") rank-boost, not filter.
  const boostGenres = (constraints.requireGenres || []).slice(1);
  // Down-rank animation unless asked for it (sci-fi TV otherwise skews to anime).
  const demoteGenres = demoteGenresFor(query);
  // The query wording sets what the user LANDS on ("comedy movie" → the Films
  // tab, model returns films) — but the pool below still carries BOTH types:
  // the per-type fill stocks the other tab with the same genre, so switching
  // to TV after asking for a movie shows comedies, not an empty screen.
  const requestedKind = kindFromQuery(query, kindArg);
  // What to FETCH. Usually == requestedKind, but a genre-less "vibe" query that
  // merely mentions a type ("a film to watch with my mum") searches BOTH so the
  // other tab isn't a dead end — it still LANDS on requestedKind's tab.
  const searchKind = searchKindFor(query, kindArg);
  const kindHint =
    searchKind === 'film'
      ? 'film (movie type only)'
      : searchKind === 'tv'
        ? 'TV series only'
        : requestedKind === 'all'
          ? 'both films and TV'
          : `both films and TV — the user said "${requestedKind === 'film' ? 'film' : 'show'}" but a great ${requestedKind === 'film' ? 'series' : 'film'} fits too, so include BOTH types (do not restrict to ${requestedKind === 'film' ? 'films' : 'series'})`;
  // Locale: a non-English query means the user wants content in THAT language.
  // Script detection covers non-Latin queries; for Latin-script languages the
  // model signals via the originalLanguage tool param, which we adopt too.
  const queryLang = languageFromQuery(query);
  let contentLang = queryLang;
  // Streaming services: naming one in the query ("comedy on netflix") is a hard
  // filter; otherwise a signed-in user's saved services apply. Empty = off.
  const queryProviders = providersFromQuery(query);
  const userProviders = (services || []).map(providerByKey).filter(Boolean);
  const activeProviders = queryProviders.length > 0 ? queryProviders : userProviders;
  const providerIds = activeProviders.map((p) => p.tmdbId);

  // Per-request cache — scoped here to avoid cross-request pollution
  const metaCache = new Map();
  // Guards provider prewarm so each id fires at most once per request.
  const _prewarmFired = new Set();
  const PREWARM_CAP = 40;

  function cachePick(pick) {
    metaCache.set(pick.id, pick);
  }
  function cacheAll(arr) {
    for (const p of arr) cachePick(p);
    // Stream what the agent is looking at so the wait feels alive.
    if (onCandidates && arr.length) {
      onCandidates(
        arr
          .filter((p) => p.poster)
          .map((p) => ({ id: p.id, title: p.title, poster: p.poster, year: p.year, kind: p.kind })),
      );
    }
    // Fire-and-forget provider prewarm so annotateAvailability hits warm cache.
    for (const p of arr) {
      if (_prewarmFired.size >= PREWARM_CAP) break;
      if (_prewarmFired.has(p.id)) continue;
      _prewarmFired.add(p.id);
      tmdbWatchProviders({ tmdbId: p.tmdbId, kind: p.kind }).catch(() => {});
    }
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
      const picks = await tmdbSearch({
        title: args.title,
        kind: args.kind || 'film',
        language: contentLang,
        limit: 8,
      });
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
      // The model naming an original language (e.g. 'fr' for a French query we
      // can't script-detect) sets the content language for fills and details too.
      if (args.originalLanguage) contentLang = args.originalLanguage;
      const picks = await tmdbDiscover({
        kind: args.kind || 'film',
        genre: args.genre,
        yearMin: args.yearMin,
        yearMax: args.yearMax,
        sort: args.sort,
        originCountry: args.originCountry,
        originalLanguage: args.originalLanguage || queryLang,
        language: contentLang,
        providers: providerIds,
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
        language: contentLang,
        limit: 20,
      });
      cacheAll(picks);
      return JSON.stringify(picks.map(toCompact));
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  const localeNote = queryLang
    ? `\nQuery language: ${languageName(queryLang)} (${queryLang}) — recommend content originally in this language (tmdb_discover originalLanguage: "${queryLang}") unless the query itself points at another language's titles.`
    : '';

  // Prior-turn context — append when refining a previous search (item 6).
  const priorNote = prior
    ? `\nThis refines an earlier search: "${prior.query}" which returned:\n` +
      prior.picks
        .map((p, i) => `${i + 1}. ${p.title}${p.year ? ` (${p.year})` : ''} [${p.kind}]`)
        .join('\n') +
      '\nReferences like "#2" or "the second one" mean that list. Honour the refinement against those results — return a NEW set (overlap is fine when asked).'
    : '';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Find recommendations for: "${query}"\nKind: ${kindHint}` + localeNote + priorNote,
    },
  ];

  let finalizeResult = null;
  const MAX_ITERATIONS = 6;
  // Wall-clock budget for the LLM loop — past this we synthesize from whatever
  // is cached rather than keep the user staring at a spinner.
  const LOOP_DEADLINE_MS = 25_000;
  const loopStartedAt = Date.now();

  // ── Single-completion fast path for plain genre/mood/era queries ────────────
  // Skips the expensive ReAct loop entirely when the query has no specific
  // qualifier (no actor/setting/comparison) and no refinement context.
  const plainQuery = isPlainQuery(query, constraints, prior);

  try {
    if (plainQuery) {
      if (onStep) onStep('Scanning the catalogue');
      const demoteGenres2 = demoteGenres; // alias for clarity in the closure
      const tvExclude2 = demoteGenres2.map((g) => TV_GENRE_IDS[g]).filter(Boolean);
      const primaryGenre = constraints.requireGenres?.[0];
      // Run 2–4 discovers in parallel: film + tv, with primary genre/year/language.
      const discoverFetches = [];
      if (searchKind !== 'tv') {
        discoverFetches.push(
          tmdbDiscover({ kind: 'film', genre: primaryGenre, yearMin: constraints.yearMin, yearMax: constraints.yearMax, originalLanguage: contentLang, language: contentLang, providers: providerIds, limit: 30 }),
        );
      }
      if (searchKind !== 'film') {
        discoverFetches.push(
          tmdbDiscover({ kind: 'tv', genre: primaryGenre, yearMin: constraints.yearMin, yearMax: constraints.yearMax, withoutGenres: tvExclude2, originalLanguage: contentLang, language: contentLang, providers: providerIds, limit: 30 }),
        );
      }
      // When kind is 'all' we already pushed both; if neither matched, push film
      if (discoverFetches.length === 0) {
        discoverFetches.push(
          tmdbDiscover({ kind: 'film', genre: primaryGenre, yearMin: constraints.yearMin, yearMax: constraints.yearMax, originalLanguage: contentLang, language: contentLang, providers: providerIds, limit: 30 }),
        );
      }

      const discoverResults = await Promise.allSettled(discoverFetches);
      for (const r of discoverResults) {
        if (r.status === 'fulfilled') cacheAll(r.value);
      }

      if (metaCache.size === 0) {
        // Pool empty after discovers — fall through to the full ReAct loop below
        finalizeResult = null;
      } else {
        if (onStep) onStep('Picking the best fits');
        // 30 candidates keeps the completion short — MiniMax-M2 emits a
        // thinking block before the tool call, so input size directly costs
        // seconds. The pool is pre-sorted; the tail wouldn't be chosen anyway.
        const poolPicks = Array.from(metaCache.values())
          .sort(byScore(boostGenres, demoteGenres))
          .slice(0, 30);

        // The pool alone is already a decent ranked answer — show it NOW
        // (~1.5s in) and let the completion upgrade order + reasons when it
        // lands. M2's latency variance must never gate first paint.
        if (onPartial && poolPicks.length >= 4 && providerIds.length === 0) {
          onPartial({
            kind: requestedKind,
            picks: rankAndBadge(applyFilters(poolPicks, 'all', constraints), 40, boostGenres, demoteGenres),
          });
        }

        // Slim candidate shape for the selection call: genres are the bulk of
        // toCompact's tokens and the model knows these titles anyway.
        const compact = poolPicks.map((p) => ({
          id: p.id,
          title: p.title,
          year: p.year,
          rating: p.rating,
          type: p.kind,
        }));

        const FAST_PATH_TIMEOUT_MS = 20_000;
        // A rejection must resolve to null: the race may already have settled
        // (timeout), and an unhandled rejection would crash the process.
        const fastCompletion = getClient()
          .chat.completions.create({
            model: MODEL,
            tools: [TOOLS.find((t) => t.function.name === 'finalize')],
            tool_choice: { type: 'function', function: { name: 'finalize' } },
            messages: [
              {
                role: 'system',
                content:
                  'You are Natter\'s recommendation curator. From the provided candidates choose the 8-10 that best fit the user\'s request, ordered best-first, with a one-sentence reason each tuned to the request\'s mood/wording. Only use provided ids. Be brief — go straight to the finalize call.',
              },
              {
                role: 'user',
                content:
                  `Request: "${query}"\nKind: ${kindHint}` +
                  localeNote +
                  `\nCandidates:\n${JSON.stringify(compact)}`,
              },
            ],
            temperature: 0.3,
          })
          .catch((err) => {
            console.warn('[agent] fast path completion failed:', err.message);
            return null;
          });

        let fastTimer;
        const timeoutPromise = new Promise((resolve) => {
          fastTimer = setTimeout(() => resolve(null), FAST_PATH_TIMEOUT_MS);
        });

        const fastResp = await Promise.race([fastCompletion, timeoutPromise]);
        clearTimeout(fastTimer);

        if (fastResp) {
          const fastMsg = fastResp.choices[0].message;
          const fc = (fastMsg.tool_calls || []).find((tc) => tc.function.name === 'finalize');
          if (fc) {
            try {
              finalizeResult = JSON.parse(fc.function.arguments);
            } catch {
              console.warn('[agent] fast path: malformed finalize args — using deterministic fallback');
            }
          }
        }

        // Deterministic fallback when the completion fails or times out
        if (!finalizeResult || !finalizeResult.picks?.length) {
          finalizeResult = {
            intent: query,
            steps: ['Scanning the catalogue', 'Picking the best fits'],
            picks: poolPicks.slice(0, 12).map((p) => ({ id: p.id, reason: 'Matches your request.' })),
          };
        }
      }
    }

    if (!plainQuery || metaCache.size === 0) {
      // ── Full ReAct loop ───────────────────────────────────────────────────
      finalizeResult = null;
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (iter > 0 && Date.now() - loopStartedAt > LOOP_DEADLINE_MS) {
        console.log('[agent] loop deadline reached — synthesizing from cache');
        break;
      }
      if (onStep && iter > 0) onStep('Shortlisting the best matches');
      // Force finalize once we have a healthy pool — avoids a costly extra round.
      const forceFinalize = iter >= 1 && metaCache.size >= 20;
      const response = await getClient().chat.completions.create({
        model: MODEL,
        tools: TOOLS,
        tool_choice: forceFinalize
          ? { type: 'function', function: { name: 'finalize' } }
          : 'auto',
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

      // Execute non-finalize tools; cap tmdb_search at 8 per round
      const MAX_SEARCH_PER_ROUND = 8;
      let searchCallCount = 0;
      const otherCalls = [];
      const cappedCalls = [];
      for (const tc of msg.tool_calls) {
        if (tc.function.name === 'finalize') continue;
        if (tc.function.name === 'tmdb_search' && ++searchCallCount > MAX_SEARCH_PER_ROUND) {
          console.log('[agent] capping tmdb_search, skipping', tc.function.arguments);
          cappedCalls.push(tc);
          continue;
        }
        otherCalls.push(tc);
      }

      const toolResults = await Promise.all(
        otherCalls.map(async (tc) => {
          try {
            const args = JSON.parse(tc.function.arguments || '{}');
            const result = await executeTool(tc.function.name, args);
            return { id: tc.id, result };
          } catch (err) {
            // One malformed/failed call must not kill the whole loop — report
            // it back to the model so it can adjust.
            console.warn(`[agent] tool ${tc.function.name} failed:`, err.message);
            return { id: tc.id, result: JSON.stringify({ error: `Tool call failed: ${err.message}` }) };
          }
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

      // Every tool_call_id must get a response — answer capped calls with an
      // error instead of silently dropping them, or the next completion
      // request is malformed and the whole run degrades to fallback.
      for (const tc of cappedCalls) {
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({
            error: `tmdb_search limit (${MAX_SEARCH_PER_ROUND} per round) reached — use the results already in cache or call finalize.`,
          }),
        });
      }

      // Handle finalize — the model occasionally emits more than one; accept
      // the first that parses, but answer EVERY finalize id (an unanswered id
      // malforms the next request).
      const finalizeCalls = msg.tool_calls.filter((tc) => tc.function.name === 'finalize');
      if (finalizeCalls.length > 0) {
        let chosen = null;
        let chosenArgs = null;
        for (const fc of finalizeCalls) {
          if (!chosen) {
            try {
              chosenArgs = JSON.parse(fc.function.arguments);
              chosen = fc;
              continue; // answered with ok below
            } catch (err) {
              console.warn('[agent] malformed finalize args:', err.message);
            }
          }
          messages.push({
            role: 'tool',
            tool_call_id: fc.id,
            content: JSON.stringify({
              error: chosen
                ? 'superseded — an earlier finalize in this round was accepted.'
                : 'finalize arguments were not valid JSON — call finalize again.',
            }),
          });
        }
        if (chosen) {
          if (onStep) onStep('Putting picks in order');
          console.log('[agent] finalize called with', chosenArgs.picks?.length, 'picks, exactTitles:', chosenArgs.exactTitles);
          messages.push({
            role: 'tool',
            tool_call_id: chosen.id,
            content: JSON.stringify({ ok: true }),
          });
          finalizeResult = chosenArgs;
          break;
        }
        // All finalize calls were malformed — let the model retry next round.
        continue;
      }
      }

      // If no finalize after the loop, synthesize from what's cached
      if (!finalizeResult) {
        console.log('[agent] no finalize — synthesizing from cache');
        const cachedIds = Array.from(metaCache.keys());
        if (cachedIds.length === 0) {
          return { ...(await fallbackSearch(query, 'all')), kind: requestedKind };
        }
        finalizeResult = {
          intent: query,
          steps: ['Reading your request', 'Searching for titles', 'Comparing results', 'Putting picks in order'],
          picks: cachedIds.slice(0, 40).map((id) => ({ id, reason: 'Matches your request.' })),
        };
      }
    } // end full ReAct loop block

    // Detect exactTitles: from agent flag OR server-side regex fallback
    const isExactTitles = !!(finalizeResult.exactTitles || SPECIFIC_QUERY_RE.test(query));

    // Resolve picks from cache
    const { intent, steps, picks: rawPicks } = finalizeResult;

    const resolvedEntries = await Promise.all(
      (rawPicks || []).map(async ({ id, reason }) => {
        let meta = metaCache.get(id);

        // Recover only when the model put a TITLE in the id slot — a hallucinated
        // "tmdb:123" can never match anything as a search query, so drop it.
        if (!meta && !/^tmdb:\d+$/i.test(String(id))) {
          console.log(`[agent] id ${id} not in cache, attempting title recovery`);
          const recovered = await tmdbSearch({ title: String(id), kind: 'film', language: contentLang, limit: 3 });
          if (recovered.length > 0) {
            meta = recovered[0];
            cachePick(meta);
          }
        }

        return meta ? { ...meta, reason } : null;
      }),
    );
    let resolvedPicks = resolvedEntries.filter(Boolean);

    // Dedupe by title (handles "Old School" duplicates etc.)
    resolvedPicks = dedupeByTitle(resolvedPicks);

    // Provisional picks: emit before the slower fill + availability pass so the
    // client can show something immediately. Only when >= 4 resolved and no
    // provider filter (filtered runs must not flash unfiltered content).
    if (onPartial && resolvedPicks.length >= 4 && providerIds.length === 0) {
      onPartial({
        kind: requestedKind,
        intent: finalizeResult.intent,
        picks: rankAndBadge(applyFilters(resolvedPicks, 'all', constraints), 40, boostGenres, demoteGenres),
      });
    }

    // Apply hard constraints (runtime, year, genre) extracted from query.
    // The pool keeps both types regardless of the requested kind — the
    // requested one leads via the client's default tab, not by exclusion.
    let filtered = applyFilters(resolvedPicks, 'all', constraints);

    // Per-type fill: bring EACH requested type (films / TV) up to a healthy depth so the
    // Films/TV toggle is balanced — "TV just as good as movies". Only deficient types get
    // topped up. Skipped for exactTitles (actor/franchise), where genre padding is wrong.
    // Locale queries fill even without a parsed genre — popular content in the
    // query's language beats an empty screen when the model under-delivers.
    if (!isExactTitles && ((constraints.requireGenres && constraints.requireGenres.length > 0) || contentLang)) {
      const types = ['film', 'tv'];
      const PER_TYPE_TARGET = 18;
      // Top up by the PRIMARY genre only — the secondary (e.g. "Thriller") has no
      // TV taxonomy entry, so discovering by it just pulls generic popular TV that
      // the primary filter then discards. Thriller-ness is applied later as a boost.
      // Locale-only fills (no parsed genre) discover by popularity alone.
      const primaryGenre = constraints.requireGenres?.[0];
      // When animation isn't requested, exclude it from the TV top-up: "Sci-Fi &
      // Fantasy" is anime-heavy, so a popularity sort otherwise fills the pool with
      // animation and buries live-action. (The ranking demote is a backstop for any
      // animation the agent surfaces via its own tool calls.)
      const tvExclude = demoteGenres.map((g) => TV_GENRE_IDS[g]).filter(Boolean);

      const deficient = types.filter(
        (t) => filtered.filter((p) => p.kind === t).length < PER_TYPE_TARGET,
      );
      if (deficient.length > 0 && onStep) {
        onStep(`Finding more${primaryGenre ? ` ${primaryGenre}` : ''} picks`);
      }
      // Both type fills run concurrently — they're independent discover calls.
      const fills = await Promise.all(
        deficient.map((t) =>
          tmdbDiscover({
            kind: t,
            genre: primaryGenre,
            yearMin: constraints.yearMin,
            yearMax: constraints.yearMax,
            withoutGenres: t === 'tv' ? tvExclude : undefined,
            originalLanguage: contentLang,
            language: contentLang,
            providers: providerIds,
            limit: 30,
          }),
        ),
      );
      for (const more of fills) {
        cacheAll(more);
        filtered = dedupeByTitle([...filtered, ...applyFilters(more, 'all', constraints)]);
      }
      console.log(
        `[agent] per-type fill: film ${filtered.filter((p) => p.kind === 'film').length}, tv ${filtered.filter((p) => p.kind === 'tv').length}`,
      );
    }

    // Relax if too few results — but NOT for exactTitles (return honest empty instead of padding)
    if (!isExactTitles && filtered.length < 3 && Object.keys(constraints).length > 0) {
      console.log('[agent] relaxing constraints, got only', filtered.length);
      filtered = applyFilters(resolvedPicks, 'all', {});
    }

    // Fallback if still empty — but NOT for exactTitles (honest empty state, not generic padding)
    if (filtered.length === 0 && !isExactTitles) {
      return { ...(await fallbackSearch(query, 'all')), kind: requestedKind };
    }

    // Streaming availability: every result card shows where to watch (the data
    // is cached, so this adds little). With an active filter (named service in
    // the query, or the signed-in user's saved services) it also GATES results:
    // search/person-sourced picks aren't covered by the discover-level provider
    // param, so this is what makes "don't show what I can't watch" true.
    if (filtered.length > 0) {
      const filterOn = providerIds.length > 0;
      if (onStep) {
        onStep(
          filterOn
            ? `Checking ${activeProviders.map((p) => p.label).join(', ')}`
            : 'Checking where to watch',
        );
      }
      filtered = await annotateAvailability(filtered, filterOn ? activeProviders : PROVIDERS);
      if (filterOn) {
        const available = filtered.filter((p) => p.available);
        // Keep unavailable titles only when filtering would leave the screen
        // nearly empty.
        filtered = available.length >= 4 ? available : [...available, ...filtered.filter((p) => !p.available)];
      }
    }

    // Exclude watchlist items — but only when enough picks survive the cut.
    // Never return a starved screen: if dropping excluded ids would leave fewer
    // than 6, keep them all.
    if (excludeIds && excludeIds.size > 0) {
      const without = filtered.filter((p) => !excludeIds.has(`${p.kind}:${p.tmdbId}`));
      if (without.length >= 6) filtered = without;
    }

    // Balance the final set so ranking doesn't re-skew to films: keep the top
    // ~20 of each type, then rankAndBadge interleaves by rating.
    const score = byScore(boostGenres, demoteGenres);
    const films = filtered.filter((p) => p.kind === 'film').sort(score).slice(0, 20);
    const tv = filtered.filter((p) => p.kind === 'tv').sort(score).slice(0, 20);
    let rankedPicks = rankAndBadge([...films, ...tv], 40, boostGenres, demoteGenres);
    // Stamp the content language so /api/title can localize the detail view.
    if (contentLang) rankedPicks = rankedPicks.map((p) => ({ ...p, lang: contentLang }));

    return {
      intent,
      steps,
      picks: rankedPicks,
      kind: requestedKind,
      lang: contentLang,
      providers: activeProviders.map((p) => p.label),
    };
  } catch (err) {
    console.error('[agent] loop error:', err.message);
    return { ...(await fallbackSearch(query, 'all')), kind: requestedKind };
  }
}
