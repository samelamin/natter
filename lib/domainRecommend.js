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
import { braveSearch } from './brave.js';

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Best-effort JSON parse. Returns null on any failure.
 */
function safeParseJson(s) {
  if (typeof s !== 'string') return null;
  try {
    return JSON.parse(s);
  } catch {
    // Try a relaxed parse: find first {...} block
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Build a minimal pick from a Brave web-search result.
 */
function pickFromBraveResult(r, idx) {
  return {
    id: `${'game'}:web:${idx}:${(r?.title || '').slice(0, 40)}`,
    domain: 'game',
    sourceId: String(idx),
    title: r?.title || '',
    subtitle: r?.url || '',
    year: null,
    rating: null,
    image: null,
    reason: '',
    match: null,
    meta: { url: r?.url || '', description: r?.description || '', webFallback: true },
  };
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
}) {
  // Hard-failure outer guard — never throw to the route.
  try {
    const provider = providerOverride || getProvider(domain);
    const llmClient = llm || getLLM();

    onStep('Understanding your request');

    // ── 1. Plan call ───────────────────────────────────────────────────────
    // Plan failure (LLM throws) is a hard failure — bubble to outer catch
    // which returns the empty-result shape. Bad-JSON (LLM returns malformed
    // content) falls back to query-only plan.
    const planSystem = `You plan a ${domain} search. Return JSON {searchTerms:[2-4 strings], filters:{}, intent:'one short sentence'}`;
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

    if (provider && typeof provider.search === 'function') {
      const searches = plan.searchTerms.slice(0, 4).map((term) =>
        Promise.allSettled([
          provider.search({ query: term, limit: 12, filters: plan.filters }),
        ]).then((arr) => arr[0]),
      );
      const results = await Promise.allSettled(searches);

      for (const r of results) {
        if (r.status === 'fulfilled') {
          const inner = r.value;
          if (inner.status === 'fulfilled' && Array.isArray(inner.value)) {
            candidates = candidates.concat(inner.value);
          } else if (inner.status === 'rejected') {
            // For games: if NO_KEY anywhere → brave fallback
            const err = inner.reason;
            const code = err?.code || err?.cause?.code;
            if (domain === 'game' && code === 'NO_KEY') {
              usedBraveFallback = true;
            }
          }
        }
      }
    }

    // Brave fallback for game + NO_KEY
    if (domain === 'game' && usedBraveFallback && candidates.length < 3) {
      try {
        const braveResults = await braveSearch(query, 8);
        const synth = (Array.isArray(braveResults) ? braveResults : []).map((r, i) =>
          pickFromBraveResult(r, i),
        );
        candidates = candidates.concat(synth);
      } catch {
        // Brave also failed — leave candidates as-is.
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
    if (picks.length < 3 && provider && typeof provider.search === 'function') {
      try {
        const broader = await provider.search({ query, limit: 20, filters: {} });
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

    // Dedupe by title, slice 15
    const deduped = dedupeByTitle(finalPicks).slice(0, 15);

    // If dedupe dropped everything (edge case), fall back to first 12 ranked
    const out = deduped.length > 0
      ? deduped
      : finalPicks.slice(0, 12);

    // If brave fallback was used, annotate intent
    const finalIntent = usedBraveFallback && (!intent || intent === query)
      ? `${intent} (limited data — web search fallback)`
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