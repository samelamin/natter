/**
 * lib/watchlistCsv.js — pure CSV helpers for watchlist export.
 * Zero imports. Letterboxd/Trakt-compatible output.
 */

const INJECTION_CHARS = new Set(['=', '+', '-', '@']);

/**
 * Stringify a value and apply CSV-injection guard + RFC-4180 quoting.
 * @param {*} value
 * @returns {string}
 */
export function csvField(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);

  // CSV-injection guard: prefix with apostrophe if leading char is dangerous
  if (s.length > 0 && INJECTION_CHARS.has(s[0])) {
    s = "'" + s;
  }

  // RFC-4180 quoting: wrap in double-quotes when value contains comma,
  // double-quote, newline, or has leading/trailing whitespace
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r') ||
      s !== s.trim()) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }

  return s;
}

/**
 * Convert an array of watchlist items to a Letterboxd/Trakt-compatible CSV string.
 * Header: tmdbID,Title,Year,Type,WatchedDate,AddedAt
 * Rows are CRLF-joined with a trailing newline (RFC 4180).
 *
 * @param {Array<{tmdbId, title, year, kind, watched, addedAt}>} items
 * @returns {string}
 */
export function watchlistToCsv(items) {
  const CRLF = '\r\n';
  const header = 'tmdbID,Title,Year,Type,WatchedDate,AddedAt';

  const rows = items.map((item) => {
    const tmdbId = item.tmdbId != null ? String(item.tmdbId) : '';
    const title = csvField(item.title);
    const year = item.year != null ? String(item.year) : '';
    const type = item.kind || '';

    let watchedDate = '';
    let addedAt = '';

    if (item.addedAt != null) {
      try {
        const d = item.addedAt instanceof Date ? item.addedAt : new Date(item.addedAt);
        if (!isNaN(d.getTime())) {
          const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
          addedAt = iso;
          if (item.watched === true) {
            watchedDate = iso;
          }
        }
      } catch (_) {
        // Tolerate bad dates — leave fields empty
      }
    }

    return `${tmdbId},${title},${year},${type},${watchedDate},${addedAt}`;
  });

  return [header, ...rows].join(CRLF) + CRLF;
}
