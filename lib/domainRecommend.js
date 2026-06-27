/**
 * lib/domainRecommend.js — Domain recommendation engine.
 *
 * Mirrors the streaming contract of lib/agent.js (onStep/onCandidates/onPartial)
 * for the new book/game/recipe domains, without touching the movie/TV path.
 *
 *   domainRecommend({ query, domain, onStep, onCandidates, onPartial,
 *                     excludeIds, llm, providerOverride })
 *
 * `llm` and `providerOverride` are optional injection points for tests; in
 * production we default to `getLLM()` and `getProvider(domain)`.
 *
 * Returns `{ intent, kind: domain, picks, providers: [], lang: null }` — same
 * shape buildDonePayload expects. On hard failure the outer try/catch
 * guarantees no throw and returns an empty result.
 */

import { getLLM, LLM_MODEL } from './llm.js';
import { getProvider } from './providers/index.js';

const CURRENT_YEAR = new Date().getFullYear();

// Per-domain guidance for the plan call — each source has different search
// capabilities. Critically, TheMealDB matches by name/category/area/ingredient,
// NOT free-text descriptions, so recipe plans must use filters.
const PLAN_HINTS = {
  book: 'Books search is free-text (author, title, or genre keywords work well). searchTerms = the best 2-4 author/title/genre phrases. filters: optional {"subject":"<genre>"}.',
  game: 'IGDB matches by game TITLE, not descriptions. searchTerms MUST be specific, real game names that fit the request — e.g. for "cozy like Stardew Valley" → ["Stardew Valley","Animal Crossing: New Horizons","Coral Island","Spiritfarer"]. Give 3-4 concrete titles, never descriptive phrases. filters: {} (unused).',
  recipe: 'The recipe API matches ONLY by meal name, category, cuisine (area), or main ingredient — never sentences. Strongly prefer filters. filters: optional {"category":"Vegetarian|Vegan|Seafood|Dessert|Chicken|Beef|Pork|Lamb|Pasta|Breakfast|Side|Starter", "area":"Italian|Mexican|Indian|Chinese|Thai|French|British|Japanese|...", "ingredient":"<one ingredient>"}. searchTerms = concrete single dish names or ingredients (e.g. "pasta", "stir fry", "chicken curry"), NOT descriptive sentences.',
};

/**
 * Best-effort JSON parse. Returns null on any failure.
 */
function safeParseJson(s) {
  if (typeof s !== 'string') return null;
  // MiniMax reasoning models (M2.1) prepend a <think>…</think> block even under
  // response_format json_object. Strip it (and any unclosed/truncated variant)
  // before parsing, else the JSON never extracts and every call silently falls
  // back. See ~/.claude/CLAUDE.md note on MiniMax <think> mis-parsing.
  let str = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (str.includes('</think>')) str = str.slice(str.lastIndexOf('</think>') + 8).trim();
  try {
    return JSON.parse(str);
  } catch {
    // ```json fenced block
    const fence = str.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try { return JSON.parse(fence[1].trim()); } catch { /* fall through */ }
    }
    // first { … last }
    const a = str.indexOf('{');
    const b = str.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(str.slice(a, b + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

/**
 * Game fallback when IGDB is unavailable: ask the LLM for real, existing game
 * titles matching the query. Returns unified picks (no cover art / scores —
 * those need IGDB). Far better UX than web-article links.
 */
async function generateGameCandidates(query, llmClient) {
  try {
    const resp = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'List 12 real, existing video games that match the user request. ' +
            'Return ONLY JSON: {"games":[{"title":"","developer":"","genres":["",""],"year":2020}]}. ' +
            'Only real games that actually exist — never invent titles.',
        },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });
    const parsed = safeParseJson(resp?.choices?.[0]?.message?.content);
    const games = parsed && Array.isArray(parsed.games) ? parsed.games : [];
    return games.slice(0, 12).map((g, i) => {
      const title = String(g?.title || '').trim();
      const genres = Array.isArray(g?.genres) ? g.genres.map(String) : [];
      const year = Number.isFinite(g?.year) ? g.year : null;
      return {
        id: `game:llm:${i}:${title.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`,
        domain: 'game',
        sourceId: `llm:${i}`,
        title,
        subtitle: String(g?.developer || genres.slice(0, 2).join(', ') || '').trim(),
        year,
        rating: null,
        image: null,
        reason: '',
        match: null,
        meta: {
          platforms: [],
          genres,
          metacritic: null,
          released: year ? String(year) : '',
          description: '',
          screenshots: [],
          llmSourced: true,
        },
      };
    }).filter((p) => p.title);
  } catch {
    return [];
  }
}

