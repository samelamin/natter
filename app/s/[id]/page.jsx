import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db, dbAvailable } from '@/lib/db.js';
import { Button } from '@/components/natter/index.jsx';
import { TmdbAttribution } from '@/components/natter/TmdbAttribution.jsx';
import { resizeImagePath } from '@/lib/share.js';

// Validate share IDs to prevent injection / spurious DB hits.
const ID_RE = /^[0-9A-Za-z]{12}$/;

const NEW_KINDS = new Set(['book', 'game', 'recipe']);
const NOUN = { all: 'film & TV', film: 'film & TV', tv: 'film & TV', book: 'book', game: 'game', recipe: 'recipe' };
function nounFor(kind) {
  return NOUN[kind] || 'great';
}
/** Link for a pick: film/TV → the rich /title page; new domains → a search that resurfaces it. */
function hrefFor(pick, setKind, query) {
  if (pick.tmdbId && (pick.kind === 'film' || pick.kind === 'tv')) {
    return `/title/${pick.kind}/${pick.tmdbId}`;
  }
  return `/?kind=${pick.domain || setKind}&q=${encodeURIComponent(query)}`;
}

async function loadSet(id) {
  if (!ID_RE.test(id)) return null;
  if (!dbAvailable()) return null;
  try {
    const pool = await db();
    const { rows } = await pool.query(
      `SELECT query, intent, kind, picks, created_at
       FROM shared_sets WHERE id = $1`,
      [id],
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      query: row.query,
      intent: row.intent || null,
      kind: row.kind,
      picks: Array.isArray(row.picks) ? row.picks : JSON.parse(row.picks),
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const set = await loadSet(id);
  if (!set) return {};

  const { query, intent, picks } = set;
  const title = `${picks.length} picks for "${query}" — Natter`;
  const description = intent || `A set of ${picks.length} ${nounFor(set.kind)} picks, chosen by Natter.`;
  const url = `/s/${id}`;
  // Lead pick's image as the preview card (a composed multi-poster PNG from
  // next/og lands well over WhatsApp's ~600KB cap and gets dropped — the
  // landing page itself carries the full grid). TMDB posters get resized via
  // the proxy; new-domain covers are already absolute external URLs.
  const lead = picks.find((p) => p.poster) || picks.find((p) => p.image);
  const ogImage = lead?.poster ? resizeImagePath(lead.poster, 'w500') : (lead?.image || null);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: 'Natter',
      locale: 'en_GB',
      url,
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function ShareSetPage({ params }) {
  const { id } = await params;
  const set = await loadSet(id);
  if (!set) notFound();

  const { query, intent, picks } = set;

  return (
    <main className="title-page">
      <section className="title-body">
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
          {picks.length} picks for &ldquo;{query}&rdquo;
        </h1>

        {intent && (
          <p className="title-body__blurb">{intent}</p>
        )}

        <div className="poster-grid">
          {picks.map((pick) => {
            const href = hrefFor(pick, set.kind, query);
            const img = pick.poster || pick.image;
            return (
              <Link key={pick.id || `${pick.kind}-${pick.tmdbId}`} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="nat-poster">
                  <div className="nat-poster__art">
                    {img ? (
                      <span className="nat-img is-loaded">
                        <img
                          src={img}
                          alt={pick.title}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </span>
                    ) : (
                      <div
                        className="nat-poster__ph"
                        style={{
                          background: 'linear-gradient(155deg, hsl(260 44% 26%), hsl(300 40% 12%))',
                        }}
                      >
                        <span>{pick.title}</span>
                      </div>
                    )}
                  </div>
                  <div className="nat-poster__body">
                    <div className="nat-poster__title">{pick.title}</div>
                    {(pick.subtitle || pick.year) && (
                      <div className="nat-poster__on">{pick.subtitle || pick.year}</div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <p style={{ color: 'var(--text-lo)', fontSize: 'var(--text-sm)', margin: 0 }}>
          Tell Natter what you&apos;re in the mood for — films, TV, books, games &amp; recipes, in seconds.
        </p>

        <div className="title-cta">
          <Button as="a" href={`/?kind=${set.kind}&q=${encodeURIComponent(query)}`} variant="brand" size="lg">
            Get my own picks
          </Button>
          <Link href="/" className="title-cta__secondary">Open Natter</Link>
        </div>

        <TmdbAttribution />
      </section>
    </main>
  );
}
