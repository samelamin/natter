'use client';

import { useRouter } from 'next/navigation';
import {
  Logo,
  Button,
  Badge,
  Tag,
  IconButton,
  MicButton,
  Waveform,
  AgentStatus,
  AgentSteps,
  PosterCard,
} from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

function hue(s = '') {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

const DEMO_PICKS = [
  {
    id: 'd1',
    title: 'The Quiet Harbour',
    kind: 'film',
    year: 2021,
    runtime: '1h 58m',
    cert: '15',
    rating: 8.4,
    badge: { label: 'Top pick', variant: 'gold' },
    genres: ['Neo-noir', 'Mystery'],
    blurb: 'A washed-up detective takes one last case in a rain-soaked port town, only to find the victim knew his name long before they ever met, and that…',
    poster: null,
  },
  {
    id: 'd2',
    title: 'Static',
    kind: 'tv',
    year: 2023,
    runtime: '6 eps · 48m',
    cert: '15',
    rating: 8.1,
    badge: { label: 'New', variant: 'solid' },
    genres: ['Techno-thriller', 'Limited series'],
    blurb: "When a quiet radio engineer starts hearing tomorrow's news through the night-time static, she has eight hours to stop a story that hasn't…",
    poster: null,
  },
  {
    id: 'd3',
    title: 'Slow Light',
    kind: 'film',
    year: 2023,
    runtime: '1h 42m',
    cert: '12',
    rating: 7.6,
    genres: ['Sci-fi', 'Romance'],
    blurb: 'Two strangers share a night train across a country that no longer exists on any map, trading secrets until the last station forces a choice…',
    poster: null,
  },
  {
    id: 'd4',
    title: 'Marrow & Bloom',
    kind: 'film',
    year: 2019,
    runtime: '52m',
    cert: 'PG',
    rating: 9.1,
    badge: { label: 'Hidden gem', variant: 'accent' },
    genres: ['Drama', 'Short'],
    blurb: 'A chef inherits a failing greenhouse and a recipe written in a language nobody alive can read, except, perhaps, the old woman next door who…',
    poster: null,
  },
];

const SUGGESTIONS = ["A cosy whodunnit", "Something that'll make us cry", "Under 90 minutes", "Tense but not gory"];
const APP = '/';

function Nav() {
  return (
    <nav className="snav">
      <div className="snav__in">
        <a href={APP}>
          <Logo size={26} />
        </a>
        <div className="snav__links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#tonight">Tonight</a>
        </div>
        <Button as="a" variant="primary" size="md" href={APP}>
          Open Natter
        </Button>
      </div>
    </nav>
  );
}

function Preview() {
  return (
    <div className="preview">
      <div className="preview__bar">
        <span className="preview__dot" />
        <span className="preview__dot" />
        <span className="preview__dot" />
        <span className="preview__url">natter.app</span>
      </div>
      <div className="preview__body">
        <div className="preview__head">
          <h3 style={{ color: 'var(--text-hi)' }}>6 picks for</h3>
          <h3 style={{ color: 'var(--iris-300)' }}>&ldquo;tense and clever, under two hours&rdquo;</h3>
        </div>
        <div className="preview__grid">
          {DEMO_PICKS.slice(0, 4).map((p) => (
            <PosterCard key={p.id} item={p} onClick={() => {}} onPlay={() => {}} onAdd={() => {}} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <header className="hero2 site__wrap">
      <span className="eyebrow">
        <Badge variant="live" dot>
          Voice-first
        </Badge>{' '}
        for the indecisive household
      </span>
      <h1>
        Stop scrolling.
        <br />
        Just say what
        <br />
        you <em>fancy</em>.
      </h1>
      <p className="lead">
        Tell Natter the mood, an actor, or a half-remembered plot — out loud or typed. It searches
        the web and comes back with a tight shortlist you can actually agree on.
      </p>
      <div className="hero2__prompt">
        <div className="nat-field nat-field--prompt">
          <span className="nat-field__ico">
            <Icons.sparkles />
          </span>
          <input
            className="nat-field__input"
            defaultValue="Something tense and clever, under two hours"
            readOnly
          />
          <span className="nat-field__trail">
            <a href={APP} style={{ display: 'inline-flex' }}>
              <MicButton state="idle" size="sm" />
            </a>
            <a href={APP}>
              <IconButton variant="accent" round label="Send" icon={<Icons.arrowUp />} />
            </a>
          </span>
        </div>
        <div className="hero2__chips">
          {SUGGESTIONS.map((s) => (
            <Tag key={s} onClick={() => { window.location.href = APP; }}>
              {s}
            </Tag>
          ))}
        </div>
      </div>
      <Preview />
    </header>
  );
}

const STEPS = [
  {
    n: '01',
    icon: <Icons.mic />,
    t: 'Say it, or type it',
    d: "Tap the mic and talk like you would to a mate, or type a line. A vibe, an actor, a plot you half remember — anything goes.",
  },
  {
    n: '02',
    icon: <Icons.sparkles />,
    t: 'Natter does the legwork',
    d: "An agent searches the web in real time, weighs up dozens of titles and reads the reviews so you don't have to.",
  },
  {
    n: '03',
    icon: <Icons.play />,
    t: 'Settle on one, press play',
    d: "A short, honest shortlist with posters, ratings and where to stream — the bits that actually end the debate.",
  },
];

function How() {
  return (
    <section className="section site__wrap" id="how">
      <div className="section__kicker">How it works</div>
      <h2>From &ldquo;dunno, what do you fancy?&rdquo; to playing in under a minute.</h2>
      <div className="steps">
        {STEPS.map((s) => (
          <div className="stepcard" key={s.n}>
            <div className="stepcard__n">{s.n}</div>
            <div className="stepcard__ico">{s.icon}</div>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="section site__wrap" id="features" style={{ paddingTop: 24 }}>
      <div className="feature">
        <div>
          <div className="section__kicker" style={{ textAlign: 'left' }}>
            Talk, don&apos;t type
          </div>
          <h3 style={{ marginTop: 12 }}>Talk to it like a person.</h3>
          <p>
            No menus, no endless rows. Press the mic and natter away — Natter listens, shows you
            it&apos;s heard, and turns the chat into a search. Typing&apos;s there too, for the
            quiet ones.
          </p>
          <ul className="feature__list">
            <li>
              <Icons.check /> Live transcript as you talk
            </li>
            <li>
              <Icons.check /> Voice or keyboard — your call
            </li>
            <li>
              <Icons.check /> Clear listening &amp; done states
            </li>
          </ul>
        </div>
        <div className="feature__art">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
            <Badge variant="live" dot>
              Now listening
            </Badge>
            <Waveform active bars={11} color="signal" height={52} />
            <MicButton state="listening" size="lg" />
          </div>
        </div>
      </div>

      <div className="feature feature--rev">
        <div>
          <div className="section__kicker" style={{ textAlign: 'left' }}>
            Real search, real reasons
          </div>
          <h3 style={{ marginTop: 12 }}>It actually does the legwork.</h3>
          <p>
            Natter sends an agent out to the live web — comparing dozens of titles, reading the room
            and the reviews — then explains its picks instead of just guessing from what you watched
            last.
          </p>
          <ul className="feature__list">
            <li>
              <Icons.check /> Searches the open web
            </li>
            <li>
              <Icons.check /> Compares 40+ titles
            </li>
            <li>
              <Icons.check /> Shows its working as it goes
            </li>
          </ul>
        </div>
        <div className="feature__art">
          <div style={{ width: '100%', maxWidth: 320 }}>
            <div style={{ marginBottom: 18 }}>
              <AgentStatus state="searching" />
            </div>
            <AgentSteps
              steps={['Reading your request', 'Searching the web', 'Comparing 40+ titles', 'Putting picks in order']}
              activeIndex={2}
            />
          </div>
        </div>
      </div>

      <div className="feature">
        <div>
          <div className="section__kicker" style={{ textAlign: 'left' }}>
            The deciding details
          </div>
          <h3 style={{ marginTop: 12 }}>The details that settle it.</h3>
          <p>
            Runtime, year, certificate, rating and where to stream — right on the card. The blurb
            teases just enough and trails off, so nobody spoils it before you&apos;ve pressed play.
          </p>
          <ul className="feature__list">
            <li>
              <Icons.check /> Runtime &amp; rating up front
            </li>
            <li>
              <Icons.check /> Where to watch, every time
            </li>
            <li>
              <Icons.check /> Filter to just Films or TV
            </li>
          </ul>
        </div>
        <div className="feature__art" style={{ padding: 28 }}>
          <div style={{ width: 210 }}>
            <PosterCard item={DEMO_PICKS[0]} onClick={() => {}} onPlay={() => {}} onAdd={() => {}} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Tonight() {
  return (
    <section className="section site__wrap" id="tonight" style={{ paddingTop: 24 }}>
      <div className="section__kicker">On Natter tonight</div>
      <h2>A taste of what it digs up.</h2>
      <div className="tonight">
        {DEMO_PICKS.map((p) => (
          <a key={p.id} href={APP} className="nat-poster" style={{ textDecoration: 'none' }}>
            <div className="nat-poster__art">
              <div
                className="nat-poster__ph"
                style={{
                  fontSize: 14,
                  background: `linear-gradient(155deg, hsl(${hue(p.title)} 42% 26%), hsl(${(hue(p.title) + 40) % 360} 40% 12%))`,
                }}
              >
                <span>{p.title}</span>
              </div>
              {p.badge && (
                <div className="nat-poster__badge">
                  <Badge variant={p.badge.variant}>{p.badge.label}</Badge>
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="cta">
      <div className="site__wrap">
        <h2>
          Movie night,
          <br />
          <em>sorted in seconds.</em>
        </h2>
        <div className="cta__btns">
          <Button as="a" variant="brand" size="lg" href={APP} iconLeft={<Icons.mic />}>
            Start nattering
          </Button>
          <Button as="a" variant="secondary" size="lg" href="#how">
            See how it works
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="foot__in">
        <Logo size={22} />
        <div className="foot__links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href={APP}>Open app</a>
        </div>
        <span
          style={{
            color: 'var(--text-dim)',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
          }}
        >
          © 2026 Natter
        </span>
      </div>
    </footer>
  );
}

export default function MarketingPage() {
  return (
    <div className="site">
      <Nav />
      <Hero />
      <How />
      <Features />
      <Tonight />
      <CTA />
      <Footer />
    </div>
  );
}
