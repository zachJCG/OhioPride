/* /2027/races: the Race to 100 target list.
 *
 * Every race Ohio Pride is recruiting or defending in 2027, read from
 * public_target_races (the view that only shows public, vetted rows) and
 * rendered on the server so the hundred cards are in the HTML on first paint.
 * The filter bar is a client component that keeps its state in the query
 * string, so a link to "Northeast school boards filing in August" is a link.
 *
 * Copy rules: "out" (never the o-word the style guide bans); "only statewide LGBTQ+ PAC", never
 * "first"; no em or en dashes; the site footer carries the only disclaimer.
 */

import Link from 'next/link';
import { APPLY_PATH, ENDORSEMENT_PATH, getTargetRaces } from '../../../../lib/candidates.mjs';
import { getElectionCycles } from '../../../../lib/election-cycles.mjs';
import { absolute, breadcrumbJsonLd } from '../../../../lib/seo.mjs';
import KeyDates from '../../components/KeyDates';
import RacesClient from './races-client';
import './races.css';

const TITLE = '2027 Target Races';
const DESCRIPTION =
  'Ohio Pride is recruiting and endorsing 100 pro-equality candidates for local office in 2027. These are the seats.';

/* A filing deadline passing or a race being vetted has to show up without a
 * deploy. Five minutes matches the election cycle cards. */
export const revalidate = 300;

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/2027/races' },
  openGraph: {
    type: 'website',
    title: '2027 Target Races | Ohio Pride',
    description: DESCRIPTION,
    url: '/2027/races',
  },
  twitter: {
    card: 'summary_large_image',
    title: '2027 Target Races | Ohio Pride',
    description: DESCRIPTION,
  },
};

export default async function RacesPage() {
  const [{ ok, races }, { cycles }] = await Promise.all([
    getTargetRaces({ revalidate: 300 }),
    getElectionCycles({ revalidate: 300 }),
  ]);

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Ohio Pride 2027 target races',
      numberOfItems: races.length,
      itemListElement: races.map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${r.jurisdiction}: ${r.office}`,
        url: absolute(`/candidate-apply?race=${encodeURIComponent(r.slug)}`),
      })),
    },
    breadcrumbJsonLd({ url: '/2027/races', crumb: TITLE }),
  ];

  return (
    <main id="main" className="r100-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="r100-hero" aria-labelledby="page-title">
        <p className="r100-kicker">Race to 100</p>
        <h1 id="page-title">The 2027 Races We Are Targeting</h1>
        <p className="r100-lede">{DESCRIPTION}</p>
        <div className="r100-hero-actions">
          <Link href={APPLY_PATH} className="r100-btn primary">Apply to Run</Link>
          <Link href={ENDORSEMENT_PATH} className="r100-btn">Seek an Endorsement</Link>
        </div>
        <p className="r100-identity">Ohio Pride is Ohio&apos;s only statewide LGBTQ+ PAC.</p>
      </section>
      <div className="r100-divider" aria-hidden="true" />

      <KeyDates cycles={cycles} />

      <RacesClient races={races} loadFailed={!ok} applyPath={APPLY_PATH} />

      <section className="r100-foot" aria-labelledby="foot-title">
        <h2 id="foot-title">Don&apos;t see your race? Apply anyway.</h2>
        <p>
          The list is a starting point, not a fence. If you are thinking about running anywhere in
          Ohio in 2027, tell us about the seat and we will help you plan it.
        </p>
        <Link href={APPLY_PATH} className="r100-btn primary">Apply to Run</Link>
      </section>
    </main>
  );
}
