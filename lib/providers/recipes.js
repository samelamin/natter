/**
 * lib/providers/recipes.js — TheMealDB provider.
 * Returns unified "pick" objects shaped like every other provider.
 *
 *  GET https://www.themealdb.com/api/json/v1/{key}/search.php?s=…
 *  GET https://www.themealdb.com/api/json/v1/{key}/lookup.php?i=…
 *  GET https://www.themealdb.com/api/json/v1/{key}/filter.php?c=…|a=…|i=…
 *
 * The free tier uses key "1"; a paid key in THEMEALDB_KEY overrides it.
 * `/filter.php` returns only { idMeal, strMeal, strMealThumb } — we mark
 * those picks as `meta.partial = true` so the caller can lazily fetch the
 * full details later.
 */

import { cacheGetJSON, cacheSetJSON } from '../cache.js';

const BASE = `https://www.themealdb.com/api/json/v1/${process.env.THEMEALDB_KEY || '1'}`;
const TIMEOUT_MS = 12_000;
const CACHE_TTL = 21_600; // 6h
const INGREDIENT_SLOTS = 20;

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`recipes ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function nonEmpty(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Build an ingredients array from the strIngredient1..N / strMeasure1..N
 * pair fields. Skips empty / null / whitespace slots.
 */
function ingredientsOf(meal) {
  const out = [];
  for (let i = 1; i <= INGREDIENT_SLOTS; i++) {
    const name = meal[`strIngredient${i}`];
    if (!nonEmpty(name)) continue;
    const measure = meal[`strMeasure${i}`];
    out.push({
      name: name.trim(),
      measure: nonEmpty(measure) ? measure.trim() : '',
    });
  }
  return out;
}

function tagsOf(meal) {
  if (!nonEmpty(meal.strTags)) return [];
  return meal.strTags.split(',').map((t) => t.trim()).filter(Boolean);
}

// ── normalizeToPick ────────────────────────────────────────────────────────

/**
 * Map a TheMealDB meal into the unified pick shape. Works for both the
 * "full" meal (search.php / lookup.php) and the "partial" filter payload
 * ({idMeal, strMeal, strMealThumb}); in the latter case meta.partial=true.
 */
export function normalizeToPick(m) {
  const partial = !m.strInstructions && !m.strCategory;
  const subtitle = m.strArea
    ? `${m.strArea} · ${m.strCategory || ''}`.replace(/\s·\s$/, '').trim()
    : (m.strCategory || '');
  return {
    id: `recipe:${m.idMeal}`,
    domain: 'recipe',
    sourceId: String(m.idMeal),
    title: m.strMeal || '',
    subtitle,
    year: null,
    rating: null,
    image: m.strMealThumb || null,
    reason: '',
    match: null,
    meta: {
      area: m.strArea || '',
      category: m.strCategory || '',
      ingredients: partial ? [] : ingredientsOf(m),
      instructions: m.strInstructions || '',
      tags: tagsOf(m),
      youtube: m.strYoutube || '',
      source: m.strSource || null,
      ...(partial ? { partial: true } : {}),
    },
  };
}

// ── search / getDetails ─────────────────────────────────────────────────────

/**
 * Search TheMealDB. With no filters → /search.php?s=. With category/area/
 * ingredient → /filter.php?{c|a|i}= (returns partial picks).
 *
 * @param {{
 *   query?: string,
 *   limit?: number,
 *   filters?: { category?: string, area?: string, ingredient?: string },
 * }}
 * @returns {Promise<object[]>}
 */
export async function search({ query, limit = 20, filters = {} } = {}) {
  let url;
  if (filters.category) {
    url = `${BASE}/filter.php?c=${encodeURIComponent(filters.category)}`;
  } else if (filters.area) {
    url = `${BASE}/filter.php?a=${encodeURIComponent(filters.area)}`;
  } else if (filters.ingredient) {
    url = `${BASE}/filter.php?i=${encodeURIComponent(filters.ingredient)}`;
  } else {
    url = `${BASE}/search.php?s=${encodeURIComponent(query || '')}`;
  }

  const ck = `prov:recipe:search:${(query || '').toLowerCase()}|${limit}|${filters.category || ''}|${filters.area || ''}|${filters.ingredient || ''}`;
  const cached = await cacheGetJSON(ck);
  if (cached) return cached;
  const data = await fetchJson(url);
  const meals = data.meals || [];
  const picks = meals.slice(0, limit).map(normalizeToPick);
  cacheSetJSON(ck, picks, CACHE_TTL);
  return picks;
}

/**
 * Fetch a single recipe by TheMealDB id.
 * @param {string} sourceId
 * @returns {Promise<object|null>}  unified pick or null when not found
 */
export async function getDetails(sourceId) {
  const ck = `prov:recipe:details:${sourceId}`;
  const cached = await cacheGetJSON(ck);
  if (cached) return cached;
  const url = `${BASE}/lookup.php?i=${encodeURIComponent(sourceId)}`;
  const data = await fetchJson(url);
  const meal = (data.meals || [])[0];
  const pick = meal ? normalizeToPick(meal) : null;
  if (pick) cacheSetJSON(ck, pick, CACHE_TTL);
  return pick;
}

// ── Provider metadata ──────────────────────────────────────────────────────

export const domain = 'recipe';
export const label = 'Recipes';
export const accent = '#F2766B';