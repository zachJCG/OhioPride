/* /endorsements — the endorsed candidate list.
 *
 * Ported off public/endorsements/index.html. What changed and why:
 *
 *   - The list is fetched on the server, so the page ships with its content
 *     instead of a skeleton plus a browser round trip to Supabase. No anon key
 *     and no supabase-js CDN bundle reach the browser from this page.
 *   - Each candidate has a real URL (/endorsements/<slug>) rather than a hash
 *     the router swapped views on, so profiles can carry their own title, meta
 *     description, and OG card when they are shared.
 *   - "How endorsements work" is on the page. The old copy asserted candidates
 *     were "vetted by our Screening Committee and approved by our Board" and
 *     left it there.
 */

import Link from 'next/link';
import { ENDORSEMENT_PROCESS, getEndorsements } from '../../../lib/endorsements.mjs';
import { absolute, breadcrumbJsonLd } from '../../../lib/seo.mjs';
import EndorsementGrid from './grid';
import './endorsements.css';

const SCREENING_PATH = '/endorsement/screening';

const DESCRIPTION =
  'Candidates endorsed by Ohio Pride PAC for federal, state, and local office in Ohio, and how our endorsement process works.';

export const revalidate = 600;

export const metadata = {
  title: 'Endorsed Candidates',
  description: DESCRIPTION,
  alternates: { canonical: '/endorsements' },
  openGraph: {
    type: 'website',
    title: 'Endorsed Candidates | Ohio Pride PAC',
    description: DESCRIPTION,
    url: '/endorsements',
    siteName: 'Ohio Pride PAC',
    images: ['/assets/social/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Endorsed Candidates | Ohio Pride PAC',
    description: DESCRIPTION,
    images: ['/assets/social/og-image.png'],
  },
};

export default async function EndorsementsPage() {
  const { ok, candidates } = await getEndorsements();

  /* An ItemList of the profiles, so the slate can surface as a list in search
   * results rather than four unrelated pages that happen to link to each
   * other. Order matches the rendered grid. */
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Candidates endorsed by Ohio Pride PAC',
      numberOfItems: candidates.length,
      itemListElement: candidates.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        url: absolute(`/endorsements/${c.slug}`),
      })),
    },
    breadcrumbJsonLd({ url: '/endorsements', crumb: 'Endorsed Candidates' }),
  ];

  return (
    <main id="main" className="endorse-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="endorse-hero" aria-labelledby="page-title">
        <p className="eyebrow">Endorsed Candidates</p>
        <h1 id="page-title">Pro-equality leadership for Ohio.</h1>
        <p>
          Ohio Pride PAC endorses candidates who demonstrate strong, consistent support for LGBTQ+
          equality. Every candidate below applied, was reviewed against their public record by our
          Screening Committee, and was approved by a vote of our Board.
        </p>
        <p className="hero-kicker">Endorse. Mobilize. Fight for Ohio.</p>
      </section>

      <EndorsementGrid candidates={candidates} loadFailed={!ok} screeningPath={SCREENING_PATH} />

      <section className="endorse-process" aria-labelledby="process-title">
        <div className="endorse-process-head">
          <p className="eyebrow">How endorsements work</p>
          <h2 id="process-title">Four steps, no interview.</h2>
          <p className="lede">
            An Ohio Pride endorsement is a judgment about a record, not a performance in a room. We
            read what candidates tell us against what they have actually done, and the Board votes.
          </p>
        </div>
        <ol className="endorse-steps">
          {ENDORSEMENT_PROCESS.map((step) => (
            <li key={step.n} className="endorse-step">
              <span className="endorse-step-num" aria-hidden="true">
                {step.n}
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="endorse-cta" aria-labelledby="cta-title">
        <div className="endorse-cta-card">
          <div className="endorse-cta-text">
            <p className="endorse-cta-eyebrow">Are you a candidate?</p>
            <h2 id="cta-title">Apply for an Ohio Pride PAC endorsement.</h2>
            <p>
              If you&apos;re running for federal, state, or local office in Ohio and want to make a
              real commitment to LGBTQ+ equality, we want to hear from you. The application takes
              about fifteen minutes and saves as you go.
            </p>
          </div>
          <div className="endorse-cta-actions">
            <Link href={SCREENING_PATH} className="endorse-btn primary">
              Apply for Endorsement
            </Link>
          </div>
        </div>
      </section>

      <a href="/donate" className="mobile-donate-fab">
        Donate
      </a>
    </main>
  );
}
