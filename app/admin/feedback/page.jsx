import { db, dbAvailable } from '@/lib/db.js';
import {
  FEEDBACK_STATUSES,
  buildFeedbackListOptions,
  feedbackSummary,
  listFeedback,
} from '@/lib/feedback.js';

export const dynamic = 'force-dynamic';

const STATUS_LABELS = {
  new: 'New',
  reviewing: 'Reviewing',
  liked: 'Liked',
  actioned: 'Actioned',
  closed: 'Closed',
};

function paramsToUrlSearchParams(params = {}) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (Array.isArray(value)) {
      for (const v of value) out.append(key, v);
    } else if (value != null) {
      out.set(key, value);
    }
  }
  return out;
}

function timeLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  }).format(new Date(value));
}

function filterHref(status) {
  return status ? `/admin/feedback?status=${status}` : '/admin/feedback';
}

function currentPath(status) {
  return status ? `/admin/feedback?status=${status}` : '/admin/feedback';
}

export default async function FeedbackAdminPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const urlParams = paramsToUrlSearchParams(resolvedSearchParams);
  const options = buildFeedbackListOptions(urlParams);

  let items = [];
  let counts = Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, 0]));
  let storageError = null;

  if (!dbAvailable()) {
    storageError = 'Feedback storage is unavailable because DATABASE_URL is not configured.';
  } else {
    try {
      const pool = await db();
      [items, counts] = await Promise.all([
        listFeedback(pool, options),
        feedbackSummary(pool),
      ]);
    } catch (err) {
      console.error('[admin/feedback]', err);
      storageError = 'Feedback storage could not be read.';
    }
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const selected = options.status;

  return (
    <main className="admin-feedback">
      <header className="admin-feedback__header">
        <div>
          <span className="eyebrow">Natter admin</span>
          <h1>Feedback</h1>
          <p>Visitor suggestions for Sam and the review agents.</p>
        </div>
        <div className="admin-feedback__total">
          <strong>{total}</strong>
          <span>Total</span>
        </div>
      </header>

      <nav className="admin-feedback__filters" aria-label="Feedback status filters">
        <a className={!selected ? 'is-active' : ''} href={filterHref(null)}>
          All <span>{total}</span>
        </a>
        {FEEDBACK_STATUSES.map((status) => (
          <a key={status} className={selected === status ? 'is-active' : ''} href={filterHref(status)}>
            {STATUS_LABELS[status]} <span>{counts[status] || 0}</span>
          </a>
        ))}
      </nav>

      {storageError ? (
        <section className="admin-feedback__empty">
          <h2>Storage unavailable</h2>
          <p>{storageError}</p>
        </section>
      ) : items.length === 0 ? (
        <section className="admin-feedback__empty">
          <h2>No feedback here</h2>
          <p>The queue is clear for this filter.</p>
        </section>
      ) : (
        <section className="admin-feedback__list">
          {items.map((item) => (
            <article className="admin-feedback__item" key={item.id}>
              <div className="admin-feedback__item-head">
                <div>
                  <span className={`feedback-pill feedback-pill--${item.category}`}>{item.category}</span>
                  <span className={`feedback-status feedback-status--${item.status}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </div>
                <time dateTime={item.createdAt}>{timeLabel(item.createdAt)}</time>
              </div>

              <p className="admin-feedback__message" dir="auto">{item.message}</p>

              <dl className="admin-feedback__meta">
                {item.contact && (
                  <>
                    <dt>Contact</dt>
                    <dd>{item.contact}</dd>
                  </>
                )}
                {item.country && (
                  <>
                    <dt>Country</dt>
                    <dd>{item.country}</dd>
                  </>
                )}
                {item.page && (
                  <>
                    <dt>Page</dt>
                    <dd>{item.page}</dd>
                  </>
                )}
              </dl>

              <form className="admin-feedback__form" method="post" action={`/api/admin/feedback/${item.id}`}>
                <input type="hidden" name="redirectTo" value={currentPath(selected)} />
                <label>
                  <span>Status</span>
                  <select name="status" defaultValue={item.status}>
                    {FEEDBACK_STATUSES.map((status) => (
                      <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Notes</span>
                  <textarea name="notes" rows={3} defaultValue={item.notes || ''} />
                </label>
                <button type="submit">Save</button>
              </form>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
