#!/usr/bin/env node
/**
 * scripts/check-seo.mjs
 * ---------------------
 * Static SEO suite. Reads the files on disk, not a running server, so it costs
 * nothing to run and can gate a PR.
 *
 *   npm run check:seo
 *
 * What it asserts, and why each one is here rather than being left to a
 * crawler to find later:
 *
 *   parity      every .html under public/ has a lib/seo.mjs entry, and every
 *               entry has a file. This is the check that makes the registry
 *               authoritative — add a page without metadata and this fails.
 *   freshness   no page's generated block is stale (same as seo:build --check)
 *   uniqueness  no two indexable pages share a title or a description. Twenty
 *               two bill pages once shared "Loading... | Ohio Pride".
 *   substance   titles and descriptions are present and within the lengths
 *               Google will actually render
 *   canonical   exactly one canonical, absolute, on the canonical host, and
 *               pointing at the page's own URL
 *   cards       og/twitter tags present, and the image they name exists on
 *               disk rather than 404ing in the share preview
 *   json-ld     parses, and declares @context and @type
 *   indexing    a noindex page is out of the sitemap and an indexable page is
 *               in it; noindex and canonical never appear on the same page
 *   structure   one <h1>, a lang attribute, alt text on every image
 *
 * Exit code is non-zero on any failure. Warnings do not fail the run.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_ROUTES,
  SITE_URL,
  absolute,
  allStaticPages,
  fileFor,
  publicPageUrls,
} from '../lib/seo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');

const failures = [];
const warnings = [];
let checks = 0;

const fail = (where, message) => failures.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);
const assert = (cond, where, message) => {
  checks++;
  if (!cond) fail(where, message);
  return cond;
};

/* ---------------------------------------------------------------------------
 * Minimal head parsing. A full HTML parser is not a dependency worth adding
 * for tags this shape, but the matchers do have to tolerate tags split across
 * lines, which several pages still do.
 * ------------------------------------------------------------------------ */
const ATTRS = '(?:[^>"\']|"[^"]*"|\'[^\']*\')*';

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 's'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function parseHead(source) {
  const head = source.slice(source.indexOf('<head'), source.indexOf('</head>'));
  const metas = {};
  for (const [tag] of head.matchAll(new RegExp(`<meta\\b${ATTRS}>`, 'g'))) {
    const key = attr(tag, 'name') || attr(tag, 'property');
    if (key) (metas[key.toLowerCase()] ||= []).push(attr(tag, 'content') ?? '');
  }
  const links = {};
  for (const [tag] of head.matchAll(new RegExp(`<link\\b${ATTRS}>`, 'g'))) {
    const rel = attr(tag, 'rel');
    if (rel) (links[rel.toLowerCase()] ||= []).push(attr(tag, 'href') ?? '');
  }
  const title = head.match(/<title>([\s\S]*?)<\/title>/);
  const jsonLd = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
  return {
    title: title ? title[1].replace(/\s+/g, ' ').trim() : null,
    meta: (name) => metas[name]?.[0] ?? null,
    count: (name) => metas[name]?.length ?? 0,
    link: (rel) => links[rel]?.[0] ?? null,
    linkCount: (rel) => links[rel]?.length ?? 0,
    jsonLd,
  };
}

/** An absolute site URL back to the path it names, or null if off-site. */
function pathOf(url) {
  if (!url?.startsWith(SITE_URL)) return null;
  const path = url.slice(SITE_URL.length) || '/';
  return path.length > 1 ? path.replace(/\/$/, '') : '/';
}

/** Site-relative asset URL to a file under public/. */
function assetFile(url) {
  const path = url.startsWith(SITE_URL) ? url.slice(SITE_URL.length) : url;
  return path.startsWith('/') ? join(PUBLIC_DIR, path.slice(1)) : null;
}

/* ------------------------------------------------------------------------ */

const pages = allStaticPages();
const byUrl = new Map(pages.map((p) => [p.url, p]));

/* --- parity: registry vs filesystem -------------------------------------- */
const onDisk = publicPageUrls();
for (const url of onDisk) {
  assert(
    byUrl.has(url),
    'registry',
    `${url} exists under public/ but has no entry in lib/seo.mjs — add one (set noindex: true if it should stay out of the index)`,
  );
}
for (const page of pages) {
  assert(fileFor(page.url), 'registry', `${page.url} is in lib/seo.mjs but has no file under public/`);
}

/* --- per page ------------------------------------------------------------ */
const titles = new Map();
const descriptions = new Map();

