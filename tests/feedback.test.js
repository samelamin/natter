/**
 * Unit tests for feedback validation, admin auth, and DTO helpers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  adminAuthResult,
  buildFeedbackListOptions,
  feedbackItemFromRow,
  sanitizeFeedbackSubmission,
  sanitizeFeedbackUpdate,
} from '../lib/feedback.js';

function req(headers = {}) {
  return { headers: new Headers(headers) };
}

function basic(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

test('feedback constants expose expected categories and statuses', () => {
  assert.deepEqual(FEEDBACK_CATEGORIES, ['idea', 'bug', 'confusing', 'praise']);
  assert.deepEqual(FEEDBACK_STATUSES, ['new', 'reviewing', 'liked', 'actioned', 'closed']);
});

test('sanitizeFeedbackSubmission: trims fields and keeps valid category', () => {
  const result = sanitizeFeedbackSubmission({
    message: '  Make it easier to share Arabic TV picks.  ',
    category: 'bug',
    contact: '  sam@example.com  ',
    page: '  /?q=drama  ',
    userAgent: '  Mozilla/5.0  ',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    message: 'Make it easier to share Arabic TV picks.',
    category: 'bug',
    contact: 'sam@example.com',
    page: '/?q=drama',
    userAgent: 'Mozilla/5.0',
  });
});

test('sanitizeFeedbackSubmission: defaults unknown category to idea', () => {
  const result = sanitizeFeedbackSubmission({ message: 'Nice work', category: 'feature-request' });
  assert.equal(result.ok, true);
  assert.equal(result.value.category, 'idea');
});

test('sanitizeFeedbackSubmission: rejects missing or whitespace-only message', () => {
  assert.deepEqual(sanitizeFeedbackSubmission({ message: '' }), {
    ok: false,
    status: 400,
    error: 'feedback message is required',
  });
  assert.equal(sanitizeFeedbackSubmission({ message: '   ' }).ok, false);
});

test('sanitizeFeedbackSubmission: rejects over-long message and contact', () => {
  assert.equal(sanitizeFeedbackSubmission({ message: 'x'.repeat(2001) }).error, 'feedback message is too long');
  assert.equal(
    sanitizeFeedbackSubmission({ message: 'hello', contact: 'x'.repeat(241) }).error,
    'contact is too long',
  );
});

test('sanitizeFeedbackUpdate: accepts status and notes updates', () => {
  const result = sanitizeFeedbackUpdate({ status: 'liked', notes: '  Worth doing after launch.  ' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { status: 'liked', notes: 'Worth doing after launch.' });
});

test('sanitizeFeedbackUpdate: rejects invalid status and over-long notes', () => {
  assert.equal(sanitizeFeedbackUpdate({ status: 'maybe', notes: '' }).error, 'invalid feedback status');
  assert.equal(sanitizeFeedbackUpdate({ notes: 'x'.repeat(2001) }).error, 'notes are too long');
});

test('buildFeedbackListOptions: normalizes status, limit, and before cursor', () => {
  const url = new URL('https://natter.cc/api/admin/feedback?status=liked&limit=500&before=42');
  assert.deepEqual(buildFeedbackListOptions(url.searchParams), {
    status: 'liked',
    limit: 100,
    before: 42,
  });
});

test('buildFeedbackListOptions: ignores invalid filters', () => {
  const url = new URL('https://natter.cc/api/admin/feedback?status=nope&limit=-2&before=1.5');
  assert.deepEqual(buildFeedbackListOptions(url.searchParams), {
    status: null,
    limit: 50,
    before: null,
  });
});

test('adminAuthResult: accepts matching Basic credentials', () => {
  const result = adminAuthResult(req({ authorization: basic('admin-user', 'correct-password') }), {
    NATTER_ADMIN_USER: 'admin-user',
    NATTER_ADMIN_PASSWORD: 'correct-password',
  });
  assert.deepEqual(result, { ok: true, type: 'basic' });
});

test('adminAuthResult: rejects missing or wrong Basic credentials', () => {
  const env = { NATTER_ADMIN_USER: 'admin-user', NATTER_ADMIN_PASSWORD: 'correct-password' };
  assert.equal(adminAuthResult(req(), env).ok, false);
  assert.equal(adminAuthResult(req({ authorization: basic('admin-user', 'wrong') }), env).ok, false);
});

test('adminAuthResult: accepts bearer token independently from Basic credentials', () => {
  const result = adminAuthResult(req({ authorization: 'Bearer agent-token' }), {
    NATTER_AGENT_TOKEN: 'agent-token',
  });
  assert.deepEqual(result, { ok: true, type: 'bearer' });
});

test('adminAuthResult: fails closed when env is missing', () => {
  assert.equal(adminAuthResult(req({ authorization: basic('admin-user', 'correct-password') }), {}).ok, false);
  assert.equal(adminAuthResult(req({ authorization: 'Bearer agent-token' }), {}).ok, false);
});

test('feedbackItemFromRow: returns a stable admin/agent DTO', () => {
  const item = feedbackItemFromRow({
    id: '7',
    message: 'More filters please',
    category: 'idea',
    contact: null,
    page: '/',
    country: 'GB',
    user_agent: 'Mozilla',
    status: 'new',
    notes: null,
    created_at: new Date('2026-06-13T10:00:00.000Z'),
    updated_at: new Date('2026-06-13T10:01:00.000Z'),
    reviewed_at: null,
  });

  assert.deepEqual(item, {
    id: 7,
    message: 'More filters please',
    category: 'idea',
    contact: null,
    page: '/',
    country: 'GB',
    userAgent: 'Mozilla',
    status: 'new',
    notes: null,
    createdAt: '2026-06-13T10:00:00.000Z',
    updatedAt: '2026-06-13T10:01:00.000Z',
    reviewedAt: null,
  });
});
