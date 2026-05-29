# Ohio Pride PAC — Brand v2.0 Refresh

Comprehensive site update to ship the v2.0 wordmark, refresh brand color tokens, replace the old logo asset set, and rebuild the brand reference page at `/brand`.

## TL;DR

- New canonical wordmark (OHIO PRIDE with PAC on a hairline divider). White + Light Blue on Navy is the primary mark for digital.
- Old `assets/logo/` PNGs are retired and replaced with a full SVG + transparent-PNG asset set.
- Brand tokens updated: Navy `#0F2233 → #152233`, Light Blue `#73D7EE → #70D6EC`, Pride Orange `#FF8C00 → #FFBC00`.
- Brand reference page (`brand.html`) rebuilt against Brand Guide v2.0 with a downloadable asset library and a "what not to do" section.
- New favicon system (SVG + PNG sizes 16 / 32 / 96 / 180 / 192 / 512) and a fresh Open Graph image at `/assets/social/og-image.png`.

## What's in the bundle

```
ohiopride-pr-bundle/
├── CHANGES.md                 ← this file
├── brand.html                 ← rebuilt brand reference page
├── favicon.ico                ← root-level multi-res favicon
├── assets/
│   ├── logo/                  ← v2.0 wordmark asset set (replaces existing assets/logo/)
│   │   ├── wordmark-primary-on-navy.svg
│   │   ├── wordmark-primary-on-white.svg
│   │   ├── wordmark-mono-white-on-navy.svg
│   │   ├── wordmark-mono-navy-on-white.svg
│   │   ├── wordmark-primary-transparent.png
│   │   ├── wordmark-primary-dark-transparent.png
│   │   ├── wordmark-mono-white-transparent.png
│   │   ├── wordmark-mono-navy-transparent.png
│   │   ├── lockup-primary-on-navy.png            (3127×3127 square avatar)
│   │   ├── lockup-primary-on-white.png
│   │   ├── lockup-mono-white-on-navy.png
│   │   ├── lockup-mono-navy-on-white.png
│   │   ├── banner-primary-on-navy.svg
│   │   └── banner-primary-on-navy.png
│   ├── favicon/               ← refreshed favicon system (replaces existing)
│   │   ├── favicon.svg
│   │   ├── favicon-16.png  / favicon-32.png  / favicon-96.png
│   │   ├── favicon-180.png  ↔  apple-touch-icon.png
│   │   ├── favicon-192.png / favicon-512.png
│   │   └── favicon.ico
│   ├── social/
│   │   └── og-image.png       ← new 1200×630 share card
│   └── source/                ← editable Illustrator originals
│       ├── ohio-pride-pac-master.ai
│       └── ohio-pride-pac-banner.ai
├── css/
│   ├── brand-tokens.css       ← v2.0 token set + new .ohp-wordmark utility
│   ├── style.css              ← color values refreshed
│   └── site-template.css      ← nav wordmark refactored for new construction
├── admin/endorsements/
│   └── admin.css              ← color values refreshed
├── js/
│   └── site-template.js       ← wordmarkSpansHtml() updated for OHIO/PRIDE/PAC divider
└── patches/
    └── apply-color-refresh.sh ← one-shot sed script for every other .html / .md / .toml
```

## How to land this

From the OhioPride repo root:

```bash
# 1. Wipe the old logo asset directory
rm -rf assets/logo

# 2. Drop in everything from the bundle (paths line up with repo paths)
cp -r ohiopride-pr-bundle/assets       ./
cp     ohiopride-pr-bundle/brand.html  ./
cp     ohiopride-pr-bundle/favicon.ico ./
cp     ohiopride-pr-bundle/css/*       ./css/
cp     ohiopride-pr-bundle/js/*        ./js/
cp     ohiopride-pr-bundle/admin/endorsements/admin.css ./admin/endorsements/

# 3. Refresh the legacy hex codes in every other HTML / MD / TOML file
bash ohiopride-pr-bundle/patches/apply-color-refresh.sh

# 4. Sanity check
git status
git diff --stat
```

Then open a PR titled **"Brand v2.0 refresh: new wordmark, tokens, brand guide"**.

## Visual changes by surface

| Surface              | Change                                                                                          |
|----------------------|-------------------------------------------------------------------------------------------------|
| Site-wide nav        | Wordmark now reads `OHIO PRIDE` (caps) with PRIDE in Light Blue, PAC on a hairline underneath.   |
| Footer               | Same wordmark construction; navy footer band moves from `#0A1929 → #0D1726`.                     |
| `/brand` page        | Full rebuild against Brand Guide v2.0. Adds Downloads section + Don'ts section.                  |
| Favicon              | New OH monogram + Light Blue accent. SVG + 5 PNG sizes + multi-res `.ico`.                       |
| Open Graph card      | New 1200×630 image: primary wordmark + tagline + Progress Pride underline.                       |
| Theme color          | `#0F2233 → #152233` in every `<meta name="theme-color">` (handled by patch script).              |
| Pride orange         | `#FF8C00 → #FFBC00` everywhere (handled by patch script).                                         |

## Tokens that changed

```css
/* Before */
--brand-navy:       #0f2233;
--brand-light-blue: #73d7ee;
--brand-pride-orange: #ff8c00;

/* After */
--brand-navy:       #152233;
--brand-light-blue: #70D6EC;
--brand-pride-orange: #FFBC00;
```

`--brand-navy-footer` also tightened from `#0A1929 → #0D1726`. All legacy aliases (`--ohp-navy`, `--color-light-blue`, etc.) are preserved.

## Wordmark utility (new)

The `.ohp-wordmark` utility class was rebuilt around the new construction. Existing pages that used the old three-span layout will need to be updated to the new structure:

```html
<span class="ohp-wordmark">
  <span class="ohp-wordmark__row">
    <span class="ohp-wordmark__ohio">OHIO</span>
    <span class="ohp-wordmark__pride">PRIDE</span>
  </span>
  <span class="ohp-wordmark__pac">PAC</span>
</span>
```

For dark backgrounds the default is correct. For light backgrounds add `.ohp-wordmark--dark`. For single-color fallback add `.ohp-wordmark--mono`.

The nav header injected by `js/site-template.js` was patched to emit this same structure under the `.ohp-logo-*` prefix.

## Source files

The editable Illustrator originals are in `assets/source/`. Hand these to the brand team if they need to tweak the wordmark — they're the same files Zach uploaded on May 26-28, 2026.

## Notes / open items

- The patch script (`patches/apply-color-refresh.sh`) is `sed`-based and idempotent. Re-running it is safe.
- The OG image was generated with DejaVu Sans Bold because Montserrat isn't shipped in the build sandbox. Replace it with a Figma export when convenient.
- The favicon's "OH" monogram is hand-built from Montserrat-style geometric forms. If the brand team wants a different mark for the favicon (e.g. just "O" or full lockup), swap `assets/favicon/favicon.svg` and re-export the PNGs.
- No HTML files reference the retired logo PNG paths directly (`wordmark-on-navy-primary.png`, `wordmark-mono-white-transparent.png`); the old PNGs were only used inside the `assets/logo/` folder. Deleting the directory and dropping in the new one is safe.