for (const page of pages) {
  const file = fileFor(page.url);
  if (!file) continue;
  const where = page.url;
  const source = readFileSync(file, 'utf8');
  const head = parseHead(source);

  assert(/<html[^>]+lang="/.test(source), where, 'no lang attribute on <html>');

  /* Title and description. Google truncates a title around 60 characters and a
   * description around 155; over the limit is a warning, not a failure,
   * because a long precise title still beats a short vague one. */
  if (assert(head.title, where, 'no <title>')) {
    assert(!/loading/i.test(head.title), where, `title is a placeholder: ${JSON.stringify(head.title)}`);
    if (head.title.length > 70) warn(where, `title is ${head.title.length} chars, will be truncated`);
    if (head.title.length < 15) warn(where, `title is only ${head.title.length} chars`);
  }

  const description = head.meta('description');
  if (assert(description, where, 'no meta description')) {
    if (description.length > 160) warn(where, `description is ${description.length} chars, will be truncated`);
    if (description.length < 70) warn(where, `description is only ${description.length} chars`);
  }

  /* Duplicates. Two pages with the same title compete with each other for the
   * same query and Google picks one. */
  if (!page.noindex) {
    for (const [map, value, label] of [
      [titles, head.title, 'title'],
      [descriptions, description, 'description'],
    ]) {
      if (!value) continue;
      const seen = map.get(value);
      assert(!seen, where, `duplicate ${label}, same as ${seen}`);
      map.set(value, where);
    }
  }

  /* Canonical and robots. */
  const canonical = head.link('canonical');
  const robots = head.meta('robots') || '';
  if (page.noindex) {
    assert(/noindex/.test(robots), where, 'marked noindex in the registry but the page does not say so');
    assert(!canonical, where, 'a noindex page should not also claim a canonical URL');
  } else {
    assert(!/noindex/.test(robots), where, `robots says ${JSON.stringify(robots)} on an indexable page`);
    assert(head.linkCount('canonical') === 1, where, `${head.linkCount('canonical')} canonical links, want exactly 1`);
    assert(pathOf(canonical) === (page.url === '/' ? '/' : page.url), where,
      `canonical is ${canonical}, want ${absolute(page.url)}`);
  }

  /* Social cards. */
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name']) {
    assert(head.meta(tag), where, `no ${tag}`);
  }
  assert(head.meta('twitter:card'), where, 'no twitter:card');
  assert(head.meta('twitter:image'), where, 'no twitter:image');

  for (const tag of ['og:image', 'twitter:image']) {
    const url = head.meta(tag);
    if (!url) continue;
    assert(url.startsWith(SITE_URL), where, `${tag} is not on ${SITE_URL}: ${url}`);
    const asset = assetFile(url);
    assert(asset && existsSync(asset), where, `${tag} points at a missing file: ${url}`);
  }

  const ogUrl = head.meta('og:url');
  if (ogUrl) {
    assert(pathOf(ogUrl) === (page.url === '/' ? '/' : page.url), where,
      `og:url is ${ogUrl}, want ${absolute(page.url)}`);
  }

  /* Structured data. */
  for (const raw of head.jsonLd) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      fail(where, `JSON-LD does not parse: ${err.message}`);
      continue;
    }
    checks++;
    assert(parsed['@context'] && parsed['@type'], where, 'JSON-LD is missing @context or @type');
  }

  /* Page structure. One h1 is what tells a crawler what the page is about —
   * and it has to have text in it. The bill pages used to ship `<h1
   * id="billTitle"></h1>` and fill it from JavaScript, which is an empty
   * heading to anything that reads the document rather than running it. */
  const headings = [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  if (page.url === '/404') {
    if (headings.length !== 1) warn(where, `${headings.length} <h1> elements`);
  } else if (assert(headings.length === 1, where, `${headings.length} <h1> elements, want exactly 1`)) {
    const heading = headings[0][1].replace(/<[^>]*>/g, '').trim();
    assert(heading, where, '<h1> is empty in the served HTML');
  }

  const imagesWithoutAlt = (source.match(new RegExp(`<img\\b${ATTRS}>`, 'g')) || [])
    .filter((tag) => attr(tag, 'alt') === null);
  assert(!imagesWithoutAlt.length, where, `${imagesWithoutAlt.length} <img> without alt text`);
}

/* --- sitemap coverage ---------------------------------------------------- */
const { default: sitemap } = await import('../app/sitemap.js');
const inSitemap = new Set((await sitemap()).map((e) => pathOf(e.url)));

for (const page of pages) {
  const key = page.url === '/' ? '/' : page.url;
  if (page.noindex) {
    assert(!inSitemap.has(key), 'sitemap', `${page.url} is noindex but appears in the sitemap`);
  } else {
    assert(inSitemap.has(key), 'sitemap', `${page.url} is indexable but missing from the sitemap`);
  }
}
for (const route of APP_ROUTES) {
  assert(inSitemap.has(route.url), 'sitemap', `${route.url} is missing from the sitemap`);
}

/* --- generated blocks are current ---------------------------------------- */
const { applyTo } = await import('./build-seo.mjs');
for (const page of pages) {
  const file = fileFor(page.url);
  if (!file) continue;
  assert(
    applyTo(readFileSync(file, 'utf8'), page) === null,
    page.url,
    'SEO block is out of date — run `npm run seo:build`',
  );
}

/* ------------------------------------------------------------------------ */
for (const line of warnings) console.warn(`⚠ ${line}`);

if (failures.length) {
  console.error(`\n✗ ${failures.length} SEO failure(s):`);
  for (const line of failures) console.error(`    ${line}`);
  process.exit(1);
}
console.log(`✓ ${checks} SEO checks passed across ${pages.length} pages${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
