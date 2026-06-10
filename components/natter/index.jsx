'use client';

import React from 'react';
import { Icons } from './Icons.jsx';
import { ShareButton } from './ShareButton.jsx';

// ── Logo ──────────────────────────────────────────────────────────────────
export function Logo({ size = 30 }) {
  const bars = [0.42, 0.7, 1, 0.7, 0.42];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11 }}>
      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 3, height: size * 0.84 }}>
        {bars.map((h, i) => (
          <span
            key={i}
            style={{
              width: size * 0.13,
              height: `${h * 100}%`,
              borderRadius: 999,
              background: 'var(--grad-brand)',
            }}
          />
        ))}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: size,
          letterSpacing: '-0.03em',
          color: 'var(--text-hi)',
        }}
      >
        Natter
      </span>
    </span>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', iconLeft, iconRight, loading, as: Tag = 'button', ...rest }) {
  return (
    <Tag className={`nat-btn nat-btn--${variant} nat-btn--${size}`} {...rest}>
      {loading && <span className="nat-btn__spin" />}
      {iconLeft && <span className="nat-btn__ico">{iconLeft}</span>}
      {children && <span style={loading ? { opacity: 0 } : null}>{children}</span>}
      {iconRight && <span className="nat-btn__ico">{iconRight}</span>}
    </Tag>
  );
}

