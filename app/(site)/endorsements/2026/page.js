/* /endorsements/2026: every 2026 endorsee and how their race ended.
 *
 * Results are data. The intro's two numbers, the groups, the badges and the
 * order all come from getEndorsementResults(), which /endorsements and
 * /api/endorsement-results (the home page) read too, so the three can never
 * count differently. Nothing here names a winner.
 *
 * A static folder beats the [slug] route beside it, so this never collides
 * with a profile: '2026' is not a slug.
 *
 * Failure: when the read fails, or succeeds with no 2026 rows at all, the page
 * shows the same "could not load" state as /endorsements. It never prints
 * "We endorsed 0 candidates" or "0 won".
 */

import Link from 'next/link';
import { getEndorsementResults } from '../../../../lib/endorsements.mjs';
import { absolute, appRouteMetadata, breadcrumbJsonLd } from '../../../../lib/seo.mjs';
import { APPLY_PATH } from '../cycles';
import { RESULTS_CRUMB, RESULTS_CYCLE, RESULTS_PATH, ResultGrid } from '../results';
import { LoadFailed } from '../shared';
import '../endorsements.css';

/* A recount or a certification change is an admin edit, and the page should
 * follow it within five minutes. The data read takes the same window, so the
 * page does not regenerate onto a cached list. */
export const revalidate = 300;

export const metadata = appRouteMetadata('/endorsements/2026');

/* The copy deck's intro, built as ONE string so React does not split it into
 * text nodes. Until at least one race is won the "and {won} won" clause would
 * read as a loss for races that are still being counted, so it is left out
 * and the rest of the sentence stands on its own. */
function introLine({ total, won }) {
  return won > 0
    ? `We endorsed ${total} candidates in 2026, and ${won} won their races. Every one of them earned our endorsement, and we are proud of all of them.`
    : `We endorsed ${total} candidates in 2026. Every one of them earned our endorsement, and we are proud of all of them.`;
}

export default async function Results2026Page() {
  const { ok, groups, counts } = await getEndorsementResults(RESULTS_CYCLE, { revalidate: 300 });
  const loaded = ok && counts.total > 0;

  /* The ItemList follows the page: groups in reading order, each in ballot
   * order then last name. */
  const listed = loaded ? groups.flatMap((g) => g.candidates) : [];
  const jsonLd = [
    listed.length > 0 && {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: RESULTS_CRUMB,
      numberOfItems: listed.length,
      itemListElement: listed.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        url: absolute(`/endorsements/${c.slug}`),
      })),
    },
    breadcrumbJsonLd({
      url: RESULTS_PATH,
      crumb: RESULTS_CRUMB,
      breadcrumb: [{ name: 'Endorsed Candidates', url: '/endorsements' }],
    }),
  ].filter(Boolean);

  return (
    <main id="main" className="endorse-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <section className="endorse-hero" aria-labelledby="page-title">
        <h1 id="page-title">2026 endorsements and results.</h1>
        {loaded && <p>{introLine(counts)}</p>}
      </section>

      <div className="endorse-results">
        {loaded ? (
          groups.map((g) => (
            <section
              key={g.key}
              className="endorse-results-group"
              aria-labelledby={`results-${g.key}`}
            >
              <h2 id={`results-${g.key}`}>{g.heading}</h2>
              <ResultGrid candidates={g.candidates} variant="cards" />
            </section>
          ))
        ) : (
          <LoadFailed retryHref={RESULTS_PATH} />
        )}
      </div>

      <section className="endorse-cta" aria-labelledby="cta-title">
        <div className="endorse-cta-card">
          <div className="endorse-cta-text">
            <h2 id="cta-title">Running in 2027? Apply for endorsement.</h2>
          </div>
          <div className="endorse-cta-actions">
            <Link href={APPLY_PATH} className="endorse-btn primary">
              Apply for endorsement
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
