# Founding Members Page — Hero Redesign

**Bundle:** `20260514-founding-members-hero-redesign`
**Touches:** `founding-members.html` only (single file, all CSS + JS inline as the page already does)

## What changed and why

The old hero had three cards: Members, Counties, and **Newest Member**. The Newest Member card showed a name plus a relative time ("Joined 6 hours ago"). That third card was a maintenance tax — it required a self-updating timer for fresh joins and got stale-looking the moment activity slowed down. It also told visitors nothing actionable.

This patch retires that card and reuses the visual real estate to do two more useful jobs: pull people toward the donate flow, and make the geographic and numerical progress feel alive without needing time-based updates.

### 1. New hero card (replaces "Newest Member")

**Before:** `Newest Member — David from Franklin Cou... — Joined 6 hours ago`

**After:** A "**Claim Your Number**" CTA card.

```
   #85    Is Still Unclaimed
        [ Claim It ]
```

- The number auto-derives from `count + 1` (capped at 1,969).
- The pill button links straight to `/donate/founding-member`.
- The number renders in the Pride gradient.
- No timers, no relative-time formatting, nothing to keep current.

### 2. Stonewall Ladder (new — directly under the progress bar)

A milestone track that nods to the 1969 Stonewall Riots. Five stops:

```
   1         169        500        969       1,969
  First     Spark     Quarter    Halfway   Stonewall
```

- A white marker bubble sits at the current count, riding on top of the existing Pride-gradient fill.
- Milestones we've passed turn from grey to Pride gradient.
- Self-updating from `count / 1,969`. No content management required.

### 3. County Tile Wall (new — between the tier CTA and the insights grid)

All **88 Ohio counties** rendered as a tile grid (4 cols on phone → 11 cols on desktop). Counties with at least one founding member get a Pride-gradient border and show the member count. Unclaimed counties stay dimmed and read as "waiting for its first member."

- Tap any tile to filter the roster below by that county and smooth-scroll to the table. Tap again to clear.
- The summary line reads: `**16** of 88 counties claimed · **72** still waiting`.
- Reinforces the "16 of 88" hero stat in a way that gets visibly more satisfying as the map fills in.
- Complements (does not duplicate) the existing County Leaderboard panel — leaderboard is "top counties by member count," tile wall is "every county on the map at once."

## JS changes

- **Removed:** `scheduleNewestWhenTick`, `newestWhenTimer`, and the `statNewestName` / `statNewestWhen` writes in `renderHeroStats`.
- **Added:**
  - `LADDER_MILESTONES = [1, 169, 500, 969, 1969]`
  - `renderStonewallLadder(count)`
  - `renderCountyWall(visibleMembers)` — also wires click handlers that update `state.county`, sync `#countyFilter`, call `renderAll()`, and smooth-scroll to `#memberTable`.
- `renderHeroStats` now also writes `#statNextNumber` and calls the two new renderers.

## CSS changes (all inline `<style>` in the head, same as the existing file)

- Removed `.hero-stat:nth-child(3) { grid-area: newest; }` and the `#statNewestName` ellipsis rules.
- Added `.hero-stat--claim` and child styles for the gradient number + pill button.
- Added `.stonewall-ladder`, `.ladder-track`, `.ladder-fill`, `.ladder-marker`, `.ladder-marker-bubble`, `.ladder-stops` styles (about 130 lines).
- Added `.county-wall-section`, `.county-grid`, `.county-tile` (with Pride-gradient border via mask compositing) and legend swatches (about 110 lines).

## Files in this bundle

```
founding-members.html   ← drop-in replacement for the file at repo root
CHANGES.md              ← this file
```

## How to apply

1. Replace `founding-members.html` at the repo root with the version in this bundle.
2. Commit on a feature branch, e.g. `feat/founding-hero-redesign`.
3. Open a PR. No data layer, Supabase, or Netlify function changes required.

## What this does NOT touch

- No Supabase migrations.
- No Netlify functions.
- No other pages.
- No data shapes — still consumes `founding_members_public` exactly as before.

## Visual sanity check (using current snapshot of 84 members in 16 counties)

| Element                | Value                                                |
|------------------------|------------------------------------------------------|
| Hero card 1            | `84` Founding Members of 1,969                       |
| Hero card 2            | `16` Ohio Counties of 88 represented                 |
| Hero card 3 (new)      | `#85` Is Still Unclaimed [Claim It]                  |
| Progress bar           | 4.27% filled                                         |
| Stonewall Ladder       | Marker at 4.27%, milestone "1" lit, others dim       |
| County Tile Wall       | 16 tiles lit with Pride border, 72 dimmed; summary: "16 of 88 counties claimed · 72 still waiting" |

## Reversibility

This change is contained to one file. If anything looks wrong in preview, revert that one file. No data side effects.
