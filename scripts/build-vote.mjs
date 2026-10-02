#!/usr/bin/env node
/**
 * scripts/build-vote.mjs
 * ----------------------
 * Writes public/vote/config.js into the two Drag Out The Vote pages.
 *
 *   npm run vote:build     rewrite public/vote/index.html and
 *                          public/dragoutthevote/index.html
 *   npm run check:vote     fail if either page is out of date (CI, tests)
 *
 * Why a generator and not a script on the page: the pages have to work with
 * JavaScript off, and the dates have to live in exactly one file. So the HTML
 * is the editable document and this script refreshes the data-bound spots in
 * it, the same way scripts/build-seo.mjs refreshes the <head> block.
 *
 * Three kinds of binding, all keyed by a dotted path into the config
 * (`POLLS`, `LINKS.lookup`) or into the derived values below
 * (`ELECTION_DAY_LABEL`, `EARLY_VOTING_RANGE`):
 *
 *   <span data-dotv="POLLS">...</span>        inner text is replaced
 *   <a data-dotv-href="LINKS.lookup" href=""> href is replaced; an optional
 *                                             data-dotv-href-prefix="tel:" is
 *                                             prepended
 *   <button data-dotv-copy="VOTE_URL">        data-copy is replaced
 *   <!-- dotv:EARLY_HOURS --> ... <!-- /dotv:EARLY_HOURS -->
 *                                             the region between the markers
 *                                             is replaced by that renderer
 *
 * A binding to a path that does not exist is an error, not a silent blank.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import CONFIG from '../public/vote/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const PAGE_FILES = ['public/vote/index.html', 'public/dragoutthevote/index.html'];

const CHECK_ONLY = process.argv.includes('--check');

/* ---------------------------------------------------------------- utils -- */

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/* Attribute values keep their line breaks as character references so a copied
 * caption pastes with the URL and hashtags on their own lines. */
const escAttr = (value) => esc(value).replace(/\n/g, '&#10;');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-03" -> { weekday: "Tuesday", label: "Nov 3", long: "Tuesday Nov 3" }. */
function dateParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS[date.getUTCDay()];
  const label = `${MONTHS[m - 1]} ${d}`;
  return { weekday, label, long: `${weekday} ${label}`, year: String(y) };
}

/* ------------------------------------------------------------- derived -- */

/** The config plus the labels the pages need that follow from it. */
export function derive(config = CONFIG) {
  const election = dateParts(config.ELECTION_DAY);
  const opens = dateParts(config.EARLY_VOTING_OPENS);
  const closes = dateParts(config.EARLY_VOTING_CLOSES);
  const [pollsOpen, pollsClose] = config.POLLS.split(' to ');
  return {
    ...config,
    ELECTION_DAY_WEEKDAY: election.weekday,
    ELECTION_DAY_LABEL: election.label,
    ELECTION_DAY_LONG: election.long,
    ELECTION_YEAR: election.year,
    EARLY_VOTING_OPENS_LABEL: opens.label,
    EARLY_VOTING_OPENS_LONG: opens.long,
    EARLY_VOTING_CLOSES_LABEL: closes.label,
    EARLY_VOTING_CLOSES_LONG: closes.long,
    EARLY_VOTING_RANGE: `${opens.label} to ${closes.label}`,
    POLLS_OPEN_LABEL: pollsOpen,
    POLLS_CLOSE_LABEL: pollsClose,
    COLLAB_HANDLE_BARE: config.COLLAB_HANDLE.replace(/^@/, ''),
    VOTE_URL_DISPLAY: config.VOTE_URL.replace(/^https?:\/\/(www\.)?/, ''),
  };
}

function lookup(ctx, path) {
  const value = path.split('.').reduce((o, key) => (o == null ? undefined : o[key]), ctx);
  if (value === undefined || value === null) throw new Error(`config has no value at "${path}"`);
  return value;
}

/* ------------------------------------------------------------ renderers -- */

/** The full text a Copy button puts on the clipboard for one week's post. */
export function captionText(week, ctx) {
  return `${week.caption}\n\n${ctx.VOTE_URL}\n${week.hashtags.join(' ')}`;
}

const listItems = (items) => items.map((item) => `<li>${esc(item)}</li>`);

