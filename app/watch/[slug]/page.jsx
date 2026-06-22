import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  SEARCH_PAGES,
  SITE_NAME,
  absoluteUrl,
  jsonLd,
  searchPageBySlug,
} from '@/lib/seo.js';

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return SEARCH_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = searchPageBySlug(slug);
  if (!page) return {};

  const url = `/watch/${page.slug}`;
  return {
    title: page.metaTitle,
    description: page.description,
    alternates: { canonical: url },
    keywords: [page.title, page.query, ...page.examples, 'Natter'],
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_GB',
      url,
      title: page.metaTitle,
      description: page.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: page.metaTitle,
      description: page.description,
    },
  };
}

export default async function WatchSearchPage({ params }) {
  const { slug } = await params;
  const page = searchPageBySlug(slug);
  if (!page) notFound();

  const pageUrl = absoluteUrl(`/watch/${page.slug}`);
  const appHref = `/?q=${encodeURIComponent(page.query)}`;
  const jsonLdData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: page.metaTitle,
        description: page.description,
        isPartOf: { '@id': `${absoluteUrl('/')}#website` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumbs`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Natter',
            item: absoluteUrl('/'),
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: page.title,
            item: pageUrl,
          },
        ],
      },
      {
        '@type': 'ItemList',
        '@id': `${pageUrl}#example-searches`,
        name: `${page.title} example searches`,
        itemListElement: page.examples.map((example, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: example,
          url: absoluteUrl(`/?q=${encodeURIComponent(example)}`),
        })),
      },
    ],
  };

  return (
    <main className="seo-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(jsonLdData) }}
      />

      <section className="seo-hero">
        <Link href="/" className="seo-brand" aria-label="Open Natter">
          <span className="seo-brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>Natter</span>
        </Link>
        <p className="seo-kicker">Film and TV recommendations</p>
        <h1>{page.title}</h1>
        <p className="seo-lead">{page.description}</p>
        <div className="seo-actions">
          <Link className="nat-btn nat-btn--brand nat-btn--lg" href={appHref}>
            Try this search
          </Link>
          <Link className="nat-btn nat-btn--secondary nat-btn--lg" href="/">
            Open Natter
          </Link>
        </div>
      </section>

      <section className="seo-section">
        <div>
          <h2>Search by mood, not menus</h2>
          <p>{page.intent}</p>
          <p>
            Natter is built for searches like &ldquo;where to watch...&rdquo;,
            &ldquo;what should I watch tonight?&rdquo;, or &ldquo;something like this,
            but lighter&rdquo;. It turns those requests into a focused set of films
            and shows, then surfaces availability where provider data is available.
          </p>
        </div>
        <div className="seo-panel">
          <h2>Example searches</h2>
          <ul>
            {page.examples.map((example) => (
              <li key={example}>
                <Link href={`/?q=${encodeURIComponent(example)}`}>{example}</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="seo-section seo-section--compact">
        <h2>Popular ways to use Natter</h2>
        <div className="seo-links">
          {SEARCH_PAGES.filter((item) => item.slug !== page.slug).slice(0, 6).map((item) => (
            <Link key={item.slug} href={`/watch/${item.slug}`}>
              {item.title}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
