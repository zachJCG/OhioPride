// scripts/build-brand-assets.mjs
// Usage: node scripts/build-brand-assets.mjs        (npm run brand:build)
//
// Derives every downloadable logo format on /brand from the hand-made
// sources in public/assets/logo/. The four square wordmark SVGs and the
// banner SVG are the vector truth; the endorsement badges only exist as PNG.
//
// What it writes (all under public/assets/logo/):
//   wordmark-*-transparent.svg / .pdf / .webp / -600.png   tight-cropped,
//       background-free wordmarks cut from the square SVGs
//   lockup-*.pdf / -1024.png / -1024.jpg                   square lockups
//       with the background baked in (profile-picture sizes)
//   banner-primary-on-navy.pdf / -2400.png / .jpg / .webp  the wide banner
//   endorsed-by-ohio-pride-*.jpg / .webp / -800.png        badge formats
//   manifest.json                                           every asset with
//       its URL, format, pixel size, background and intended use
//   ohio-pride-pac-brand-kit.zip                            the whole set,
//       plus favicons, the OG card and the Illustrator sources
//
// PDFs are printed by headless Chromium so the vectors stay vectors. Set
// CHROME_BIN to point at a browser if the usual locations miss; without a
// browser the script still builds every raster and skips the PDFs loudly.
// Outputs are committed: Vercel's build image has no browser.
import sharp from "sharp";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PUBLIC = path.join(ROOT, "public");
const LOGO = path.join(PUBLIC, "assets/logo");
const SITE = "https://www.ohiopride.org";

const NAVY = "#152233";
const WHITE = "#ffffff";

// The four square wordmark SVGs. `key` names the square lockup outputs,
// `tKey` names the transparent (background-free) outputs, matching the
// names the existing transparent PNGs already use.
const WORDMARKS = [
  {
    src: "wordmark-primary-on-navy.svg", key: "primary-on-navy", tKey: "primary-transparent",
    bg: NAVY, hasBackground: true,
    label: "Primary", colors: "White + Light Blue", on: "dark",
  },
  {
    src: "wordmark-primary-on-white.svg", key: "primary-on-white", tKey: "primary-dark-transparent",
    bg: WHITE, hasBackground: false,
    label: "Primary Dark", colors: "Navy + Light Blue", on: "light",
  },
  {
    src: "wordmark-mono-white-on-navy.svg", key: "mono-white-on-navy", tKey: "mono-white-transparent",
    bg: NAVY, hasBackground: true,
    label: "Mono White", colors: "White", on: "dark",
  },
  {
    src: "wordmark-mono-navy-on-white.svg", key: "mono-navy-on-white", tKey: "mono-navy-transparent",
    bg: WHITE, hasBackground: false,
    label: "Mono Navy", colors: "Navy", on: "light",
  },
];

const BADGES = [
  { src: "endorsed-by-ohio-pride-white.png", key: "endorsed-by-ohio-pride-white", flatten: NAVY, label: "White badge", on: "dark" },
  { src: "endorsed-by-ohio-pride-blue.png", key: "endorsed-by-ohio-pride-blue", flatten: WHITE, label: "Blue + White badge", on: "light" },
];

const PT_PER_IN = 72;

/* ------------------------------------------------------------------------ */

const manifest = [];
const built = [];

function record(entry) {
  manifest.push(entry);
}

async function fileBytes(abs) {
  return (await stat(abs)).size;
}

async function describe(rel, extra) {
  const abs = path.join(PUBLIC, rel);
  const entry = { path: `/${rel}`, url: `${SITE}/${rel}`, format: path.extname(rel).slice(1), bytes: await fileBytes(abs), ...extra };
  if (/\.(png|jpe?g|webp|svg)$/i.test(rel)) {
    const meta = await sharp(abs, { limitInputPixels: false }).metadata();
    entry.width = meta.width;
    entry.height = meta.height;
    if (entry.transparent === undefined) entry.transparent = Boolean(meta.hasAlpha) && entry.format !== "jpg";
  }
  return entry;
}

function logoRel(name) {
  return path.posix.join("assets/logo", name);
}

async function write(name, buffer) {
  const abs = path.join(LOGO, name);
  await writeFile(abs, buffer);
  built.push(name);
  return abs;
}

/* --- SVG helpers --------------------------------------------------------- */

function svgSize(svg) {
  const open = svg.match(/<svg[^>]*>/)[0];
  const vb = open.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
  return { open, viewBox: vb };
}

