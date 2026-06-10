import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDetails } from '@/lib/tmdb.js';
import { resizeImagePath } from '@/lib/share.js';
import { Backdrop, MetaRow, RatingStars, CastRow, WatchOn, Button } from '@/components/natter/index.jsx';
import { ShareButton } from '@/components/natter/ShareButton.jsx';
import { TitlePageActions } from '@/components/screens/TitlePageActions.jsx';
import { TmdbAttribution } from '@/components/natter/TmdbAttribution.jsx';

// Server component: thin wrapper over getDetails(). The presentational pieces are
// client components but Next still SSRs them to HTML, so crawlers/cold visitors
// get a real page. getDetails validates id/kind; we 404 on a non-title result.
async function load(kind, id) {
  if ((kind !== 'film' && kind !== 'tv') || !/^\d+$/.test(id)) return null;
  try {
    const item = await getDetails({ tmdbId: id, kind: kind === 'tv' ? 'tv' : 'movie' });
    return item && item.title ? item : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { kind, id } = await params;
  const item = await load(kind, id);
  if (!item) return {};
  const heading = `${item.title}${item.year ? ` (${item.year})` : ''} — Natter`;
  const description = item.blurb || `Where to watch ${item.title} and more, on Natter.`;
  const url = `/title/${kind}/${id}`;
  // og:image is the proxied TMDB JPEG, NOT a composed next/og PNG: a 1200×630
  // photographic PNG is ~1.4MB, which WhatsApp silently refuses (~600KB cap),
  // so previews never rendered. The w780 JPEG is ~100KB, Cloudflare-cached,
  // and unfurls instantly everywhere. metadataBase makes the URL absolute.
  const ogImage =
    resizeImagePath(item.backdropSrc, 'w780') || resizeImagePath(item.posterSrc, 'w500');
  // openGraph/twitter are replaced wholesale on merge, so re-declare type/siteName/
  // locale, and set twitter.{title,description} or X shows the generic site title.
  return {
    title: heading,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: 'Natter',
      locale: 'en_GB',
      url,
      title: heading,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: heading,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function TitlePage({ params }) {
  const { kind, id } = await params;
  const item = await load(kind, id);
  if (!item) notFound();

  const meta = [
    item.year ? <span key="y">{item.year}</span> : null,
    item.cert ? <span key="c" className="nat-meta--cert">{item.cert}</span> : null,
    item.runtime ? <span key="r" className="nat-meta">{item.runtime}</span> : null,
  ].filter(Boolean);

  return (
    <main className="title-page">
      <TitlePageActions
        item={{
          tmdbId: Number(id),
          kind,
          title: item.title,
          poster: item.posterSrc,
          year: item.year,
          rating: item.rating,
        }}
      />
      <Backdrop item={item} className="title-hero">
        <div className="title-hero__inner">
          <h1 className="title-hero__name" dir="auto">{item.title}</h1>
          <div className="title-hero__meta">
            <MetaRow items={meta} />
            {item.rating ? <RatingStars value={item.rating} /> : null}
          </div>
        </div>
      </Backdrop>

      <section className="title-body">
        {(item.synopsis || item.blurb) && (
          <p className="title-body__blurb" dir="auto">{item.synopsis || item.blurb}</p>
        )}
        {item.watch ? <WatchOn watch={item.watch} /> : null}
        {item.cast && item.cast.length ? <CastRow cast={item.cast} /> : null}

        <div className="title-cta">
          <Button as="a" href={'/?q=' + encodeURIComponent('Something like ' + item.title)} variant="brand" size="lg">
            Find things like this
          </Button>
          <ShareButton item={item} variant="solid" size="lg" targets />
          <Link href="/" className="title-cta__secondary">Open Natter</Link>
        </div>

        <TmdbAttribution />
      </section>
    </main>
  );
}
