#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Ohio Pride PAC — Brand Consistency Check
 * ----------------------------------------
 * Walks every public-facing *.html file in the repo and enforces the
 * shared header / footer / wordmark wiring documented in
 * docs/brand-system.md.
 *
 * Exits non-zero if any page is missing canonical wiring or hand-rolls
 * its own header/footer/wordmark. Designed to be safe to run locally
 * and from CI.
 *
 * Usage:
 *   node scripts/check-brand-consistency.js
 *   npm run check:brand
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Directories that ship to production. Anything outside these is
// ignored and intentionally does not follow the system.
const SCAN_ROOTS = [
  '.',
  'issues',
  'donate',
  'endorsements',
  'endorsement/screening',
  'endorsement/screening/thank-you',
];

// Pages that legitimately don't use the shared chrome (e.g. embedded
// fragments, redirect stubs). None today; placeholder for the future.
const ALLOW_LIST = new Set([
  // 'some/special-page.html',
]);

// Pages must link the shared template stylesheet AND at least one of
// the brand stylesheets (each of which @imports the canonical
// brand-tokens). Most pages link both; a couple of self-contained
// pages (connect, launch-day) opt out of style.css.
const REQUIRED_LINKS = [
  '/css/site-template.css',
];

const REQUIRED_LINKS_ANY = [
  '/css/style.css',
  '/css/site-template.css',
];

const REQUIRED_SCRIPTS = [
  '/js/site-template.js',
];

const REQUIRED_MARKUP = [
  { id: 'site-header', label: '<div id="site-header">' },
  { id: 'site-footer', label: '<div id="site-footer">' },
];

// Soft checks — warn but don't fail. Lets us flag drift in legacy pages
// that pre-date a convention without blocking PRs that didn't introduce
// the gap.
const RECOMMENDED_MARKUP = [
  { id: 'main', label: '<main id="main"> (skip-link target)' },
];

// Hand-rolled chrome we don't want anywhere in body content. The
// shared template owns these, full stop.
const FORBIDDEN_PATTERNS = [
  {
    re: /<footer\s+class="site-disclaimer"/i,
    msg: 'inline <footer class="site-disclaimer"> — replace with <div id="site-footer"></div>',
  },
  {
    re: /<a[^>]+class="logo"[^>]*>\s*Ohio Pride PAC\s*<\/a>/i,
    msg: 'hand-rolled "logo" wordmark — use the shared header or .ohp-wordmark',
  },
  {
    re: /<div[^>]+class="logo"[^>]*>\s*Ohio Pride PAC\s*<\/div>/i,
    msg: 'hand-rolled "logo" wordmark — use the shared header or .ohp-wordmark',
  },
  {
    re: /<div[^>]+class="nav-logo"[^>]*>\s*Ohio Pride PAC\s*<\/div>/i,
    msg: 'hand-rolled "nav-logo" wordmark — use the shared header',
  },
];

function listHtmlFiles() {
  const out = [];
  for (const dir of SCAN_ROOTS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) continue;
    for (const entry of fs.readdirSync(abs)) {
      if (!entry.endsWith('.html')) continue;
      const rel = path.relative(ROOT, path.join(abs, entry));
      out.push(rel);
    }
  }
  return out.sort();
}

function checkFile(rel) {
  const abs = path.join(ROOT, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const errors = [];
  const warnings = [];

  if (ALLOW_LIST.has(rel)) return { errors, warnings };

  for (const href of REQUIRED_LINKS) {
    const re = new RegExp(`<link[^>]+href=["']${escapeRegex(href)}["']`, 'i');
    if (!re.test(html)) {
      errors.push(`missing <link rel="stylesheet" href="${href}">`);
    }
  }

  const hasAnyBrandSheet = REQUIRED_LINKS_ANY.some((href) =>
    new RegExp(`<link[^>]+href=["']${escapeRegex(href)}["']`, 'i').test(html));
  if (!hasAnyBrandSheet) {
    errors.push(
      `missing brand stylesheet (link one of: ${REQUIRED_LINKS_ANY.join(', ')})`,
    );
  }

  for (const src of REQUIRED_SCRIPTS) {
    const re = new RegExp(`<script[^>]+src=["']${escapeRegex(src)}["']`, 'i');
    if (!re.test(html)) {
      errors.push(`missing <script src="${src}">`);
    }
  }

  for (const m of REQUIRED_MARKUP) {
    const re = new RegExp(`id=["']${m.id}["']`, 'i');
    if (!re.test(html)) {
      errors.push(`missing ${m.label}`);
    }
  }

  for (const m of RECOMMENDED_MARKUP) {
    const re = new RegExp(`id=["']${m.id}["']`, 'i');
    if (!re.test(html)) {
      warnings.push(`missing ${m.label}`);
    }
  }

  for (const f of FORBIDDEN_PATTERNS) {
    if (f.re.test(html)) {
      errors.push(f.msg);
    }
  }

  return { errors, warnings };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const files = listHtmlFiles();
  if (!files.length) {
    console.error('No HTML files found under', SCAN_ROOTS.join(', '));
    process.exit(2);
  }

  let errorCount = 0;
  let warningCount = 0;
  let errorFiles = 0;
  let warningFiles = 0;

  for (const f of files) {
    const { errors, warnings } = checkFile(f);
    if (!errors.length && !warnings.length) continue;
    if (errors.length) errorFiles += 1;
    if (warnings.length) warningFiles += 1;
    errorCount += errors.length;
    warningCount += warnings.length;

    const stream = errors.length ? console.error : console.warn;
    stream(`\n  ${f}`);
    for (const e of errors) stream(`    ✗ ${e}`);
    for (const w of warnings) stream(`    ! ${w} (warning)`);
  }

  const parts = [`Scanned ${files.length} page(s).`];
  if (errorCount) parts.push(`${errorCount} error(s) across ${errorFiles} file(s).`);
  if (warningCount) parts.push(`${warningCount} warning(s) across ${warningFiles} file(s).`);
  if (!errorCount && !warningCount) parts.push('All pages match the shared brand system.');

  const summary = '\n' + parts.join(' ');

  if (errorCount) {
    console.error(summary);
    console.error('See docs/brand-system.md for the canonical wiring.');
    process.exit(1);
  } else {
    console.log(summary);
    if (warningCount) {
      console.log('Warnings did not fail the build. See docs/brand-system.md.');
    }
  }
}

if (require.main === module) main();
