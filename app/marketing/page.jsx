import { permanentRedirect } from 'next/navigation';

// The old marketing mock (fabricated demo titles, stale domain) converted
// worse than the real app — the SSR'd home page IS the pitch. Permanent home.
export default function MarketingPage() {
  permanentRedirect('/');
}
