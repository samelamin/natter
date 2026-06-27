# Fix: React rules-of-hooks violation in components/screens/DetailModal.jsx

ESLint errors (6) — hooks called conditionally because there's an early `return <NewDomainDetail .../>` (around line 373-375) BEFORE the film/TV path's `useState/useCallback/useEffect` (lines 378-412). Hooks must be unconditional.

## Fix (surgical, no behavior change)
Refactor `DetailModal` into a thin dispatcher + two child components so every component calls its hooks unconditionally:

```jsx
export function DetailModal(props) {
  if (isNewDomain(props.item)) return <NewDomainDetail item={props.item} onClose={props.onClose} />;
  return <FilmTvDetail {...props} />;
}
```

- Create `function FilmTvDetail({ item, picks = [], saved = false, onToggleSave, onClose, onOpen })` containing the EXISTING film/TV body EXACTLY as it is now (the two top useEffects for ESC + body-scroll-lock, the enriched/loading/fetchError useState, fetchEnrichment useCallback, the fetch useEffect, and the full JSX return). Move it verbatim — do not change its logic.
- Ensure `NewDomainDetail` (already defined in this file) ALSO has its own ESC-key + body-scroll-lock `useEffect`s at its top (copy the same two effects) so the new-domain modal still closes on Escape and locks scroll. Those hooks are unconditional inside NewDomainDetail — fine.
- `isNewDomain` helper already exists in the file; reuse it. Keep the comment explaining watchlist save is intentionally absent for new domains.

## Acceptance
```
cd /home/ubuntu/natter-wave3-ui
npx eslint components/screens/DetailModal.jsx   # 0 errors (the 6 rules-of-hooks errors gone)
npm run build                                    # still compiles
node --experimental-vm-modules --test tests/*.test.js | grep -E "^# (pass|fail)"   # 578 pass, 0 fail
```
Only edit components/screens/DetailModal.jsx. Do not touch anything else.