export function IconButton({ icon, label, variant = 'ghost', size = 'md', round, ...rest }) {
  return (
    <button
      className={`nat-ib nat-ib--${variant} nat-ib--${size} ${round ? 'nat-ib--round' : ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      {icon}
    </button>
  );
}

// ── Badge / Tag ───────────────────────────────────────────────────────────
export function Badge({ children, variant = 'neutral', dot }) {
  return (
    <span className={`nat-badge nat-badge--${variant}`}>
      {dot && <span className="nat-badge__dot" />}
      {children}
    </span>
  );
}

export function Tag({ children, selected, onClick, onRemove }) {
  const interactive = !!onClick;
  const role = interactive ? (selected !== undefined ? 'checkbox' : 'button') : undefined;
  return (
    <span
      className={`nat-tag ${interactive ? 'nat-tag--int' : ''} ${selected ? 'nat-tag--sel' : ''}`}
      onClick={onClick}
      role={role}
      tabIndex={interactive ? 0 : undefined}
      aria-checked={role === 'checkbox' ? !!selected : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      } : undefined}
    >
      {selected && <Icons.check />}
      {children}
      {onRemove && (
        <span
          className="nat-tag__x"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Icons.x />
        </span>
      )}
    </span>
  );
}

// ── Meta + rating ─────────────────────────────────────────────────────────
export function MetaRow({ items }) {
  return (
    <span className="nat-metarow">
      {items.filter(Boolean).map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="nat-metarow__sep">·</span>}
          {it}
        </React.Fragment>
      ))}
    </span>
  );
}

export function RatingStars({ value, max = 10, size = 'sm', showNumber = true }) {
  if (!value) return null;
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  const five = [0, 1, 2, 3, 4];
  return (
    <span className={`nat-stars nat-stars--${size}`}>
      <span className="nat-stars__ico">
        <span className="nat-stars__track">
          {five.map((i) => (
            <Icons.star key={i} />
          ))}
        </span>
        <span className="nat-stars__fill" style={{ width: `${pct}%` }}>
          {five.map((i) => (
            <Icons.star key={i} />
          ))}
        </span>
      </span>
      {showNumber && (
        <span>
          <span className="nat-stars__num">{value.toFixed(1)}</span>
          <span className="nat-stars__out">/{max}</span>
        </span>
      )}
    </span>
  );
}

// ── Poster ────────────────────────────────────────────────────────────────
export function hueFrom(s = '') {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function provName(p) { return typeof p === 'string' ? p : p.name; }
function provInitials(name = '') {
  const w = name.replace(/\+/g, ' Plus').split(/\s+/).filter(Boolean);
  return (w.length > 1 ? (w[0][0] + w[1][0]) : name.slice(0, 2)).toUpperCase();
}
function initialsOf(name = '') {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── Image with shimmer-until-loaded skeleton ──────────────────────────────
export function Img({ src, alt = '', round = false, style }) {
  const [loaded, setLoaded] = React.useState(false);
  const done = () => setLoaded(true);
  return (
    <span className={`nat-img${loaded ? ' is-loaded' : ''}${round ? ' nat-img--round' : ''}`} style={style}>
      <img src={src} alt={alt} loading="lazy" onLoad={done} onError={done} />
    </span>
  );
}

// ── Watch-provider tag (logo + name) ─────────────────────────────────────
export function ProviderTag({ name, logo, className = '' }) {
  if (!name) return null;
  return (
    <span className={`prov ${className}`}>
      {logo && <img className="prov__logo" src={logo} alt="" loading="lazy" />}
      <span>{name}</span>
    </span>
  );
}

// ── Provider logo tile (real logo or initials fallback) ───────────────────
export function ProviderLogo({ provider, size = 42 }) {
  const name = provName(provider);
  const logo = typeof provider === 'object' ? (provider.logo || provider.logoSrc) : null;
  return (
    <span className="provlogo" title={name}
      style={{ width: size, height: size, borderRadius: Math.max(5, Math.round(size * 0.26)), '--h': hueFrom(name), '--fs': `${Math.round(size * 0.36)}px` }}>
      {logo ? <Img src={logo} alt={name} /> : <span className="provlogo__txt">{provInitials(name)}</span>}
    </span>
  );
}

// ── Compact provider logo row (cards) ─────────────────────────────────────
export function ProviderLogoRow({ providers = [], max = 3, size = 22 }) {
  if (!providers.length) return null;
  const shown = providers.slice(0, max);
  const extra = providers.length - shown.length;
  return (
    <span className="provrow">
      {shown.map((p, i) => <ProviderLogo key={i} provider={p} size={size} />)}
      {extra > 0 && <span className="provrow__more">+{extra}</span>}
    </span>
  );
}

// ── "Where to watch" — subscription / rent / buy + JustWatch ─────────────
export function WatchOn({ watch }) {
  if (!watch) return null;
  const { stream = [], rent = [], buy = [], link } = watch;
  if (!stream.length && !rent.length && !buy.length) {
    return <div className="watch watch--none">Not currently streaming in your region.</div>;
  }
  return (
    <div className="watch">
      {stream.length > 0 && (
        <div className="watch__group">
          <div className="watch__lbl">Stream</div>
          <div className="watch__logos">{stream.map((p, i) => <ProviderLogo key={i} provider={p} />)}</div>
        </div>
      )}
      {(rent.length > 0 || buy.length > 0) && (
        <div className="watch__sub">
          {rent.length > 0 && <div><span className="watch__k">Rent</span> {rent.map(provName).join(', ')}</div>}
          {buy.length > 0 && <div><span className="watch__k">Buy</span> {buy.map(provName).join(', ')}</div>}
        </div>
      )}
      <a className="watch__jw" href={link || '#'} target="_blank" rel="noopener noreferrer"
        onClick={(e) => { if (!link) e.preventDefault(); }}>
        Powered by JustWatch <Icons.chevR />
      </a>
    </div>
  );
}

// ── Match score ───────────────────────────────────────────────────────────
export function MatchScore({ value }) {
  if (!value) return null;
  return <span className="match">{value}% match</span>;
}

// ── Cinematic backdrop ────────────────────────────────────────────────────
export function Backdrop({ item, className = '', children, style }) {
  const h = hueFrom(item.title);
  const imgSrc = item.backdropSrc || item.background || item.posterSrc || item.poster;
  return (
    <div className={`bd ${className}`} style={{ '--h': h, '--h2': (h + 38) % 360, ...style }}>
      {imgSrc
        ? <Img src={imgSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }} />
        : <div className="bd__title" aria-hidden="true">{item.title}</div>}
      <div className="bd__scrim" />
      {children}
    </div>
  );
}

// ── Mock / real trailer player ────────────────────────────────────────────
export function TrailerStage({ item }) {
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(true);
  const key = item.trailerKey;
  return (
    <Backdrop item={item} className={`trailer ${playing ? 'is-playing' : ''}`}>
      {!playing ? (
        <div className="trailer__cover">
          <div className="trailer__meta">
            {item.badge && <Badge variant={item.badge.variant}>{item.badge.label}</Badge>}
            <h1 className="trailer__name" dir="auto">{item.title}</h1>
            {item.tagline && <p className="trailer__tag" dir="auto">{item.tagline}</p>}
          </div>
          <button className="trailer__play" onClick={() => setPlaying(true)}>
            <span className="trailer__playico"><Icons.play /></span>
            Play trailer
          </button>
        </div>
      ) : key ? (
        <div className="trailer__embed">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${key}?autoplay=1&mute=${muted ? 1 : 0}&rel=0&modestbranding=1`}
            title={`${item.title} — trailer`}
            frameBorder="0"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
          <div className="trailer__embedclose">
            <IconButton variant="solid" round label="Close trailer" icon={<Icons.x />} onClick={() => setPlaying(false)} />
          </div>
        </div>
      ) : (
        <div className="trailer__playing">
          <div className="trailer__top">
            <Badge variant="live" dot>Trailer</Badge>
            <Waveform active bars={7} color="signal" height={22} />
          </div>
          <div className="trailer__ctrls">
            <IconButton variant="solid" round label={muted ? 'Unmute' : 'Mute'}
              icon={muted ? <Icons.mute /> : <Icons.volume />}
              onClick={() => setMuted(!muted)} />
            <div className="trailer__bar"><span className="trailer__fill" /></div>
            <IconButton variant="solid" round label="Replay" icon={<Icons.replay />} onClick={() => setPlaying(false)} />
          </div>
        </div>
      )}
    </Backdrop>
  );
}

