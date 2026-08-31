# SEO

How search metadata works on ohiopride.org, and what to do when you add a page.

## The short version

```
lib/seo.mjs                one entry per URL: title, description, card, priority
  ├─ scripts/build-seo.mjs   writes the <head> block into public/**/*.html
  ├─ app/sitemap.js          serves /sitemap.xml
  ├─ app/robots.js           serves /robots.txt
  └─ scripts/check-seo.mjs   fails when any of the above drifts
```

```bash
npm run seo:build     # rewrite the generated <head> blocks
npm run check:seo     # lint everything (also run by CI-style checks)
```

## Adding a page

1. Create the page as usual — `public/<name>.html`, or an App Router route.
2. Add an entry to `PAGES` in `lib/seo.mjs` with at least `url`, `title` and
   `description`. Internal pages get `noindex: true` instead of a priority.
3. Run `npm run seo:build`. Commit the page and its generated block together.

`npm run check:seo` fails if a page under `public/` has no registry entry, so
step 2 cannot be skipped quietly. App Router routes carry their own `metadata`
export and only need a line in `APP_ROUTES` so the sitemap knows about them.

## The generated block

Everything between `<!-- seo:start -->` and `<!-- seo:end -->` in a static page
is written by `scripts/build-seo.mjs`. Editing it by hand is pointless: the next
`npm run seo:build` overwrites it. Change `lib/seo.mjs` instead.

The generator owns exactly these tags and touches nothing else in the `<head>`:
`<title>`, the description / robots / theme-color metas, every `og:` and
`twitter:` meta, `<link rel="canonical">`, the icon links, and JSON-LD scripts.
Stylesheets, font preconnects and page `<style>` blocks are left alone.

## Bill pages

`/issues/<slug>` pages are not listed in `PAGES`. They are derived from
`public/js/bill-data.js`, the same file the pages render from, so a bill that
changes status gets a new title, description and JSON-LD on the next
`npm run seo:build` — no second place to update.

The generator also fills the bill hero (`billTitle`, `billNumber`,
`statusBadge`, sponsors, last action) and the two outbound links directly into
the HTML. `js/bill-detail.js` still sets the same values at runtime; prefilling
them means the served document has a real `<h1>` and real link targets for
anything that reads the page without running its scripts.

## Structured data

| Where | Graph |
|---|---|
| every page | `BreadcrumbList` (all but `/`) |
| `/` and every App Router page | `Organization`, `WebSite` |
| `/issues/<slug>` | `Legislation` |
| `/sunday-funday` | `Event` |
| `/endorsements` | `ItemList` |
| `/endorsements/<slug>` | `Person` with an `EndorseAction` |

Builders live in `lib/seo.mjs`. Only assert what the page itself says: the
Cincinnati event has no street address in its structured data because the page
does not give one, and `legislationLegalForce` is set only for bills that
actually became law.

## Indexing rules

- `robots.txt` blocks `/admin/` and `/api/` only.
- Internal pages that must stay out of the index (`/board-retreat`,
  `/PRTraining`, the run-of-show pages) are **crawlable** and carry `noindex`.
  Blocking the crawl would hide the `noindex` and Google would list the URL
  anyway, with no snippet. `next.config.mjs` adds `X-Robots-Tag` on top for
  crawlers that never render.
- Everything is canonical to `https://www.ohiopride.org`. The apex domain must
  redirect there at the DNS/Vercel layer; nothing in this repo can do that.

## What check:seo asserts

Registry/filesystem parity · generated blocks are current · no duplicate titles
or descriptions · title and description present and a sane length · exactly one
canonical, absolute, on the right host, pointing at the page's own URL · og and
twitter tags present with an image that exists on disk · JSON-LD parses and
declares `@context`/`@type` · noindex pages are out of the sitemap and
indexable pages are in it · one non-empty `<h1>` · alt text on every image.

Length problems are warnings, not failures — a long precise title beats a short
vague one, and the run tells you which ones Google will truncate.
