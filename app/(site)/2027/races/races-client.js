'use client';
/* The filter bar and the race cards.
 *
 * A client component because the chips are interactive, but it is server
 * rendered like the rest of the page, so every card is in the HTML on first
 * paint. Filter state lives in the query string (tier, region, type, wave, q)
 * so any view can be shared as a link. The query string is read after mount
 * and written with history.replaceState rather than through useSearchParams,
 * because useSearchParams turns a statically rendered route into a
 * client-only render up to the nearest Suspense boundary, which would ship
 * the page with no cards in it. Reading it after mount keeps the static,
 * revalidating HTML complete and applies a shared link's filters a moment
 * later.
 *
 * Every tag carries text. Colour only ever repeats what the words say.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BALLOT_PATH_LABEL, FILING_TBC_LABEL, OFFICE_TYPE_LABEL, OFFICE_TYPE_ORDER, REGION_ORDER,
  TIER_LABEL, TIER_ORDER, TIER_SECTION, filingLine, filingWaveOf, monthDay, officeTypeOf,
} from '../../../../lib/candidates.mjs';

const FILTER_KEYS = ['tier', 'region', 'type', 'wave', 'q'];
const DEFAULT_FILTERS = { tier: 'all', region: 'all', type: 'all', wave: 'all', q: '' };

function filtersFromSearch(search) {
  const p = new URLSearchParams(search || '');
  return {
    tier: p.get('tier') || 'all',
    region: p.get('region') || 'all',
    type: p.get('type') || 'all',
    wave: p.get('wave') || 'all',
    q: p.get('q') || '',
  };
}

function Chip({ active, onClick, children }) {
  return (
    <button type="button" className="r100-chip" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

function ChipGroup({ label, value, options, onChange }) {
  return (
    <div className="r100-filter" role="group" aria-label={label}>
      <span className="r100-filter-label">{label}</span>
      <div className="r100-chips">
        <Chip active={value === 'all'} onClick={() => onChange('all')}>All</Chip>
        {options.map(([key, text]) => (
          <Chip key={key} active={value === key} onClick={() => onChange(key)}>{text}</Chip>
        ))}
      </div>
    </div>
  );
}

function RaceCard({ race, applyPath }) {
  const tier = race.tier;
  const ballot = race.ballot_path ? BALLOT_PATH_LABEL[race.ballot_path] : null;
  const showIncumbent = tier === 'protect' && race.incumbent_is_out && race.incumbent_name;
  return (
    <article className={`r100-card tier-${tier}`}>
      <h3 className="r100-card-title">
        <span className="r100-card-place">{race.jurisdiction}</span>
        <span className="r100-card-office">{race.office}</span>
      </h3>
      <p className="r100-card-where">
        {race.county ? `${race.county} County` : 'Statewide'}
        {race.region ? ` · ${race.region} Ohio` : ''}
      </p>
      <ul className="r100-tags" aria-label="Race details">
        <li className={`r100-tag ${tier === 'protect' ? 'is-protect' : ''}`}>{TIER_LABEL[tier] || tier}</li>
        {ballot && <li className="r100-tag">{ballot}</li>}
        {race.is_open_seat && <li className="r100-tag">Open Seat</li>}
      </ul>
      <p className="r100-card-filing">{filingLine(race)}</p>
      {race.rationale && <p className="r100-card-why">{race.rationale}</p>}
      {showIncumbent && <p className="r100-card-incumbent">Out incumbent: {race.incumbent_name}</p>}
      {race.needs_verification && (
        <p className="r100-card-note">Seat details pending board of elections confirmation</p>
      )}
      <Link className="r100-card-cta" href={`${applyPath}?race=${encodeURIComponent(race.slug)}`}>
        Apply for this race
      </Link>
    </article>
  );
}

export default function RacesClient({ races, loadFailed, applyPath }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // Shared links: apply the query string once mounted, and follow the back
  // button if someone navigates between filtered views.
  useEffect(() => {
    const read = () => setFilters(filtersFromSearch(window.location.search));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const writeUrl = useCallback((next) => {
    const p = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = next[k];
      if (v && v !== 'all') p.set(k, v);
    }
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, []);

  const setFilter = useCallback((key, value) => {
    setFilters((f) => {
      const next = { ...f, [key]: value == null ? '' : value };
      writeUrl(next);
      return next;
    });
  }, [writeUrl]);

  const clearAll = useCallback(() => { setFilters(DEFAULT_FILTERS); writeUrl(DEFAULT_FILTERS); }, [writeUrl]);

  /* Chip sets are built from the data, so a wave only appears when a race
   * actually files on that day and a region with no seats is not offered. */
  const tierOptions = TIER_ORDER.filter((t) => races.some((r) => r.tier === t)).map((t) => [t, TIER_LABEL[t]]);
  const regionOptions = REGION_ORDER.filter((g) => races.some((r) => r.region === g)).map((g) => [g, g]);
  const typeOptions = OFFICE_TYPE_ORDER
    .filter((t) => races.some((r) => officeTypeOf(r) === t))
    .map((t) => [t, OFFICE_TYPE_LABEL[t]]);
  const waveOptions = useMemo(() => {
    const days = [...new Set(races.map(filingWaveOf))].filter((d) => d !== 'tbc').sort();
    const out = days.map((d) => [d, monthDay(d)]);
    if (races.some((r) => filingWaveOf(r) === 'tbc')) out.push(['tbc', FILING_TBC_LABEL]);
    return out;
  }, [races]);

  const visible = useMemo(() => {
    const term = filters.q.trim().toLowerCase();
    return races.filter((r) =>
      (filters.tier === 'all' || r.tier === filters.tier) &&
      (filters.region === 'all' || r.region === filters.region) &&
      (filters.type === 'all' || officeTypeOf(r) === filters.type) &&
      (filters.wave === 'all' || filingWaveOf(r) === filters.wave) &&
      (!term || [r.jurisdiction, r.county, r.office, r.incumbent_is_out ? r.incumbent_name : '']
        .some((v) => String(v || '').toLowerCase().includes(term))));
  }, [races, filters.tier, filters.region, filters.type, filters.wave, filters.q]);

  const sections = TIER_ORDER
    .map((t) => ({ tier: t, ...TIER_SECTION[t], items: visible.filter((r) => r.tier === t) }))
    .filter((s) => s.items.length);

  const anyFilter = FILTER_KEYS.some((k) => (k === 'q' ? filters.q.trim() : filters[k] !== 'all'));

  return (
    <>
      <div className="r100-controls">
        <div className="r100-controls-inner">
          <label className="r100-search">
            <span className="sr-only">Search races</span>
            <input
              type="search"
              className="r100-search-input"
              placeholder="Search by city, county, office, or incumbent"
              value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)}
              inputMode="search"
            />
          </label>
          <ChipGroup label="Tier" value={filters.tier} options={tierOptions} onChange={(v) => setFilter('tier', v)} />
          <ChipGroup label="Region" value={filters.region} options={regionOptions} onChange={(v) => setFilter('region', v)} />
          <ChipGroup label="Office type" value={filters.type} options={typeOptions} onChange={(v) => setFilter('type', v)} />
          <ChipGroup label="Filing wave" value={filters.wave} options={waveOptions} onChange={(v) => setFilter('wave', v)} />
          <p className="r100-count" aria-live="polite">
            {visible.length === races.length
              ? `${races.length} races`
              : `${visible.length} of ${races.length} races`}
            {anyFilter && (
              <>
                {' · '}
                <button type="button" className="r100-link" onClick={clearAll}>Clear filters</button>
              </>
            )}
          </p>
        </div>
      </div>

      {loadFailed && (
        <p className="r100-empty" role="status">
          The race list could not be loaded right now. Refresh in a moment, or go ahead and apply.
        </p>
      )}

      {!loadFailed && !sections.length && (
        <p className="r100-empty" role="status">No races match those filters.</p>
      )}

      {sections.map((s) => (
        <section key={s.tier} className={`r100-section tier-${s.tier}`} aria-labelledby={`tier-${s.tier}`}>
          <div className="r100-section-head">
            <h2 id={`tier-${s.tier}`}>{s.title}</h2>
            <p>{s.intro}</p>
            <p className="r100-section-count">{s.items.length} {s.items.length === 1 ? 'race' : 'races'}</p>
          </div>
          <div className="r100-grid">
            {s.items.map((r) => <RaceCard key={r.id} race={r} applyPath={applyPath} />)}
          </div>
        </section>
      ))}
    </>
  );
}
