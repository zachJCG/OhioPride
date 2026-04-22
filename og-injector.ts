// Ohio Pride PAC, Edge Function: per-legislator OG tag injection.
//
// Path: any GET to /scorecard or /scorecard.html with ?rep=<slug>.
// Behavior:
//   1. Fetch the static scorecard.html via context.next().
//   2. If ?rep=<slug> is present and matches a known legislator,
//      replace the <!-- INJECT_OG_TAGS_HERE --> marker with per-rep
//      OG/Twitter meta tags so Facebook/X/etc. show the right preview.
//   3. Otherwise pass the response through unchanged.
//
// The legislator manifest is generated at build time by
// scripts/build-legislators-manifest.mjs and lives at
// /assets/data/legislators.json (publicly fetchable). We cache it
// per edge worker via globalThis to avoid re-fetching every request.
//
// Deno runtime (Netlify Edge Functions, Deno on V8).

import type { Context } from "https://edge.netlify.com";

interface LegislatorEntry {
  slug: string;
  name: string;
  chamber: "House" | "Senate";
  district: number;
  party: "D" | "R";
  score: number;
  grade: string;        // "A+", "A", "B", "C", "D", "F"
  gradeLabel: string;   // "Champion", "Strong Ally", ...
  ogImage: string;      // absolute URL
}

const SITE = "https://ohiopride.org";
const MANIFEST_URL = SITE + "/assets/data/legislators.json";

// Cache manifest on the worker's global so we don't refetch every hit.
// 5-minute TTL is plenty: manifest only changes on deploy.
interface CacheShape { fetchedAt: number; data: Record<string, LegislatorEntry> | null; }
// deno-lint-ignore no-explicit-any
const g = globalThis as any;
if (!g.__OPP_OG_CACHE__) g.__OPP_OG_CACHE__ = { fetchedAt: 0, data: null } as CacheShape;
const CACHE: CacheShape = g.__OPP_OG_CACHE__;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadManifest(): Promise<Record<string, LegislatorEntry> | null> {
  const now = Date.now();
  if (CACHE.data && now - CACHE.fetchedAt < CACHE_TTL_MS) return CACHE.data;
  try {
    const r = await fetch(MANIFEST_URL, { headers: { accept: "application/json" } });
    if (!r.ok) return CACHE.data; // fall back to whatever we had
    const list = (await r.json()) as LegislatorEntry[];
    const map: Record<string, LegislatorEntry> = {};
    for (const entry of list) map[entry.slug] = entry;
    CACHE.data = map;
    CACHE.fetchedAt = now;
    return map;
  } catch (_err) {
    return CACHE.data;
  }
}

function escapeHtml(str: string): string {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildOgBlock(entry: LegislatorEntry, shareUrl: string): string {
  const title = `${entry.name} (${entry.chamber} Dist. ${entry.district}): ${entry.grade}`;
  const desc =
    `${entry.name} scored ${entry.score}/100 (${entry.grade}, ${entry.gradeLabel}) ` +
    `on the Ohio Pride PAC LGBTQ+ Equality Scorecard.`;
  const t = escapeHtml(title);
  const d = escapeHtml(desc);
  const url = escapeHtml(shareUrl);
  const img = escapeHtml(entry.ogImage);
  return [
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:site_name" content="Ohio Pride PAC" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ].join("\n  ");
}

export default async (request: Request, context: Context): Promise<Response> => {
  const url = new URL(request.url);
  const rep = (url.searchParams.get("rep") || "").trim().toLowerCase();
  // No ?rep? Pass through untouched. This keeps the site fully static for default shares.
  if (!rep) return context.next();

  const response = await context.next();
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return response;

  const manifest = await loadManifest();
  if (!manifest) return response;
  const entry = manifest[rep];
  if (!entry) return response;

  const shareUrl = `${SITE}/scorecard?rep=${encodeURIComponent(entry.slug)}`;
  const ogBlock = buildOgBlock(entry, shareUrl);

  // Replace the marker. If the marker is missing (older deploy), we no-op.
  const html = await response.text();
  const marker = "<!-- INJECT_OG_TAGS_HERE -->";
  if (!html.includes(marker)) {
    return new Response(html, response);
  }
  const patched = html.replace(marker, ogBlock + "\n  " + marker);

  // Preserve original headers but make sure caches respect ?rep variants.
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
  headers.append("vary", "accept");
  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const config = {
  path: ["/scorecard", "/scorecard.html"],
};
