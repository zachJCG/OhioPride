/* /endorsement/screening/thank-you — the page a candidate lands on after they
 * submit an application.
 *
 * Ported off public/endorsement/screening/thank-you/index.html for one reason:
 * the confirmation copy told every applicant we would invite them to "a
 * virtual interview of one hour or less before any board vote", which is not
 * something Ohio Pride does. It now shows the same four steps as
 * /endorsements, with step one marked complete, so an applicant knows exactly
 * where their file is and what is left.
 *
 * The steps come from lib/endorsements.mjs, the one definition of the process,
 * so this page cannot drift from the public one again.
 */

import Link from 'next/link';
import { ENDORSEMENT_PROCESS } from '../../../../../lib/endorsements.mjs';
import './thank-you.css';

export const metadata = {
  title: 'Application Received',
  description: 'Your Ohio Pride PAC endorsement application has been received.',
  robots: { index: false, follow: true },
};

export default function EndorsementThankYou() {
  return (
    <main id="main" className="ty-page">
      <div className="ty-card">
        <div className="ty-card-banner" aria-hidden="true" />
        <div className="ty-card-body">
          <div className="ty-check" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <polyline points="4 12 10 18 20 6" />
            </svg>
          </div>

          <p className="ty-eyebrow">Application Received</p>
          <h1>Thank you.</h1>
          <p className="ty-lead">
            Your application is in front of our Screening Committee. There is nothing else you need
            to send us and no interview to schedule — watch your campaign email for the decision.
          </p>

          <div className="ty-next">
            <h2>Where your application goes next</h2>
            <ol className="ty-steps">
              {ENDORSEMENT_PROCESS.map((step) => (
                <li key={step.n} className={`ty-step${step.n === 1 ? ' done' : ''}`}>
                  <span className="ty-step-num" aria-hidden="true">
                    {step.n === 1 ? '✓' : step.n}
                  </span>
                  <span className="ty-step-text">
                    <span className="ty-step-title">{step.title}</span>
                    <p className="ty-step-body">{step.body}</p>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="ty-actions">
            <Link href="/endorsements" className="ty-btn ty-btn-primary">
              See our endorsed candidates &rarr;
            </Link>
            <Link href="/" className="ty-btn ty-btn-secondary">
              Return Home
            </Link>
          </div>

          <p className="ty-contact">
            Need to correct something you submitted, or have a question? Email{' '}
            <a href="mailto:info@ohiopride.org">info@ohiopride.org</a> and we will attach it to your
            file.
          </p>
        </div>
      </div>

      <a href="/donate" className="mobile-donate-fab">
        Donate
      </a>
    </main>
  );
}
