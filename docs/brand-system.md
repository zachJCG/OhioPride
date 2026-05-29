# Ohio Pride PAC — Brand System

This is the source-of-truth doc for the site's shared header, footer,
wordmark, and brand tokens. If the site looks inconsistent across pages,
the answer almost always belongs here, not in a one-off page-level CSS
block.

The brand reference is `Ohio_Pride_PAC_Brand_Guide.pdf` (v1.1, April 2026).

---

## TL;DR for new pages

Every public HTML page in this repo should look like this:

```html
<!doctype html>
<html lang="en">
<head>
  …
  <link rel="stylesheet" href="/css/style.css" />
  <link rel="stylesheet" href="/css/site-template.css" />
</head>
<body>

  <div id="site-header"></div>

  <main id="main">
    <!-- page content -->
  </main>

  <div id="site-footer"></div>

  <script src="/js/enhancements.js" defer></script>
  <script src="/js/site-template.js" defer></script>
</body>
</html>
```

Do **not** write your own `<nav>`, `<header>`, or `<footer class="…">`
markup for the site chrome. The shared template injects identical
markup on every page so we never drift again.

Run `npm run check:brand` before opening a PR. CI-friendly script that
flags pages missing the canonical wiring.

---

## What lives where

| Concern                                | File                                            |
|----------------------------------------|-------------------------------------------------|
| Brand colors, gradients, type tokens   | `css/brand-tokens.css`                          |
| Header + footer **markup**             | `js/site-template.js`                           |
| Header + footer **styling**            | `css/site-template.css`                         |
| Inline page styles (one-off layouts)   | per-page `<style>` block — **must use tokens**  |
| Animated Progress Pride banner         | `js/enhancements.js`                            |
| Footer leadership/disclaimer data      | `netlify/functions/site-leadership.mjs` + DB    |
| Consistency check                      | `scripts/check-brand-consistency.js`            |

`css/brand-tokens.css` is `@import`-ed by both `style.css` and
`site-template.css`, so any page that links either stylesheet picks up
the tokens automatically. There is no need to add a third `<link>`.

---

## Brand tokens

Defined in `css/brand-tokens.css`. Always prefer the `--brand-*`
tokens. Older `--color-*`, `--ohp-*`, `--text-*`, `--dark-bg` etc. are
preserved as backward-compat aliases — fine to keep using in legacy
files, but new code should reach for the canonical names.

### Colors

```
--brand-navy            #152233   primary background
--brand-navy-light      #1A3A52
--brand-navy-lighter    #234A66
--brand-navy-footer     #0A1929   deeper navy used by the footer band

--brand-light-blue      #70D6EC   PAC accent + on-dark accent
--brand-white           #FFFFFF
--brand-white-65        rgba(255,255,255,0.65)   "Ohio" in the wordmark
```

Progress Pride palette chips:
`--brand-pride-red` `--brand-pride-orange` `--brand-pride-yellow`
`--brand-pride-green` `--brand-pride-blue` `--brand-pride-violet`
`--brand-pride-black` `--brand-pride-brown` `--brand-pride-pink`.

For text on the navy background, the raw Pride chips fail WCAG AA.
Use the on-dark accent text tokens instead:
`--brand-text-accent` `--brand-text-danger` `--brand-text-success`
`--brand-text-warning`.

### Gradient

`--brand-pride-gradient` — 135°, used on stripes, donate-button fills,
card-border hovers. Never as a wordmark text fill (the brand guide
explicitly prohibits this).

`--brand-pride-gradient-h` — horizontal sweep variant for the animated
banner under the nav.

### Typography

```
--brand-font-display    'Montserrat', Arial, sans-serif
--brand-font-body       'Roboto Slab', Georgia, serif
```

Sizing per the brand guide:
- Display headlines: Montserrat Bold 700, 32–60px, tracking ≈ -0.8px, line-height 1.1
- Section titles: Montserrat Bold 700, 22–30px
- Body copy: Roboto Slab Regular 400, 14–16px, line-height 1.7
- Labels/eyebrows: Montserrat Bold 700, 10–11px, uppercase, tracking 2–3px

