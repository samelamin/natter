'use client';

import { Logo, SegmentedToggle, IconButton, Avatar } from '@/components/natter/index.jsx';
import { Icons } from '@/components/natter/Icons.jsx';

const KIND_OPTS = [
  { value: 'all', label: 'Everything', icon: <Icons.layers /> },
  { value: 'film', label: 'Films', icon: <Icons.film /> },
  { value: 'tv', label: 'TV', icon: <Icons.tv /> },
];

export function TopBar({ onHome, kind, setKind, showFilter }) {
  return (
    <header className="topbar">
      <span onClick={onHome} style={{ cursor: 'pointer' }}>
        <Logo />
      </span>
      {showFilter ? (
        <SegmentedToggle options={KIND_OPTS} value={kind} onChange={setKind} />
      ) : (
        <span />
      )}
      <div className="topbar__right">
        <IconButton variant="ghost" label="Search" icon={<Icons.search />} onClick={onHome} />
        <Avatar initials="SE" />
      </div>
    </header>
  );
}
