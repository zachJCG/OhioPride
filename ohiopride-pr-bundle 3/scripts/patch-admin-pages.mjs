#!/usr/bin/env node
/* =============================================================================
 * Ohio Pride PAC, /admin mobile-responsive patcher
 * -----------------------------------------------------------------------------
 * Walks every /admin/<module>/index.html (and any nested admin html), and:
 *   1. Adds  <link rel="stylesheet" href="/admin/admin-responsive.css" />
 *      directly after the admin-shell.css link if it isn't already there.
 *   2. Adds  <script src="/admin/admin-responsive.js" defer></script>
 *      directly after the admin-shell.js script if it isn't already there.
 *
 * Idempotent. Run from the repo root:
 *
 *     node scripts/patch-admin-pages.mjs
 *
 * Or with an explicit root:
 *
 *     node scripts/patch-admin-pages.mjs --root /tmp/OhioPride
 * ============================================================================= */
import fs from 'node:fs';
import path from 'node:path';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const ROOT = path.resolve(arg('root', process.cwd()));

const CSS_TAG    = '<link rel="stylesheet" href="/admin/admin-responsive.css" />';
const SCRIPT_TAG = '<script src="/admin/admin-responsive.js" defer></script>';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && /\.html$/i.test(e.name)) out.push(full);
  }
  return out;
}

const adminDir = path.join(ROOT, 'admin');
if (!fs.existsSync(adminDir)) {
  console.error(`No /admin/ directory at ${adminDir}`);
  process.exit(1);
}

const files = walk(adminDir);
let touched = 0;

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const isShellPage  = /admin-shell\.css/.test(s) || /admin-shell\.js/.test(s);
  const isSharedPage = /admin-shared\.css/.test(s);
  if (!isShellPage && !isSharedPage) {
    console.log(`skipped  ${path.relative(ROOT, f)}  (not an admin shell/shared page)`);
    continue;
  }

  let changed = false;
  if (!s.includes('/admin/admin-responsive.css')) {
    if (isShellPage) {
      s = s.replace(
        /(<link[^>]*href="\/admin\/admin-shell\.css"[^>]*\/?>)/,
        `$1\n    ${CSS_TAG}`
      );
    } else {
      // Older standalone admin pages: inject after admin-shared.css
      s = s.replace(
        /(<link[^>]*href="\/admin\/admin-shared\.css"[^>]*\/?>)/,
        `$1\n    ${CSS_TAG}`
      );
    }
    changed = true;
  }
  if (!s.includes('/admin/admin-responsive.js')) {
    if (isShellPage) {
      s = s.replace(
        /(<script[^>]*src="\/admin\/admin-shell\.js"[^>]*><\/script>)/,
        `$1\n    ${SCRIPT_TAG}`
      );
    } else {
      // Standalone admin page: inject just before </body>
      s = s.replace(/<\/body>/i, `  ${SCRIPT_TAG}\n  </body>`);
    }
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(f, s);
    touched++;
    console.log(`patched  ${path.relative(ROOT, f)}`);
  } else {
    console.log(`skipped  ${path.relative(ROOT, f)}  (already responsive)`);
  }
}

console.log(`\nDone. ${touched} file${touched === 1 ? '' : 's'} updated, ${files.length - touched} already current.`);
