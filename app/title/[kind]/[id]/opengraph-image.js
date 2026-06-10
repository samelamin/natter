import { ImageResponse } from 'next/og';
import { getDetails, tmdbImageUrl } from '@/lib/tmdb.js';

export const alt = 'Natter';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Fetch the backdrop once (with a timeout) and inline it as a data URL, so the
// render never makes a second fetch that could hang/fail. Falls through to the
// poster, then to the branded gradient, so we always return a 200 image.
async function inlineImage(url, ms = 2500) {
  if (!url) return null;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || 'image/jpeg';
    const b64 = Buffer.from(await r.arrayBuffer()).toString('base64');
    return `data:${type};base64,${b64}`;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const BARS = [0.42, 0.7, 1, 0.7, 0.42];

export default async function Image({ params }) {
  const { kind, id } = await params;
  let item = null;
  if ((kind === 'film' || kind === 'tv') && /^\d+$/.test(id)) {
    try {
      item = await getDetails({ tmdbId: id, kind: kind === 'tv' ? 'tv' : 'movie' });
    } catch {
      item = null;
    }
  }

  const bg =
    (await inlineImage(tmdbImageUrl(item?.backdropSrc))) ||
    (await inlineImage(tmdbImageUrl(item?.posterSrc)));

  const title = item?.title || 'Natter';
  const sub = item
    ? [item.year, item.rating ? `★ ${item.rating}` : null, ...(item.genres || []).slice(0, 2)]
        .filter(Boolean)
        .join('  ·  ')
    : 'Describe what you want to watch — get real films & TV.';

  const mark = (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 52 }}>
        {BARS.map((h, i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: Math.round(h * 52),
              borderRadius: 999,
              background: 'linear-gradient(180deg,#7C6CFF,#B26CFF)',
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 44, fontWeight: 800, color: '#F4F3FB', letterSpacing: '-2px' }}>Natter</div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative', background: 'linear-gradient(135deg,#15151F,#0B0B12)' }}>
        {bg ? (
          <img
            src={bg}
            width={1200}
            height={630}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : null}
        <div style={{ position: 'absolute', top: 38, right: 48, display: 'flex' }}>{mark}</div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '46px 60px',
            background: 'rgba(8,9,14,0.82)',
            color: '#F4F3FB',
          }}
        >
          <div style={{ fontSize: 66, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1.05 }}>{title}</div>
          <div style={{ marginTop: 16, fontSize: 30, color: '#C9C8DC' }}>{sub}</div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable' },
    },
  );
}
