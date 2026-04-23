# Scorecard Rework v5 — Deployment Notes

## Files In This Bundle

```
scorecard.html
methodology.html
js/scorecard-data.js
js/voting-records.js
20260424000000_scorecard.sql
```

Drop these in place over the corresponding files in the live repo. Nothing else changed.

## What Changed In v5

### Evidence-Only Scoring (No Party Baseline)

The composite formula was rewritten so every legislator starts from the same flat 50 baseline regardless of party, chamber, or caucus role. The grade is driven entirely by Votes, Sponsorship, and News evidence.

```
score = clamp(0, 100, round(50 + (V * 6) + (S * 3) + (N * 1)))
```

Subscore weights are tuned so a perfect +5/+5/+5 record reaches exactly 100 (A+) and a worst-case -5/-5/-5 reaches exactly 0 (F) without clamping at the extremes. A legislator with no tracked evidence holds the 50 baseline (a C, labeled Mixed Record) until the public record moves them.

Defensible non-partisan grade distribution after the rework:

```
A+: 1     A: 3     A-: 39
C: 1
D: 77    F: 11
```

The bimodal shape reflects Ohio's bimodal caucus voting on tracked LGBTQ+ legislation, not a partisan tilt in the formula.

### Methodology Pages

- **In-page summary on /scorecard** is now a brief explainer: a one-paragraph lede, a single formula card with a "Why 50?" callout, the full grade scale built from `GRADE_SCALE`, and a CTA to the full methodology page. The longer subscore cards and intersectionality block were moved to /methodology.
- **/methodology** got a new Section 03, "Why we use an intersectional lens," covering the ten policy areas the scorecard tracks (civil rights, trans health care, schools, religious-imposition legislation, voting access, workers, housing, criminal justice, immigration, climate). The composite-formula section now defends the flat baseline and the V*6 / S*3 / N*1 weighting choices.
- **Changelog removed** from /methodology.
- **Per-card grade math** on /scorecard now displays: `50 baseline + (V x 6) + (S x 3) + (N x 1) = score`, with subscores color-coded by direction.

### Filter-Aware Stats Bar

The four stat cards (Lawmakers Graded, Pro-Equality Allies, Hostile or Unfriendly, Bills Tracked) now re-render live whenever any filter changes. A small hint line below the bar tells the reader whether they're looking at the full General Assembly or a filtered subset.

### App-Like Polish On The Scorecard

- A **Clear filters** chip pops in next to the stats hint as soon as any filter is active. Clicking it resets every pill, the search box, and the sort, and reapplies.
- Stat numbers briefly **pulse** when their value changes after a filter is applied or cleared.
- Stat cards lift slightly on hover for a tactile feel.
- The "See our scoring approach" hero link smooth-scrolls to the in-page methodology block at the bottom of the scorecard, with a `scroll-margin-top` offset so the section header lands cleanly under the sticky controls bar.

### SQL Migration

`20260424000000_scorecard.sql` got an updated header comment that documents the evidence-only formula and explicitly names the lack of any party-baseline column. The schema itself did not change.

## Deploy Steps

1. Copy `scorecard.html`, `methodology.html`, and the two `js/` files over the live versions.
2. Replace `SQL Migration/20260424000000_scorecard.sql` with the bundled copy. Schema is unchanged, so no re-run is needed against an existing database.
3. Commit, push, and verify the Netlify deploy.
4. Spot-check on the live site: open `/scorecard`, click a few filters, confirm the stat numbers pulse and the Clear filters chip appears. Click "See our scoring approach" in the hero and confirm the methodology block lands under the sticky controls bar.

## Known Outstanding Work

- 43 placeholder URLs in `LEGISLATOR_NEWS` (see `News-URL-Research-Checklist.md` in the repo root) still need real article URLs.
