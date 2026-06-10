/**
 * lib/pinPicks.js — pure client-safe utility for stable pick ordering.
 *
 * Prevents results from reshuffling under the user when the final 'done'
 * ranking arrives ~13-40s after the first 'partial' paint.
 *
 * Zero imports. No side effects. Inputs never mutated.
 */

/**
 * Merge an incoming picks array into an existing pinned order.
 *
 * @param {Array|null|undefined} prevPicks   - Picks currently in React state.
 * @param {Array|null|undefined} incomingPicks - New picks from partial/done event.
 * @param {Array|null|undefined} pinnedIds   - Ordered ids from the first event.
 * @returns {{ picks: Array, pinnedIds: Array, appendedCount: number }}
 */
export function mergePinnedPicks(prevPicks, incomingPicks, pinnedIds) {
  const prev = Array.isArray(prevPicks) ? prevPicks : [];
  const incoming = Array.isArray(incomingPicks) ? incomingPicks : [];
  const pinned = Array.isArray(pinnedIds) ? pinnedIds : [];

  // First-event path: no pinned order yet — accept incoming as-is and record order.
  if (pinned.length === 0) {
    return {
      picks: incoming,
      pinnedIds: incoming.map((p) => p.id),
      appendedCount: 0,
    };
  }

  // Build lookup maps for O(1) access.
  const prevById = new Map();
  for (const item of prev) {
    if (item.id != null) prevById.set(item.id, item);
  }
  const incomingById = new Map();
  for (const item of incoming) {
    if (item.id != null) incomingById.set(item.id, item);
  }

  // Track which incoming ids have been consumed by the pinned section.
  const consumed = new Set();

  // Reconstruct the pinned section in pinned order.
  const pinnedPicks = [];
  for (const id of pinned) {
    const cur = id != null ? prevById.get(id) : undefined;
    const inc = id != null ? incomingById.get(id) : undefined;

    if (cur === undefined && inc === undefined) {
      // Neither exists — skip this slot.
      continue;
    }

    if (cur !== undefined && inc === undefined) {
      // Server dropped this id — keep the prev item unchanged (never yank shown items).
      pinnedPicks.push(cur);
      continue;
    }

    if (cur === undefined && inc !== undefined) {
      // New item that was in pinnedIds but not in prev (shouldn't normally happen,
      // but handle gracefully by accepting incoming as-is).
      pinnedPicks.push(inc);
      if (id != null) consumed.add(id);
      continue;
    }

    // Both exist: merge, protecting match and badge from being overwritten.
    const merged = { ...cur, ...inc };

    // Protect match: if prev has a numeric match value, keep it.
    if (typeof cur.match === 'number') {
      merged.match = cur.match;
    }

    // Protect badge: if prev has a non-null badge, keep it.
    if (cur.badge != null) {
      merged.badge = cur.badge;
    }

    pinnedPicks.push(merged);
    if (id != null) consumed.add(id);
  }

  // Also keep prev items lacking an id (they sit in place positionally).
  // These were inserted into pinnedIds as undefined; we handle them above
  // (cur only, no id match). But if any id-less prev items were skipped
  // (because undefined is not in pinned map lookups), collect them here.
  // Actually: id-less prev items are handled by the undefined-id slot above.
  // The loop above may skip undefined slots if both cur and inc are undefined.
  // Re-scan prev for id-less items not already in pinnedPicks.
  const prevIdlessItems = prev.filter((item) => item.id == null);
  // id-less items from prev are already included via the pinned loop
  // (pinnedIds contains undefined for each), but only if the loop found cur.
  // To be safe, ensure they appear. Check how many id-less slots we processed.
  const idlessInPinnedPicks = pinnedPicks.filter((p) => p.id == null);
  if (prevIdlessItems.length > idlessInPinnedPicks.length) {
    // Some id-less prev items may have been missed; append the remainder.
    const extra = prevIdlessItems.slice(idlessInPinnedPicks.length);
    pinnedPicks.push(...extra);
  }

  // Append genuinely new incoming picks (ids not in pinnedIds).
  const appendedPicks = [];
  const pinnedIdSet = new Set(pinned.filter((id) => id != null));

  for (const item of incoming) {
    if (item.id == null) {
      // id-less incoming: append (cannot be matched to pinned).
      appendedPicks.push(item);
    } else if (!pinnedIdSet.has(item.id)) {
      // Genuinely new id: append with its own match/badge.
      appendedPicks.push(item);
    }
    // Otherwise already consumed by the pinned section.
  }

  const picks = [...pinnedPicks, ...appendedPicks];

  // Extend pinnedIds with newly appended ids (in incoming order).
  const newPinnedIds = [
    ...pinned,
    ...appendedPicks.map((p) => p.id),
  ];

  return {
    picks,
    pinnedIds: newPinnedIds,
    appendedCount: appendedPicks.length,
  };
}
