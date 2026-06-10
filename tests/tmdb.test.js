/**
 * Unit tests for lib/tmdb.js adapter functions.
 * Uses node:test + mock fetch — does NOT hit the live TMDB API.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  img,
  tmdbImageUrl,
  runtime,
  trailerKey,
  movieCert,
  tvCert,
  fromMovie,
  fromTv,
  _testCacheClear,
  MOVIE_GENRE_IDS,
  TV_GENRE_IDS,
  tmdbSearch,
  tmdbDiscover,
  tmdbPersonCredits,
} from '../lib/tmdb.js';

// ── img ─────────────────────────────────────────────────────────────────────
// URLs are routed through our own-origin proxy (app/img/[...path]/route.js)
// rather than hotlinked from image.tmdb.org.

test('img: builds correct URL', () => {
  assert.equal(img('/abc.jpg', 'w500'), '/img/w500/abc.jpg');
});

test('img: default size is w500', () => {
  assert.equal(img('/foo.jpg'), '/img/w500/foo.jpg');
});

test('img: returns null for null path', () => {
  assert.equal(img(null), null);
});

test('img: returns null for undefined path', () => {
  assert.equal(img(undefined), null);
});

// ── tmdbImageUrl (inverse of img, for server-side next/og fetches) ──────────

test('tmdbImageUrl: proxied path → absolute TMDB url', () => {
  assert.equal(tmdbImageUrl('/img/w1280/x.jpg'), 'https://image.tmdb.org/t/p/w1280/x.jpg');
});

test('tmdbImageUrl: bare size/file path resolves against the CDN host', () => {
  assert.equal(tmdbImageUrl('/w500/y.jpg'), 'https://image.tmdb.org/t/p/w500/y.jpg');
});

test('tmdbImageUrl: null → null', () => {
  assert.equal(tmdbImageUrl(null), null);
});

// ── runtime ─────────────────────────────────────────────────────────────────

test('runtime: 136 mins → "2h 16m"', () => {
  assert.equal(runtime(136), '2h 16m');
});

test('runtime: 90 mins → "1h 30m"', () => {
  assert.equal(runtime(90), '1h 30m');
});

test('runtime: 45 mins → "45m"', () => {
  assert.equal(runtime(45), '45m');
});

test('runtime: 60 mins → "1h 0m"', () => {
  assert.equal(runtime(60), '1h 0m');
});

test('runtime: null → null', () => {
  assert.equal(runtime(null), null);
});

test('runtime: 0 → null', () => {
  assert.equal(runtime(0), null);
});

// ── trailerKey ───────────────────────────────────────────────────────────────

test('trailerKey: picks official YouTube Trailer first', () => {
  const videos = [
    { site: 'Vimeo', type: 'Trailer', official: true, key: 'vimeo1' },
    { site: 'YouTube', type: 'Teaser', official: false, key: 'teaser1' },
    { site: 'YouTube', type: 'Trailer', official: true, key: 'official1' },
    { site: 'YouTube', type: 'Trailer', official: false, key: 'unofficial1' },
  ];
  assert.equal(trailerKey(videos), 'official1');
});

test('trailerKey: falls back to unofficial Trailer', () => {
  const videos = [
    { site: 'YouTube', type: 'Trailer', official: false, key: 'trailer1' },
    { site: 'YouTube', type: 'Teaser', official: false, key: 'teaser1' },
  ];
  assert.equal(trailerKey(videos), 'trailer1');
});

test('trailerKey: falls back to Teaser if no Trailer', () => {
  const videos = [
    { site: 'YouTube', type: 'Teaser', official: false, key: 'teaser1' },
  ];
  assert.equal(trailerKey(videos), 'teaser1');
});

test('trailerKey: returns null for empty array', () => {
  assert.equal(trailerKey([]), null);
});

test('trailerKey: returns null for null', () => {
  assert.equal(trailerKey(null), null);
});

// ── movieCert ────────────────────────────────────────────────────────────────

test('movieCert: returns GB certificate', () => {
  const releaseDates = {
    results: [
      { iso_3166_1: 'US', release_dates: [{ certification: 'R' }] },
      { iso_3166_1: 'GB', release_dates: [{ certification: '15' }] },
    ],
  };
  assert.equal(movieCert(releaseDates, 'GB'), '15');
});

test('movieCert: returns null if region not found', () => {
  const releaseDates = {
    results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'R' }] }],
  };
  assert.equal(movieCert(releaseDates, 'GB'), null);
});

test('movieCert: returns null for null input', () => {
  assert.equal(movieCert(null, 'GB'), null);
});

// ── tvCert ───────────────────────────────────────────────────────────────────

test('tvCert: returns GB rating', () => {
  const contentRatings = {
    results: [
      { iso_3166_1: 'US', rating: 'TV-MA' },
      { iso_3166_1: 'GB', rating: '15' },
    ],
  };
  assert.equal(tvCert(contentRatings, 'GB'), '15');
});

test('tvCert: returns null if not found', () => {
  const contentRatings = { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] };
  assert.equal(tvCert(contentRatings, 'GB'), null);
});

// ── fromMovie fixture (The Matrix, tmdbId 603) ───────────────────────────────

const MATRIX_FIXTURE = {
  id: 603,
  title: 'The Matrix',
  release_date: '1999-03-31',
  runtime: 136,
  vote_average: 8.2,
  overview: 'A computer hacker learns from mysterious rebels about the true nature of his reality.',
  tagline: 'Welcome to the Real World',
  poster_path: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
  backdrop_path: '/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg',
  genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }],
  credits: {
    cast: [
      { name: 'Keanu Reeves', character: 'Neo', profile_path: '/keanu.jpg' },
      { name: 'Laurence Fishburne', character: 'Morpheus', profile_path: '/laurence.jpg' },
      { name: 'Carrie-Anne Moss', character: 'Trinity', profile_path: '/carrie.jpg' },
    ],
    crew: [
      { name: 'Lana Wachowski', job: 'Director' },
      { name: 'Lilly Wachowski', job: 'Director' },
    ],
  },
  videos: {
    results: [
      { site: 'YouTube', type: 'Trailer', official: true, key: 'm8e-FF8MsqU' },
    ],
  },
  images: {
    backdrops: [
      { file_path: '/still1.jpg' },
      { file_path: '/still2.jpg' },
    ],
  },
  release_dates: {
    results: [
      { iso_3166_1: 'GB', release_dates: [{ certification: '15' }] },
    ],
  },
  'watch/providers': {
    results: {
      GB: {
        flatrate: [{ provider_name: 'Netflix', logo_path: '/netflix.png' }],
        rent: [{ provider_name: 'Apple TV', logo_path: '/apple.png' }],
        buy: [{ provider_name: 'Amazon Video', logo_path: '/amazon.png' }],
        link: 'https://www.justwatch.com/uk/movie/the-matrix',
      },
    },
  },
};

test('fromMovie: title and kind', () => {
  const item = fromMovie(MATRIX_FIXTURE, { match: 95 });
  assert.equal(item.title, 'The Matrix');
  assert.equal(item.kind, 'film');
});

test('fromMovie: year parsed correctly', () => {
  const item = fromMovie(MATRIX_FIXTURE, { match: 95 });
  assert.equal(item.year, 1999);
});

test('fromMovie: runtime formatted', () => {
  const item = fromMovie(MATRIX_FIXTURE, { match: 95 });
  assert.equal(item.runtime, '2h 16m');
});

test('fromMovie: rating rounded to 1dp', () => {
  const item = fromMovie(MATRIX_FIXTURE, { match: 95 });
  assert.equal(item.rating, 8.2);
});

test('fromMovie: match passthrough', () => {
  const item = fromMovie(MATRIX_FIXTURE, { match: 95 });
  assert.equal(item.match, 95);
});

test('fromMovie: cert from GB release_dates', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.equal(item.cert, '15');
});

test('fromMovie: director from crew', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.equal(item.director, 'Lana Wachowski');
});

test('fromMovie: cast has name, character, profileSrc', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.equal(item.cast.length, 3);
  assert.equal(item.cast[0].name, 'Keanu Reeves');
  assert.equal(item.cast[0].character, 'Neo');
  assert.equal(item.cast[0].profileSrc, '/img/w185/keanu.jpg');
});

test('fromMovie: trailerKey extracted', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.equal(item.trailerKey, 'm8e-FF8MsqU');
});

test('fromMovie: posterSrc and backdropSrc built', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.ok(item.posterSrc.includes('/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'));
  assert.ok(item.backdropSrc.includes('/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg'));
});

test('fromMovie: stills array populated', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.equal(item.stills.length, 2);
  assert.ok(item.stills[0].includes('/still1.jpg'));
});

test('fromMovie: watch shape correct', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.ok(Array.isArray(item.watch.stream));
  assert.equal(item.watch.stream[0].name, 'Netflix');
  assert.ok(item.watch.stream[0].logo.includes('/netflix.png'));
  assert.equal(item.watch.rent[0].name, 'Apple TV');
  assert.equal(item.watch.buy[0].name, 'Amazon Video');
  assert.equal(item.watch.link, 'https://www.justwatch.com/uk/movie/the-matrix');
});

test('fromMovie: on/onLogo from primary flatrate provider', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.equal(item.on, 'Netflix');
  assert.ok(item.onLogo.includes('/netflix.png'));
});

test('fromMovie: genres array', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.deepEqual(item.genres, ['Action', 'Science Fiction']);
});

test('fromMovie: tagline and synopsis/blurb', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.equal(item.tagline, 'Welcome to the Real World');
  assert.ok(item.synopsis.includes('hacker'));
  assert.equal(item.blurb, item.synopsis);
});

test('fromMovie: tmdbId set', () => {
  const item = fromMovie(MATRIX_FIXTURE, {});
  assert.equal(item.tmdbId, 603);
});

test('fromMovie: handles missing watch/providers gracefully', () => {
  const noWatch = { ...MATRIX_FIXTURE, 'watch/providers': undefined };
  const item = fromMovie(noWatch, {});
  assert.deepEqual(item.watch, { stream: [], rent: [], buy: [], link: null });
  assert.equal(item.on, null);
  assert.equal(item.onLogo, null);
});

// ── fromTv fixture ────────────────────────────────────────────────────────────

const BREAKING_BAD_FIXTURE = {
  id: 1396,
  name: 'Breaking Bad',
  first_air_date: '2008-01-20',
  number_of_episodes: 62,
  episode_run_time: [47],
  vote_average: 9.5,
  overview: 'A high school chemistry teacher turned methamphetamine manufacturer.',
  tagline: 'All Hail the King',
  poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
  backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
  genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
  created_by: [{ name: 'Vince Gilligan' }],
  credits: {
    cast: [
      { name: 'Bryan Cranston', character: 'Walter White', profile_path: '/bryan.jpg' },
    ],
    crew: [],
  },
  videos: {
    results: [
      { site: 'YouTube', type: 'Trailer', official: true, key: 'HhesaQXLuRY' },
    ],
  },
  images: { backdrops: [{ file_path: '/bb_still.jpg' }] },
  content_ratings: {
    results: [{ iso_3166_1: 'GB', rating: '18' }],
  },
  'watch/providers': {
    results: {
      GB: {
        flatrate: [{ provider_name: 'Netflix', logo_path: '/netflix.png' }],
        link: 'https://www.justwatch.com/uk/series/breaking-bad',
      },
    },
  },
};

const SEASON_FIXTURE = {
  episodes: [
    { episode_number: 1, name: 'Pilot', overview: 'Walter learns he has cancer.', still_path: '/ep1.jpg' },
    { episode_number: 2, name: "Cat's in the Bag", overview: 'Walter and Jesse deal with the aftermath.', still_path: '/ep2.jpg' },
  ],
};

test('fromTv: title and kind', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, { match: 97 });
  assert.equal(item.title, 'Breaking Bad');
  assert.equal(item.kind, 'tv');
});

test('fromTv: year from first_air_date', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, {});
  assert.equal(item.year, 2008);
});

test('fromTv: runtime includes episode count and duration', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, {});
  assert.ok(item.runtime.includes('62 eps'));
  assert.ok(item.runtime.includes('47m'));
});

test('fromTv: cert from content_ratings', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, {});
  assert.equal(item.cert, '18');
});

test('fromTv: director from created_by', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, {});
  assert.equal(item.director, 'Vince Gilligan');
});

test('fromTv: watch populated', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, {});
  assert.equal(item.watch.stream[0].name, 'Netflix');
  assert.equal(item.watch.link, 'https://www.justwatch.com/uk/series/breaking-bad');
});

test('fromTv: no episodes field when season not provided', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, {});
  assert.equal(item.episodes, undefined);
});

test('fromTv: episodes populated from season fixture', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, { season: SEASON_FIXTURE });
  assert.ok(Array.isArray(item.episodes));
  assert.equal(item.episodes.length, 2);
  assert.equal(item.episodes[0].n, 1);
  assert.equal(item.episodes[0].title, 'Pilot');
  assert.equal(item.episodes[0].dur, '47m');
  assert.ok(item.episodes[0].stillSrc.includes('/ep1.jpg'));
});

test('fromTv: episodes capped at 8', () => {
  const manyEps = {
    episodes: Array.from({ length: 12 }, (_, i) => ({
      episode_number: i + 1,
      name: `Episode ${i + 1}`,
      overview: '',
      still_path: null,
    })),
  };
  const item = fromTv(BREAKING_BAD_FIXTURE, { season: manyEps });
  assert.equal(item.episodes.length, 8);
});

test('fromTv: tmdbId set', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, {});
  assert.equal(item.tmdbId, 1396);
});

test('fromTv: match passthrough', () => {
  const item = fromTv(BREAKING_BAD_FIXTURE, { match: 97 });
  assert.equal(item.match, 97);
});

// ── getDetails (mock fetch) ───────────────────────────────────────────────────

import { getDetails } from '../lib/tmdb.js';

test('getDetails: calls movie endpoint and maps result', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.ok(url.includes('/movie/603'), `Expected movie URL, got: ${url}`);
    return { ok: true, status: 200, json: async () => MATRIX_FIXTURE };
  };
  try {
    const item = await getDetails({ tmdbId: 603, kind: 'movie', match: 95 });
    assert.equal(item.title, 'The Matrix');
    assert.equal(item.kind, 'film');
    assert.equal(item.trailerKey, 'm8e-FF8MsqU');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('getDetails: calls tv endpoint and maps result', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.ok(url.includes('/tv/1396'), `Expected tv URL, got: ${url}`);
    return { ok: true, status: 200, json: async () => BREAKING_BAD_FIXTURE };
  };
  try {
    const item = await getDetails({ tmdbId: 1396, kind: 'tv' });
    assert.equal(item.title, 'Breaking Bad');
    assert.equal(item.kind, 'tv');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('getDetails: fetches season when requested', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes('/season/')) {
      return { ok: true, status: 200, json: async () => SEASON_FIXTURE };
    }
    return { ok: true, status: 200, json: async () => BREAKING_BAD_FIXTURE };
  };
  try {
    const item = await getDetails({ tmdbId: 1396, kind: 'tv', season: 1 });
    assert.ok(calls.some((u) => u.includes('/season/1')), 'Should have fetched season');
    assert.ok(Array.isArray(item.episodes));
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('getDetails: throws on HTTP error', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  try {
    await assert.rejects(
      () => getDetails({ tmdbId: 9999999, kind: 'movie' }),
      /HTTP 404/,
    );
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('getDetails: caches result to avoid duplicate fetch', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let callCount = 0;
  global.fetch = async () => {
    callCount++;
    return { ok: true, status: 200, json: async () => MATRIX_FIXTURE };
  };
  try {
    await getDetails({ tmdbId: 603, kind: 'movie' });
    await getDetails({ tmdbId: 603, kind: 'movie' });
    // Second call should be served from cache — only 1 network call
    assert.equal(callCount, 1, 'Should only fetch once; second call should be cached');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

// ── getDetails input validation (path-injection guard) ─────────────────────

test('getDetails: rejects path-injection in tmdbId without any upstream fetch', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => MATRIX_FIXTURE }; };
  try {
    for (const bad of ['693134/../../authentication/token/new', '603?api_key=leak', 'abc', '12.5', '', ' 7 ']) {
      await assert.rejects(getDetails({ tmdbId: bad, kind: 'movie' }), /invalid tmdbId/);
    }
    assert.equal(calls.length, 0, 'must not issue any upstream fetch for an injected id');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('getDetails: rejects an unexpected kind instead of silently defaulting to movie', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => MATRIX_FIXTURE }; };
  try {
    for (const bad of ['film', 'banana', '', '__proto__']) {
      await assert.rejects(getDetails({ tmdbId: 603, kind: bad }), /invalid kind/);
    }
    assert.equal(calls.length, 0, 'must not fetch for an invalid kind');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('getDetails: rejects path-injection in season without any upstream fetch', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => MATRIX_FIXTURE }; };
  try {
    await assert.rejects(
      getDetails({ tmdbId: 1396, kind: 'tv', season: '1/../../authentication/token/new' }),
      /invalid season/,
    );
    assert.equal(calls.length, 0, 'must not fetch for an injected season');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

// ── Genre maps ────────────────────────────────────────────────────────────────

test('MOVIE_GENRE_IDS: Comedy → 35', () => {
  assert.equal(MOVIE_GENRE_IDS['Comedy'], 35);
});

test('MOVIE_GENRE_IDS: Drama → 18', () => {
  assert.equal(MOVIE_GENRE_IDS['Drama'], 18);
});

test('MOVIE_GENRE_IDS: Action → 28', () => {
  assert.equal(MOVIE_GENRE_IDS['Action'], 28);
});

test('MOVIE_GENRE_IDS: Science Fiction → 878', () => {
  assert.equal(MOVIE_GENRE_IDS['Science Fiction'], 878);
});

test('MOVIE_GENRE_IDS: Horror → 27', () => {
  assert.equal(MOVIE_GENRE_IDS['Horror'], 27);
});

test('TV_GENRE_IDS: Comedy → 35', () => {
  assert.equal(TV_GENRE_IDS['Comedy'], 35);
});

test('TV_GENRE_IDS: Drama → 18', () => {
  assert.equal(TV_GENRE_IDS['Drama'], 18);
});

test('TV_GENRE_IDS: Crime → 80', () => {
  assert.equal(TV_GENRE_IDS['Crime'], 80);
});

test('TV_GENRE_IDS: Sci-Fi resolves to a valid id', () => {
  // TV uses 10765 for Sci-Fi & Fantasy
  assert.ok(TV_GENRE_IDS['Sci-Fi'] > 0);
});

// ── tmdbSearch (mock fetch) ────────────────────────────────────────────────────

const SEARCH_MOVIE_RESPONSE = {
  results: [
    {
      id: 603,
      title: 'The Matrix',
      release_date: '1999-03-31',
      vote_average: 8.2,
      genre_ids: [28, 878],
      poster_path: '/matrix.jpg',
      overview: 'A computer hacker.',
      vote_count: 22000,
    },
    {
      id: 604,
      title: 'The Matrix Reloaded',
      release_date: '2003-05-15',
      vote_average: 7.2,
      genre_ids: [28, 878],
      poster_path: '/matrix2.jpg',
      overview: 'Neo returns.',
      vote_count: 12000,
    },
  ],
};

const SEARCH_TV_RESPONSE = {
  results: [
    {
      id: 1396,
      name: 'Breaking Bad',
      first_air_date: '2008-01-20',
      vote_average: 9.5,
      genre_ids: [18, 80],
      poster_path: '/bb.jpg',
      overview: 'Chemistry teacher.',
      vote_count: 14000,
    },
  ],
};

test('tmdbSearch: returns mapped picks for movies', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.ok(url.includes('/search/movie'), `Expected movie search URL, got: ${url}`);
    return { ok: true, status: 200, json: async () => SEARCH_MOVIE_RESPONSE };
  };
  try {
    const picks = await tmdbSearch({ title: 'The Matrix', kind: 'film' });
    assert.equal(picks.length, 2);
    assert.equal(picks[0].id, 'tmdb:603');
    assert.equal(picks[0].title, 'The Matrix');
    assert.equal(picks[0].kind, 'film');
    assert.equal(picks[0].year, 1999);
    assert.equal(picks[0].rating, 8.2);
    assert.ok(Array.isArray(picks[0].genres));
    assert.ok(picks[0].poster.includes('/matrix.jpg'));
    assert.equal(picks[0].tmdbId, 603);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbSearch: returns mapped picks for tv', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.ok(url.includes('/search/tv'), `Expected tv search URL, got: ${url}`);
    return { ok: true, status: 200, json: async () => SEARCH_TV_RESPONSE };
  };
  try {
    const picks = await tmdbSearch({ title: 'Breaking Bad', kind: 'tv' });
    assert.equal(picks.length, 1);
    assert.equal(picks[0].id, 'tmdb:1396');
    assert.equal(picks[0].title, 'Breaking Bad');
    assert.equal(picks[0].kind, 'tv');
    assert.equal(picks[0].year, 2008);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbSearch: respects limit', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => SEARCH_MOVIE_RESPONSE,
  });
  try {
    const picks = await tmdbSearch({ title: 'Matrix', kind: 'film', limit: 1 });
    assert.equal(picks.length, 1);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbSearch: returns [] on fetch error', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const picks = await tmdbSearch({ title: 'Anything', kind: 'film' });
    assert.ok(Array.isArray(picks));
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

// ── tmdbDiscover (mock fetch) ──────────────────────────────────────────────────

const DISCOVER_RESPONSE = {
  results: [
    {
      id: 10001,
      title: 'Comedy Hit',
      release_date: '2012-06-01',
      vote_average: 7.8,
      genre_ids: [35],
      poster_path: '/comedy.jpg',
      overview: 'Funny film.',
      vote_count: 5000,
    },
    {
      id: 10002,
      title: 'Another Comedy',
      release_date: '2015-03-20',
      vote_average: 7.1,
      genre_ids: [35],
      poster_path: '/comedy2.jpg',
      overview: 'Also funny.',
      vote_count: 3000,
    },
  ],
};

test('tmdbDiscover: calls /discover/movie with genre id', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => DISCOVER_RESPONSE };
  };
  try {
    const picks = await tmdbDiscover({ kind: 'film', genre: 'Comedy' });
    assert.ok(capturedUrl.includes('/discover/movie'), 'Should hit /discover/movie');
    assert.ok(capturedUrl.includes('with_genres=35'), 'Should include Comedy genre id 35');
    assert.equal(picks.length, 2);
    assert.equal(picks[0].kind, 'film');
    assert.equal(picks[0].year, 2012);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: calls /discover/tv for tv kind', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { id: 20001, name: 'Drama Show', first_air_date: '2015-01-01', vote_average: 8.0,
            genre_ids: [18], poster_path: '/drama.jpg', overview: 'Dramatic.', vote_count: 2000 },
        ],
      }),
    };
  };
  try {
    const picks = await tmdbDiscover({ kind: 'tv', genre: 'Drama' });
    assert.ok(capturedUrl.includes('/discover/tv'), 'Should hit /discover/tv');
    assert.equal(picks[0].kind, 'tv');
    assert.equal(picks[0].title, 'Drama Show');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: passes year range for movies', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => DISCOVER_RESPONSE };
  };
  try {
    await tmdbDiscover({ kind: 'film', yearMin: 2010, yearMax: 2019 });
    assert.ok(capturedUrl.includes('primary_release_date.gte=2010'), 'Should include yearMin');
    assert.ok(capturedUrl.includes('primary_release_date.lte=2019'), 'Should include yearMax');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: passes year range for tv', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return {
      ok: true, status: 200,
      json: async () => ({ results: [] }),
    };
  };
  try {
    await tmdbDiscover({ kind: 'tv', yearMin: 2010, yearMax: 2019 });
    assert.ok(capturedUrl.includes('first_air_date.gte=2010'), 'TV should use first_air_date for yearMin');
    assert.ok(capturedUrl.includes('first_air_date.lte=2019'), 'TV should use first_air_date for yearMax');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: passes originCountry', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => DISCOVER_RESPONSE };
  };
  try {
    await tmdbDiscover({ kind: 'film', originCountry: 'GB' });
    assert.ok(capturedUrl.includes('with_origin_country=GB'), 'Should pass origin country');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: passes without_genres to exclude genres (e.g. Animation)', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => DISCOVER_RESPONSE };
  };
  try {
    await tmdbDiscover({ kind: 'tv', genre: 'Sci-Fi', withoutGenres: [16] });
    assert.ok(capturedUrl.includes('without_genres=16'), 'Should exclude Animation (id 16)');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: genre name lookup is case-insensitive', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => DISCOVER_RESPONSE };
  };
  try {
    // The agent's LLM sometimes lowercases genre names — "sci-fi" must still
    // resolve to the TV genre id rather than silently discovering unfiltered.
    await tmdbDiscover({ kind: 'tv', genre: 'sci-fi' });
    assert.ok(
      capturedUrl.includes('with_genres=10765'),
      `lowercase "sci-fi" should resolve to TV genre 10765, got: ${capturedUrl}`,
    );
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: passes with_original_language + language for locale queries', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => DISCOVER_RESPONSE };
  };
  try {
    // An Arabic query must surface originally-Arabic content with Arabic metadata.
    await tmdbDiscover({ kind: 'film', genre: 'Comedy', originalLanguage: 'ar', language: 'ar' });
    assert.ok(capturedUrl.includes('with_original_language=ar'), `expected original-language filter, got: ${capturedUrl}`);
    assert.ok(capturedUrl.includes('language=ar'), `expected localized metadata param, got: ${capturedUrl}`);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: non-English original language lowers the vote-count floor', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => DISCOVER_RESPONSE };
  };
  try {
    // Regional cinema rarely reaches 80 TMDB votes — a floor of 80 would
    // return a near-empty pool for e.g. Arabic queries.
    await tmdbDiscover({ kind: 'film', originalLanguage: 'ar' });
    assert.ok(capturedUrl.includes('vote_count.gte=10'), `expected lowered floor, got: ${capturedUrl}`);
    await tmdbDiscover({ kind: 'film' });
    assert.ok(capturedUrl.includes('vote_count.gte=80'), `default floor must stay 80, got: ${capturedUrl}`);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: rejects malformed language codes (no URL injection)', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => DISCOVER_RESPONSE };
  };
  try {
    await tmdbDiscover({ kind: 'film', originalLanguage: 'ar&api_key=evil', language: 'x'.repeat(40) });
    assert.ok(!capturedUrl.includes('evil'), `malformed code must be dropped, got: ${capturedUrl}`);
    assert.ok(!capturedUrl.includes('language=xxxx'), `overlong code must be dropped, got: ${capturedUrl}`);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbSearch: passes language for localized titles/overviews', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  };
  try {
    await tmdbSearch({ title: 'الرسالة', kind: 'film', language: 'ar' });
    assert.ok(capturedUrl.includes('language=ar'), `expected language param, got: ${capturedUrl}`);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: pick carries a landscape backdropSrc for the hero (film)', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{ id: 7, title: 'X', poster_path: '/p.jpg', backdrop_path: '/b.jpg', genre_ids: [], vote_count: 500 }],
    }),
  });
  try {
    const picks = await tmdbDiscover({ kind: 'film' });
    assert.equal(picks[0].backdropSrc, img('/b.jpg', 'w1280'));
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: pick carries a landscape backdropSrc for the hero (tv)', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: [{ id: 8, name: 'Y', poster_path: '/p.jpg', backdrop_path: '/b.jpg', genre_ids: [], vote_count: 500 }],
    }),
  });
  try {
    const picks = await tmdbDiscover({ kind: 'tv' });
    assert.equal(picks[0].backdropSrc, img('/b.jpg', 'w1280'));
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: backdropSrc is null when the result has no backdrop_path', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: [{ id: 9, title: 'Z', poster_path: '/p.jpg', genre_ids: [], vote_count: 500 }] }),
  });
  try {
    const picks = await tmdbDiscover({ kind: 'film' });
    assert.equal(picks[0].backdropSrc, null);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbDiscover: returns [] on fetch error', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const picks = await tmdbDiscover({ kind: 'film' });
    assert.ok(Array.isArray(picks));
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

// ── tmdbPersonCredits (mock fetch) ────────────────────────────────────────────

const PERSON_SEARCH_RESPONSE = {
  results: [{ id: 42, name: 'Will Ferrell', known_for_department: 'Acting' }],
};

const PERSON_CREDITS_RESPONSE = {
  cast: [
    { id: 8000, media_type: 'movie', title: 'Elf', release_date: '2003-11-07',
      vote_average: 7.1, genre_ids: [35, 10751], poster_path: '/elf.jpg',
      overview: 'Buddy the Elf.', vote_count: 5000, popularity: 80 },
    { id: 8001, media_type: 'movie', title: 'Anchorman', release_date: '2004-07-09',
      vote_average: 7.2, genre_ids: [35], poster_path: '/anchor.jpg',
      overview: 'Ron Burgundy.', vote_count: 4000, popularity: 70 },
    { id: 8002, media_type: 'tv', name: 'The Office (US)', first_air_date: '2005-03-24',
      vote_average: 8.8, genre_ids: [35], poster_path: '/office.jpg',
      overview: 'Office comedy.', vote_count: 9000, popularity: 90 },
  ],
};

test('tmdbPersonCredits: searches person then fetches combined_credits', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes('/search/person')) {
      return { ok: true, status: 200, json: async () => PERSON_SEARCH_RESPONSE };
    }
    if (url.includes('/combined_credits')) {
      return { ok: true, status: 200, json: async () => PERSON_CREDITS_RESPONSE };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    const picks = await tmdbPersonCredits({ name: 'Will Ferrell', kind: 'all' });
    assert.ok(calls.some((u) => u.includes('/search/person')));
    assert.ok(calls.some((u) => u.includes('/person/42/combined_credits')));
    assert.ok(picks.length > 0);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbPersonCredits: kind=film returns only films', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('/search/person')) {
      return { ok: true, status: 200, json: async () => PERSON_SEARCH_RESPONSE };
    }
    return { ok: true, status: 200, json: async () => PERSON_CREDITS_RESPONSE };
  };
  try {
    const picks = await tmdbPersonCredits({ name: 'Will Ferrell', kind: 'film' });
    assert.ok(picks.every((p) => p.kind === 'film'), 'All picks should be films');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbPersonCredits: kind=tv returns only tv', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('/search/person')) {
      return { ok: true, status: 200, json: async () => PERSON_SEARCH_RESPONSE };
    }
    return { ok: true, status: 200, json: async () => PERSON_CREDITS_RESPONSE };
  };
  try {
    const picks = await tmdbPersonCredits({ name: 'Will Ferrell', kind: 'tv' });
    assert.ok(picks.every((p) => p.kind === 'tv'), 'All picks should be tv');
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbPersonCredits: returns [] when person not found', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ results: [] }),
  });
  try {
    const picks = await tmdbPersonCredits({ name: 'Nobody Real' });
    assert.deepEqual(picks, []);
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});

test('tmdbPersonCredits: returns [] on fetch error', async () => {
  _testCacheClear();
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    const picks = await tmdbPersonCredits({ name: 'Will Ferrell' });
    assert.ok(Array.isArray(picks));
  } finally {
    global.fetch = originalFetch;
    _testCacheClear();
  }
});
