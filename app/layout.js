/* Root layout: the shared chrome every ported page inherits.
 *
 * The pages still living in public/ carry their own <head> and mount the
 * header and footer with public/js/site-template.js. Ported pages get both
 * from here instead, server rendered. The two must stay visually identical
 * while both exist, which is why this loads the same stylesheets and the
 * components emit the same class names.
 *
 * The font list is the union of the weights the static pages ask for, so no
 * ported page loses a weight it was using.
 */

import Script from 'next/script';
import SiteHeader from './components/SiteHeader';
import SiteFooter from './components/SiteFooter';

export const metadata = {
  metadataBase: new URL('https://www.ohiopride.org'),
  title: {
    default: "Ohio Pride | Ohio's Only Statewide LGBTQ+ Political Action Committee",
    template: '%s | Ohio Pride',
  },
  description:
    'Ohio Pride PAC elects pro-equality leaders and scores all 132 state legislators on LGBTQ+ rights.',
  icons: {
    icon: [
      { url: '/assets/favicon/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/assets/favicon/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: '/assets/favicon/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#152233',
};

/* The footer resolves leadership and the disclaimer on the server, so a purely
 * static render would freeze both until the next deploy. That block is legally
 * required copy, so it must not go stale on a deploy schedule. Hourly
 * revalidation keeps ported pages static and fast while still picking up a
 * change to site_leadership on its own. */
export const revalidate = 3600;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Roboto+Slab:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/css/style.css" />
        <link rel="stylesheet" href="/css/site-template.css" />
      </head>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />

        {/* Migration bridge. Every static page loads these two, so ported
            pages load them as well and keep the same scroll reveals, counters,
            smooth anchor scrolling, and donate button behaviour. They target
            the older .nav and .nav-links classes, not the .ohp-nav markup
            above, so they do not fight the React header. Retire them as those
            behaviours are ported into components. */}
        <Script src="/js/main.js" strategy="afterInteractive" />
        <Script src="/js/enhancements.js" strategy="afterInteractive" />

        {/* Two day promotion for /governor-guide. The static pages get this
            from site-template.js; ported pages get it here. Self expiring, so
            it needs no deadline cleanup. Delete both loaders with the file. */}
        <Script src="/js/guide-popup.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