// ── Stills / scenes ───────────────────────────────────────────────────────
export function StillsRow({ item, count = 3 }) {
  const base = hueFrom(item.title);
  const stills = (item.stills || []).filter(Boolean).slice(0, count);
  if (stills.length) {
    return (
      <div className="stills">
        {stills.map((src, i) => (
          <div key={i} className="still">
            <Img src={src} alt="" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="stills">
      {Array.from({ length: count }).map((_, i) => {
        const h = (base + 20 + i * 34) % 360;
        return <div key={i} className="still" style={{ '--h': h, '--h2': (h + 30) % 360 }} />;
      })}
    </div>
  );
}

// ── Cast ──────────────────────────────────────────────────────────────────
export function CastRow({ cast = [] }) {
  return (
    <div className="cast">
      {cast.map((c) => {
        const name = typeof c === 'string' ? c : c.name;
        const profile = typeof c === 'object' ? c.profileSrc : null;
        const role = typeof c === 'object' ? c.character : null;
        return (
          <div className="cast__item" key={name}>
            <span className="cast__av" style={{ '--h': hueFrom(name) }}>
              {profile ? <Img src={profile} alt={name} round /> : initialsOf(name)}
            </span>
            <span className="cast__name">{name}</span>
            {role && <span className="cast__role">{role}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Episodes (TV) ─────────────────────────────────────────────────────────
export function EpisodeList({ item, episodes = [] }) {
  const base = hueFrom(item.title);
  return (
    <div className="eps">
      {episodes.map((ep, i) => {
        const h = (base + i * 26) % 360;
        return (
          <div className="ep" key={ep.n}>
            <div className="ep__thumb" style={{ '--h': h, '--h2': (h + 30) % 360 }}>
              {ep.stillSrc && <Img src={ep.stillSrc} alt="" style={{ zIndex: 1 }} />}
              <span className="ep__playover"><Icons.play /></span>
            </div>
            <div className="ep__body">
              <div className="ep__head">
                <span className="ep__n">{ep.n}. {ep.title}</span>
                <span className="ep__dur">{ep.dur}</span>
              </div>
              <p className="ep__desc">{ep.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Results billboard ─────────────────────────────────────────────────────
export function Billboard({ item, onPlay, onDetails, onAdd }) {
  return (
    <Backdrop item={item} className="billboard">
      <div className="billboard__content">
        <div className="billboard__badges">
          {item.badge && <Badge variant={item.badge.variant}>{item.badge.label}</Badge>}
          <MatchScore value={item.match} />
        </div>
        <h1 className="billboard__title" dir="auto">{item.title}</h1>
        <div className="billboard__meta">
          <MetaRow items={[
            <span key="y">{item.year}</span>,
            item.runtime ? <span key="r" className="nat-meta"><Icons.clock />{item.runtime}</span> : null,
            item.cert ? <span key="c" className="nat-meta--cert">{item.cert}</span> : null,
            item.rating ? <RatingStars key="s" value={item.rating} size="sm" /> : null,
          ].filter(Boolean)} />
        </div>
        <p className="billboard__blurb" dir="auto">{item.synopsis || item.blurb}</p>
        {item.reason && (
          <p
            className="billboard__blurb"
            dir="auto"
            style={{ color: 'var(--accent)', fontStyle: 'italic', marginTop: 6 }}
          >
            <Icons.sparkles /> {item.reason}
          </p>
        )}
        <div className="billboard__btns">
          <Button variant="brand" size="lg" iconLeft={item.on ? <Icons.play /> : <Icons.info />} onClick={onPlay}>
            {item.on ? `Watch on ${item.on}` : 'Take a look'}
          </Button>
          <Button variant="secondary" size="lg" iconLeft={<Icons.info />} onClick={onDetails}>More info</Button>
          <IconButton
            variant="solid"
            size="lg"
            round
            label={item.inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            icon={item.inWatchlist ? <Icons.check /> : <Icons.plus />}
            onClick={onAdd}
          />
          <ShareButton item={item} variant="solid" size="lg" round />
        </div>
      </div>
    </Backdrop>
  );
}

function PosterArt({ title, h }) {
  return (
    <div
      className="nat-poster__ph"
      style={{
        background: `linear-gradient(155deg, hsl(${h} 44% 26%), hsl(${(h + 40) % 360} 40% 12%))`,
      }}
    >
      <span>{title}</span>
    </div>
  );
}

export function PosterCard({ item, onPlay, onAdd, onClick }) {
  const h = hueFrom(item.title);
  const meta = [<span key="y">{item.year}</span>];
  if (item.runtime) meta.push(<span key="r" className="nat-meta"><Icons.clock />{item.runtime}</span>);
  if (item.cert) meta.push(<span key="c" className="nat-meta--cert">{item.cert}</span>);

  const imgSrc = item.posterSrc || item.poster;

  return (
    <div className="nat-poster" role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick && onClick()}>
      <div className="nat-poster__art">
        {imgSrc
          ? <Img src={imgSrc} alt={item.title} />
          : <PosterArt title={item.title} h={h} />}
        {item.badge && (
          <div className="nat-poster__badge">
            <Badge variant={item.badge.variant}>{item.badge.label}</Badge>
          </div>
        )}
        <div className="nat-poster__scrim">
          <div className="nat-poster__play">
            <IconButton
              variant="accent" round size="lg"
              label={`Open ${item.title}`}
              icon={<Icons.play />}
              onClick={(e) => { e.stopPropagation(); onPlay && onPlay(); }}
            />
            <ShareButton item={item} variant="solid" round size="lg" />
          </div>
        </div>
      </div>
      <div className="nat-poster__body">
        <div className="nat-poster__title" dir="auto">{item.title}</div>
        <MetaRow items={meta} />
        {item.rating && <RatingStars value={item.rating} />}
        {(item.reason || item.blurb) && (
          <div className="nat-poster__blurb" dir="auto">{item.reason || item.blurb}</div>
        )}
        <div className="nat-poster__foot">
          {item.watch && item.watch.stream && item.watch.stream.length
            ? <ProviderLogoRow providers={item.watch.stream} />
            : <span className="nat-poster__on">
                {item.on
                  ? <React.Fragment>On <ProviderTag name={item.on} logo={item.onLogo} /></React.Fragment>
                  : (item.kind === 'tv' ? 'TV Series' : 'Film')}
              </span>}
          <IconButton
            variant="ghost" size="sm"
            label={item.inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            icon={item.inWatchlist ? <Icons.check /> : <Icons.plus />}
            onClick={(e) => { e.stopPropagation(); onAdd && onAdd(); }}
          />
        </div>
      </div>
    </div>
  );
}

export function PosterSkeleton() {
  return (
    <div className="nat-poster">
      <div className="nat-poster__art nat-skel" />
      <div className="nat-poster__body">
        <div className="nat-skel" style={{ height: 18, width: '70%', borderRadius: 6 }} />
        <div className="nat-skel" style={{ height: 12, width: '45%', borderRadius: 6, marginTop: 8 }} />
        <div className="nat-skel" style={{ height: 12, width: '90%', borderRadius: 6, marginTop: 10 }} />
      </div>
    </div>
  );
}

// ── Voice ─────────────────────────────────────────────────────────────────
export function MicButton({ state = 'idle', size = 'lg', level = 0, onClick, ...rest }) {
  const scale = state === 'listening' && level ? 1 + Math.min(1, level) * 0.08 : 1;
  return (
    <button
      className={`nat-mic nat-mic--${size} nat-mic--${state}`}
      aria-label={state === 'listening' ? 'Stop' : 'Talk'}
      onClick={onClick}
      style={state === 'listening' && level ? { transform: `scale(${scale})` } : null}
      {...rest}
    >
      {state === 'processing' && <span className="nat-mic__spin" />}
      {state === 'listening' && (
        <>
          <span className="nat-mic__ring" />
          <span className="nat-mic__ring nat-mic__ring--b" />
        </>
      )}
      {state === 'listening' ? <Icons.stop /> : <Icons.mic />}
    </button>
  );
}

export function Waveform({ active = true, bars = 7, color = 'signal', height = 36 }) {
  const items = Array.from({ length: bars }, (_, i) => ({
    d: 620 + ((i * 137) % 520),
    delay: (i * 90) % 700,
  }));
  return (
    <span className={`nat-wave nat-wave--${color} ${active ? 'nat-wave--active' : ''}`} style={{ height }}>
      {items.map((b, i) => (
        <span
          key={i}
          className="nat-wave__bar"
          style={{ '--_d': `${b.d}ms`, animationDelay: `${b.delay}ms` }}
        />
      ))}
    </span>
  );
}

export function AgentStatus({ state = 'thinking', label }) {
  const map = {
    listening: 'Listening…',
    thinking: 'Reading your request',
    searching: 'Searching the web',
    comparing: 'Comparing 40+ titles',
    done: "Here's what I'd put on",
  };
  const icon =
    state === 'done' ? <Icons.check /> : state === 'searching' ? <Icons.search /> : <Icons.sparkles />;
  const spin = state !== 'done';
  return (
    <span className={`nat-agent nat-agent--${state}`}>
      <span className="nat-agent__ico">{icon}</span>
      <span>{label || map[state]}</span>
      {spin && (
        <span className="nat-agent__dots">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}

export function AgentSteps({ steps, activeIndex = 0 }) {
  return (
    <div className="nat-steps">
      {steps.map((s, i) => {
        const st = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
        return (
          <div key={i} className={`nat-step nat-step--${st}`}>
            <span className="nat-step__dot">
              {st === 'done' ? (
                <Icons.check />
              ) : st === 'active' ? (
                <span className="nat-step__ring" />
              ) : (
                <span className="nat-step__pend" />
              )}
            </span>
            <span>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────
export function PromptBar({ value, onChange, onSend, placeholder, micState, onMic }) {
  return (
    <div className="nat-field nat-field--prompt">
      <span className="nat-field__ico">
        <Icons.sparkles />
      </span>
      <input
        className="nat-field__input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onSend();
        }}
      />
      <span className="nat-field__trail">
        {onMic && <MicButton state={micState} size="sm" onClick={onMic} />}
        <IconButton
          variant="accent"
          round
          label="Send"
          icon={<Icons.arrowUp />}
          onClick={() => value.trim() && onSend()}
        />
      </span>
    </div>
  );
}

export function SegmentedToggle({ options, value, onChange }) {
  return (
    <div className="nat-seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          className="nat-seg__btn"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ initials = 'JR' }) {
  return <span className="nat-avatar">{initials}</span>;
}

export { Icons };
