/**
 * lib/providers/books.js — Google Books provider.
 * Returns unified "pick" objects shaped like every other provider.
 *
 *  GET https://www.googleapis.com/books/v1/volumes?q=…&maxResults=…&…
 *  GET https://www.googleapis.com/books/v1/volumes/{id}
 *
 * Works keyless — only appends &key= when GOOGLE_BOOKS_API_KEY is set.
 */

const BASE = 'https://www.googleapis.com/books/v1/volumes';
const TIMEOUT_MS = 12_000;

// ── Helpers ────────────────────────────────────────────────────────────────

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Force a thumbnail URL onto https — Google still serves some over http. */
function httpsUrl(u) {
  if (!u) return null;
  return String(u).replace(/^http:\/\//, 'https://');
}

function yearOf(publishedDate) {
  if (!publishedDate) return null;
  const y = parseInt(String(publishedDate).slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`books ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

// ── normalizeToPick ────────────────────────────────────────────────────────

/**
 * Map a Google Books `volume` resource into the unified pick shape.
 * @param {object} volume  { id, volumeInfo: {…} }
 */
export function normalizeToPick(volume) {
  const v = volume?.volumeInfo || {};
  const authors = Array.isArray(v.authors) ? v.authors : [];
  const categories = Array.isArray(v.categories) ? v.categories : [];
  return {
    id: `book:${volume.id}`,
    domain: 'book',
    sourceId: String(volume.id),
    title: v.title || '',
    subtitle: authors.join(', '),
    year: yearOf(v.publishedDate),
    rating: v.averageRating ? round1(v.averageRating * 2) : null,
    image: httpsUrl(v.imageLinks?.thumbnail) || null,
    reason: '',
    match: null,
    meta: {
      authors,
      pageCount: typeof v.pageCount === 'number' ? v.pageCount : null,
      categories,
      description: v.description || '',
      publisher: v.publisher || '',
      language: v.language || '',
      previewLink: v.previewLink || '',
    },
  };
}

// ── search / getDetails ─────────────────────────────────────────────────────

/**
 * Search Google Books.
 * @param {{ query: string, limit?: number, filters?: { subject?: string } }}
 * @returns {Promise<object[]>}  unified picks
 */
export async function search({ query, limit = 20, filters = {} } = {}) {
  let q = query || '';
  if (filters.subject) q = `subject:${filters.subject} ${q}`.trim();
  const params = new URLSearchParams({
    q,
    maxResults: String(limit),
    printType: 'books',
    orderBy: 'relevance',
  });
  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }
  const url = `${BASE}?${params.toString()}`;
  const data = await fetchJson(url);
  return (data.items || []).map(normalizeToPick);
}

/**
 * Fetch a single Google Books volume by id.
 * @param {string} sourceId  Google Books volumeId
 * @returns {Promise<object>} unified pick
 */
export async function getDetails(sourceId) {
  const url = `${BASE}/${encodeURIComponent(sourceId)}`;
  const data = await fetchJson(url);
  return normalizeToPick(data);
}

// ── Provider metadata ──────────────────────────────────────────────────────

export const domain = 'book';
export const label = 'Books';
export const accent = '#E8A94B';