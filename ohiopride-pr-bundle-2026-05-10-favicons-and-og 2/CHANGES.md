# Ohio Pride PAC — Favicons + OG + Letterhead PR Bundle (2026-05-10)

Non-CSS deliverables only. The brand polish CSS layer was dropped per
direction. The existing `/css/brand-tokens.css`, `/css/style.css`, and
`/css/site-template.css` remain the canonical stylesheets — this bundle
does not touch them.

## What this ships

### Hybrid favicon set

- Small sizes (16, 32, 48, `favicon.ico`) use **Option A** — "OH" in light
  blue with a Progress Pride stripe beneath it. Sharpest in browser tabs.
- Large sizes (96, 144, 180, 192, 256, 384, 512, apple-touch, maskable) use
  **Option D** — "OHIO / PRIDE" stacked wordmark with the Progress Pride
  stripe. Full brand identity on home screens and PWA installs.
- `site.webmanifest` for Android / PWA installability.

### Open Graph link previews

- `og-default.png` — default link preview (every page falls back to this).
- Themed variants: `og-founding-members.png`, `og-scorecard.png`,
  `og-donate.png`, `og-launch-day.png`, `og-endorsements.png`.
- `og-square-1200.png` — 1200x1200 square for IG / LinkedIn / Slack share.

### Letterhead assets (refreshed)

- `assets/letterhead/ohiopride_header.png` — navy + centered Ohio Pride PAC
  wordmark + pride stripe at the bottom.
- `assets/letterhead/ohiopride_footer.png` — black + blue rule + compliance
  text in two lines.

## Files in this bundle

```
assets/favicon/          → /assets/favicon/       (favicon set + manifest)
assets/og/               → /assets/og/            (link preview images)
assets/letterhead/       → /assets/letterhead/    (header/footer PNGs)
favicon.ico              → also place at /favicon.ico at site root
```

## How to unpack

```bash
unzip -o /path/to/ohiopride-pr-bundle-2026-05-10-favicons-and-og.zip -d /tmp/bp
rsync -a /tmp/bp/ohiopride-pr-bundle-2026-05-10-favicons-and-og/assets/  ./assets/
cp ./assets/favicon/favicon.ico ./favicon.ico
```

## Wire it up

Add the canonical head block to every page. Reference snippet:

```html
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="icon" type="image/png" sizes="16x16"  href="/assets/favicon/favicon-16.png" />
<link rel="icon" type="image/png" sizes="32x32"  href="/assets/favicon/favicon-32.png" />
<link rel="icon" type="image/png" sizes="48x48"  href="/assets/favicon/favicon-48.png" />
<link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon/favicon-192.png" />
<link rel="icon" type="image/png" sizes="512x512" href="/assets/favicon/favicon-512.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon/apple-touch-icon.png" />
<link rel="manifest" href="/assets/favicon/site.webmanifest" />
<meta name="theme-color" content="#0F2233" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="Ohio Pride PAC" />
<meta property="og:title" content="Ohio Pride PAC — LGBTQ+ Equality in Ohio" />
<meta property="og:description" content="Ohio's Political Action Committee for LGBTQ+ Equality." />
<meta property="og:url" content="https://www.ohiopride.org/" />
<meta property="og:image" content="https://www.ohiopride.org/assets/og/og-default.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Ohio Pride PAC — LGBTQ+ Equality in Ohio" />
<meta name="twitter:description" content="Mobilizing voters and electing pro-equality leaders across Ohio." />
<meta name="twitter:image" content="https://www.ohiopride.org/assets/og/og-default.png" />
```

For pages that have a themed OG image, swap `og-default.png` for the
matching variant:

| Page                     | Image                                |
| ------------------------ | ------------------------------------ |
| `/founding-members.html` | `/assets/og/og-founding-members.png` |
| `/scorecard.html`        | `/assets/og/og-scorecard.png`        |
| `/donate.html`           | `/assets/og/og-donate.png`           |
| `/launch-day.html`       | `/assets/og/og-launch-day.png`       |
| `/endorsements/`         | `/assets/og/og-endorsements.png`     |

## What is NOT changed

- No CSS changes. `/css/brand-tokens.css`, `/css/style.css`, and
  `/css/site-template.css` are untouched.
- The `.ohp-wordmark` utility is unchanged.
- Existing buttons, components, and layouts are not modified.
- The brand-consistency CI check still passes — no forbidden patterns introduced.

## Roll-back

Delete `assets/favicon/` and `assets/og/` from the repo, remove the favicon
`<link>` and OG `<meta>` tags from each page. The site returns to its
prior state.