const RENDERERS = {
  EARLY_HOURS: (ctx) =>
    ctx.EARLY_HOURS.map(
      ([dates, hours]) => `<tr><th scope="row">${esc(dates)}</th><td>${esc(hours)}</td></tr>`,
    ),

  ID_ACCEPTED: (ctx) => listItems(ctx.ID_ACCEPTED),
  ID_NOT_ACCEPTED: (ctx) => listItems(ctx.ID_NOT_ACCEPTED),
  ID_NOTES: (ctx) => listItems(ctx.ID_NOTES),

  STAGE_LINES: (ctx) =>
    ctx.WEEKS.flatMap((week) => [
      `<li class="dotv-stage">`,
      `  <p class="dotv-label">${esc(week.label)}</p>`,
      `  <p class="dotv-stage-line">${esc(week.stage)}</p>`,
      `</li>`,
    ]),

  POSTS: (ctx) =>
    ctx.WEEKS.flatMap((week) => {
      const n = week.number;
      const theme = esc(week.theme);
      return [
        `<li class="dotv-card dotv-post" id="week-${n}">`,
        `  <p class="dotv-label">Week ${n}: ${esc(week.dates)}</p>`,
        `  <h3>${theme}</h3>`,
        `  <div class="dotv-graphics">`,
        `    <figure>`,
        `      <img src="${esc(week.feed)}" alt="Week ${n} feed graphic: ${theme}" width="1080" height="1350" loading="lazy" />`,
        `      <a class="dotv-btn" href="${esc(week.feed)}" download="dragoutthevote-week-${n}-feed.png">Download feed graphic</a>`,
        `      <figcaption>Feed, 1080 by 1350</figcaption>`,
        `    </figure>`,
        `    <figure>`,
        `      <img src="${esc(week.story)}" alt="Week ${n} story graphic: ${theme}" width="1080" height="1920" loading="lazy" />`,
        `      <a class="dotv-btn" href="${esc(week.story)}" download="dragoutthevote-week-${n}-story.png">Download story graphic</a>`,
        `      <figcaption>Story, 1080 by 1920</figcaption>`,
        `    </figure>`,
        `  </div>`,
        `  <div class="dotv-caption-box">`,
        `    <p class="dotv-label">Caption starter</p>`,
        `    <p class="dotv-caption">${esc(week.caption)}</p>`,
        `    <p class="dotv-caption-url">${esc(ctx.VOTE_URL)}</p>`,
        `    <p class="dotv-caption-tags">${esc(week.hashtags.join(' '))}</p>`,
        `    <button type="button" class="dotv-btn dotv-btn--hot" data-copy="${escAttr(captionText(week, ctx))}">Copy caption</button>`,
        `  </div>`,
        `</li>`,
      ];
    }),

  DATES_AT_A_GLANCE: (ctx) =>
    [
      ['Early voting opens', ctx.EARLY_VOTING_OPENS_LONG],
      ['Absentee ballot request deadline', ctx.ABSENTEE_REQUEST_DEADLINE],
      ['Last day of early voting', ctx.EARLY_VOTING_CLOSES_LONG],
      ['Election Day polls', `${ctx.ELECTION_DAY_LONG}, ${ctx.POLLS}`],
      ['Absentee ballot received by', ctx.ABSENTEE_RECEIVED_DEADLINE],
    ].map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`),
};

/* --------------------------------------------------------------- apply -- */

const ATTRS = '(?:[^>"\']|"[^"]*"|\'[^\']*\')*';

/** Apply the config to one document. Returns the new source. */
export function applyTo(source, ctx = derive()) {
  let out = source;

  // Regions. The markers stay in place so the next run finds them again.
  out = out.replace(
    /^([ \t]*)<!-- dotv:([A-Z_]+) -->[\s\S]*?^[ \t]*<!-- \/dotv:\2 -->/gm,
    (whole, indent, name) => {
      const render = RENDERERS[name];
      if (!render) throw new Error(`no renderer for region "${name}"`);
      const body = render(ctx).map((line) => indent + line).join('\n');
      return `${indent}<!-- dotv:${name} -->\n${body}\n${indent}<!-- /dotv:${name} -->`;
    },
  );

  // Inner text. The bound elements hold plain text, never child elements, so
  // the non-greedy match to the first closing tag of the same name is safe.
  out = out.replace(
    new RegExp(`<(\\w+)(${ATTRS}\\bdata-dotv="([^"]+)"${ATTRS})>([\\s\\S]*?)</\\1>`, 'g'),
    (whole, tag, attrs, path) => `<${tag}${attrs}>${esc(lookup(ctx, path))}</${tag}>`,
  );

  // Attributes.
  const bindAttr = (dataAttr, targetAttr) => {
    out = out.replace(
      new RegExp(`<\\w+${ATTRS}\\b${dataAttr}="[^"]+"${ATTRS}>`, 'g'),
      (tag) => {
        // Anchored on whitespace, not \b: a hyphen is a word boundary, so a
        // bare `href=` pattern would match inside `data-dotv-href=` too.
        const attrRe = (name, body) => new RegExp(`(?<=\\s)${name}="${body}"`);
        const path = tag.match(attrRe(dataAttr, '([^"]+)'))[1];
        const prefix = tag.match(attrRe(`${dataAttr}-prefix`, '([^"]*)'))?.[1] ?? '';
        const value = `${prefix}${lookup(ctx, path)}`;
        const assignment = `${targetAttr}="${escAttr(value)}"`;
        const existing = attrRe(targetAttr, '[^"]*');
        if (existing.test(tag)) return tag.replace(existing, assignment);
        // No target attribute yet: add it right after the binding.
        return tag.replace(attrRe(dataAttr, '[^"]+'), (m) => `${m} ${assignment}`);
      },
    );
  };
  bindAttr('data-dotv-href', 'href');
  bindAttr('data-dotv-copy', 'data-copy');

  return out;
}

/* ---------------------------------------------------------------- main -- */

function main() {
  const ctx = derive();
  const stale = [];
  for (const rel of PAGE_FILES) {
    const file = join(ROOT, rel);
    const source = readFileSync(file, 'utf8');
    const next = applyTo(source, ctx);
    if (next === source) continue;
    stale.push(rel);
    if (!CHECK_ONLY) writeFileSync(file, next);
  }

  if (CHECK_ONLY) {
    if (stale.length) {
      console.error(`✗ ${stale.length} page(s) do not match public/vote/config.js. Run: npm run vote:build`);
      for (const rel of stale) console.error(`    ${rel}`);
      process.exitCode = 1;
    } else {
      console.log(`✓ both Drag Out The Vote pages match config.js`);
    }
  } else {
    console.log(
      stale.length
        ? `✓ wrote ${stale.length} page(s):\n    ${stale.join('\n    ')}`
        : '✓ both pages already up to date',
    );
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
