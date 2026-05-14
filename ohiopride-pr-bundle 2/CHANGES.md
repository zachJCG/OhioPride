# Founding Members Page — v2 Enhancements

**Branch suggestion:** `feature/founding-members-v2`
**Scope:** Single file. `/founding-members.html` only.
**No new migrations. No new Netlify functions. No new JS or CSS files.**

## Summary

Reworked the founding members page into a stunning, easy-to-use directory:

1. **More filters** — added city dropdown (auto-narrows when county is picked), a new quick-filter chip row (Joined this week / this month / Has a quote / Recurring donors), and two new sort options (City A to Z, By tier weight). The active filter set is summarized as a pill next to the result count.

2. **Collapsible "Founding Members In Office"** — converted the always-visible endorsed strip into a proper accordion panel with a member-count badge in the header. Default state: expanded on desktop, collapsed on mobile (≤720px). User's expand/collapse choice persists in `localStorage` under `ohpfm.v2.electedPanel`.

3. **County Leaderboard (new)** — sits next to the elected officials panel in a 2-column grid on desktop, stacks below it on mobile. Computed entirely client-side from the same `founding_members_public` view fetch — no new function or query. Each row shows rank (gold/silver/bronze for top 3), county name, a pride-gradient mini-progress bar normalized to the #1 county, and member count. Tap a row to filter the directory by that county and smooth-scroll down to the grid. "Show all 88" expands beyond the top 10. Coverage line reads "N of 88 counties represented" in the footer.

## File changes

| File | Action |
|------|--------|
| `founding-members.html` | Replace |

That's it. Drop the new file in, commit, push.

## What still ships unchanged

- Supabase view: `founding_members_public` (no schema changes)
- Netlify functions: untouched
- Brand assets, fonts, color tokens: untouched
- Hero, tier chips, progress bar: untouched
- Member card markup + tier coloring: untouched
- Anonymous fallback and `displayName` resolution: untouched

## Notable implementation details

- **Insights grid** uses `grid-template-columns: 1fr 1fr` desktop, collapses to `1fr` at ≤900px so the panels stack cleanly on tablets too.
- **Panel state persistence**: `localStorage.setItem("ohpfm.v2.electedPanel", "1" | "0")` and same key for `leaderboardPanel`. Falls back to viewport default if nothing stored.
- **Leaderboard is reactive to county filter** — selecting a county from the dropdown or the leaderboard highlights the active row (`.is-active`) and the active-filter pill updates. Clicking the active leaderboard row toggles the filter off.
- **City dropdown is dependent on county** — when county changes, city options narrow to that county and the active city resets. Disabled if no cities are present.
- **Quick filters** stack with all other filters (AND semantics). "Recurring donors" maps to tier slugs `stonewall-sustainer`, `pride-builder`, `founding-circle`.
- **Sort by tier weight** uses the new `weight` field on each TIER object (Patron 5 → Circle 4 → Builder 3 → Sustainer 2 → Founding 1), tie-broken by newest joined.
- **A11y**: all interactive elements have `aria-pressed` / `aria-expanded` / `aria-label`. Leaderboard rows are `<button>` and keyboard-focusable. Reduced-motion preference is respected.

## Verification done in this session

- Inline `<script>` parses with `new Function()`.
- 18 feature smoke-checks pass (insights grid, both collapsibles, lb list, lb show-all, city filter, all four quick-filter chips, both new sort options, Supabase URL, adapter, leaderboard computation, localStorage persistence, active-filter pill).
- Leaderboard math dry-run against snapshot data produces correct rankings (Montgomery 3, Hamilton 2). City narrowing for Montgomery returns `[Dayton, Oakwood]`.

## Open follow-ups (not in this PR)

- If desired, persist `state.sort` and quick-filter selection in URL params so a shared link reproduces the same view.
- Server-side county leaderboard via a Postgres function would be more efficient at full scale (1,969 rows), but client-side aggregation is fine until you cross ~5K rows.