function withOpenTag(svg, attrs) {
  const { open } = svgSize(svg);
  let next = open.replace(/\s(width|height|viewBox)="[^"]*"/g, "");
  next = next.replace(/<svg/, `<svg ${attrs}`);
  return svg.replace(open, next);
}

// Sets width/height to the viewBox size in unitless px, so a render at
// density 72 is exactly one pixel per user unit (the sources say "pt").
function normalize(svg) {
  const { viewBox: [, , w, h] } = svgSize(svg);
  const open = svgSize(svg).open;
  const vb = open.match(/viewBox="([^"]+)"/)[1];
  return withOpenTag(svg, `width="${w}" height="${h}" viewBox="${vb}"`);
}

// Strips the full-bleed background group the on-navy files carry.
function stripBackground(svg) {
  const re = /<g clip-path="url\(#clip1\)"[^>]*>\s*<path[^>]*\/>\s*<\/g>\s*/;
  const m = svg.match(re);
  if (!m) throw new Error("background group not found");
  if (!/fill:rgb\(6\.6665\d+%,13\.333\d+%,20\.39\d+%\)/.test(m[0])) {
    throw new Error("background group is not navy, refusing to strip it");
  }
  return svg.replace(re, "");
}

function addBackground(svg, color) {
  const { viewBox: [x, y, w, h] } = svgSize(svg);
  return svg.replace(/<g id="surface1">/, `<g id="surface1">\n<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`);
}

// Crops an SVG to the bounding box of its visible pixels, plus padding.
async function cropToContent(svg, padRatio = 0.04) {
  const { viewBox: [vx, vy, vw, vh] } = svgSize(svg);
  const renderW = 4000;
  const density = (PT_PER_IN * renderW) / vw;
  const { info } = await sharp(Buffer.from(normalize(svg)), { density, limitInputPixels: false })
    .png()
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  const scale = vw / renderW;
  const left = vx + -info.trimOffsetLeft * scale;
  const top = vy + -info.trimOffsetTop * scale;
  const w = info.width * scale;
  const h = info.height * scale;
  const pad = w * padRatio;
  const box = [left - pad, top - pad, w + 2 * pad, h + 2 * pad].map((n) => Number(n.toFixed(3)));
  return withOpenTag(svg, `width="${box[2]}" height="${box[3]}" viewBox="${box.join(" ")}"`);
}

/* --- Raster helpers ------------------------------------------------------ */

function rasterFromSvg(svg, widthPx) {
  const { viewBox: [, , vw] } = svgSize(svg);
  const density = (PT_PER_IN * widthPx) / vw;
  return sharp(Buffer.from(normalize(svg)), { density, limitInputPixels: false }).resize({ width: widthPx });
}

/* --- PDF via headless Chromium ------------------------------------------ */

async function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  for (const c of candidates) {
    try { await access(c); return c; } catch {}
  }
  return null;
}

let chrome = null;
let tmp = null;
let pdfCount = 0;

// Prints an SVG to a single-page PDF whose page is exactly `wPt` x `hPt`.
async function svgToPdf(svg, outName, wPt, hPt) {
  if (!chrome) return false;
  const base = outName.replace(/\.pdf$/, "");
  const svgPath = path.join(tmp, `${base}.svg`);
  const htmlPath = path.join(tmp, `${base}.html`);
  const pdfPath = path.join(tmp, `${base}.pdf`);
  await writeFile(svgPath, svg);
  await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8">
<style>@page{size:${wPt}pt ${hPt}pt;margin:0}html,body{margin:0;padding:0;background:transparent}
img{display:block;width:${wPt}pt;height:${hPt}pt}</style></head>
<body><img src="file://${svgPath}"></body></html>`);
  await run(chrome, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`,
  ], { maxBuffer: 1 << 24 });
  await write(outName, stabilizePdf(await readFile(pdfPath)));
  pdfCount += 1;
  return true;
}

