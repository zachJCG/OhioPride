/* tests/season-banners.test.mjs
 *
 * The two fundraising banners are dated inside public/js/season-banners.js.
 * This pins their windows (America/New_York, which is -05:00 all December)
 * and the copy deck strings, with a mocked clock rather than the real one, so
 * a wrong offset or an off-by-one at midnight fails here and not on the day.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The file is a browser IIFE. Give it the two globals it touches and read the
 * helpers it hangs on window.OhioPride; `document.readyState` is left as
 * 'complete' with a stub body so start() runs and finds nothing to do. */
function load() {
  const src = readFileSync(join(ROOT, 'public/js/season-banners.js'), 'utf8');
  const window = { location: { pathname: '/' }, sessionStorage: new Map() };
  window.sessionStorage.getItem = (k) => window.sessionStorage.get(k) ?? null;
  window.sessionStorage.setItem = (k, v) => window.sessionStorage.set(k, v);
  const document = {
    readyState: 'complete',
    querySelector: () => null,
    createElement: () => ({ setAttribute() {}, querySelector: () => ({ addEventListener() {} }) }),
    body: { insertBefore() {}, firstChild: null },
    addEventListener() {},
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', src)(window, document);
  return window.OhioPride.seasonBanners;
}

const at = (iso) => new Date(iso);

test('Giving Tuesday runs December 1, 2026, New York time, and not a minute more', () => {
  const { activeBanner } = load();
  assert.equal(activeBanner(at('2026-11-30T23:59:59-05:00')), null);
  assert.equal(activeBanner(at('2026-12-01T00:00:00-05:00'))?.id, 'givingtuesday-2026');
  assert.equal(activeBanner(at('2026-12-01T12:00:00-05:00'))?.id, 'givingtuesday-2026');
  assert.equal(activeBanner(at('2026-12-01T23:59:59-05:00'))?.id, 'givingtuesday-2026');
  assert.equal(activeBanner(at('2026-12-02T00:00:00-05:00')), null);
});

test('the year-end banner runs December 26 through 31, 2026', () => {
  const { activeBanner } = load();
  assert.equal(activeBanner(at('2026-12-25T23:59:59-05:00')), null);
  assert.equal(activeBanner(at('2026-12-26T00:00:00-05:00'))?.id, 'yearend-2026');
  assert.equal(activeBanner(at('2026-12-29T09:00:00-05:00'))?.id, 'yearend-2026');
  assert.equal(activeBanner(at('2026-12-31T23:59:59-05:00'))?.id, 'yearend-2026');
  assert.equal(activeBanner(at('2027-01-01T00:00:00-05:00')), null);
});

test('nothing shows the rest of the year, today included', () => {
  const { activeBanner } = load();
  assert.equal(activeBanner(at('2026-11-05T12:00:00-05:00')), null);
  assert.equal(activeBanner(at('2026-12-15T12:00:00-05:00')), null);
  assert.equal(activeBanner(at('2027-12-01T12:00:00-05:00')), null);
});

test('copy, buttons and refcodes match the work order', () => {
  const { BANNERS } = load();
  const byId = Object.fromEntries(BANNERS.map((b) => [b.id, b]));
  assert.equal(
    byId['givingtuesday-2026'].text,
    "Today is Giving Tuesday. Help us back Ohio's next pro-equality leaders.",
  );
  assert.equal(byId['givingtuesday-2026'].button, 'Give today');
  assert.equal(
    byId['givingtuesday-2026'].href,
    'https://secure.actblue.com/donate/ohio-pride-pac?refcode=website_givingtuesday_2026',
  );
  assert.equal(byId['yearend-2026'].text, 'Close out 2026 with us. Give before midnight on December 31.');
  assert.equal(byId['yearend-2026'].button, 'Give now');
  assert.equal(
    byId['yearend-2026'].href,
    'https://secure.actblue.com/donate/ohio-pride-pac?refcode=website_yearend_2026',
  );
  for (const b of BANNERS) assert.doesNotMatch(b.text, /[–—]/, `${b.id} has a dash`);
});
