import type { Metadata } from 'next';
import { PageBody } from '@/components/PageBody';
import { loadPage, metadataFromPageMeta } from '@/lib/page-content';

const PAGE = loadPage('donate-founding-member');

export const metadata: Metadata = metadataFromPageMeta(PAGE.meta, {
  title:       'Become a Founding Member | Ohio Pride',
  description: 'Become a founding member of Ohio Pride PAC and help launch LGBTQ+ political power in Ohio.',
});

export default function DonateFoundingMemberPage() {
  return <PageBody content={PAGE} />;
}
