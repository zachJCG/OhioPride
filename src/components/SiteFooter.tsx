import Link from 'next/link';
import { loadLeadership } from '@/lib/site-leadership';

/**
 * Server-rendered footer. The original site injected the footer via JS and
 * then hit /.netlify/functions/site-leadership on the client to refresh it.
 * Now we render the same disclaimer server-side so visitors with JS disabled
 * (and crawlers) see the legally complete "Paid for by" line on first paint.
 */
export async function SiteFooter() {
  const leadership = await loadLeadership('pac');

  return (
    <footer className="ohp-footer">
      <div className="ohp-footer-inner">
        <div className="ohp-footer-col">
          <h4>Organization</h4>
          <ul>
            <li><Link href="/issues">Issues</Link></li>
            <li><Link href="/scorecard">Scorecard</Link></li>
            <li><Link href="/about">About</Link></li>
            <li><Link href="/board">Board</Link></li>
            <li><Link href="/founding-members">Founding Members</Link></li>
            <li><Link href="/contact">Contact</Link></li>
          </ul>
        </div>
        <div className="ohp-footer-col">
          <h4>Get Involved</h4>
          <ul>
            <li><Link href="/donate">Donate</Link></li>
            <li><Link href="/donate/founding-member">Founding Membership</Link></li>
            <li><Link href="/launch-day">Launch Day RSVP</Link></li>
            <li><Link href="/connect">Volunteer</Link></li>
          </ul>
        </div>
        <div className="ohp-footer-col">
          <h4>Connect with Us</h4>
          <ul>
            <li><Link href="/connect#schedule">Schedule a Call</Link></li>
            <li><Link href="/connect#message">Send a Message</Link></li>
            <li><a href="mailto:press@ohiopride.org">Press Inquiries</a></li>
          </ul>
        </div>
        <div className="ohp-footer-col">
          <h4>Legal</h4>
          <ul>
            <li><Link href="/privacy">Privacy Policy</Link></li>
            <li><Link href="/terms">Terms of Use</Link></li>
          </ul>
        </div>
        <div className="ohp-footer-col">
          <h4>Leadership</h4>
          <div className="ohp-directors" data-ohp-directors data-ohp-entity="pac">
            {leadership.officers
              .filter(o => o.required_on_disclaimer)
              .map((o, i, arr) => (
                <span key={`${o.title}-${o.full_name}`}>
                  <strong>{o.title}:</strong> {o.full_name}
                  {i < arr.length - 1 ? <br /> : null}
                </span>
              ))}
          </div>
        </div>
      </div>
      <div className="ohp-footer-bottom">
        <div>© 2026 Ohio Pride PAC. All rights reserved.</div>
        <div className="ohp-disclaimer" data-ohp-disclaimer data-ohp-entity="pac">
          {leadership.disclaimer}
        </div>
      </div>
    </footer>
  );
}
