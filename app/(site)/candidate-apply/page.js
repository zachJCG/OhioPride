/* /candidate-apply: the 2027 recruitment form.
 *
 * Five short steps on a phone, one screen each, saved to sessionStorage as
 * the candidate goes. The race list and the key dates are fetched here on the
 * server and handed to the form, so the page never makes the browser talk to
 * Supabase and the select is populated on first paint.
 *
 * This is the recruitment pathway. Endorsement is a separate process with its
 * own form at /endorsement/screening, and the copy says so twice.
 */

import { ENDORSEMENT_PATH, RACES_PATH, getTargetRaces } from '../../../lib/candidates.mjs';
import { getElectionCycles } from '../../../lib/election-cycles.mjs';
import { breadcrumbJsonLd } from '../../../lib/seo.mjs';
import CandidateApplyForm from './form';
import './candidate-apply.css';

const TITLE = 'Apply to Run in 2027';
const DESCRIPTION =
  'Thinking about running for local office in Ohio in 2027? Tell Ohio Pride about yourself and the seat, and our board and network of serving elected officials will help you plan, petition, and win.';

export const revalidate = 300;

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/candidate-apply' },
  openGraph: {
    type: 'website',
    title: 'Apply to Run in 2027 | Ohio Pride',
    description: DESCRIPTION,
    url: '/candidate-apply',
  },
  twitter: { card: 'summary_large_image', title: 'Apply to Run in 2027 | Ohio Pride', description: DESCRIPTION },
};

export default async function CandidateApplyPage() {
  const [{ races }, { cycles }] = await Promise.all([
    getTargetRaces({ revalidate: 300 }),
    getElectionCycles({ revalidate: 300 }),
  ]);

  const jsonLd = breadcrumbJsonLd({
    url: '/candidate-apply',
    crumb: TITLE,
    breadcrumb: [{ name: '2027 Target Races', url: RACES_PATH }],
  });

  return (
    <main id="main" className="capply-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <CandidateApplyForm
        races={races}
        cycles={cycles}
        endorsementPath={ENDORSEMENT_PATH}
        racesPath={RACES_PATH}
      />
    </main>
  );
}
