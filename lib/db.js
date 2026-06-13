/**
 * lib/db.js — server-only Postgres access.
 * NEVER import from client code.
 *
 * Degrades gracefully: when DATABASE_URL is unset (e.g. local dev without a
 * database), dbAvailable() is false and account features return 503 — search
 * keeps working without any database.
 */

import pg from 'pg';

const { Pool } = pg;

let _pool;
let _ready;

export function dbAvailable() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return _pool;
}

// Idempotent bootstrap — runs once per process, safe to re-run.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  services TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('film','tv')),
  title TEXT NOT NULL,
  poster TEXT,
  year INT,
  rating REAL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tmdb_id, kind)
);
CREATE TABLE IF NOT EXISTS searches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query TEXT NOT NULL,
  lang TEXT,
  country TEXT,
  picks_count INT,
  ok BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS searches_country_created_idx ON searches (country, created_at);
CREATE INDEX IF NOT EXISTS searches_created_idx ON searches (created_at);
CREATE TABLE IF NOT EXISTS trending_chips (
  locale TEXT PRIMARY KEY,
  chips JSONB NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rec_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  intent TEXT,
  kind TEXT,
  picks JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rec_history_user_created_idx ON rec_history (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS shared_sets (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  intent TEXT,
  kind TEXT,
  picks JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS feedback (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'idea' CHECK (category IN ('idea','bug','confusing','praise')),
  contact TEXT,
  page TEXT,
  country TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','liked','actioned','closed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS feedback_status_created_idx ON feedback (status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS watched BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS trakt_tokens (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  trakt_user TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trakt_watched (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('film','tv')),
  watched_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, tmdb_id, kind)
);
`;

/** Get the pool with the schema guaranteed to exist. */
export async function db() {
  const pool = getPool();
  if (!_ready) _ready = pool.query(SCHEMA);
  await _ready;
  return pool;
}
