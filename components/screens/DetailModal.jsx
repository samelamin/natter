'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  IconButton, Button, Badge, MetaRow, RatingStars, Tag,
  TrailerStage, StillsRow, CastRow, EpisodeList, WatchOn, PosterCard,
  MatchScore, PosterSkeleton,
} from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';
import { ShareButton } from '@/components/natter/ShareButton.jsx';

export function DetailModal({ item, picks = [], saved = false, onToggleSave, onClose, onOpen }) {
  const [enriched, setEnriched] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // ESC key closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fetch enrichment from /api/title
  const fetchEnrichment = useCallback(async () => {
    if (!item.tmdbId) return; // no TMDB id — render with basic pick fields
    setLoading(true);
    setFetchError(false);
    try {
      const kind = item.kind === 'tv' ? 'tv' : 'movie';
      const body = { tmdbId: item.tmdbId, kind };
      // Fetch first season episodes for TV
      if (kind === 'tv') body.season = 1;
      // Keep the detail view in the language the recommendation was made in
      if (item.lang) body.lang = item.lang;
      const res = await fetch('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEnriched(data);
    } catch (err) {
      console.error('[DetailModal] enrichment fetch failed:', err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [item.tmdbId, item.kind, item.lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEnrichment();
  }, [fetchEnrichment]);

  // Merge: enriched data takes priority; fall back to pick fields
  const data = enriched
    ? {
        ...item,
        ...enriched,
        // match comes from the recommendation engine, not /api/title — keep
        // the pick's value even if the route ever starts returning the key
        match: enriched.match ?? item.match,
        // poster/backdrop: prefer enriched, fall back to pick's basic fields
        posterSrc: enriched.posterSrc || item.poster,
        backdropSrc: enriched.backdropSrc || item.background,
      }
    : {
        ...item,
        posterSrc: item.poster,
        backdropSrc: item.background,
        cast: item.cast || [],
        stills: item.stills || [],
        genres: item.genres || [],
        watch: item.watch || null,
        episodes: item.episodes || null,
      };

  // "More like this" — other picks excluding current
  const more = (picks || []).filter((p) => (p.id || p.title) !== (item.id || item.title)).slice(0, 4);

  const metaItems = [
    data.year ? <span key="y">{data.year}</span> : null,
    data.runtime ? <span key="r" className="nat-meta"><Icons.clock />{data.runtime}</span> : null,
    data.cert ? <span key="c" className="nat-meta--cert">{data.cert}</span> : null,
  ].filter(Boolean);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail__close">
          <IconButton variant="solid" round label="Close" icon={<Icons.x />} onClick={onClose} />
        </div>

        {/* Hero: TrailerStage with real embed or mock player */}
        <div className="detail__hero">
          <TrailerStage key={data.title} item={data} />
        </div>

        <div className="detail__body">
          {/* Lead: synopsis + facts sidebar */}
          <div className="detail__lead">
            <div>
              <div className="detail__top">
                <div className="detail__row1">
                  <MetaRow items={metaItems} />
                  <MatchScore value={data.match} />
                </div>
                {data.genres && data.genres.length > 0 && (
                  <div className="detail__genres">
                    {data.genres.map((g) => <Tag key={g}>{g}</Tag>)}
                  </div>
                )}
              </div>
              <p className="detail__synopsis" style={{ marginTop: 18 }}>
                {data.synopsis || data.blurb}
              </p>
              {item.reason && (
                <p
                  className="detail__synopsis"
                  style={{ marginTop: 10, color: 'var(--accent)', fontStyle: 'italic' }}
                >
                  <Icons.sparkles /> Why this pick: {item.reason}
                </p>
              )}
              <div className="detail__actions">
                <Button
                  variant="brand"
                  size="lg"
                  iconLeft={<Icons.play />}
                  onClick={() => {
                    const link = data.watch?.link;
                    if (link) window.open(link, '_blank', 'noopener,noreferrer');
                  }}
                >
                  {data.on ? `Play on ${data.on}` : 'Where to watch'}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  iconLeft={saved ? <Icons.check /> : <Icons.bookmark />}
                  onClick={() => onToggleSave && onToggleSave(item)}
                >
                  {saved ? 'Saved' : 'Watchlist'}
                </Button>
                <ShareButton item={data} variant="solid" size="lg" />
              </div>
            </div>

            {/* Facts sidebar */}
            <dl className="detail__facts">
              <div>
                <dt>Where to watch</dt>
                {loading ? (
                  <div className="nat-skel" style={{ height: 48, borderRadius: 8, marginTop: 8 }} />
                ) : (
                  <WatchOn watch={data.watch} />
                )}
              </div>
              {data.rating && (
                <div>
                  <dt>Rating</dt>
                  <dd><RatingStars value={data.rating} size="sm" /></dd>
                </div>
              )}
              {data.director && (
                <div>
                  <dt>Director</dt>
                  <dd>{data.director}</dd>
                </div>
              )}
              {data.genres && data.genres.length > 0 && (
                <div>
                  <dt>Genres</dt>
                  <dd>{data.genres.join(' · ')}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Scenes */}
          <div className="dsec">
            <div className="dsec__h">Scenes</div>
            {loading ? (
              <div className="stills">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="still nat-skel" />
                ))}
              </div>
            ) : (
              <StillsRow item={data} />
            )}
          </div>

          {/* Episodes (TV only) */}
          {data.episodes && data.episodes.length > 0 && (
            <div className="dsec">
              <div className="dsec__h">Episodes</div>
              <EpisodeList item={data} episodes={data.episodes} />
            </div>
          )}

          {/* Cast */}
          <div className="dsec">
            <div className="dsec__h">Cast</div>
            {loading ? (
              <div className="cast">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="cast__item">
                    <div className="cast__av nat-skel" />
                    <div className="nat-skel" style={{ height: 10, borderRadius: 4, marginTop: 6 }} />
                  </div>
                ))}
              </div>
            ) : (
              <CastRow cast={data.cast} />
            )}
          </div>

          {/* More like this */}
          {more.length > 0 && (
            <div className="dsec">
              <div className="dsec__h">More like this</div>
              <div className="more">
                {more.map((p) => (
                  <PosterCard
                    key={p.id || p.title}
                    item={p}
                    onClick={() => {
                      onClose();
                      setTimeout(() => onOpen && onOpen(p), 0);
                    }}
                    onPlay={() => {
                      onClose();
                      setTimeout(() => onOpen && onOpen(p), 0);
                    }}
                    onAdd={() => {}}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
