import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.ohiopride.org'),
  title: {
    default:  'Ohio Pride | Political Action Committee for LGBTQ+ Equality',
    template: '%s | Ohio Pride',
  },
  description: 'Ohio Pride mobilizes voters, endorses pro-equality candidates, and advocates for the rights of LGBTQ+ Ohioans at every level of government.',
  openGraph: {
    type:        'website',
    siteName:    'Ohio Pride',
    title:       'Ohio Pride | LGBTQ+ Equality in Ohio',
    description: 'Ohio Pride mobilizes voters, endorses pro-equality candidates, and advocates for the rights of LGBTQ+ Ohioans at every level of government.',
    url:         'https://www.ohiopride.org',
  },
  twitter: {
    card:        'summary',
    title:       'Ohio Pride | LGBTQ+ Equality in Ohio',
    description: 'Ohio Pride mobilizes voters, endorses pro-equality candidates, and advocates for the rights of LGBTQ+ Ohioans at every level of government.',
  },
  icons: {
    icon: '/assets/logo/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Roboto+Slab:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/css/style.css" />
        <link rel="stylesheet" href="/css/site-template.css" />
        <link rel="stylesheet" href="/css/bill-pipeline.css" />
        <link rel="stylesheet" href="/css/round-3-mobile-and-tier-cta.css" />
      </head>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
        <Link href="/donate" className="mobile-donate-fab">Donate</Link>
      </body>
    </html>
  );
}
