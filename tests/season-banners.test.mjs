/* tests/season-banners.test.mjs
 *
 * The two fundraising banners are dated inside public/js/season-banners.js.
 * This pins their windows (America/New_York, which is -05:00 all December)
 * and the copy deck strings, and renders the banner against a small DOM
 * stand-in with a mocked clock, so a wrong offset, an off-by-one at midnight
 * or a broken render fails here and not on the day.
 *
 * Nothing here reads the real clock. The suite must pass on any date,
 * including the days the banners are live.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'public/js/season-banners.js'), 'utf8');

/* ---------------------------------------------------------------------------
 * A DOM stand-in with just what the script touches: elements with classes,
 * attributes, text and click listeners, a body that can insert and remove,
 * and class-based querySelector. Enough to see what was rendered and where.
 * ------------------------------------------------------------------------ */
function makeElement(tag, cls = '') {
  const el = {
    tagName: tag,
    className: cls,
    attrs: {},
    children: [],
    parentNode: null,
    textContent: '',
    listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    hasAttribute(k) { return k in this.attrs; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    click() { (this.listeners.click || []).forEach((fn) => fn()); },
    focus() { el.focused = true; },
    insertBefore(node, ref) {
      node.parentNode = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
    },
    removeChild(node) {
      this.children = this.children.filter((c) => c !== node);
      node.parentNode = null;
    },
    get nextSibling() {
      if (!this.parentNode) return null;
      const sibs = this.parentNode.children;
      return sibs[sibs.indexOf(this) + 1] || null;
    },
    get firstChild() { return this.children[0] || null; },
    querySelector(sel) { return find(this, sel); },
  };
  /* innerHTML is only ever the banner's fixed template: build its three
   * children from it so querySelector can find them. */
  Object.defineProperty(el, 'innerHTML', {
    set(html) {
      el.children = [];
      const inner = makeElement('div', 'ohp-banner-inner');
      inner.parentNode = el;
      el.children.push(inner);
      for (const c of ['ohp-banner-text', 'ohp-banner-cta', 'ohp-banner-close']) {
        if (html.includes(`class="${c}"`)) {
          const child = makeElement('x', c);
          child.parentNode = inner;
          inner.children.push(child);
        }
      }
    },
  });
  return el;
}

function find(root, sel) {
  const cls = sel.replace(/^\./, '');
  for (const c of root.children) {
    if (c.className.split(' ').includes(cls)) return c;
    const deep = find(c, sel);
    if (deep) return deep;
  }
  return null;
}

/* Load the script at a fixed time on a fixed path. Returns the exported
 * helpers, the body, the timers it scheduled, and the stores it used. */
function load({ now = '2026-11-05T12:00:00-05:00', path = '/', withNav = true, readyState = 'complete' } = {}) {
  const clock = { t: new Date(now).getTime() };
  class FakeDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(clock.t); }
    static now() { return clock.t; }
  }
  const timers = [];
  const store = new Map();
  const body = makeElement('body');
  const skip = makeElement('a', 'ohp-skip-link');
  body.insertBefore(skip, null);
  if (withNav) body.insertBefore(makeElement('nav', 'ohp-nav'), null);
  const main = makeElement('main');
  main.id = 'main';
  body.insertBefore(main, null);

  const window = {
    location: { pathname: path },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  };
  const document = {
    readyState,
    body,
    querySelector: (sel) => find(body, sel),
    getElementById: (id) => (id === 'main' ? main : null),
    createElement: (tag) => makeElement(tag),
    addEventListener() {},
  };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'Date', SRC)(window, document, FakeDate);
  /* Fire the next scheduled timer with the clock moved to when it is due. */
  const runNextTimer = () => {
    const t = timers.shift();
    clock.t += t.ms;
    t.fn();
  };
  return { api: window.OhioPride.seasonBanners, body, timers, store, main, runNextTimer };
}

const at = (iso) => new Date(iso);
const promo = (body) => find(body, '.ohp-banner--promo');

test('loading the script never depends on the real clock', () => {
  // readyState 'loading' only registers start(); nothing renders or throws.
  assert.doesNotThrow(() => load({ readyState: 'loading', now: '2026-12-01T10:00:00-05:00' }));
});

