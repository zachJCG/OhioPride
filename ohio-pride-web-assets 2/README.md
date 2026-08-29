# Ohio Pride PAC — Web Assets Drop-in Pack

Generated for ohiopride.org. All files in this zip belong at the **site root** (the same directory as `index.html`). Once deployed, the meta tags reference them as absolute paths starting with `/`.

## What's in here

### Favicons
| File | Purpose |
|------|---------|
| `favicon.ico` | Multi-size legacy icon (16/32/48/64). Browsers fall back to this. |
| `favicon.svg` | Modern vector favicon. Sharp on any DPI. |
| `favicon-16x16.png` / `favicon-32x32.png` / `favicon-48x48.png` / `favicon-96x96.png` | Standard PNG sizes. |
| `apple-touch-icon.png` | 180×180. Used when someone adds the site to their iOS home screen. |
| `android-chrome-192x192.png` / `android-chrome-512x512.png` | Android launcher icons. |
| `android-chrome-maskable-192x192.png` / `android-chrome-maskable-512x512.png` | Android adaptive icons (full-bleed, safe zone respected). |
| `safari-pinned-tab.svg` | Monochrome icon for Safari pinned tabs. |

### Social preview (the "pretty preview" when you text the link)
| File | Purpose |
|------|---------|
| `og-image.png` | **1200×630.** This is the one that matters. iMessage, Slack, Discord, Signal, Facebook, LinkedIn, X all use this. |
| `og-image-square.png` | 1200×1200 backup for platforms that prefer square. Optional. |

### Config
| File | Purpose |
|------|---------|
| `site.webmanifest` | PWA manifest. Lets the site be "installed" on phones. |
| `browserconfig.xml` | Legacy Windows tile config. |
| `HEAD-snippet.html` | The `<head>` block to paste into your HTML. |

## Deploying with Claude Code

1. Unzip everything into the **root** of the ohiopride.org repo (alongside `index.html`).
2. Open `HEAD-snippet.html` and copy the contents into the `<head>` of every page that should have favicons and social previews. If you're using a layout/template file, paste it once there.
3. Commit and push. Netlify will auto-deploy.

## Verifying after deploy

- **Favicon:** Hard-refresh the site (`Cmd+Shift+R`) and check the browser tab. Some browsers cache aggressively — try an incognito window if you don't see the new icon right away.
- **Social preview:** Validate with these tools after deploy.
  - https://www.opengraph.xyz/url/https%3A%2F%2Fohiopride.org
  - https://cards-dev.twitter.com/validator
  - https://www.linkedin.com/post-inspector/
  - For iMessage specifically: text yourself the link from a different device. iMessage caches previews per-device, so if it shows an old one, that device has it cached. The previews update on first share from any device that hasn't seen the URL yet.
- **Cache busting trick if needed:** append `?v=2` to the OG image URL inside the meta tag. e.g. `https://ohiopride.org/og-image.png?v=2`. Forces external scrapers to re-fetch.

## Mark and brand

**Favicon mark:** Ohio state silhouette filled with the Progress Pride gradient (red top → violet bottom), set on a navy rounded square. Pulled from the US Census 2022 cartographic boundary file, simplified to 92 points so it stays clean at 16×16.

**Wordmark on the OG image** matches `ohiopride.org/brand`:
- "Ohio" — Montserrat 400, white at 65% opacity
- "Pride" — Montserrat 700, pure white #FFFFFF
- "PAC" — Montserrat 700 uppercase, #73D7EE Light Blue, ~62% of Pride's cap-height, 2px tracking, same baseline

**Colors:**
- Navy `#0F2233`
- Cyan accent `#73D7EE`
- Pride gradient: `#E40303 → #FF8C00 → #FFED00 → #008026 → #004DFF → #750787`

## Quick sanity check

Tagline used: **Endorse. Mobilize. Fight for Ohio.**
URL on image: **ohiopride.org**
Kicker: **OHIO'S FIRST STATEWIDE LGBTQ+ PAC**

If any of those need to change before launch, just say so and I'll regenerate.
