# Drag Out The Vote Ohio: voter page and performer guide

Delivered 2026-10-02 against the "Drag Out The Vote Ohio: 2026 GOTV Plan and
Page Build Prompt" work order. Two static pages, one config file, one assets
folder. No forms, no database, no serverless functions, no QR codes, nothing
collected.

| URL | File | For |
|---|---|---|
| `ohiopride.org/vote` | `public/vote/index.html` | Anyone in Ohio, on a phone. Make a plan in under a minute |
| `ohiopride.org/dragoutthevote` | `public/dragoutthevote/index.html` | Drag artists and hosts. The ask, the lines, the graphics, the dates |

Both are served by the generated rewrites in `next.config.mjs` like every
other page under `public/`, so they deploy with no config change and survive
the Next.js migration untouched.

## The one rule: dates live in config.js

**`public/vote/config.js` is the single source of truth.** Every date, hour,
deadline, link, ID rule, stage line, caption starter and graphic path on both
pages comes from it. Nothing date-shaped is typed in the HTML.

Two things read the file:

1. **`scripts/build-vote.mjs`** (`npm run vote:build`) writes the values into
   both HTML files, so the pages are complete documents that work with
   JavaScript off. It refreshes three kinds of binding and leaves everything
   else in the HTML alone:

   | Binding | Example | What is replaced |
   |---|---|---|
   | `data-dotv="PATH"` | `<span data-dotv="POLLS">` | the element's text |
   | `data-dotv-href="PATH"` | `<a data-dotv-href="LINKS.lookup">` | the `href` (optional `data-dotv-href-prefix="tel:"`) |
   | `data-dotv-copy="PATH"` | `<button data-dotv-copy="VOTE_URL">` | the `data-copy` the Copy button reads |
   | `<!-- dotv:NAME -->` … `<!-- /dotv:NAME -->` | `EARLY_HOURS`, `ID_ACCEPTED`, `STAGE_LINES`, `POSTS`, `DATES_AT_A_GLANCE` | the whole region, from a renderer in the script |

   A `PATH` is a dotted key into the config (`LINKS.lookup`) or into the
   derived labels the script computes from it (`ELECTION_DAY_LABEL`,
   `EARLY_VOTING_RANGE`, `POLLS_CLOSE_LABEL`, `COLLAB_HANDLE_BARE`). A path
   that does not exist is an error, never a silent blank.

2. **`public/vote/vote.js`** imports it in the browser for the three things
   that need a script: the countdown, Copy, and Share.

`npm run check:vote` fails when either page no longer matches the config, and
`npm test` runs the same check plus the copy rules below.

## How to update a date, hour, or deadline

1. Edit the value in `public/vote/config.js`. Verify it against the Ohio
   Secretary of State first (`LINKS.voting_schedule`) and move the date in
   `SOURCE_LINE` to the day you checked.
2. `npm run vote:build`
3. Commit `config.js` and both `index.html` files together.

That is the whole procedure. Specifically:

- **Early voting hours** are the `EARLY_HOURS` rows, in display order. Add or
  remove rows freely; the table follows.
- **Election Day** is `ELECTION_DAY`, `POLLS`, `POLLS_OPEN_AT` and
  `POLLS_CLOSE_AT`. The last two drive the countdown and carry the UTC offset
  (`-05:00` once clocks fall back; `-04:00` for an election before the first
  Sunday of November). `npm test` checks they fall on `ELECTION_DAY`.
- **The absentee deadlines** are the two `ABSENTEE_*` strings, written the way
  they should read on the page.
- **ID rules** are the three `ID_*` lists.
- **Weekly copy** is `WEEKS`: label, date range, theme, stage line, caption
  starter and hashtags for each of the five weeks. The guide renders the stage
  lines and the post cards from this list in order, and the Copy button text
  is assembled from it (caption, blank line, `VOTE_URL` on its own line, then
  the hashtags).

## How to swap the graphics

The ten files under `public/dragoutthevote/assets/` are placeholders
(navy, theme in big type, "PLACEHOLDER" written across them). Design replaces
them in place:

| File | Size |
|---|---|
| `week-N-feed.png` | 1080 by 1350 |
| `week-N-story.png` | 1080 by 1920 |