/**
 * Dedupe a list of picks by id.
 */
function dedupeById(picks) {
  const seen = new Set();
  const out = [];
  for (const p of picks || []) {
    if (!p || !p.id) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/**
 * Identity key for a game: the first 5 significant title words. Collapses
 * editions/bundles/ports of the same base ("… Breath of the Wild Bundle" vs
 * "… Breath of the Wild - Switch 2 Edition") while keeping distinct entries in
 * a series apart (Ocarina vs Majora differ by word 5).
 */
function gameBaseKey(title) {
  const words = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 5).join(' ');
}

/**
 * From a set of IGDB results, pick the one that best matches the wanted title.
 * IGDB search is fuzzy and ranks bundles/wrong games highly; for a known title
 * we want the exact/base entry, and nothing if there's no real match (avoids
 * surfacing an unrelated fuzzy hit, especially under a platform filter).
 */
function pickBestMatch(wanted, results) {
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const w = norm(wanted);
  if (!w || !Array.isArray(results) || !results.length) return null;
  const scored = results
    .map((r) => {
      const n = norm(r.title);
      let score = 0;
      if (n === w) score = 100;
      else if (n.startsWith(w) || w.startsWith(n)) score = 80 - Math.abs(n.length - w.length);
      else if (n.includes(w) || w.includes(n)) score = 50;
      return { r, score, len: n.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.len - b.len); // prefer closer match, then shorter (base) name
  return scored.length ? scored[0].r : null;
}

/** Collapse game edition/bundle variants, keeping the first (best-ranked). */
function dropGameEditions(picks) {
  const seen = new Set();
  const out = [];
  for (const p of picks || []) {
    const k = gameBaseKey(p.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * Dedupe by title (case-insensitive). Keeps first occurrence.
 */
function dedupeByTitle(picks) {
  const seen = new Set();
  const out = [];
  for (const p of picks || []) {
    const k = (p?.title || '').trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * Domain recommendation engine.
 * @param {{
 *   query: string,
 *   domain: string,
 *   onStep?: (label: string) => void,
 *   onCandidates?: (items: any[]) => void,
 *   onPartial?: (payload: any) => void,
 *   excludeIds?: Set<string>,
 *   llm?: any,
 *   providerOverride?: any,
 * }} args
 */
export async function domainRecommend({
  query,
  domain,
  onStep = () => {},
  onCandidates = () => {},
  onPartial = () => {},
  excludeIds,
  llm,
  providerOverride,
  platforms = [],
}) {
  // Hard-failure outer guard — never throw to the route.
  try {
    const provider = providerOverride || getProvider(domain);
    const llmClient = llm || getLLM();
    // Extra provider filters from the UI (currently: game platform constraint).
    const uiFilters = Array.isArray(platforms) && platforms.length ? { platforms } : {};

    onStep('Understanding your request');

    // ── 1. Plan call ───────────────────────────────────────────────────────
    // Plan failure (LLM throws) is a hard failure — bubble to outer catch
    // which returns the empty-result shape. Bad-JSON (LLM returns malformed
    // content) falls back to query-only plan.
    const planSystem = `You plan a ${domain} search for the user's request. ${PLAN_HINTS[domain] || ''} Return ONLY JSON: {"searchTerms":[2-4 strings], "filters":{...}, "intent":"one short sentence describing what the user wants"}.`;
    let plan = { searchTerms: [query], filters: {}, intent: query };
    const planResp = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: planSystem },
        { role: 'user', content: query },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });
    const parsed = safeParseJson(planResp?.choices?.[0]?.message?.content);
    if (parsed && Array.isArray(parsed.searchTerms) && parsed.searchTerms.length > 0) {
      plan = {
        searchTerms: parsed.searchTerms.slice(0, 4).map((s) => String(s)),
        filters: parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : {},
        intent: typeof parsed.intent === 'string' && parsed.intent.length > 0 ? parsed.intent : query,
      };
    }

    const intent = plan.intent || query;

    // ── 2. Fetch candidates ────────────────────────────────────────────────
    let candidates = [];
    let usedBraveFallback = false;

    if (provider && typeof provider.search === 'function' && domain === 'game') {
      // Games: IGDB title-search on descriptive phrases returns junk, so let the
      // LLM name concrete games that fit the vibe, then look each up in IGDB
      // (honouring the platform filter) for real cover art + scores.
      const synth = await generateGameCandidates(query, llmClient);
      let enriched = [];
      if (synth.length) {
        const lookups = await Promise.allSettled(
          synth.slice(0, 14).map(async (s) => {
            const res = await provider.search({ query: s.title, limit: 5, filters: { ...uiFilters } });
            return pickBestMatch(s.title, res); // exact/base entry, or null if no real match (e.g. not on platform)
          }),
        );
        enriched = lookups.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
      }
      if (enriched.length) {
        candidates = enriched;
      } else {
        // IGDB unavailable / no creds — LLM titles only (no art/scores).
        candidates = synth;
        usedBraveFallback = true;
      }
    } else if (provider && typeof provider.search === 'function') {
      const searches = plan.searchTerms.slice(0, 4).map((term) =>
        Promise.allSettled([
          provider.search({ query: term, limit: 12, filters: { ...plan.filters, ...uiFilters } }),
        ]).then((arr) => arr[0]),
      );
      const results = await Promise.allSettled(searches);

      for (const r of results) {
        if (r.status === 'fulfilled') {
          const inner = r.value;
          if (inner.status === 'fulfilled' && Array.isArray(inner.value)) {
            candidates = candidates.concat(inner.value);
          }
        }
      }
    }

    // Dedupe + exclude
    let picks = dedupeById(candidates);
    if (excludeIds && typeof excludeIds.has === 'function') {
      picks = picks.filter((p) => !excludeIds.has(p.id));
    }

    // Emit candidate preview + partial
    if (picks.length > 0) {
      onCandidates(picks.slice(0, 12).map((p) => ({ id: p.id, title: p.title, image: p.image })));
      onPartial({ kind: domain, intent, picks: picks.slice(0, 8), phase: 'partial' });
    }

    // ── 3. Recipe hydrate partials ─────────────────────────────────────────
    if (domain === 'recipe' && provider && typeof provider.getDetails === 'function') {
      const partials = picks.filter((p) => p?.meta?.partial);
      if (partials.length > 0) {
        const top = partials.slice(0, 12);
        const results = await Promise.allSettled(top.map((p) => provider.getDetails(p.sourceId)));
        const byId = new Map();
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value) byId.set(top[i].sourceId, r.value);
        });
        if (byId.size > 0) {
          picks = picks.map((p) => (byId.has(p.sourceId) ? byId.get(p.sourceId) : p));
        }
      }
    }

    // ── 4. Broadening if <3 candidates ─────────────────────────────────────
    // Skip for games — a raw descriptive query is a poor IGDB title search
    // (returns junk); the LLM-title path above is the quality source.
    if (picks.length < 3 && domain !== 'game' && provider && typeof provider.search === 'function') {
      try {
        const broader = await provider.search({ query, limit: 20, filters: { ...uiFilters } });
        if (Array.isArray(broader)) {
          picks = dedupeById(picks.concat(broader));
          if (excludeIds && typeof excludeIds.has === 'function') {
            picks = picks.filter((p) => !excludeIds.has(p.id));
          }
        }
      } catch {
        // Broadening failed — continue with what we have.
      }
    }

    onStep('Picking the best for you');

    // ── 5. Rank call ───────────────────────────────────────────────────────
    let rankedIds = [];
    let rankedReasons = new Map();
    let rankedMatches = new Map();

    const compact = picks.slice(0, 24).map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle || '',
      year: p.year ?? null,
      rating: p.rating ?? null,
      note: p?.meta?.partial
        ? 'partial listing'
        : p?.meta?.webFallback
          ? 'web search result'
          : (p.subtitle || '').slice(0, 60),
    }));

    try {
      const rankSystem = `You rank ${domain} picks for a user query. Return JSON {picks:[{id, reason:'one specific sentence', match: 60-99}]} choosing up to 15 best, ordered by best match first.`;
      const rankResp = await llmClient.chat.completions.create({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: rankSystem },
          { role: 'user', content: JSON.stringify({ query, candidates: compact }) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });
      const parsed = safeParseJson(rankResp?.choices?.[0]?.message?.content);
      if (parsed && Array.isArray(parsed.picks)) {
        for (const r of parsed.picks.slice(0, 15)) {
          if (!r || !r.id) continue;
          rankedIds.push(String(r.id));
          rankedReasons.set(String(r.id), typeof r.reason === 'string' ? r.reason : '');
          const m = Number(r.match);
          rankedMatches.set(
            String(r.id),
            Number.isFinite(m) ? Math.min(99, Math.max(60, Math.round(m))) : 80,
          );
        }
      }
    } catch {
      // Ranking failed — fall back to first candidates below.
    }

    // Fallback ranking if LLM didn't return valid picks
    if (rankedIds.length === 0) {
      const sorted = picks.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
      for (const p of sorted.slice(0, 12)) {
        rankedIds.push(p.id);
        rankedReasons.set(p.id, `A strong ${domain} pick for your query.`);
        rankedMatches.set(p.id, 80);
      }
    }

    // ── 6. Map back to full picks + attach reason/match/badge ─────────────
    // Badge rules: 'New' wins over 'Top pick' (a brand-new release is more
    // newsworthy than the top-ranked pick); otherwise index0 = 'Top pick'.
    const byId = new Map(picks.map((p) => [p.id, p]));
    const finalPicks = [];
    for (let i = 0; i < rankedIds.length; i++) {
      const id = rankedIds[i];
      const full = byId.get(id);
      if (!full) continue;
      const reason = rankedReasons.get(id) || `A great ${domain} match.`;
      const match = rankedMatches.get(id);
      let badge;
      if (full.year === CURRENT_YEAR) badge = 'New';
      else if (i === 0) badge = 'Top pick';
      const pick = { ...full, reason, match };
      if (badge) pick.badge = badge;
      finalPicks.push(pick);
    }

    // Dedupe by title; for games also collapse edition/expansion variants.
    let deduped = dedupeByTitle(finalPicks);
    if (domain === 'game') deduped = dropGameEditions(deduped);
    deduped = deduped.slice(0, 15);

    // If dedupe dropped everything (edge case), fall back to first 12 ranked
    const out = deduped.length > 0
      ? deduped
      : finalPicks.slice(0, 12);

    // Note the degraded mode when games ran without live IGDB data.
    const finalIntent = usedBraveFallback
      ? `${intent} — game titles only (IGDB unavailable; no cover art or scores)`
      : intent;

    return {
      intent: finalIntent,
      kind: domain,
      picks: out,
      providers: [],
      lang: null,
    };
  } catch (err) {
    console.error('[domainRecommend]', err);
    return { intent: '', kind: domain, picks: [], providers: [], lang: null };
  }
}