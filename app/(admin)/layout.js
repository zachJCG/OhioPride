/* Admin root layout. A separate root layout from the public site's
 * app/(site)/layout.js: no marketing header/footer, no migration bridge
 * scripts, its own theme.
 *
 * No web app manifest is linked on purpose. Linking one made browsers offer
 * to install the admin as an app, which is confusing on the way to a login
 * screen. public/admin/manifest.webmanifest is still in the repo; add
 * `manifest: '/admin/manifest.webmanifest'` back to the metadata below if the
 * board ever wants the installable version.
 */
import { Analytics } from '@vercel/analytics/next';
import './admin-theme.css';
import AdminShell from './AdminShell';

export const metadata = {
  metadataBase: new URL('https://www.ohiopride.org'),
  title: {
    default: 'Ohio Pride Admin',
    template: '%s · Ohio Pride Admin',
  },
  robots: { index: false, follow: false, noarchive: true },
  icons: {
    icon: [
      { url: '/assets/favicon/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/assets/favicon/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: '/assets/favicon/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#0F2233',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function AdminRootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="admin">
        <AdminShell>{children}</AdminShell>
        <Analytics />
      </body>
    </html>
  );
}
