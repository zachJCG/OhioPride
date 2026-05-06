import type { Metadata } from 'next';
import { PageBody } from '@/components/PageBody';
import { loadPage, metadataFromPageMeta } from '@/lib/page-content';

const PAGE = loadPage('index');

export const metadata: Metadata = metadataFromPageMeta(PAGE.meta, {
  title:       'Ohio Pride | Political Action Committee for LGBTQ+ Equality',
  description: 'Ohio Pride mobilizes voters, endorses pro-equality candidates, and advocates for the rights of LGBTQ+ Ohioans at every level of government.',
});

export default function HomePage() {
  return <PageBody content={PAGE} />;
}
