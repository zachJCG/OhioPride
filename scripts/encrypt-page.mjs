/* =============================================================================
 * encrypt-page.mjs — build a password-gated static page.
 * -----------------------------------------------------------------------------
 * Encrypts an HTML document with AES-256-GCM (key derived from a shared
 * password via PBKDF2-SHA256, 310k iterations) and emits a self-contained
 * gate page. The visitor enters the password, WebCrypto derives the same key
 * in the browser, and the decrypted document replaces the page. The plaintext
 * never ships to the repo or the CDN, so this is safe for a public repo.
 *
 * Usage:
 *   node scripts/encrypt-page.mjs <input.html> <output.html> <password> [title]
 *
 * Example (the /PRTraining media-prep page):
 *   node scripts/encrypt-page.mjs prep.html PRTraining.html '<password>' 'Media Prep'
 *
 * Notes:
 *   - Do NOT commit the input file. Only the encrypted output belongs in git.
 *   - WebCrypto requires a secure context: https in production, localhost in dev.
 *   - To rotate the password or update content, re-run this script and commit
 *     the regenerated output.
 * ============================================================================= */

import { readFileSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes, createCipheriv } from 'node:crypto';

const [input, output, password, title = 'Team Access'] = process.argv.slice(2);
if (!input || !output || !password) {
  console.error('usage: node scripts/encrypt-page.mjs <input.html> <output.html> <password> [title]');
  process.exit(1);
}

const ITERATIONS = 310000;
const plaintext = readFileSync(input, 'utf8');
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${esc(title)} | Ohio Pride</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Roboto+Slab:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #152233;
    --navy-deep: #0d1726;
    --blue: #70D6EC;
    --pride: linear-gradient(90deg, #E40303, #FFBC00, #FFED00, #008026, #004DFF, #750787);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    background: var(--navy);
    color: #fff;
    font-family: 'Roboto Slab', serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .stripe { position: fixed; top: 0; left: 0; right: 0; height: 6px; background: var(--pride); }
  .card {
    width: 100%;
    max-width: 420px;
    background: rgba(19, 45, 68, 0.6);
    border: 1px solid rgba(112, 214, 236, 0.25);
    border-radius: 16px;
    padding: 2.4rem 2rem 2.2rem;
    position: relative;
    overflow: hidden;
    text-align: center;
  }
  .card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: var(--pride); }
  .brand {
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--blue);
    margin-bottom: 12px;
  }
  h1 { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 1.45rem; margin-bottom: 8px; }
  .sub { font-size: 0.92rem; color: rgba(255,255,255,0.7); line-height: 1.6; margin-bottom: 1.5rem; }
  label {
    display: block;
    text-align: left;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.6);
    margin-bottom: 0.4rem;
  }
  input[type="password"] {
    width: 100%;
    padding: 0.85rem 0.95rem;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(8, 21, 33, 0.6);
    color: #fff;
    font-family: 'Roboto Slab', serif;
    font-size: 1rem;
  }
  input[type="password"]:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px rgba(112,214,236,0.18); }
  button {
    width: 100%;
    margin-top: 0.9rem;
    padding: 0.9rem;
    border: none;
    border-radius: 8px;
    background: var(--blue);
    color: var(--navy-deep);
    font-family: 'Montserrat', sans-serif;
    font-weight: 800;
    font-size: 0.9rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }
  button:hover { filter: brightness(1.08); }
  button[disabled] { opacity: 0.6; cursor: wait; }
  .err {
    display: none;
    margin-top: 0.9rem;
    padding: 0.65rem 0.9rem;
    border-radius: 8px;
    background: rgba(228, 3, 3, 0.14);
    border: 1px solid rgba(228, 3, 3, 0.45);
    color: #ffd3d3;
    font-size: 0.85rem;
  }
  .err.show { display: block; }
  .foot { margin-top: 1.6rem; font-size: 0.72rem; color: rgba(255,255,255,0.35); font-family: 'Montserrat', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
</style>
</head>
<body>
<div class="stripe" aria-hidden="true"></div>
<main class="card">
  <div class="brand">Ohio Pride</div>
  <h1>${esc(title)}</h1>
  <p class="sub">This page is for the Ohio Pride team. Enter the shared password to continue.</p>
  <form id="gate">
    <label for="pw">Password</label>
    <input type="password" id="pw" autocomplete="current-password" autofocus required>
    <button type="submit" id="go">Unlock</button>
    <p class="err" id="err" role="alert">That password did not work. Check with Zach and try again.</p>
  </form>
</main>
<p class="foot">Internal · Not for distribution</p>
<script>
(function () {
  "use strict";
  var SALT = "${salt.toString('base64')}";
  var IV = "${iv.toString('base64')}";
  var DATA = "${enc.toString('base64')}";
  var ITER = ${ITERATIONS};
  var KEY_CACHE = "ohp-gate-${output.replace(/[^A-Za-z0-9]/g, '')}";

  function b64(s) {
    var bin = atob(s), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function unlock(password) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: b64(SALT), iterations: ITER, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
        );
      })
      .then(function (key) {
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(IV) }, key, b64(DATA));
      })
      .then(function (buf) {
        var html = new TextDecoder().decode(buf);
        try { sessionStorage.setItem(KEY_CACHE, password); } catch (e) { /* private mode */ }
        document.open();
        document.write(html);
        document.close();
      });
  }

  var form = document.getElementById("gate");
  var btn = document.getElementById("go");
  var err = document.getElementById("err");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.classList.remove("show");
    btn.disabled = true;
    btn.textContent = "Unlocking...";
    unlock(document.getElementById("pw").value)
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Unlock";
        err.classList.add("show");
      });
  });

  // Re-unlock automatically within the same tab session.
  try {
    var cached = sessionStorage.getItem(KEY_CACHE);
    if (cached) unlock(cached).catch(function () { sessionStorage.removeItem(KEY_CACHE); });
  } catch (e) { /* private mode */ }
})();
</script>
</body>
</html>
`;

writeFileSync(output, page);
console.log(`wrote ${output} (${page.length} bytes, ciphertext ${enc.length} bytes)`);
