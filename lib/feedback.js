import { createHash, timingSafeEqual } from 'node:crypto';

export const FEEDBACK_CATEGORIES = ['idea', 'bug', 'confusing', 'praise'];
export const FEEDBACK_STATUSES = ['new', 'reviewing', 'liked', 'actioned', 'closed'];

const MAX_MESSAGE = 2000;
const MAX_CONTACT = 240;
const MAX_PAGE = 240;
const MAX_USER_AGENT = 500;
const MAX_NOTES = 2000;

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function isTooLong(value, max) {
  return typeof value === 'string' && value.trim().length > max;
}

function oneOf(value, allowed, fallback = null) {
  return allowed.includes(value) ? value : fallback;
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const left = createHash('sha256').update(String(a)).digest();
  const right = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(left, right);
}

function parseBasic(header) {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep < 0) return null;
    return {
      user: decoded.slice(0, sep),
      password: decoded.slice(sep + 1),
    };
  } catch {
    return null;
  }
}

function parseBearer(header) {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function isoOrNull(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function clientIp(headers) {
  const xff = (headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return headers.get('cf-connecting-ip') || xff || headers.get('x-real-ip') || null;
}

export function ipHash(ip) {
  return ip ? createHash('sha256').update(ip).digest('hex').slice(0, 12) : null;
}

export function sanitizeFeedbackSubmission(body) {
  const messageRaw = body?.message;
  if (typeof messageRaw !== 'string' || !messageRaw.trim()) {
    return { ok: false, status: 400, error: 'feedback message is required' };
  }
  if (messageRaw.trim().length > MAX_MESSAGE) {
    return { ok: false, status: 400, error: 'feedback message is too long' };
  }
  if (isTooLong(body?.contact, MAX_CONTACT)) {
    return { ok: false, status: 400, error: 'contact is too long' };
  }
  if (isTooLong(body?.page, MAX_PAGE)) {
    return { ok: false, status: 400, error: 'page is too long' };
  }
  if (isTooLong(body?.userAgent, MAX_USER_AGENT)) {
    return { ok: false, status: 400, error: 'user agent is too long' };
  }

  return {
    ok: true,
    value: {
      message: text(messageRaw, MAX_MESSAGE),
      category: oneOf(body?.category, FEEDBACK_CATEGORIES, 'idea'),
      contact: text(body?.contact, MAX_CONTACT) || null,
      page: text(body?.page, MAX_PAGE) || null,
      userAgent: text(body?.userAgent, MAX_USER_AGENT) || null,
    },
  };
}

export function sanitizeFeedbackUpdate(body) {
  const hasStatus = Object.hasOwn(body || {}, 'status');
  const hasNotes = Object.hasOwn(body || {}, 'notes');
  const status = hasStatus ? oneOf(body.status, FEEDBACK_STATUSES, null) : undefined;
  if (hasStatus && !status) {
    return { ok: false, status: 400, error: 'invalid feedback status' };
  }
  if (isTooLong(body?.notes, MAX_NOTES)) {
    return { ok: false, status: 400, error: 'notes are too long' };
  }
  if (!hasStatus && !hasNotes) {
    return { ok: false, status: 400, error: 'no update fields provided' };
  }

  const value = {};
  if (hasStatus) value.status = status;
  if (hasNotes) value.notes = text(body.notes, MAX_NOTES) || null;
  return { ok: true, value };
}

export function buildFeedbackListOptions(searchParams) {
  const status = oneOf(searchParams.get('status'), FEEDBACK_STATUSES, null);
  const rawLimit = Number.parseInt(searchParams.get('limit') || '', 10);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
  const rawBefore = Number(searchParams.get('before'));
  const before = Number.isInteger(rawBefore) && rawBefore > 0 ? rawBefore : null;
  return { status, limit, before };
}

export function adminAuthResult(request, env = process.env) {
  const header = request?.headers?.get?.('authorization') || '';

  const token = parseBearer(header);
  if (token && env.NATTER_AGENT_TOKEN && safeEqual(token, env.NATTER_AGENT_TOKEN)) {
    return { ok: true, type: 'bearer' };
  }

  const basic = parseBasic(header);
  if (
    basic &&
    env.NATTER_ADMIN_USER &&
    env.NATTER_ADMIN_PASSWORD &&
    safeEqual(basic.user, env.NATTER_ADMIN_USER) &&
    safeEqual(basic.password, env.NATTER_ADMIN_PASSWORD)
  ) {
    return { ok: true, type: 'basic' };
  }

  return { ok: false, type: null };
}

export function adminChallenge() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Natter feedback"',
      'Cache-Control': 'no-store',
    },
  });
}

export function feedbackItemFromRow(row) {
  return {
    id: Number(row.id),
    message: row.message,
    category: row.category,
    contact: row.contact || null,
    page: row.page || null,
    country: row.country || null,
    userAgent: row.user_agent || null,
    status: row.status,
    notes: row.notes || null,
    createdAt: isoOrNull(row.created_at),
    updatedAt: isoOrNull(row.updated_at),
    reviewedAt: isoOrNull(row.reviewed_at),
  };
}

export async function insertFeedback(pool, item, request) {
  const headers = request.headers;
  const { rows } = await pool.query(
    `INSERT INTO feedback (message, category, contact, page, country, ip_hash, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      item.message,
      item.category,
      item.contact,
      item.page,
      headers.get('cf-ipcountry') || null,
      ipHash(clientIp(headers)),
      item.userAgent || headers.get('user-agent') || null,
    ],
  );
  return Number(rows[0]?.id);
}

export async function listFeedback(pool, { status, limit, before }) {
  const clauses = [];
  const values = [];
  if (status) {
    values.push(status);
    clauses.push(`status = $${values.length}`);
  }
  if (before) {
    values.push(before);
    clauses.push(`id < $${values.length}`);
  }
  values.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT id, message, category, contact, page, country, user_agent, status, notes, created_at, updated_at, reviewed_at
     FROM feedback
     ${where}
     ORDER BY id DESC
     LIMIT $${values.length}`,
    values,
  );
  return rows.map(feedbackItemFromRow);
}

export async function feedbackSummary(pool) {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM feedback
     GROUP BY status`,
  );
  const counts = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, 0]));
  for (const row of rows) counts[row.status] = Number(row.count) || 0;
  return counts;
}

export async function updateFeedback(pool, id, patch) {
  const feedbackId = Number(id);
  if (!Number.isInteger(feedbackId) || feedbackId <= 0) {
    return null;
  }

  const sets = ['updated_at = now()'];
  const values = [];
  if (Object.hasOwn(patch, 'status')) {
    values.push(patch.status);
    sets.push(`status = $${values.length}`);
    sets.push('reviewed_at = now()');
  }
  if (Object.hasOwn(patch, 'notes')) {
    values.push(patch.notes);
    sets.push(`notes = $${values.length}`);
  }
  values.push(feedbackId);

  const { rows } = await pool.query(
    `UPDATE feedback
     SET ${sets.join(', ')}
     WHERE id = $${values.length}
     RETURNING id, message, category, contact, page, country, user_agent, status, notes, created_at, updated_at, reviewed_at`,
    values,
  );
  return rows[0] ? feedbackItemFromRow(rows[0]) : null;
}
