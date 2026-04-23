# Scorecard Rework v6 — Trackable Evidence Only

Released: April 23, 2026

## What Changed

The Ohio Pride PAC legislative scorecard now relies exclusively on
trackable, primary-source evidence. The composite score is driven by
three subscores tied to the official chamber journal and the
Legislative Service Commission. Editorial commentary and curated news
quotes are still part of our reporting, but they no longer move a
lawmaker's grade.

### New Scoring Model

```
score = clamp(0, 100, round(50 + (Vf × 4) + (Vc × 4) + (S × 2)))
```

- Vf — Floor Votes subscore (-5 to +5). Pass, concur, override stages.
- Vc — Committee Votes subscore (-5 to +5). Committee stage.
- S  — Bills (Sponsorship) subscore (-5 to +5). Primary ±2, co ±1.

Floor and committee votes carry equal weight because both are binding
action; we track them as separate subscores so a reader can see each
signal independently. Sponsorship counts at half weight because adding
your name to a bill is a public commitment but not a recorded yes/no
on it.

### Why the News Subscore Was Removed

Earlier versions (v3 through v5) included a fourth subscore for
on-the-record public statements: floor speeches, press releases,
op-eds, quoted remarks. We retired it in v6. Quotes proved too easy
to spin and too hard to weight consistently across lawmakers. A
sympathetic press release in a friendly outlet and a hostile remark
on a hot mic both arrived as "public statements" without a defensible
way to compare their political weight. The v6 model keeps only the
signals every constituent can verify in the official record.

### Bills Catalog Update

Added **HB 467 (135th GA) — Trans Candidate Name-Change Fix** to the
tracked bills list. Bill died in committee 12/31/2024 but the
sponsorship attribution remains scoreable for current 136th GA
members who put their name on it. 12 current members credited
(district numbers reflect the 136th GA roster):

- Primary sponsors (now scored at +2 each):
  - Beryl Brown Piccolantonio (House 4)
  - Michele Grim (House 43)
- Co-sponsors (now scored at +1 each):
  - Dontavius L. Jarrells (House 1)
  - Anita Somani (House 8)
  - Munira Abdullahi (House 9)
  - Crystal Lett (House 11)
  - Tristan Rader (House 13)
  - Bride Rose Sweeney (House 16)
  - Karen Brownlee (House 28)
  - Joseph A. Miller, III (House 53)
  - Catherine D. Ingram (Senate 9)
  - Hearcel F. Craig (Senate 15)

(Jodi Whitted, listed in earlier draft notes, is not a 136th GA
member and was dropped from the credit list.)

## Files Changed

| File | Summary |
|---|---|
| `js/scorecard-data.js` | New computeSubscores returns {vf, vc, s, v, n}. New calcScore: 50 + (vf*4) + (vc*4) + (s*2). Floor and committee subscore helpers split out by stage. HB 467 (135th) added to SCORED_BILLS. LEGISLATOR_SPONSORSHIPS map populated with 13 current-member credits. SCORECARD_UPDATED bumped to "v6 — Trackable Evidence Only". |
| `js/voting-records.js` | No code changes — confirmed `stage` field values used by new floor/committee split. |
| `scorecard.html` | renderGradeMath rewritten: three rows (Floor, Committee, Bills) with new ×4/×4/×2 formula. Card subscores show Floor / Cmte / Bills counts. renderNewsBreakdown stubbed; not called from card render. Inline How We Score updated. A- grade pill added. Meta tags updated. |
| `methodology.html` | Subscore section restructured to Floor Votes / Committee Votes / Bills (Sponsorship). Composite formula updated. Weight rationale rewritten. "Why we removed News in v6" section added. Floor-vs-committee section, intersectional section, and roll-call weighting section reworded. Meta description updated. |
| `SQL Migration/20260424000000_scorecard.sql` | Header SCORING MODEL block rewritten: v6 formula, three subscores, news removal explained. |
| `SQL Migration/PROJECT-INSTRUCTIONS-daily-bill-check.md` | Daily verification guidance updated to reference v6 formula and LEGISLATOR_SPONSORSHIPS map. News evidence no longer scored. |

## Deploy Checklist

- [ ] Drop the four front-end files into the Netlify site root:
  - `scorecard.html`
  - `methodology.html`
  - `js/scorecard-data.js`
  - `js/voting-records.js`
- [ ] Apply the SQL migration header update by running
  `20260424000000_scorecard.sql` against the staging Supabase project
  (header-only change; schema is unchanged from v5, safe to re-run).
- [ ] Spot-check after deploy:
  - Search for a known A+ champion — confirm they still score 90+.
  - Search for a known F-grade member — confirm they still score under
    18.
  - Confirm card subscores read "Floor / Cmte / Bills" not "Votes /
    Bills / News".
  - Click into a card and confirm the grade math shows three rows and
    the v6 formula `50 + (Vf × 4) + (Vc × 4) + (S × 2)`.
  - Click the new A- pill in the grade filter and confirm Reliable
    Allies surface.
- [ ] Re-run any cached share-image generation (the per-card numbers
  shifted under the new weights).

## Known Follow-ups

- Several legacy `.news-row` / `.news-link` CSS rules remain in
  `scorecard.html` even though no element uses them. They are harmless
  dead code and can be swept out in a future cleanup pass.
- The methodology page section anchor `#composite` no longer
  references the outlier callout from v5; if any external link points
  to that anchor it still resolves correctly to the composite-formula
  section.
