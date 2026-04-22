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

// Cache manifest on the worker's global so we don't refetch every hit.
// Keyed by origin so deploy previews and production don't cross-contaminate.
// 5-minute TTL is plenty: manifest only changes on deploy.
interface CacheEntry { fetchedAt: number; data: Record<string, LegislatorEntry> | null; }
// deno-lint-ignore no-explicit-any
const g = globalThis as any;
if (!g.__OPP_OG_CACHE__) g.__OPP_OG_CACHE__ = {} as Record<string, CacheEntry>;
const CACHE: Record<string, CacheEntry> = g.__OPP_OG_CACHE__;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadManifest(origin: string): Promise<Record<string, LegislatorEntry> | null> {
  const now = Date.now();
  const entry = CACHE[origin] || (CACHE[origin] = { fetchedAt: 0, data: null });
  if (entry.data && now - entry.fetchedAt < CACHE_TTL_MS) return entry.data;
  try {
    const r = await fetch(origin + "/assets/data/legislators.json", { headers: { accept: "application/json" } });
    if (!r.ok) return entry.data; // fall back to whatever we had
    const list = (await r.json()) as LegislatorEntry[];
    const map: Record<string, LegislatorEntry> = {};
    for (const e of list) map[e.slug] = e;
    entry.data = map;
    entry.fetchedAt = now;
    return map;
  } catch (_err) {
    return entry.data;
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
    `Check out ${entry.name}'s grade on Ohio Pride. ` +
    `Scored ${entry.score}/100 (${entry.grade}, ${entry.gradeLabel}) on the LGBTQ+ Equality Scorecard.`;
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

  // Read manifest from the same origin as the incoming request so deploy
  // previews see their own fresh manifest, not prod's.
  const manifest = await loadManifest(url.origin);
  if (!manifest) return response;
  const entry = manifest[rep];
  if (!entry) return response;

  // The public share URL stays canonical (prod) so link previews don't
  // point at ephemeral deploy-preview hostnames.
  const shareUrl = `${SITE}/scorecard?rep=${encodeURIComponent(entry.slug)}`;
  const ogBlock = buildOgBlock(entry, shareUrl);

  // Replace the marker. If the marker is missing (older deploy), we no-op.
  const html = await response.text();
  const marker = "<!-- INJECT_OG_TAGS_HERE -->";
  if (!html.includes(marker)) {
    return new Response(html, response);
  }
  const patched = html.replace(marker, ogBlock + "\n  " + marker);

  // Preserve original headers but:
  //  - drop content-length (we rewrote the body, the inherited length is wrong and
  //    scrapers may truncate or reject the response)
  //  - drop content-encoding (upstream may be gzip; we hand back plain text)
  //  - set cache-control so the edge respects ?rep variants
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
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
