/* ============================================================
   Build /assets/data/legislators.json from js/scorecard-data.js.

   Why this exists:
   The scorecard renders client-side, so search engines and
   social-card scrapers (Facebook, X, iMessage) never see the
   per-legislator grade. The Netlify edge function in
   netlify/edge-functions/og-injector.ts looks up the legislator
   by slug from this manifest at request time and injects the
   right OG tags into scorecard.html before the response is sent.

   Run automatically by the netlify build (see netlify.toml):
     node scripts/build-legislators-manifest.mjs

   Output:
     assets/data/legislators.json   (one big array, see entryShape)
   ============================================================ */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const SITE = "https://ohiopride.org";

/* Load js/scorecard-data.js. It's a plain script that defines
   const HOUSE_MEMBERS, SENATE_MEMBERS, GRADE_SCALE, calcScore,
   calcGrade. We eval it inside a sandboxed function and then read
   what we need off the resulting context object. */
const src = readFileSync(resolve(ROOT, "js/scorecard-data.js"), "utf8");
const ctx = { module: { exports: {} } };
const factory = new Function(
  "ctx",
  src + "\n;Object.assign(ctx, { HOUSE_MEMBERS, SENATE_MEMBERS, GRADE_SCALE, calcScore, calcGrade });"
);
factory(ctx);
const { HOUSE_MEMBERS, SENATE_MEMBERS, calcScore, calcGrade } = ctx;

if (!Array.isArray(HOUSE_MEMBERS) || !Array.isArray(SENATE_MEMBERS)) {
  console.error("[manifest] FATAL: HOUSE_MEMBERS / SENATE_MEMBERS not found in scorecard-data.js");
  process.exit(1);
}

/* Slug must mirror js/share.js slugify(). Keep these in sync. */
function lastNameOf(fullName) {
  return String(fullName || "")
    .replace(/[.,]/g, " ")
    .replace(/\s+(Jr|Sr|II|III|IV|V)$/i, "")
    .trim()
    .split(/\s+/)
    .pop()
    .toLowerCase();
}
function slugify(member, chamber) {
  return lastNameOf(member.name) + "-" + (chamber === "Senate" ? "s" : "h") + member.d;
}

/* Grade -> static OG image. We host one fallback image per grade
   under /assets/social/. Per-rep images can be substituted later
   if/when the social card asset library grows. */
function ogImageForGrade(g) {
  const key = g === "A+" ? "a-plus" : g.toLowerCase();
  return SITE + "/assets/social/grade-" + key + "-share.png";
}

function entry(member, chamber) {
  const score = calcScore(member);
  const grade = calcGrade(score);
  return {
    slug: slugify(member, chamber),
    name: member.name,
    chamber,
    district: member.d,
    party: member.party,
    score,
    grade: grade.grade,
    gradeLabel: grade.label,
    ogImage: ogImageForGrade(grade.grade),
  };
}

const all = [
  ...HOUSE_MEMBERS.map((m) => entry(m, "House")),
  ...SENATE_MEMBERS.map((m) => entry(m, "Senate")),
];

/* Sanity: warn on duplicate slugs. */
const seen = new Map();
const dups = [];
for (const e of all) {
  if (seen.has(e.slug)) dups.push({ slug: e.slug, a: seen.get(e.slug), b: e });
  else seen.set(e.slug, e);
}
if (dups.length) {
  console.warn(`[manifest] ${dups.length} duplicate slug(s); collisions resolve to last-write-wins:`);
  for (const d of dups) console.warn(`  ${d.slug}: ${d.a.name} <vs> ${d.b.name}`);
}

const outDir = resolve(ROOT, "assets/data");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "legislators.json");
writeFileSync(outPath, JSON.stringify(all, null, 2) + "\n", "utf8");

console.log(
  `[manifest] wrote ${all.length} legislators -> assets/data/legislators.json` +
  (dups.length ? ` (${dups.length} dup slug(s) flagged)` : "")
);