---

## Wordmark

The wordmark has three parts and is **always** built from the same
markup:

| Part   | Weight       | Color                        | Notes |
|--------|--------------|------------------------------|-------|
| Ohio   | Montserrat 400 | white @ 65% opacity        | |
| Pride  | Montserrat 700 | pure white                 | |
| PAC    | Montserrat 700 | Light Blue `#70D6EC`       | uppercase, ~18% size of full wordmark, 2px tracking |

The wordmark sits on `--brand-navy`. Mono-white fallback is allowed
only where color cannot run (printed PDFs, single-color contexts).

### Two ways to use it

**1. Inside the nav (automatic)** — `js/site-template.js` injects the
wordmark into every page's `#site-header`. You never hand-author this.

**2. Inline in body content** — drop the `.ohp-wordmark` utility:

```html
<span class="ohp-wordmark">
  <span class="ohp-wordmark__ohio">Ohio</span>
  <span class="ohp-wordmark__pride">Pride</span>
  <span class="ohp-wordmark__pac">PAC</span>
</span>
```

…or, if site-template.js is loaded, call the JS helper:

```js
OhioPride.renderWordmark('#some-target');           // tri-color
OhioPride.renderWordmark('#some-target', { mono: true });  // mono white
```

Scale by setting `font-size` on the parent. The "PAC" sub-glyph scales
proportionally via `--brand-wordmark-pac-ratio`.

### Don't

- Don't fill the wordmark with the Progress Pride gradient.
- Don't substitute different fonts.
- Don't hand-edit the markup in another HTML file. If you find yourself
  doing that, you are about to introduce drift — call the helper instead.

---

## Header / nav

Single source of truth: `HEADER_HTML` in `js/site-template.js`.

What the shared header gives you for free:
- Skip-to-main link (`<a class="ohp-skip-link" href="#main">`)
- Sticky nav with backdrop blur
- Brand wordmark (canonical construction)
- Mobile hamburger toggle with aria-expanded / aria-label / Escape-to-close
- Active-link highlighting via `aria-current="page"`
- Donate CTA with the animated Progress Pride border
- Focus rings on all interactive elements

To change a nav item, edit `HEADER_HTML` once. Do not edit page HTML.

To add a new top-level nav link, add a `<li>` in `HEADER_HTML` and run
`npm run check:brand` to confirm no page hard-codes its own nav.

---

## Footer

Single source of truth: `FOOTER_HTML` in `js/site-template.js`.

What the shared footer gives you for free:
- Four-column nav (Organization / Get Involved / Connect / Legal)
- Leadership block populated from Supabase via
  `netlify/functions/site-leadership.mjs` (with hardcoded fallback)
- "Paid for by" disclaimer populated from the same source (with fallback)
- Progress Pride top-border stripe
- Responsive collapse to a single column on narrow viewports

External links should use `rel="noopener"` (and `target="_blank"` if you
mean to open a new tab). The shared footer doesn't currently have any
external links — if you add one, set the safe attributes.

To change footer copy or links, edit `FOOTER_HTML` once. Do not edit
page HTML.

---

## Preventing future drift

Three layers:

1. **Convention** — every page uses `<div id="site-header"></div>` and
   `<div id="site-footer"></div>`. The shared template owns the rest.
2. **Tokens** — `css/brand-tokens.css` is the only place that hard-codes
   palette values. Page-level styles must reference tokens, not hex codes.
3. **Check script** — `scripts/check-brand-consistency.js` walks all
   `*.html` in the repo and fails if any page is missing canonical
   wiring or hand-rolls its own header/footer/wordmark.

Run it locally:

```
npm run check:brand
```

It exits non-zero on drift, so you can wire it into a pre-commit hook
or CI gate when ready.

---

## Pages intentionally outside the system

The legacy snapshots under `Update/` and `OhioPride-Refocused/` are
historical artifacts. They are not deployed (Netlify publish root is
`.`, and they are not linked from any active page or `sitemap.xml`).
The brand-consistency check ignores them by default.

If you ever need to revive content from those folders, port it into
the live tree first, wire it through the shared template, and delete
the snapshot.
