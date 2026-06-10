/**
 * Unit tests for lib/watchlistCsv.js — pure CSV helpers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { csvField, watchlistToCsv } from '../lib/watchlistCsv.js';

// ── csvField: CSV-injection guard ──────────────────────────────────────────

test('csvField: prefixes leading = with apostrophe', () => {
  assert.equal(csvField('=SUM(A1)'), "'=SUM(A1)");
});

test('csvField: prefixes leading + with apostrophe', () => {
  assert.equal(csvField('+x'), "'+x");
});

test('csvField: prefixes leading - with apostrophe', () => {
  assert.equal(csvField('-x'), "'-x");
});

test('csvField: prefixes leading @ with apostrophe', () => {
  assert.equal(csvField('@x'), "'@x");
});

// ── csvField: RFC-4180 quoting ─────────────────────────────────────────────

test('csvField: quotes value containing a comma', () => {
  assert.equal(csvField('Hello, World'), '"Hello, World"');
});

test('csvField: doubles internal double-quotes and wraps', () => {
  assert.equal(csvField('Say "hi"'), '"Say ""hi"""');
});

test('csvField: quotes value containing a newline', () => {
  assert.equal(csvField('line1\nline2'), '"line1\nline2"');
});

test('csvField: quotes value with leading space', () => {
  assert.equal(csvField(' leading'), '" leading"');
});

test('csvField: quotes value with trailing space', () => {
  assert.equal(csvField('trailing '), '"trailing "');
});

test('csvField: plain value needs no quoting', () => {
  assert.equal(csvField('Inception'), 'Inception');
});

test('csvField: numeric value stringified without quoting', () => {
  assert.equal(csvField(2010), '2010');
});

test('csvField: null becomes empty string', () => {
  assert.equal(csvField(null), '');
});

test('csvField: undefined becomes empty string', () => {
  assert.equal(csvField(undefined), '');
});

// ── watchlistToCsv: header ─────────────────────────────────────────────────

test('watchlistToCsv: emits exact header line', () => {
  const csv = watchlistToCsv([]);
  const header = csv.split('\r\n')[0];
  assert.equal(header, 'tmdbID,Title,Year,Type,WatchedDate,AddedAt');
});

// ── watchlistToCsv: watched item gets WatchedDate ─────────────────────────

test('watchlistToCsv: watched item gets WatchedDate as ISO date of addedAt', () => {
  const items = [{
    tmdbId: 27205,
    title: 'Inception',
    year: 2010,
    kind: 'film',
    watched: true,
    addedAt: new Date('2024-03-15T10:30:00.000Z'),
  }];
  const csv = watchlistToCsv(items);
  const row = csv.split('\r\n')[1];
  assert.equal(row, '27205,Inception,2010,film,2024-03-15,2024-03-15');
});

// ── watchlistToCsv: unwatched item has empty WatchedDate ──────────────────

test('watchlistToCsv: unwatched item has empty WatchedDate', () => {
  const items = [{
    tmdbId: 550,
    title: 'Fight Club',
    year: 1999,
    kind: 'film',
    watched: false,
    addedAt: new Date('2024-01-10T08:00:00.000Z'),
  }];
  const csv = watchlistToCsv(items);
  const row = csv.split('\r\n')[1];
  assert.equal(row, '550,Fight Club,1999,film,,2024-01-10');
});

// ── watchlistToCsv: missing year/addedAt tolerated ─────────────────────────

test('watchlistToCsv: missing year produces empty field, no throw', () => {
  const items = [{
    tmdbId: 1,
    title: 'No Year',
    kind: 'tv',
    watched: false,
  }];
  let csv;
  assert.doesNotThrow(() => { csv = watchlistToCsv(items); });
  const row = csv.split('\r\n')[1];
  // tmdbID,Title,Year,Type,WatchedDate,AddedAt
  assert.equal(row, '1,No Year,,tv,,');
});

test('watchlistToCsv: missing addedAt produces empty fields, no throw', () => {
  const items = [{
    tmdbId: 2,
    title: 'No Date',
    year: 2020,
    kind: 'film',
    watched: true,
    addedAt: undefined,
  }];
  let csv;
  assert.doesNotThrow(() => { csv = watchlistToCsv(items); });
  const row = csv.split('\r\n')[1];
  // WatchedDate should be empty when addedAt is missing even if watched=true
  assert.equal(row, '2,No Date,2020,film,,');
});

// ── watchlistToCsv: CRLF row joining and trailing newline ─────────────────

test('watchlistToCsv: rows are CRLF-joined with trailing newline', () => {
  const items = [
    { tmdbId: 1, title: 'A', year: 2000, kind: 'film', watched: false, addedAt: new Date('2024-01-01T00:00:00Z') },
    { tmdbId: 2, title: 'B', year: 2001, kind: 'tv',   watched: false, addedAt: new Date('2024-02-01T00:00:00Z') },
  ];
  const csv = watchlistToCsv(items);
  // Should end with \r\n
  assert.ok(csv.endsWith('\r\n'), 'CSV must end with CRLF');
  // Should have header + 2 rows + trailing empty = 4 segments when split by \r\n
  const parts = csv.split('\r\n');
  assert.equal(parts.length, 4); // header, row1, row2, ''
  assert.equal(parts[parts.length - 1], '');
});

// ── csvField: injection guard + quoting interaction ────────────────────────

test('csvField: injection char prefixed before quoting check (=SUM with comma)', () => {
  // "=A,B" — starts with = so gets apostrophe prefix, then contains comma → quoted
  assert.equal(csvField('=A,B'), '"\'=A,B"');
});