// Chromium stamps the run's clock into the PDF, which would make every
// rebuild a diff. Pin both dates to a constant of the same byte length so the
// xref offsets stay valid and an unchanged source yields an identical file.
function stabilizePdf(buffer) {
  const text = buffer.toString("latin1");
  const fixed = text.replace(/\/(CreationDate|ModDate) \(D:\d{14}/g, "/$1 (D:20260501000000");
  return Buffer.from(fixed, "latin1");
}

/* ------------------------------------------------------------------------ */

async function buildWordmarks() {
  for (const v of WORDMARKS) {
    const square = await readFile(path.join(LOGO, v.src), "utf8");
    const { viewBox: [, , vw, vh] } = svgSize(square);
    const bare = v.hasBackground ? stripBackground(square) : square;
    const squareFilled = v.hasBackground ? square : addBackground(square, v.bg);

    // Transparent, tight-cropped wordmark: SVG, PDF, WebP, small PNG.
    const cropped = await cropToContent(bare);
    const { viewBox: [, , cw, ch] } = svgSize(cropped);
    await write(`wordmark-${v.tKey}.svg`, cropped);
    await svgToPdf(cropped, `wordmark-${v.tKey}.pdf`, cw, ch);
    await rasterFromSvg(cropped, 2400).webp({ quality: 90, alphaQuality: 100 }).toFile(await targetPath(`wordmark-${v.tKey}.webp`));
    await rasterFromSvg(cropped, 600).png().toFile(await targetPath(`wordmark-${v.tKey}-600.png`));

    // Square lockup with the background: PDF, 1024 PNG, 1024 JPG.
    await svgToPdf(squareFilled, `lockup-${v.key}.pdf`, vw, vh);
    await rasterFromSvg(squareFilled, 1024).flatten({ background: v.bg }).png().toFile(await targetPath(`lockup-${v.key}-1024.png`));
    await rasterFromSvg(squareFilled, 1024).flatten({ background: v.bg }).jpeg({ quality: 92, mozjpeg: true }).toFile(await targetPath(`lockup-${v.key}-1024.jpg`));

    const use = v.on === "dark" ? "any dark background" : "any light background";
    const base = { family: "wordmark", variant: v.label, colors: v.colors, on: v.on };
    record(await describe(logoRel(`wordmark-${v.tKey}.svg`), { ...base, background: "transparent", transparent: true, use: `Vector wordmark for ${use}. Default for web and design tools.` }));
    if (chrome) record(await describe(logoRel(`wordmark-${v.tKey}.pdf`), { ...base, background: "transparent", transparent: true, use: `Vector wordmark for print, ${use}.` }));
    record(await describe(logoRel(`wordmark-${v.tKey}.webp`), { ...base, background: "transparent", use: `Transparent wordmark for the web, ${use}.` }));
    record(await describe(logoRel(`wordmark-${v.tKey}-600.png`), { ...base, background: "transparent", use: `Small transparent wordmark for email signatures and slides, ${use}.` }));
    record(await describe(logoRel(`wordmark-${v.tKey}.png`), { ...base, background: "transparent", use: `Full-size transparent wordmark, ${use}.` }));
    record(await describe(logoRel(v.src), { ...base, family: "lockup", background: v.hasBackground ? v.bg : "transparent", transparent: !v.hasBackground, use: `Square vector lockup${v.hasBackground ? " with the navy background" : " (no background; sits on white)"}.` }));
    if (chrome) record(await describe(logoRel(`lockup-${v.key}.pdf`), { ...base, family: "lockup", background: v.bg, transparent: false, use: "Square lockup for print." }));
    record(await describe(logoRel(`lockup-${v.key}-1024.png`), { ...base, family: "lockup", background: v.bg, use: "Profile picture and avatar upload (1024 square)." }));
    record(await describe(logoRel(`lockup-${v.key}-1024.jpg`), { ...base, family: "lockup", background: v.bg, use: "Profile picture where PNG is refused or too large." }));
    record(await describe(logoRel(`lockup-${v.key}.png`), { ...base, family: "lockup", background: v.bg, use: "Full-resolution square lockup." }));
  }
}

async function targetPath(name) {
  built.push(name);
  return path.join(LOGO, name);
}

async function buildBanner() {
  const svg = await readFile(path.join(LOGO, "banner-primary-on-navy.svg"), "utf8");
  const { viewBox: [, , vw, vh] } = svgSize(svg);
  // 18in x 8in page: the file is vector, so the page size only sets the default print scale.
  await svgToPdf(svg, "banner-primary-on-navy.pdf", 18 * PT_PER_IN, (18 * PT_PER_IN * vh) / vw);
  await rasterFromSvg(svg, 2400).flatten({ background: NAVY }).png().toFile(await targetPath("banner-primary-on-navy-2400.png"));
  await rasterFromSvg(svg, 2400).flatten({ background: NAVY }).jpeg({ quality: 90, mozjpeg: true }).toFile(await targetPath("banner-primary-on-navy-2400.jpg"));
  await rasterFromSvg(svg, 2400).flatten({ background: NAVY }).webp({ quality: 88 }).toFile(await targetPath("banner-primary-on-navy-2400.webp"));

  const base = { family: "banner", variant: "Banner with tagline", colors: "White + Light Blue + Progress Pride rule", on: "dark", background: NAVY, transparent: false };
  record(await describe(logoRel("banner-primary-on-navy.svg"), { ...base, use: "Wide banner lockup with tagline (9:4). Vector." }));
  if (chrome) record(await describe(logoRel("banner-primary-on-navy.pdf"), { ...base, use: "Banner for print and signage." }));
  record(await describe(logoRel("banner-primary-on-navy-2400.png"), { ...base, use: "Banner for headers, covers and slides." }));
  record(await describe(logoRel("banner-primary-on-navy-2400.jpg"), { ...base, use: "Banner for cover-photo uploads with size limits." }));
  record(await describe(logoRel("banner-primary-on-navy-2400.webp"), { ...base, use: "Banner for the web." }));
  record(await describe(logoRel("banner-primary-on-navy.png"), { ...base, use: "Full-resolution banner." }));
}

async function buildBadges() {
  for (const b of BADGES) {
    const src = path.join(LOGO, b.src);
    await sharp(src).flatten({ background: b.flatten }).jpeg({ quality: 92, mozjpeg: true }).toFile(await targetPath(`${b.key}.jpg`));
    await sharp(src).webp({ quality: 92, alphaQuality: 100 }).toFile(await targetPath(`${b.key}.webp`));
    await sharp(src).resize({ width: 800 }).png().toFile(await targetPath(`${b.key}-800.png`));
    const base = { family: "endorsement-badge", variant: b.label, on: b.on };
    const use = b.on === "dark" ? "dark backgrounds" : "light backgrounds";
    record(await describe(logoRel(b.src), { ...base, background: "transparent", use: `"Endorsed by Ohio Pride PAC" badge for ${use}. Endorsed candidates only.` }));
    record(await describe(logoRel(`${b.key}.jpg`), { ...base, background: b.flatten, use: `Badge flattened on ${b.flatten === NAVY ? "navy" : "white"} for tools that refuse transparency.` }));
    record(await describe(logoRel(`${b.key}.webp`), { ...base, background: "transparent", use: `Badge for the web, ${use}.` }));
    record(await describe(logoRel(`${b.key}-800.png`), { ...base, background: "transparent", use: `Small badge for web and email, ${use}.` }));
  }
  record(await describe(logoRel("endorsed-badge-preview.png"), { family: "endorsement-badge", variant: "Preview", background: "mixed", transparent: false, use: "Both badge variants shown on their backgrounds." }));
}

async function recordStatic() {
  const fav = [
    ["assets/favicon/favicon.svg", "Vector favicon (OP monogram over the Progress Pride underline)."],
    ["favicon.ico", "Legacy browser favicon, served at the site root."],
    ["assets/favicon/favicon.ico", "Legacy browser favicon (copy of the root file)."],
    ["assets/favicon/favicon-16.png", "16px favicon."],
    ["assets/favicon/favicon-32.png", "32px favicon."],
    ["assets/favicon/favicon-48.png", "48px favicon."],
    ["assets/favicon/favicon-96.png", "96px favicon."],
    ["assets/favicon/favicon-192.png", "Android home-screen icon."],
    ["assets/favicon/favicon-512.png", "PWA icon (512px)."],
    ["assets/favicon/maskable-512.png", "Maskable PWA icon (512px, safe-zone padded)."],
    ["assets/favicon/apple-touch-icon.png", "Apple touch icon (180px, full bleed)."],
  ];
  for (const [rel, use] of fav) record(await describe(rel, { family: "favicon", variant: "OP monogram", background: NAVY, use }));
  record(await describe("assets/social/og-image.png", { family: "social", variant: "Open Graph card", background: NAVY, transparent: false, use: "Default link-preview card (1200x630)." }));
  record(await describe("assets/social/pride-rule.svg", { family: "supporting", variant: "Progress Pride rule", background: "transparent", transparent: true, use: "Thin Progress Pride divider for email and web." }));
  record(await describe("assets/img/ohio-pride-outline.svg", { family: "supporting", variant: "Ohio outline, Progress Pride fill", background: "transparent", transparent: true, use: "Illustrative Ohio silhouette in Progress Pride colors. Accent use only, never in place of the wordmark." }));
  record(await describe("assets/source/ohio-pride-pac-master.ai", { family: "source", variant: "Illustrator master", use: "Editable source for the wordmark and lockups. Adobe Illustrator." }));
  record(await describe("assets/source/ohio-pride-pac-banner.ai", { family: "source", variant: "Illustrator banner", use: "Editable source for the banner lockup. Adobe Illustrator." }));
}

function readmeText() {
  return `OHIO PRIDE PAC BRAND KIT (Brand Guide v2.1, October 2026)
https://www.ohiopride.org/brand
Machine-readable brand: https://www.ohiopride.org/brand.json

Everything in this archive is the current Ohio Pride PAC mark.
A machine-readable index of every file is in manifest.json.

WHICH FILE
  Dark backgrounds   wordmark-primary-transparent.*      (white + light blue)
  Light backgrounds  wordmark-primary-dark-transparent.* (navy + light blue)
  Single color       wordmark-mono-white-transparent.*   or wordmark-mono-navy-transparent.*
  Profile pictures   lockup-primary-on-navy-1024.png
  Cover photos       banner-primary-on-navy-2400.jpg
  Print              the .pdf files are vector; the .ai files are the editable sources

FORMATS
  .svg  vector, web and design tools      .pdf  vector, print
  .png  transparent raster                .webp transparent raster, smaller, web
  .jpg  flattened on navy or white, for uploads that refuse transparency

COLORS
  Navy        #152233      Light Blue  #70D6EC      White  #FFFFFF
  Progress Pride accent: #E40303 #FFBC00 #FFED00 #008026 #004DFF #750787 #000000 #613915 #FFAFC8

TYPE
  Montserrat (headlines, wordmark)   Roboto Slab (body)   both on Google Fonts

RULES
  Keep clear space equal to the height of the O in OHIO on every side.
  Minimum width 140px on screen, 1.25in in print; below that use the favicon mark.
  Never recolor, stretch, rotate, add effects, or fill the mark with the rainbow.
  The "Endorsed by" badge is for candidates Ohio Pride PAC has endorsed on the record. Nothing else.

Questions: info@ohiopride.org
`;
}

async function buildZip() {
  const zipName = "ohio-pride-pac-brand-kit.zip";
  const zipAbs = path.join(LOGO, zipName);
  await writeFile(path.join(tmp, "README.txt"), readmeText());
  // Deterministic archive: fixed timestamps, sorted entries, so a rebuild
  // without asset changes leaves the committed file byte-identical.
  const script = `
import sys, zipfile, os
out, public, tmp = sys.argv[1], sys.argv[2], sys.argv[3]
files = sorted(sys.argv[4:])
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for rel in files:
        src = os.path.join(public, rel)
        arc = "ohio-pride-pac-brand-kit/" + rel.replace("assets/", "", 1)
        info = zipfile.ZipInfo(arc, date_time=(2026, 5, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        with open(src, "rb") as f:
            z.writestr(info, f.read())
    for name in ("README.txt",):
        info = zipfile.ZipInfo("ohio-pride-pac-brand-kit/" + name, date_time=(2026, 5, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        with open(os.path.join(tmp, name), "rb") as f:
            z.writestr(info, f.read())
`;
  const files = manifest.map((m) => m.path.slice(1)).filter((p) => !p.endsWith(zipName));
  files.push("assets/logo/manifest.json");
  await run("python3", ["-I", "-c", script, zipAbs, PUBLIC, tmp, ...files], { maxBuffer: 1 << 24 });
  built.push(zipName);
  return zipAbs;
}

async function main() {
  chrome = await findChrome();
  tmp = await mkdtemp(path.join(os.tmpdir(), "ohp-brand-"));
  if (!chrome) console.warn("! No Chromium found (set CHROME_BIN); skipping PDF outputs.");

  await buildWordmarks();
  await buildBanner();
  await buildBadges();
  await recordStatic();

  manifest.sort((a, b) => a.path.localeCompare(b.path));
  const manifestOut = {
    brand: "Ohio Pride PAC",
    version: "2.1",
    reference: `${SITE}/brand`,
    kit: `${SITE}/assets/logo/ohio-pride-pac-brand-kit.zip`,
    colors: {
      navy: "#152233", lightBlue: "#70D6EC", white: "#FFFFFF", navyFooter: "#0D1726",
      progressPride: ["#E40303", "#FFBC00", "#FFED00", "#008026", "#004DFF", "#750787", "#000000", "#613915", "#FFAFC8"],
    },
    fonts: { display: "Montserrat", body: "Roboto Slab" },
    assets: manifest,
  };
  await writeFile(path.join(LOGO, "manifest.json"), JSON.stringify(manifestOut, null, 2) + "\n");
  built.push("manifest.json");

  const zipAbs = await buildZip();
  await rm(tmp, { recursive: true, force: true });

  console.log(`Built ${built.length} files in public/assets/logo (${pdfCount} PDFs). Kit: ${(await fileBytes(zipAbs) / 1048576).toFixed(1)} MB, ${manifest.length} assets in manifest.json.`);
}

await main();
