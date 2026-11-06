/* /archive: the hub for everything archived in place after the 2026 cycle.
 *
 * Archived pages keep their URLs and their copy; this page is the one place
 * that still links to them, since they are out of the nav and the sitemap.
 * The list of archived paths lives in lib/archived-paths.mjs (the banner, the
 * robots header and the sitemap read the same list); the entries here add the
 * one-line description each link needs.
 *
 * Three groups, in the order the work order sets them. The 2026 endorsements
 * group stays hidden until phase 3 ships /endorsements/2026, which is what
 * SHOW_ENDORSEMENTS_2026 gates.
 */

import Link from 'next/link';
import { DEFAULT_OG_IMAGE, DEFAULT_OG_IMAGE_ALT } from '../../../lib/seo.mjs';
import './archive.css';

const SHOW_ENDORSEMENTS_2026 = true;

export const metadata = {
  title: 'Archive',
  description: 'Past Ohio Pride PAC campaigns, guides, and events, kept for the record.',
  alternates: { canonical: '/archive' },
  // A page-level openGraph block replaces the layout's rather than merging
  // with it, so the share card is restated here.
  openGraph: {
    type: 'website',
    title: 'Archive | Ohio Pride',
    description: 'Past Ohio Pride PAC campaigns, guides, and events, kept for the record.',
    url: '/archive',
    siteName: 'Ohio Pride PAC',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: DEFAULT_OG_IMAGE_ALT }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Archive | Ohio Pride',
    description: 'Past Ohio Pride PAC campaigns, guides, and events, kept for the record.',
    images: [{ url: DEFAULT_OG_IMAGE, alt: DEFAULT_OG_IMAGE_ALT }],
  },
};

const GROUPS = [
  {
    heading: '2026 endorsements',
    show: SHOW_ENDORSEMENTS_2026,
    items: [
      {
        href: '/endorsements/2026',
        title: '2026 endorsements and results',
        note: 'Every candidate we endorsed in 2026, and how their race ended.',
      },
    ],
  },
  {
    heading: '2026 election',
    show: true,
    items: [
      {
        href: '/governor-guide',
        title: 'The 2026 Governor Guide',
        note: 'Amy Acton and Vivek Ramaswamy, side by side. Every claim dated, sourced, and linked.',
      },
      {
        href: '/vote',
        title: 'Drag Out The Vote Ohio: voter resource',
        note: 'Dates, deadlines, and county links for voting in the November 3, 2026 election.',
      },
      {
        href: '/dragoutthevote',
        title: 'Drag Out The Vote Ohio: performer guide',
        note: 'The guide for performers and venues who got Ohio to the polls in 2026.',
      },
    ],
  },
  {
    heading: '2026 Pride and events',
    show: true,
    items: [
      {
        href: '/pride',
        title: 'Ohio Pride Road Tour 2026',
        note: 'Every Pride festival we showed up to in the summer of 2026.',
      },
      {
        href: '/volunteer/events',
        title: 'Volunteer events 2026',
        note: 'Run of show for the Pride festivals our volunteers marched and tabled.',
      },
    ],
  },
];

/* The Pride Hours that ran in 2026. Their own pages are gone (both paths
 * now land on /events), so the flyers live on here. */
const PAST_EVENTS = [
  {
    city: 'Cincinnati',
    title: "Cincinnati's Pride Hour",
    when: 'Wednesday, August 26, 2026, 6:30 to 8:00 PM',
    where: ['Cobblestone OTR', 'Over-the-Rhine, Cincinnati'],
    flyer: '/assets/img/events/cincinnati-pride-hour.jpg',
    alt: "Cincinnati's Pride Hour, a happy hour in support of Ohio Pride PAC. Wednesday, August 26, 2026, 6:30 to 8:00 PM at Cobblestone OTR in Over-the-Rhine, Cincinnati.",
  },
  {
    city: 'Cleveland',
    title: "Cleveland's Pride Hour",
    when: 'Sunday, September 20, 2026, 4:00 to 6:00 PM',
    where: ['Leather Stallion Saloon', '2205 St. Clair Ave NE, Cleveland'],
    note: 'Part of Sunday Funday, in partnership with CLEather and Kink.',
    flyer: '/assets/img/events/cleveland-pride-hour.jpg',
    alt: "Cleveland's Pride Hour, a happy hour in support of Ohio Pride PAC. Sunday, September 20, 2026, 4:00 to 6:00 PM at the Leather Stallion Saloon, 2205 St. Clair Ave NE, Cleveland, during Sunday Funday.",
  },
];

export default function ArchivePage() {
  return (
    <main id="main" className="archive-page">
      <section className="legal-hero">
        <h1>Archive.</h1>
        <div className="hero-divider" />
        <p>Past campaigns, guides, and events, kept for the record.</p>
      </section>

      <div className="archive-body">
        {GROUPS.filter((g) => g.show).map((group) => (
          <section className="archive-group" key={group.heading} aria-labelledby={`archive-${group.heading.replace(/\W+/g, '-')}`}>
            <h2 id={`archive-${group.heading.replace(/\W+/g, '-')}`}>{group.heading}</h2>
            <ul className="archive-list">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="archive-item">
                    <span className="archive-item-title">{item.title}</span>
                    <span className="archive-item-note">{item.note}</span>
                  </Link>
                </li>
              ))}
            </ul>

            {group.heading === '2026 Pride and events' && (
              <>
                <h3>Past events</h3>
                <ul className="archive-events">
                  {PAST_EVENTS.map((ev) => (
                    <li className="archive-event" key={ev.title}>
                      <div className="archive-event-media">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ev.flyer} alt={ev.alt} width="1080" height="1350" loading="lazy" />
                      </div>
                      <div className="archive-event-body">
                        <span className="archive-event-city">{ev.city}</span>
                        <h4>{ev.title}</h4>
                        <p className="archive-event-when">{ev.when}</p>
                        <p className="archive-event-where">
                          {ev.where.map((line, i) => (
                            <span key={line}>
                              {line}
                              {i < ev.where.length - 1 ? <br /> : null}
                            </span>
                          ))}
                        </p>
                        {ev.note ? <p className="archive-event-note">{ev.note}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ))}

        <p className="archive-foot">
          Looking for what is live? The <Link href="/endorsements">endorsements</Link> page,
          the <Link href="/scorecard">scorecard</Link>, and the{' '}
          <Link href="/apply">endorsement application</Link> are all current.
        </p>
      </div>
    </main>
  );
}