Keep the names and the page needs no edit: the `<img>` and the Download button
both point at the path in `WEEKS[n].feed` / `.story`. To use a different name
or format, change that path in `config.js` and run `npm run vote:build`. Keep
each file under about 500 KB; a phone downloads them on a bar's wifi.

Reminders for the art, from the work order: campaign look first, wordmark
small in the footer position, no "Paid for by" line, no candidate anywhere,
and the dates on the graphic must match `config.js` (Week 3 says Oct 27 and
8:30 pm; Week 4 says Saturday 8 to 4, Sunday 1 to 5, Monday closed; Week 5
says 6:30 am to 7:30 pm).

## Renaming the campaign

If the naming question goes the other way (an Ohio-only name with
`#DragOutTheVote` kept as a secondary tag), change `CAMPAIGN_NAME` and, if
needed, `HASHTAG` in `config.js` and rebuild. The hashtag order in `WEEKS` is
built from the `HASHTAG` constant, so a new lead tag propagates to every
caption. The URL `/dragoutthevote` and the page titles in `lib/seo.mjs` are
the two things that would also need a decision.

## Design notes

- **Tokens** come from `/css/brand-tokens.css` through `style.css`: Navy
  `#152233` field, Navy Footer `#0D1726`, Light Blue `#70D6EC`. The one
  campaign addition is the hot accent, magenta `#FF2D95`, set once as
  `--dotv-hot` in `public/vote/vote.css`. Design can change it there.
- **Contrast**, measured: magenta on navy 4.63:1 (passes AA for any text),
  magenta on the card surface 4.02:1 (so magenta text on a card is always 24px
  or larger), navy text on a magenta button 4.63:1. White text on magenta
  fails (3.46:1), which is why the buttons carry navy text.
- **Type**: Bowlby One (Google Fonts) for the campaign name, section headlines
  and stage lines; Roboto Slab body at 18px minimum (the two pages set
  `1rem = 18px`). Montserrat for buttons and labels, which the shared footer
  needs anyway.
- **Rainbow** is the 135 degree brand gradient, used for the divider bars and
  the top edge of cards only. Never a background field.
- **Grain** on the hero is an inline SVG turbulence filter in CSS. No image.
- **Wordmark** is the official `/assets/logo/wordmark-primary-on-navy.svg`,
  footer only on both pages. The brand SVG is a square canvas with the
  wordmark across its middle; `object-fit: cover` crops it to a wordmark-shaped
  box without touching the file.
- **Chrome**: neither page mounts the shared site header. The voter page is
  opened from a story sticker and the guide reads as the campaign, not as Ohio
  Pride. Both mount `<div id="site-footer">` and load `site-template.js`, so
  they carry the standard footer and its disclaimer like every other page.
  `scripts/check-brand-consistency.js` allow-lists the two files for the
  missing header and says why.

## Copy rules, enforced

`tests/vote-pages.test.mjs` fails the suite if any file under `public/vote`
or `public/dragoutthevote` contains an em dash or en dash, "mail ballot",
"mail-in", "openly", "first statewide", or "Paid for by". The one exemption is
the opening marker of the generated SEO block (`<!-- seo:start — generated by
… -->`), which `scripts/build-seo.mjs` writes into every page on the site and
which is an HTML comment, not copy. Running the literal `grep` from the work
order will find that one marker on each page and nothing else.

Both pages are in `lib/seo.mjs` (`/vote` and `/dragoutthevote`) with a
dash-free card alt text, so `npm run seo:build` and `npm run check:seo` know
about them.

## Verified on delivery

- `npm run build`, `npm test`, `npm run check:vote`, `npm run check:seo` and
  `npm run check:brand` pass.
- Both pages render at 375px with no horizontal scroll and at 1280px; the
  screenshots are in `docs/drag-out-the-vote/screenshots/`.
- With JavaScript off, everything renders except the countdown (which falls
  back to "Election Day is Tuesday Nov 3"), Copy, and Share (which falls back
  to a plain link).
- Countdown: days until Election Day; hours until polls open on the day
  before and on the morning of; hours and minutes until polls close on
  Election Day; a closing line after 7:30 pm. All Eastern time.
- Copy uses the async clipboard API with a selection fallback; Share uses the
  Web Share API and falls back to copying the preset text.
