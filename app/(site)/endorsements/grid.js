'use client';
/* The filterable card grid.
 *
 * A client component because the office and year filters are interactive, but
 * it is server rendered like everything else, so the cards are in the HTML on
 * first paint. That is the whole point of the port: the old page shipped a
 * skeleton, fetched Supabase in the browser, and only then had content for a
 * crawler or a slow connection to see.
 *
 * The filter bar only appears once the list is big enough to need it.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LEVEL_LABEL } from '../../../lib/endorsements.mjs';
import { EndorsedPill, cardTeaser } from './shared';

const LEVEL_ORDER = ['federal', 'state', 'local', 'judicial'];

function Card({ c }) {
  const href = `/endorsements/${c.slug}`;
  const photo = c.content?.cardPhoto || c.content?.photo;
  const teaser = cardTeaser(c);
  const meta = [c.district, c.electionYear].filter(Boolean).join(' · ');

  return (
    <article className="endorse-card">
      <div className="endorse-card-stripe" aria-hidden="true" />
      <Link className="endorse-card-photolink" href={href} tabIndex={-1} aria-hidden="true">
        {photo ? (
          <div className="endorse-card-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={c.content?.photoAlt || c.name} loading="lazy" />
          </div>
        ) : (
          <div className="endorse-card-photo placeholder" aria-hidden="true">
            {c.name?.trim()?.[0]?.toUpperCase() || '?'}
          </div>
        )}
      </Link>

      <div className="endorse-card-body">
        <div>
          <h3 className="endorse-card-name">
            <Link href={href}>{c.name}</Link>
          </h3>
          {c.pronouns && <p className="endorse-card-pronouns">{c.pronouns}</p>}
          <p className="endorse-card-office">{c.office}</p>
          {meta && <p className="endorse-card-meta">{meta}</p>}
        </div>

        <EndorsedPill />

        {teaser ? (
          <p className="endorse-card-bio">{teaser}</p>
        ) : (
          <p className="endorse-card-bio empty">Our full endorsement statement is coming soon.</p>
        )}

        <div className="endorse-card-foot">
          <Link className="endorse-read-btn" href={href}>
            Read Our Endorsement
          </Link>
          {c.website && (
            <a className="endorse-campaign-link" href={c.website} target="_blank" rel="noopener">
              Campaign Site
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function EndorsementGrid({ candidates, loadFailed, screeningPath }) {
  const [level, setLevel] = useState('all');
  const [year, setYear] = useState('');

  /* /endorsements#jeff-givan was the shareable URL until the profile became a
   * real route. The hash never reaches the server, so the redirect has to
   * happen here. Anything that is not a known slug just clears itself. */
  useEffect(() => {
    const slug = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
    if (!slug) return;
    if (candidates.some((c) => c.slug === slug)) {
      window.location.replace(`/endorsements/${slug}`);
    } else {
      window.history.replaceState(null, '', '/endorsements');
    }
  }, [candidates]);

  const counts = useMemo(() => {
    const out = { all: candidates.length };
    for (const c of candidates) out[c.level] = (out[c.level] || 0) + 1;
    return out;
  }, [candidates]);

  const years = useMemo(
    () => [...new Set(candidates.map((c) => c.electionYear).filter(Boolean))].sort((a, b) => b - a),
    [candidates],
  );

  const levels = useMemo(
    () => LEVEL_ORDER.filter((l) => counts[l]),
    [counts],
  );

  const filtered = useMemo(
    () =>
      candidates.filter(
        (c) =>
          (level === 'all' || c.level === level) &&
          (!year || String(c.electionYear) === year),
      ),
    [candidates, level, year],
  );

  // Filters earn their screen space only once the list needs them.
  const showControls = candidates.length > 3 || years.length > 1 || levels.length > 1;

  function clearFilters() {
    setLevel('all');
    setYear('');
  }

  return (
    <>
      {showControls && (
        <section className="endorse-controls" aria-label="Filters">
          <div className="endorse-controls-inner">
            <span className="endorse-controls-label">Office</span>
            <div className="endorse-pill-group" role="group" aria-label="Office level">
              {['all', ...levels].map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`endorse-pill${level === l ? ' active' : ''}`}
                  aria-pressed={level === l}
                  onClick={() => setLevel(l)}
                >
                  {LEVEL_LABEL[l]}
                  <span className="count">({counts[l] || 0})</span>
                </button>
              ))}
            </div>
            {years.length > 1 && (
              <select
                className="endorse-year-select"
                aria-label="Election year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
            <span className="endorse-count" role="status" aria-live="polite">
              <strong>{filtered.length}</strong> endorsed
            </span>
          </div>
        </section>
      )}

      <div className="endorse-grid-wrap">
        {filtered.length > 0 ? (
          <div className="endorse-grid">
            {filtered.map((c) => (
              <Card key={c.id} c={c} />
            ))}
            {level === 'all' && !year && (
              <article className="endorse-card soon">
                <h3>More endorsements coming soon</h3>
                <p>
                  Our Screening Committee reviews applications on a rolling basis. New endorsed
                  candidates appear here as the Board approves them.
                </p>
                <Link href={screeningPath}>Are you a candidate? Apply now</Link>
              </article>
            )}
          </div>
        ) : loadFailed ? (
          <div className="endorse-state error">
            <h2>We couldn&apos;t load endorsements</h2>
            <p>
              There was a problem fetching the latest endorsement list. Please refresh the page or
              try again in a moment.
            </p>
            <a className="btn-action" href="/endorsements">
              Try again
            </a>
          </div>
        ) : candidates.length === 0 ? (
          <div className="endorse-state">
            <h2>Endorsements coming soon</h2>
            <p>
              Our Screening Committee is reviewing applications now. The first round of endorsed
              candidates will appear here as the Board approves them.
            </p>
            <Link className="btn-action" href={screeningPath}>
              Are you a candidate? Apply now
            </Link>
          </div>
        ) : (
          <div className="endorse-state">
            <h2>No matches</h2>
            <p>No endorsed candidates match the current filters. Try clearing them.</p>
            <button type="button" className="btn-action" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>
    </>
  );
}
