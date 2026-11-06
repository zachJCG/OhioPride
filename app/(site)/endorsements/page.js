/* /endorsements - the endorsed candidate list.
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
 *
 * After the 2026 general election (phase 3):
 *
 *   - "Elected with Ohio Pride." sits under the hero: the 2026 winners as a
 *     wall of faces, linking to /endorsements/2026. It renders only when the
 *     database holds at least one 2026 win; results are data, never typed.
 *   - The card grid shows the current and future cycles only. The 2026 slate
 *     lives on /endorsements/2026 now. The grid renders only when it has
 *     something to show or the read failed, so its "first round coming soon"
 *     empty state never appears on a page that has just listed winners.
 *   - Old /endorsements#<slug> links still reach every profile: HashRedirect
 *     gets every published slug, whatever the grid shows.
 */

import Link from 'next/link';
import {
  ENDORSEMENT_PROCESS,
  getEndorsementResults,
  getEndorsements,
} from '../../../lib/endorsements.mjs';
import { getElectionCycles } from '../../../lib/election-cycles.mjs';
import { currentCycleYear } from '../../../lib/endorsement-race.mjs';
import { absolute, breadcrumbJsonLd } from '../../../lib/seo.mjs';
import EndorsementGrid from './grid';
import CycleList from './cycles';
import HashRedirect from './hash-redirect';
import { RESULTS_CYCLE, RESULTS_PATH, WinnersSection } from './results';
import './endorsements.css';

const SCREENING_PATH = '/endorsement/screening';

const DESCRIPTION =
  'Candidates endorsed by Ohio Pride PAC for federal, state, and local office in Ohio, and how our endorsement process works.';

/* The endorsement list changes a few times a cycle, but an application window
 * closes on a clock. Five minutes keeps a deadline that has just passed from
 * sitting on the page as an invitation to apply. */
export const revalidate = 300;

/* Both endorsement reads take the same options, so they are one request: the
 * winners and the grid can never come from two different moments. */
const DATA = { revalidate: 300 };

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
  const [{ ok, candidates }, results, { ok: cyclesOk, cycles }] = await Promise.all([
    getEndorsements(DATA),
    getEndorsementResults(RESULTS_CYCLE, DATA),
    getElectionCycles({ revalidate: 300 }),
  ]);

  /* Winners in ballot order, then last name (the helper sorts). Empty when the
   * read failed, so a blip renders the grid's error state, never "0 won". */
  const winners = results.ok ? results.won : [];
  /* Endorsed for 2026, no race won yet (results pending, or none won): no
   * wall, but the results page is still one tap away. */
  const resultsLinkOnly = results.ok && winners.length === 0 && results.counts.total > 0;

  /* The card grid: this cycle and later. A row with no cycle is kept rather
   * than hidden; it is happening now or staff need to fix it. */
  const thisCycle = currentCycleYear();
  const current = candidates.filter((c) => c.cycle == null || Number(c.cycle) >= thisCycle);
  const showGrid = !ok || current.length > 0;

  /* An ItemList of the profiles on the page, in the order they render: the
   * winners wall, then the grid. Left out when the page lists nobody. */
  const listed = [...winners, ...(showGrid ? current : [])];
  const jsonLd = [
    listed.length > 0 && {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Candidates endorsed by Ohio Pride PAC',
      numberOfItems: listed.length,
      itemListElement: listed.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        url: absolute(`/endorsements/${c.slug}`),
      })),
    },
    breadcrumbJsonLd({ url: '/endorsements', crumb: 'Endorsed Candidates' }),
  ].filter(Boolean);

  return (
    <main id="main" className="endorse-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
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

      <HashRedirect slugs={candidates.map((c) => c.slug)} />

      {winners.length > 0 && <WinnersSection winners={winners} />}

      {resultsLinkOnly && (
        <p className="endorse-results-more is-solo">
          <Link href={RESULTS_PATH} className="endorse-btn secondary">
            See 2026 results
          </Link>
        </p>
      )}

      {showGrid && (
        <EndorsementGrid candidates={current} loadFailed={!ok} screeningPath={SCREENING_PATH} />
      )}

      <CycleList cycles={cycles} loadFailed={!cyclesOk} screeningPath={SCREENING_PATH} />

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
