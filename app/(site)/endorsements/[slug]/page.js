/* /endorsements/<slug> — one candidate's endorsement.
 *
 * This used to be a hidden <div> the old page swapped in on hashchange, which
 * meant every candidate shared one URL, one <title>, and one OG card: sharing
 * a profile in a group chat previewed the whole list. It is a real route now,
 * with its own metadata, and it is still statically rendered.
 *
 * dynamicParams stays on (the default) so an endorsement recorded in the admin
 * appears here on the next revalidation without waiting for a deploy.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatDate,
  getEndorsement,
  getEndorsements,
  initial,
} from '../../../../lib/endorsements.mjs';
import { SITE_NAME, SITE_URL, absolute, breadcrumbJsonLd } from '../../../../lib/seo.mjs';
import { EndorsedPill } from '../shared';
import '../endorsements.css';

export const revalidate = 600;

export async function generateStaticParams() {
  const { candidates } = await getEndorsements();
  return candidates.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const c = await getEndorsement(slug);
  if (!c) return { title: 'Endorsement not found' };

  const office = [c.office, c.district].filter(Boolean).join(', ');
  const description =
    c.content?.meta || `Ohio Pride PAC endorses ${c.name} for ${office}.`;
  const title = `${c.name} | Endorsed Candidates`;
  /* A portrait photo is the wrong aspect ratio for a 1.91:1 social card and
   * gets cropped to a sliver, so a profile may supply a built `ogImage`. */
  const image = c.content?.ogImage || c.content?.photo || '/assets/social/og-image.png';

  return {
    title,
    description,
    alternates: { canonical: `/endorsements/${c.slug}` },
    openGraph: {
      type: 'profile',
      title: `${c.name} | Endorsed by Ohio Pride PAC`,
      description,
      url: `/endorsements/${c.slug}`,
      siteName: 'Ohio Pride PAC',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${c.name} | Endorsed by Ohio Pride PAC`,
      description,
      images: [image],
    },
  };
}

export default async function EndorsementProfile({ params }) {
  const { slug } = await params;
  const c = await getEndorsement(slug);
  if (!c) notFound();

  const content = c.content || {};
  const endorsedOn = formatDate(c.endorsedAt);
  const officeLine = [c.office, c.district].filter(Boolean).join(', ');

  /* Facts the header does not already state. "District covers" rather than
   * "District": the office line right above it already reads "District 28",
   * and two rows both labelled District said different things. */
  const facts = [
    content.region && { label: 'District covers', value: content.region },
    content.opponent && { label: 'Running against', value: content.opponent },
    c.electionYear && { label: 'Election', value: String(c.electionYear) },
    endorsedOn && { label: 'Endorsed', value: endorsedOn },
  ].filter(Boolean);

  const sections = Array.isArray(content.profile) ? content.profile : [];
  const ctaLinks = Array.isArray(content.cta) ? content.cta : [];

  /* Structured data for the profile. The candidate is a Person, and the
   * endorsement itself is an EndorseAction by the PAC, which is the vocabulary
   * that actually says "Ohio Pride PAC endorsed this person" rather than
   * leaving a crawler to infer it from the page copy. Only fields the page
   * itself states are included. */
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: c.name,
      url: absolute(`/endorsements/${c.slug}`),
      image: content.photo ? absolute(content.photo) : undefined,
      description: content.meta || c.bio || undefined,
      jobTitle: officeLine || undefined,
      sameAs: c.website ? [c.website] : undefined,
      subjectOf: {
        '@type': 'EndorseAction',
        agent: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_URL}/` },
        startTime: c.endorsedAt || undefined,
      },
    },
    breadcrumbJsonLd({
      url: `/endorsements/${c.slug}`,
      crumb: c.name,
      breadcrumb: [{ name: 'Endorsed Candidates', url: '/endorsements' }],
    }),
  ];

  return (
    <main id="main" className="endorse-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="endorse-profile">
        <div className="endorse-profile-inner">
          <Link className="endorse-back" href="/endorsements">
            All Endorsed Candidates
          </Link>

          <header className="endorse-profile-head">
            {content.photo ? (
              <div className="endorse-profile-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={content.photo} alt={content.photoAlt || c.name} />
              </div>
            ) : (
              <div className="endorse-profile-photo placeholder" aria-hidden="true">
                {initial(c.name)}
              </div>
            )}

            <div className="endorse-profile-idcard">
              <EndorsedPill />
              <h1>{c.name}</h1>
              {c.pronouns && <p className="endorse-profile-pronouns">{c.pronouns}</p>}
              <p className="endorse-profile-office">{officeLine}</p>
              {content.tagline && <p className="endorse-profile-tagline">{content.tagline}</p>}

              {facts.length > 0 && (
                <ul className="endorse-facts">
                  {facts.map((f) => (
                    <li key={f.label}>
                      <span className="fact-label">{f.label}</span>
                      {f.value}
                    </li>
                  ))}
                </ul>
              )}

              {(c.website || content.donate) && (
                <div className="endorse-profile-actions">
                  {c.website && (
                    <a
                      className="endorse-btn primary"
                      href={c.website}
                      target="_blank"
                      rel="noopener"
                    >
                      Campaign Site
                    </a>
                  )}
                  {content.donate && (
                    <a
                      className="endorse-btn secondary"
                      href={content.donate}
                      target="_blank"
                      rel="noopener"
                    >
                      Donate to the Campaign
                    </a>
                  )}
                </div>
              )}
            </div>
          </header>

          <div className="endorse-profile-body">
            {sections.length > 0 ? (
              sections.map((sec, i) => (
                <section key={sec.heading || i}>
                  {sec.heading && <h2>{sec.heading}</h2>}
                  {(sec.paragraphs || []).map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
                  {(sec.bullets || []).length > 0 && (
                    <ul>
                      {sec.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  )}
                </section>
              ))
            ) : c.bio ? (
              /* No editorial statement written yet: the candidate's own words,
                 clearly attributed so nobody reads them as ours. */
              <section>
                <h2>In {c.name.trim().split(/\s+/)[0]}&apos;s own words</h2>
                <p>{c.bio}</p>
                <p>
                  <em>Our full endorsement statement is coming soon.</em>
                </p>
              </section>
            ) : null}
          </div>

          {ctaLinks.length > 0 && (
            <div className="endorse-profile-ctarow">
              {ctaLinks.map((l, i) => {
                const external = /^https?:/i.test(l.href);
                return (
                  <span key={l.href} style={{ display: 'contents' }}>
                    {i > 0 && (
                      <span className="ctadiv" aria-hidden="true">
                        |
                      </span>
                    )}
                    {external ? (
                      <a href={l.href} target="_blank" rel="noopener">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href}>{l.label}</Link>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          <p className="endorse-profile-provenance">
            {endorsedOn
              ? `Ohio Pride PAC endorsed ${c.name} on ${endorsedOn}, `
              : `Ohio Pride PAC endorsed ${c.name} `}
            after our Screening Committee reviewed the application against the public record and our
            Board voted. <Link href="/endorsements#process-title">See how endorsements work</Link>,
            or <Link href="/endorsement/screening">apply for an endorsement</Link>.
          </p>
        </div>
      </article>

      <a href="/donate" className="mobile-donate-fab">
        Donate
      </a>
    </main>
  );
}
