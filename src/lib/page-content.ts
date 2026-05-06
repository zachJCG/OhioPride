import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';

/**
 * Build-time helper for the Round-3 Next.js migration.
 *
 * The original site shipped 14 top-level HTML pages and 22 issue-detail pages
 * (~28K lines of markup) hand-authored against /css/style.css. Rewriting that
 * volume into JSX in a single migration would have meant either a multi-week
 * port or an unbounded "we'll re-author it later" sprawl, so this loader
 * preserves each page's exact body markup as-is and lets the Next.js layer
 * own routing, metadata, layout, and API routes.
 *
 * For each page we have a sibling pair in /content:
 *   <slug>.html      → body innerHTML (head/header/footer/script tags removed)
 *   <slug>.meta.json → title/description/OG/Twitter/JSON-LD/style/script lists
 *
 * The page component then renders:
 *   - body via dangerouslySetInnerHTML
 *   - head <style> blocks via inline <style> tags (preserved verbatim)
 *   - JSON-LD via <script type="application/ld+json">
 *   - external scripts via next/script with the original src paths
 *   - inline scripts via next/script id'd by index
 */

export interface PageMeta {
  title: string | null;
  description: string | null;
  canonical: string | null;
  og: { title: string | null; description: string | null; image: string | null; type: string | null };
  twitter: { card: string | null; title: string | null; description: string | null; image: string | null };
  jsonLd: string[];
  headStyles: string[];
  externalScripts: string[];
  inlineScripts: string[];
}

export interface PageContent {
  body: string;
  meta: PageMeta;
}

const PAGES_DIR  = path.join(process.cwd(), 'content', 'pages');
const ISSUES_DIR = path.join(process.cwd(), 'content', 'issues');

function load(dir: string, slug: string): PageContent {
  const body = fs.readFileSync(path.join(dir, `${slug}.html`), 'utf8');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, `${slug}.meta.json`), 'utf8')) as PageMeta;
  return { body, meta };
}

export function loadPage(slug: string): PageContent {
  return load(PAGES_DIR, slug);
}

export function loadIssue(slug: string): PageContent {
  return load(ISSUES_DIR, slug);
}

export function listIssueSlugs(): string[] {
  return fs
    .readdirSync(ISSUES_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace(/\.html$/, ''))
    .sort();
}

/**
 * Convert an extracted PageMeta into a Next.js Metadata object so we keep the
 * existing OG/Twitter/canonical values from the original HTML.
 */
export function metadataFromPageMeta(meta: PageMeta, fallback: { title: string; description: string }): Metadata {
  const title       = meta.title       || fallback.title;
  const description = meta.description || fallback.description;
  const canonical   = meta.canonical   || undefined;

  return {
    // Absolute so the layout's "%s | Ohio Pride" template does not duplicate the
    // suffix already baked into the legacy titles.
    title:       { absolute: title },
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: (meta.og.type as 'website' | 'article' | undefined) || 'website',
      title:       meta.og.title       || title,
      description: meta.og.description || description,
      url:         canonical,
      siteName:    'Ohio Pride',
      images:      meta.og.image ? [meta.og.image] : undefined,
    },
    twitter: {
      card:        (meta.twitter.card as 'summary' | 'summary_large_image' | undefined) || 'summary',
      title:       meta.twitter.title       || title,
      description: meta.twitter.description || description,
      images:      meta.twitter.image ? [meta.twitter.image] : undefined,
    },
  };
}