test('Giving Tuesday runs December 1, 2026, New York time, and not a minute more', () => {
  const { activeBanner } = load({ readyState: 'loading' }).api;
  assert.equal(activeBanner(at('2026-11-30T23:59:59-05:00')), null);
  assert.equal(activeBanner(at('2026-12-01T00:00:00-05:00'))?.id, 'givingtuesday-2026');
  assert.equal(activeBanner(at('2026-12-01T12:00:00-05:00'))?.id, 'givingtuesday-2026');
  assert.equal(activeBanner(at('2026-12-01T23:59:59-05:00'))?.id, 'givingtuesday-2026');
  assert.equal(activeBanner(at('2026-12-02T00:00:00-05:00')), null);
});

test('the year-end banner runs December 26 through 31, 2026', () => {
  const { activeBanner } = load({ readyState: 'loading' }).api;
  assert.equal(activeBanner(at('2026-12-25T23:59:59-05:00')), null);
  assert.equal(activeBanner(at('2026-12-26T00:00:00-05:00'))?.id, 'yearend-2026');
  assert.equal(activeBanner(at('2026-12-29T09:00:00-05:00'))?.id, 'yearend-2026');
  assert.equal(activeBanner(at('2026-12-31T23:59:59-05:00'))?.id, 'yearend-2026');
  assert.equal(activeBanner(at('2027-01-01T00:00:00-05:00')), null);
});

test('nothing shows the rest of the year', () => {
  const { activeBanner } = load({ readyState: 'loading' }).api;
  assert.equal(activeBanner(at('2026-11-05T12:00:00-05:00')), null);
  assert.equal(activeBanner(at('2026-12-15T12:00:00-05:00')), null);
  assert.equal(activeBanner(at('2027-12-01T12:00:00-05:00')), null);
});

test('copy, buttons and refcodes match the work order', () => {
  const { BANNERS } = load({ readyState: 'loading' }).api;
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

test('inside the window it renders under the nav with the right text and link', () => {
  const { body } = load({ now: '2026-12-01T10:00:00-05:00', path: '/about' });
  const el = promo(body);
  assert.ok(el, 'banner rendered');
  assert.equal(el.getAttribute('data-banner'), 'givingtuesday-2026');
  assert.equal(find(el, '.ohp-banner-text').textContent, "Today is Giving Tuesday. Help us back Ohio's next pro-equality leaders.");
  assert.equal(find(el, '.ohp-banner-cta').textContent, 'Give today');
  assert.match(find(el, '.ohp-banner-cta').getAttribute('href'), /refcode=website_givingtuesday_2026$/);
  const order = body.children.map((c) => c.className.split(' ')[0] || c.tagName);
  assert.deepEqual(order, ['ohp-skip-link', 'ohp-nav', 'ohp-banner', 'main']);
});

test('without a nav it goes after the skip link, never before it', () => {
  const { body } = load({ now: '2026-12-28T10:00:00-05:00', path: '/dragoutthevote', withNav: false });
  const order = body.children.map((c) => c.className.split(' ')[0] || c.tagName);
  assert.deepEqual(order, ['ohp-skip-link', 'ohp-banner', 'main']);
});

test('a shown banner schedules its own removal at the end of its window', () => {
  const { body, timers, runNextTimer } = load({ now: '2026-12-01T23:00:00-05:00' });
  assert.ok(promo(body));
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 60 * 60 * 1000); // one hour to 11:59:59.999 p.m., plus 1 ms
  runNextTimer();
  assert.equal(promo(body), null, 'banner removed when its window ends');
  // ...and it queues the year-end check, which is under 24.8 days away.
  assert.equal(timers.length, 1);
  runNextTimer();
  assert.equal(promo(body)?.getAttribute('data-banner'), 'yearend-2026');
});

test('a page opened before a window checks again when it opens', () => {
  const { body, timers } = load({ now: '2026-11-30T23:00:00-05:00' });
  assert.equal(promo(body), null);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 60 * 60 * 1000 + 1);
  // Today (Nov 5) is more than 24.8 days out from Dec 1: no timer at all.
  assert.equal(load({ now: '2026-11-05T12:00:00-05:00' }).timers.length, 0);
});

test('never on the donate pages or the application form', () => {
  for (const path of ['/donate', '/donate/founding-member', '/endorsement/screening', '/admin/contacts']) {
    const { body } = load({ now: '2026-12-01T10:00:00-05:00', path });
    assert.equal(promo(body), null, `banner shown on ${path}`);
  }
});

test('dismissing it hides it for the session and moves focus to the page', () => {
  const first = load({ now: '2026-12-01T10:00:00-05:00' });
  find(promo(first.body), '.ohp-banner-close').click();
  assert.equal(promo(first.body), null);
  assert.equal(first.main.focused, true);
  assert.equal(first.store.get('ohp-banner-givingtuesday-2026'), 'dismissed');
});
