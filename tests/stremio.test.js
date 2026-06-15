/**
 * Unit tests for lib/stremio.js — the pure Stremio-protocol shaping helpers.
 * No I/O: recommend()/TMDB calls live in the route, not here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toStremioType,
  toNatterKind,
  buildManifest,
  parseExtra,
  absUrl,
  pickToMeta,
  metaFromDetails,
} from '../lib/stremio.js';

// ── type mapping ──────────────────────────────────────────────────────────────

test('toStremioType: film→movie, tv→series', () => {
  assert.equal(toStremioType('film'), 'movie');
  assert.equal(toStremioType('tv'), 'series');
});

test('toNatterKind: series→tv, movie→film', () => {
  assert.equal(toNatterKind('series'), 'tv');
  assert.equal(toNatterKind('movie'), 'film');
});

test('type mapping round-trips', () => {
  for (const k of ['film', 'tv']) assert.equal(toNatterKind(toStremioType(k)), k);
});

// ── manifest ──────────────────────────────────────────────────────────────────

test('buildManifest: required fields + search-only catalogs + tt prefix', () => {
  const m = buildManifest();
  assert.ok(m.id && m.name && m.version);
  assert.deepEqual(m.resources, ['catalog', 'meta']);
  assert.deepEqual(m.types, ['movie', 'series']);
  assert.deepEqual(m.idPrefixes, ['tt']);
  assert.equal(m.catalogs.length, 2);
  for (const c of m.catalogs) {
    assert.equal(c.id, 'natter');
    assert.deepEqual(c.extra, [{ name: 'search', isRequired: true }]);
  }
  assert.deepEqual(m.catalogs.map((c) => c.type), ['movie', 'series']);
});

test('buildManifest: logo included only when provided', () => {
  assert.equal(buildManifest().logo, undefined);
  assert.equal(buildManifest({ logo: 'https://x/y.svg' }).logo, 'https://x/y.svg');
});

// ── parseExtra ────────────────────────────────────────────────────────────────

test('parseExtra: strips .json and decodes a search extra', () => {
  assert.deepEqual(parseExtra('search=the matrix.json'), { search: 'the matrix' });
});

test('parseExtra: multiple &-joined extras', () => {
  assert.deepEqual(parseExtra('skip=20&genre=Action'), { skip: '20', genre: 'Action' });
});

test('parseExtra: empty/absent → {}', () => {
  assert.deepEqual(parseExtra(''), {});
  assert.deepEqual(parseExtra(undefined), {});
});

test('parseExtra: tolerates a value containing "="', () => {
  assert.deepEqual(parseExtra('search=a=b.json'), { search: 'a=b' });
});

// ── absUrl ────────────────────────────────────────────────────────────────────

test('absUrl: prefixes a relative /img path with the origin', () => {
  assert.equal(absUrl('/img/w500/p.jpg', 'https://natter.cc'), 'https://natter.cc/img/w500/p.jpg');
});

test('absUrl: passes an already-absolute url through unchanged', () => {
  assert.equal(absUrl('https://cdn/x.jpg', 'https://natter.cc'), 'https://cdn/x.jpg');
});

test('absUrl: null/undefined → undefined', () => {
  assert.equal(absUrl(null, 'https://natter.cc'), undefined);
  assert.equal(absUrl('/p.jpg', ''), undefined);
});

// ── pickToMeta ────────────────────────────────────────────────────────────────

const PICK = {
  id: 'tmdb:27205',
  tmdbId: 27205,
  title: 'Inception',
  kind: 'film',
  year: 2010,
  rating: 8.8,
  genres: ['Action', 'Sci-Fi'],
  poster: '/img/w500/incep.jpg',
  backdropSrc: '/img/w1280/incep-bg.jpg',
  blurb: 'A thief who steals corporate secrets…',
};

test('pickToMeta: maps a full pick to a Stremio meta with the IMDb id', () => {
  const meta = pickToMeta(PICK, { imdb: 'tt1375666', origin: 'https://natter.cc' });
  assert.deepEqual(meta, {
    id: 'tt1375666',
    type: 'movie',
    name: 'Inception',
    posterShape: 'poster',
    poster: 'https://natter.cc/img/w500/incep.jpg',
    background: 'https://natter.cc/img/w1280/incep-bg.jpg',
    description: 'A thief who steals corporate secrets…',
    releaseInfo: '2010',
    imdbRating: '8.8',
    genres: ['Action', 'Sci-Fi'],
  });
});

test('pickToMeta: tv pick → series', () => {
  const meta = pickToMeta({ ...PICK, kind: 'tv' }, { imdb: 'tt1', origin: 'https://x' });
  assert.equal(meta.type, 'series');
});

test('pickToMeta: no IMDb id → null (caller drops it)', () => {
  assert.equal(pickToMeta(PICK, { imdb: null, origin: 'https://x' }), null);
});

test('pickToMeta: omits optional fields that are missing', () => {
  const meta = pickToMeta(
    { title: 'Bare', kind: 'film' },
    { imdb: 'tt9', origin: 'https://x' },
  );
  assert.deepEqual(meta, { id: 'tt9', type: 'movie', name: 'Bare', posterShape: 'poster' });
});

// ── metaFromDetails ─────────────────────────────────────────────────────────

const MOVIE_DETAILS = {
  title: 'Inception',
  kind: 'film',
  year: 2010,
  runtime: '2h 28m',
  rating: 8.8,
  genres: ['Action', 'Sci-Fi'],
  director: 'Christopher Nolan',
  cast: [
    { name: 'Leonardo DiCaprio', character: 'Cobb', profileSrc: '/img/w185/leo.jpg' },
    { name: 'Elliot Page', character: 'Ariadne', profileSrc: null },
  ],
  blurb: 'A thief…',
  synopsis: 'A thief who steals corporate secrets…',
  posterSrc: '/img/w500/p.jpg',
  backdropSrc: '/img/w1280/b.jpg',
  trailerKey: 'YoHD9XEInc0',
  tmdbId: 27205,
};

test('metaFromDetails: maps a movie, prefers synopsis, no videos', () => {
  const meta = metaFromDetails(MOVIE_DETAILS, {
    imdb: 'tt1375666',
    type: 'movie',
    origin: 'https://natter.cc',
  });
  assert.equal(meta.id, 'tt1375666');
  assert.equal(meta.type, 'movie');
  assert.equal(meta.name, 'Inception');
  assert.equal(meta.poster, 'https://natter.cc/img/w500/p.jpg');
  assert.equal(meta.background, 'https://natter.cc/img/w1280/b.jpg');
  assert.equal(meta.description, 'A thief who steals corporate secrets…');
  assert.equal(meta.releaseInfo, '2010');
  assert.equal(meta.imdbRating, '8.8');
  assert.equal(meta.runtime, '2h 28m');
  assert.deepEqual(meta.director, ['Christopher Nolan']);
  assert.deepEqual(meta.cast, ['Leonardo DiCaprio', 'Elliot Page']);
  assert.deepEqual(meta.trailers, [{ source: 'YoHD9XEInc0', type: 'Trailer' }]);
  assert.equal('videos' in meta, false);
});

const SERIES_DETAILS = {
  title: 'Breaking Bad',
  kind: 'tv',
  year: 2008,
  rating: 8.9,
  genres: ['Drama', 'Crime'],
  blurb: 'A chemistry teacher…',
  posterSrc: '/img/w500/bb.jpg',
  backdropSrc: null,
};

const EPISODES = [
  { season: 1, episode: 1, name: 'Pilot', overview: 'He starts cooking.', air_date: '2008-01-20', still: '/img/w300/e1.jpg' },
  { season: 1, episode: 2, name: "Cat's in the Bag...", overview: null, air_date: null, still: null },
];

test('metaFromDetails: series builds videos with tt:S:E ids', () => {
  const meta = metaFromDetails(SERIES_DETAILS, {
    imdb: 'tt0903747',
    type: 'series',
    origin: 'https://natter.cc',
    episodes: EPISODES,
  });
  assert.equal(meta.type, 'series');
  assert.equal(meta.videos.length, 2);
  assert.deepEqual(meta.videos[0], {
    id: 'tt0903747:1:1',
    title: 'Pilot',
    season: 1,
    episode: 1,
    released: '2008-01-20T00:00:00.000Z',
    overview: 'He starts cooking.',
    thumbnail: 'https://natter.cc/img/w300/e1.jpg',
  });
  // Missing air_date/overview/still are omitted, not null.
  assert.deepEqual(meta.videos[1], {
    id: 'tt0903747:1:2',
    title: "Cat's in the Bag...",
    season: 1,
    episode: 2,
  });
});

test('metaFromDetails: series without episodes has no videos key', () => {
  const meta = metaFromDetails(SERIES_DETAILS, { imdb: 'tt0903747', type: 'series', origin: 'https://x' });
  assert.equal('videos' in meta, false);
});

test('metaFromDetails: no IMDb id → null', () => {
  assert.equal(metaFromDetails(MOVIE_DETAILS, { imdb: null, type: 'movie' }), null);
});
