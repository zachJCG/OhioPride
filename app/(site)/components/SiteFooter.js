/* Site footer.
 *
 * Ported from the FOOTER_HTML block in public/js/site-template.js, with one
 * upgrade: the Leadership block and the disclaimer are resolved on the server
 * instead of being patched into the DOM after load by
 * public/js/ohiopride-data.js. The legally required disclaimer is now in the
 * first byte of HTML rather than arriving a moment later.
 *
 * The hardcoded values below are the fallback, exactly as before: if the query
 * fails or credentials are missing, visitors see a complete, correct
 * disclaimer rather than an empty element. Keep them in sync with the
 * site_leadership seed in 20260422020014_configuration_tables.sql.
 */

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const FALLBACK_OFFICERS = [
  { title: 'Director', full_name: 'Zachary R. Joseph' },
  { title: 'Treasurer', full_name: 'David Donofrio' },
];

const FALLBACK_DISCLAIMER =
  "Paid for by Ohio Pride PAC. Not authorized by any candidate or candidate's committee.";

async function loadLeadership() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase
      .from('site_leadership')
      .select('title, full_name, is_required_on_disclaimer, display_order')
      .eq('entity', 'pac')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error || !data?.length) return null;
    return data;
  } catch {
    // A footer must never be the reason a page fails to render.
    return null;
  }
}

const FOOTER_COLUMNS = [
  {
    heading: 'Organization',
    links: [
      ['/issues', 'Issues'],
      ['/scorecard', 'Scorecard'],
      ['/about', 'About'],
      ['/board', 'Board'],
      ['/elected-resources', 'Officials Toolkit'],
      ['/founding-members', 'Founding Members'],
      ['/contact', 'Contact'],
    ],
  },
  {
    heading: 'Get Involved',
    links: [
      ['/donate', 'Donate'],
      ['/donate/founding-member', 'Founding Membership'],
      ['/events', 'Events'],
      ['/volunteer', 'Volunteer'],
      ['/endorsements', 'Endorsed Candidates'],
      ['/endorsement/screening', 'Candidate Endorsement'],
    ],
  },
  {
    heading: 'Connect with Us',
    links: [
      ['/connect#schedule', 'Schedule a Call'],
      ['/connect#message', 'Send a Message'],
      ['mailto:press@ohiopride.org', 'Press Inquiries'],
    ],
  },
  {
    heading: 'Legal',
    links: [
      ['/privacy', 'Privacy Policy'],
      ['/terms', 'Terms of Use'],
      ['/credits', 'Photo Credits'],
      ['/brand', 'Brand Guide'],
      ['/admin/login', 'Admin Sign In', { rel: 'nofollow' }],
    ],
  },
];

export default async function SiteFooter() {
  const officers = (await loadLeadership()) || FALLBACK_OFFICERS;

  const required = officers.filter((o) => o.is_required_on_disclaimer);
  const disclaimer = required.length
    ? `Paid for by Ohio Pride PAC, ${required
        .map((o) => `${o.full_name}, ${o.title}`)
        .join(', ')}. Not authorized by any candidate or candidate's committee.`
    : FALLBACK_DISCLAIMER;

  return (
    <footer className="ohp-footer">
      <div className="ohp-footer-inner">
        {FOOTER_COLUMNS.map((col) => (
          <div className="ohp-footer-col" key={col.heading}>
            <h4>{col.heading}</h4>
            <ul>
              {col.links.map(([href, label, extra]) => (
                <li key={href}>
                  {href.startsWith('mailto:') ? (
                    <a href={href}>{label}</a>
                  ) : (
                    <Link href={href} {...(extra || {})}>
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="ohp-footer-col">
          <h4>Leadership</h4>
          <div className="ohp-directors" data-ohp-entity="pac">
            {officers.map((o, i) => (
              <span key={`${o.title}-${o.full_name}`}>
                <strong>{o.title}:</strong> {o.full_name}
                {i < officers.length - 1 ? <br /> : null}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="ohp-footer-bottom">
        <div>&copy; 2026 Ohio Pride PAC. All rights reserved.</div>
        <div className="ohp-disclaimer" data-ohp-entity="pac">
          {disclaimer}
        </div>
      </div>
    </footer>
  );
}
