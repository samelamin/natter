import { ImageResponse } from 'next/og';

// Open Graph / social-share image for the site root.
// Next emits og:image + og:image:width/height; the twitter card falls back to it.
export const alt = 'Natter — Voice-first film & TV recommendations';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Bar heights mirror the Natter mark (see components/natter Logo + icon.svg).
const BARS = [0.42, 0.7, 1, 0.7, 0.42];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #15151F 0%, #0B0B12 65%)',
          color: '#F4F3FB',
          position: 'relative',
        }}
      >
        {/* Iris glow */}
        <div
          style={{
            position: 'absolute',
            top: -160,
            width: 900,
            height: 900,
            borderRadius: 900,
            background:
              'radial-gradient(circle, rgba(124,108,255,0.28) 0%, rgba(11,11,18,0) 60%)',
          }}
        />
        {/* Mark + wordmark */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 150 }}>
            {BARS.map((h, i) => (
              <div
                key={i}
                style={{
                  width: 26,
                  height: Math.round(h * 150),
                  borderRadius: 999,
                  background: 'linear-gradient(180deg, #7C6CFF 0%, #B26CFF 100%)',
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 132, fontWeight: 800, letterSpacing: '-4px', lineHeight: 1 }}>
            Natter
          </div>
        </div>
        {/* Tagline */}
        <div style={{ marginTop: 34, fontSize: 40, color: '#B6B5CC', maxWidth: 880, textAlign: 'center' }}>
          Describe what you want to watch — get real films &amp; TV, instantly.
        </div>
      </div>
    ),
    { ...size },
  );
}
