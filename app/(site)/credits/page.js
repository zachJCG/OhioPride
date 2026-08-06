/* /credits, the first page ported off public/.
 *
 * It is a good canary: entirely static, short, and it exercises the whole
 * chain (root layout chrome, page-scoped CSS, metadata) without depending on
 * Supabase. The rewrite in next.config.mjs for public/credits.html is an
 * afterFiles rule, so the moment this file exists it stops firing and this
 * route answers /credits. Deleting public/credits.html is the cleanup, not
 * the cutover.
 *
 * The credits themselves are data rather than markup so a new photo is one
 * object, and so this list can move to Supabase later without a rewrite.
 */

import './credits.css';

export const metadata = {
  title: 'Photo Credits',
  description:
    'Attribution for the photography used on ohiopride.org, with authors, sources, and licenses.',
  alternates: { canonical: '/credits' },
  openGraph: {
    type: 'website',
    title: 'Photo Credits | Ohio Pride',
    description:
      'Attribution for the photography used on ohiopride.org, with authors, sources, and licenses.',
    url: '/credits',
    siteName: 'Ohio Pride',
  },
  twitter: {
    card: 'summary',
    title: 'Photo Credits | Ohio Pride',
    description:
      'Attribution for the photography used on ohiopride.org, with authors, sources, and licenses.',
  },
};

const CREDITS = [
  {
    title: 'Dr. Amy Acton (December 2025)',
    author: 'Myselfsour2724',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Amy_Acton_05.jpg',
    note: 'Used on the Governor Guide. Adapted: background removed and cropped. This adaptation is shared under the same license.',
    license: 'CC BY-SA 4.0',
  },
  {
    title: 'Vivek Ramaswamy (April 2026)',
    author: 'Gage Skidmore',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Vivek_Ramaswamy_(55241367373).jpg',
    note: 'Used on the Governor Guide. Adapted: background removed and cropped. This adaptation is shared under the same license.',
    license: 'CC BY-SA 4.0',
  },
  {
    title: 'Ohio State House, Columbus, OH',
    author: 'Warren LeMay',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Ohio_State_House,_Columbus,_OH_-_48310618761.jpg',
    note: 'Used on the homepage.',
    license: 'CC0',
  },
  {
    title: 'Ohio Statehouse Rotunda',
    author: 'Ibagli',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Ohio_Statehouse_Rotunda.JPG',
    note: 'Used on the scorecard and methodology pages.',
    license: 'CC0',
  },
  {
    title: 'Ohio Statehouse with Flowers',
    author: 'puroticorico',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Ohio_Statehouse_with_Flowers.jpg',
    note: 'Used on the about page. Cropped and toned for display under a navy overlay.',
    license: 'CC BY 2.0',
  },
  {
    title: 'Columbus Ohio Skyline Panorama',
    author: 'Derek Jensen (Tysto)',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Columbus-ohio-skyline-panorama.jpg',
    note: 'Used on the connect and contact pages.',
    license: 'Public Domain',
  },
  {
    title: 'Progress Pride Flag Waving',
    author: 'Ken Whytock',
    source: 'Unsplash',
    href: 'https://unsplash.com/photos/a-progress-pride-flag-is-waving-in-the-breeze-NVI6gFrpG4Q',
    note: 'Used on the issues and volunteer pages.',
    license: 'Unsplash License',
  },
  {
    title: 'Progress Pride Flag',
    author: 'Lisett Kruusimae',
    source: 'Pexels',
    href: 'https://www.pexels.com/photo/progress-pride-flag-12289210/',
    note: 'Used on the pride tour page.',
    license: 'Pexels License',
  },
];

export default function CreditsPage() {
  return (
    <main id="main">
      <section className="legal-hero">
        <h1>Photo Credits</h1>
        <div className="hero-divider" />
        <p>The photography on this site, with thanks to the people who made it.</p>
      </section>

      <div className="legal-body">
        <p>
          Photographs on ohiopride.org come from open license sources. We credit every
          photographer here, including those whose licenses do not require it. Where a license
          requires attribution, this page is that attribution.
        </p>

        <ul className="credit-list">
          {CREDITS.map((c) => (
            <li key={c.title}>
              <span className="credit-title">{c.title}</span>
              By {c.author}, via{' '}
              <a href={c.href} rel="noopener" target="_blank">
                {c.source}
              </a>
              . {c.note} <span className="credit-license">{c.license}</span>
            </li>
          ))}
        </ul>

        <p>
          Candidate photographs on endorsement pages are supplied by the campaigns. Board
          portraits are first party photography provided by the board members themselves.
        </p>
        <p>
          Questions about image use or attribution? Contact us at{' '}
          <a href="mailto:info@ohiopride.org">info@ohiopride.org</a>.
        </p>
      </div>

      <a href="/donate" className="mobile-donate-fab">
        Donate
      </a>
    </main>
  );
}
