'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  IconButton, Button, Badge, MetaRow, RatingStars, Tag,
  TrailerStage, StillsRow, CastRow, EpisodeList, WatchOn, PosterCard,
  MatchScore, PosterSkeleton, Backdrop, Img,
} from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';
import { ShareButton } from '@/components/natter/ShareButton.jsx';

const NEW_DOMAINS = new Set(['book', 'game', 'recipe']);

/**
 * True when the pick comes from the book/game/recipe providers. Those picks
 * carry `domain` (not `kind`) and have no tmdbId — they bypass the /api/title
 * fetch (which is TMDB-only) and render directly from the pick payload.
 */
function isNewDomain(item) {
  return !!(item && item.domain && NEW_DOMAINS.has(item.domain));
}

/**
 * Book detail body — synopsis, author/pages/categories/publisher dl,
 * and a Preview link to Google Books when available.
 */
function BookDetail({ item }) {
  const meta = item.meta || {};
  const authors = Array.isArray(meta.authors) ? meta.authors : [];
  const categories = Array.isArray(meta.categories) ? meta.categories : [];
  return (
    <div className="detail__body">
      <div className="detail__lead">
        <div>
          <div className="detail__top">
            <div className="detail__row1">
              <MetaRow items={[
                item.year ? <span key="y">{item.year}</span> : null,
                item.rating ? <RatingStars key="r" value={item.rating} size="sm" /> : null,
              ].filter(Boolean)} />
              <MatchScore value={item.match} />
            </div>
            {categories.length > 0 && (
              <div className="detail__genres">
                {categories.slice(0, 6).map((g) => <Tag key={g}>{g}</Tag>)}
              </div>
            )}
          </div>
          {meta.description && (
            <p className="detail__synopsis" dir="auto" style={{ marginTop: 18 }}>
              {meta.description}
            </p>
          )}
          {item.reason && (
            <p
              className="detail__synopsis"
              dir="auto"
              style={{ marginTop: 10, color: 'var(--accent)', fontStyle: 'italic' }}
            >
              <Icons.sparkles /> Why this pick: {item.reason}
            </p>
          )}
          <div className="detail__actions">
            {meta.previewLink && (
              <Button
                as="a"
                variant="brand"
                size="lg"
                iconLeft={<Icons.externalLink />}
                href={meta.previewLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Preview
              </Button>
            )}
            <ShareButton item={item} variant="solid" size="lg" />
          </div>
        </div>

        <dl className="detail__facts">
          {authors.length > 0 && (
            <div>
              <dt>{authors.length === 1 ? 'Author' : 'Authors'}</dt>
              <dd>{authors.join(', ')}</dd>
            </div>
          )}
          {meta.pageCount ? (
            <div>
              <dt>Pages</dt>
              <dd>{meta.pageCount}</dd>
            </div>
          ) : null}
          {categories.length > 0 && (
            <div>
              <dt>Categories</dt>
              <dd>{categories.join(' · ')}</dd>
            </div>
          )}
          {meta.publisher && (
            <div>
              <dt>Publisher</dt>
              <dd>{meta.publisher}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

/**
 * Game detail body — synopsis, platforms/genres/metacritic/released dl,
 * and a screenshots row reusing the existing stills layout.
 */
function GameDetail({ item }) {
  const meta = item.meta || {};
  const genres = Array.isArray(meta.genres) ? meta.genres : [];
  const platforms = Array.isArray(meta.platforms) ? meta.platforms : [];
  const screenshots = Array.isArray(meta.screenshots) ? meta.screenshots : [];
  return (
    <div className="detail__body">
      <div className="detail__lead">
        <div>
          <div className="detail__top">
            <div className="detail__row1">
              <MetaRow items={[
                item.year ? <span key="y">{item.year}</span> : null,
                typeof meta.metacritic === 'number' && meta.metacritic > 0
                  ? <span key="mc" className="nat-meta--cert" title="Metacritic">{meta.metacritic}</span>
                  : null,
                item.rating ? <RatingStars key="r" value={item.rating} size="sm" /> : null,
              ].filter(Boolean)} />
              <MatchScore value={item.match} />
            </div>
            {genres.length > 0 && (
              <div className="detail__genres">
                {genres.slice(0, 6).map((g) => <Tag key={g}>{g}</Tag>)}
              </div>
            )}
          </div>
          {meta.description && (
            <p className="detail__synopsis" dir="auto" style={{ marginTop: 18 }}>
              {meta.description}
            </p>
          )}
          {item.reason && (
            <p
              className="detail__synopsis"
              dir="auto"
              style={{ marginTop: 10, color: 'var(--accent)', fontStyle: 'italic' }}
            >
              <Icons.sparkles /> Why this pick: {item.reason}
            </p>
          )}
          <div className="detail__actions">
            <ShareButton item={item} variant="solid" size="lg" />
          </div>
        </div>

        <dl className="detail__facts">
          {platforms.length > 0 && (
            <div>
              <dt>Platforms</dt>
              <dd>{platforms.slice(0, 6).join(' · ')}</dd>
            </div>
          )}
          {genres.length > 0 && (
            <div>
              <dt>Genres</dt>
              <dd>{genres.join(' · ')}</dd>
            </div>
          )}
          {typeof meta.metacritic === 'number' && meta.metacritic > 0 && (
            <div>
              <dt>Metacritic</dt>
              <dd>{meta.metacritic}</dd>
            </div>
          )}
          {meta.released && (
            <div>
              <dt>Released</dt>
              <dd>{meta.released}</dd>
            </div>
          )}
        </dl>
      </div>

      {screenshots.length > 0 && (
        <div className="dsec">
          <div className="dsec__h">Screenshots</div>
          <div className="screenshots-row">
            {screenshots.slice(0, 6).map((src, i) => (
              <div key={i} className="screenshot">
                <Img src={src} alt="" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Recipe detail body — prominent ingredients list, step-by-step instructions,
 * cuisine/category dl, and outbound YouTube + source links.
 */
function RecipeDetail({ item }) {
  const meta = item.meta || {};
  const ingredients = Array.isArray(meta.ingredients) ? meta.ingredients : [];
  const steps = (meta.instructions || '').split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  const ytId = meta.youtube ? extractYouTubeId(meta.youtube) : null;
  return (
    <div className="detail__body">
      <div className="detail__lead">
        <div>
          <div className="detail__top">
            <div className="detail__row1">
              <MetaRow items={[
                meta.area ? <span key="area">{meta.area}</span> : null,
                meta.category ? <span key="cat">{meta.category}</span> : null,
              ].filter(Boolean)} />
              <MatchScore value={item.match} />
            </div>
          </div>
          {item.reason && (
            <p
              className="detail__synopsis"
              dir="auto"
              style={{ color: 'var(--accent)', fontStyle: 'italic' }}
            >
              <Icons.sparkles /> Why this pick: {item.reason}
            </p>
          )}
          <div className="detail__actions">
            {ytId && (
              <Button
                as="a"
                variant="brand"
                size="lg"
                iconLeft={<Icons.play />}
                href={`https://www.youtube.com/watch?v=${ytId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch on YouTube
              </Button>
            )}
            {meta.source && (
              <Button
                as="a"
                variant="secondary"
                size="lg"
                iconLeft={<Icons.externalLink />}
                href={meta.source}
                target="_blank"
                rel="noopener noreferrer"
              >
                Original recipe
              </Button>
            )}
            <ShareButton item={item} variant="solid" size="lg" />
          </div>
        </div>

        <dl className="detail__facts">
          {meta.area && (
            <div>
              <dt>Cuisine</dt>
              <dd>{meta.area}</dd>
            </div>
          )}
          {meta.category && (
            <div>
              <dt>Category</dt>
              <dd>{meta.category}</dd>
            </div>
          )}
          {Array.isArray(meta.tags) && meta.tags.length > 0 && (
            <div>
              <dt>Tags</dt>
              <dd>{meta.tags.join(' · ')}</dd>
            </div>
          )}
        </dl>
      </div>

      {ingredients.length > 0 && (
        <div className="dsec">
          <div className="dsec__h">Ingredients</div>
          <ul className="recipe-ingredients">
            {ingredients.map((ing, i) => (
              <li key={i}>
                <span className="recipe-ingredients__name">{ing.name}</span>
                {ing.measure ? <span className="recipe-ingredients__measure">{ing.measure}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {steps.length > 0 && (
        <div className="dsec">
          <div className="dsec__h">Instructions</div>
          <ol className="recipe-steps">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/**
 * Top-level wrapper for new-domain modals: chrome + domain-specific body.
 * Watchlist save button is intentionally absent (watchlist is TMDB-only).
 */
function NewDomainDetail({ item, onClose }) {
  // Own ESC-close + scroll-lock so the new-domain modal behaves like film/TV.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  let Body;
  if (item.domain === 'book') Body = BookDetail;
  else if (item.domain === 'game') Body = GameDetail;
  else Body = RecipeDetail;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail" role="dialog" aria-modal="true" aria-label={item.title} onClick={(e) => e.stopPropagation()}>
        <div className="detail__close">
          <IconButton variant="solid" round label="Close" icon={<Icons.x />} onClick={onClose} />
        </div>
        <div className="detail__hero">
          <Backdrop item={item} className="trailer">
            <div className="trailer__cover">
              <div className="trailer__meta">
                {item.badge && <Badge variant={item.badge.variant}>{item.badge.label}</Badge>}
                <h1 className="trailer__name" dir="auto">{item.title}</h1>
                {item.subtitle && <p className="trailer__tag" dir="auto">{item.subtitle}</p>}
              </div>
            </div>
          </Backdrop>
        </div>
        <Body item={item} />
      </div>
    </div>
  );
}

export function DetailModal(props) {
  // Hook-free dispatcher: hooks live in the child components, so neither calls
  // hooks conditionally (rules-of-hooks). New domains render directly from the
  // pick (no /api/title); the save button is intentionally absent for them.
  if (isNewDomain(props.item)) {
    return <NewDomainDetail item={props.item} onClose={props.onClose} />;
  }
  return <FilmTvDetail {...props} />;
}

function FilmTvDetail({ item, picks = [], saved = false, onToggleSave, onClose, onOpen }) {
  // ── ESC key closes (mounted once for the lifetime of the modal)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Body scroll lock (modal lifetime)
  useEffect(() => {
    const saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = saved; };
  }, []);

  const [enriched, setEnriched] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

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
      <div className="detail" role="dialog" aria-modal="true" aria-label={item.title} onClick={(e) => e.stopPropagation()}>
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
              <p className="detail__synopsis" dir="auto" style={{ marginTop: 18 }}>
                {data.synopsis || data.blurb}
              </p>
              {item.reason && (
                <p
                  className="detail__synopsis"
                  dir="auto"
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
