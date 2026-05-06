import type { Metadata } from 'next';
import { PageBody } from '@/components/PageBody';
import { loadPage, metadataFromPageMeta } from '@/lib/page-content';

const PAGE = loadPage('privacy');

export const metadata: Metadata = metadataFromPageMeta(PAGE.meta, {
  title:       'Ohio Pride',
  description: 'Ohio Pride PAC',
});

export default function PrivacyPage() {
  return <PageBody content={PAGE} />;
}
