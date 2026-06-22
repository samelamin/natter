import { SEARCH_PAGES, absoluteUrl } from '@/lib/seo.js';

export default function sitemap() {
  return [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...SEARCH_PAGES.map((page) => ({
      url: absoluteUrl(`/watch/${page.slug}`),
      changeFrequency: 'monthly',
      priority: 0.82,
    })),
  ];
}
