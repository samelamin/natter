/**
 * app/sitemap.js — Next.js metadata route (sitemap.(js|ts) convention).
 *
 * Minimal: only the home page is indexed. /s/* (noindexed shares) and
 * /title/* (no canonical enumerable source) are intentionally omitted.
 */
export default function sitemap() {
  const base = process.env.SITE_ORIGIN || 'https://natter.cc';
  return [
    {
      url: base + '/',
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
