/* Root layout. Required by the App Router.
 *
 * Nothing renders through it yet: every page is still the static HTML in
 * public/, served by the clean-URL rewrites in next.config.mjs. As pages are
 * ported off public/ they become real routes and pick this up, which is where
 * the shared header and footer from js/site-template.js will eventually live.
 */
export const metadata = {
  title: 'Ohio Pride PAC',
  description: "Ohio's only statewide LGBTQ+ political action committee.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
