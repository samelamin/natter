'use client';

// Lucide-style icons, 2px round stroke
function Ic(paths, fill) {
  const IconComponent = (props) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {paths}
  </svg>
  );
  IconComponent.displayName = 'NatterIcon';
  return IconComponent;
}

export const Icons = {
  mic: Ic(
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" stroke="none" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </>,
  ),
  stop: Ic(<rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" stroke="none" />),
  search: Ic(
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>,
  ),
  sparkles: Ic(
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
    </>,
  ),
  arrowUp: Ic(
    <>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </>,
  ),
  play: Ic(<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" />),
  plus: Ic(
    <>
      <path d="M5 12h14M12 5v14" />
    </>,
  ),
  check: Ic(<path d="M20 6 9 17l-5-5" />),
  x: Ic(<path d="M18 6 6 18M6 6l12 12" />),
  clock: Ic(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  film: Ic(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 8h4M17 8h4M3 16h4M17 16h4" />
    </>,
  ),
  tv: Ic(
    <>
      <rect x="2" y="7" width="20" height="13" rx="2" />
      <path d="m7 3 5 4 5-4" />
    </>,
  ),
  layers: Ic(
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
    </>,
  ),
  sliders: Ic(
    <>
      <line x1="4" x2="4" y1="21" y2="14" />
      <line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" />
      <line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" />
      <line x1="20" x2="20" y1="12" y2="3" />
      <line x1="2" x2="6" y1="14" y2="14" />
      <line x1="10" x2="14" y1="8" y2="8" />
      <line x1="18" x2="22" y1="16" y2="16" />
    </>,
  ),
  back: Ic(
    <>
      <path d="m15 18-6-6 6-6" />
    </>,
  ),
  bookmark: Ic(<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />),
  share: Ic(
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </>,
  ),
  star: Ic(
    <path d="m12 2 2.9 6.26 6.1.53-4.6 4.02 1.36 6.19L12 16.9l-5.76 3.1L7.6 13.81 3 9.79l6.1-.53z" />,
    true,
  ),
  refresh: Ic(
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </>,
  ),
  volume: Ic(
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
    </>,
  ),
  mute: Ic(
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </>,
  ),
  info: Ic(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>,
  ),
  chevR: Ic(<path d="m9 18 6-6-6-6" />),
  replay: Ic(
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>,
  ),
  externalLink: Ic(
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </>,
  ),
  // Open book — paired pages with a spine
  book: Ic(
    <>
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3H11v17H4.5A1.5 1.5 0 0 1 3 18.5v-14Z" />
      <path d="M21 4.5A1.5 1.5 0 0 0 19.5 3H13v17h6.5a1.5 1.5 0 0 0 1.5-1.5v-14Z" />
      <path d="M11 4v16" />
    </>,
  ),
  // Gamepad — body with d-pad, two buttons, top shoulder triggers
  gamepad: Ic(
    <>
      <line x1="6" x2="10" y1="11" y2="11" />
      <line x1="8" x2="8" y1="9" y2="13" />
      <line x1="15" x2="15.01" y1="12" y2="12" />
      <line x1="18" x2="18.01" y1="10" y2="10" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5Z" />
    </>,
  ),
  // Chef hat — tall pleated toque with a band
  chef: Ic(
    <>
      <path d="M6 18a4 4 0 0 1-3.46-6A4 4 0 0 1 6 6a4 4 0 0 1 6-2.65A4 4 0 0 1 18 6a4 4 0 0 1 3.46 6" />
      <path d="M6 18h12" />
      <path d="M6 18a2 2 0 0 1-2-2v-2" />
      <path d="M18 18a2 2 0 0 0 2-2v-2" />
      <path d="M9 21h6" />
    </>,
  ),
};
