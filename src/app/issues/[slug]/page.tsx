import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageBody } from '@/components/PageBody';
import { listIssueSlugs, loadIssue, metadataFromPageMeta } from '@/lib/page-content';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const KNOWN_SLUGS = new Set(listIssueSlugs());

export function generateStaticParams() {
  return Array.from(KNOWN_SLUGS).map(slug => ({ slug }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  if (!KNOWN_SLUGS.has(slug)) return {};
  const page = loadIssue(slug);
  return metadataFromPageMeta(page.meta, {
    title:       `${slug.toUpperCase()} | Ohio Pride Bill Tracker`,
    description: 'Track LGBTQ+ legislation in the Ohio Statehouse — sponsors, status, and roll-call votes.',
  });
}

export default async function IssueDetailPage({ params }: RouteParams) {
  const { slug } = await params;
  if (!KNOWN_SLUGS.has(slug)) notFound();
  const page = loadIssue(slug);
  return <PageBody content={page} />;
}
