'use client';
// Shared vocabulary and helpers for the Pride road tour, ported from
// public/admin/pride/pride-shared.js. The regions, event types, PAC roles and
// assignment statuses match the CHECK constraints and the
// pride_assignment_status enum, so nothing here is decorative: change a value
// and the insert fails.
import { supabase } from '../../lib/supabase';

export const REGIONS = [
  { value: 'Central', label: 'Central' },
  { value: 'NE', label: 'Northeast' },
  { value: 'NW', label: 'Northwest' },
  { value: 'SE', label: 'Southeast' },
  { value: 'SW', label: 'Southwest' },
];

export const EVENT_TYPES = [
  'parade', 'march', 'festival', 'parade_and_festival', 'rally', 'mixer',
  'kickoff', 'fundraiser', '5k', 'interfaith', 'community', 'other',
];

export const PAC_ROLES = ['none', 'marching', 'tabling', 'both', 'scouting'];
export const REG_STATUSES = ['tbd', 'open', 'closed', 'late_add', 'passed'];
export const ROLE_OPTIONS = [
  'marcher', 'captain', 'tabler', 'driver', 'photographer',
  'greeter', 'marshal', 'scout', 'other',
];

export const ASSIGNMENT_STATUSES = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'tentative', label: 'Tentative' },
  { key: 'declined', label: 'Declined' },
  { key: 'removed', label: 'Removed' },
];

// Who is going. "volunteers" is derived from the event roster (any confirmed
// or tentative assignment); the other three are pride_events flags. "ed" is
// the Director, which is what the Director tab filters on. Colors are the
// static console's categories restated for the light admin theme; every dot
// also carries its label as a title and in the legend, so color is never the
// only signal.
export const ATTENDANCE = [
  { key: 'volunteers', label: 'Volunteers', color: '#0B8FB0', derived: true },
  { key: 'board', label: 'Board', color: '#1D8A5B', col: 'board_attending' },
  { key: 'staff', label: 'Staff', color: '#B7791F', col: 'staff_attending' },
  { key: 'ed', label: 'Director', color: '#B3378F', col: 'ed_attending' },
];

export const ATTENDANCE_BY_KEY = Object.fromEntries(ATTENDANCE.map(a => [a.key, a]));

export const STATUS_BADGE = {
  confirmed: 'badge-ok',
  tentative: 'badge-review',
  declined: 'badge-bad',
  removed: 'badge-muted',
};

export function titleCase(s) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function regionLabel(r) {
  const m = { NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest', Central: 'Central', Anywhere: 'Anywhere' };
  return m[r] || r || '';
}

export const prettyRole = (r) => titleCase(r || 'marcher');
export const eventTypeLabel = (t) => titleCase(t || 'event');

// 'YYYY-MM-DD' to a local Date at noon, which keeps a date-only value from
// shifting a day when the browser is west of UTC.
export function parseDateOnly(d) {
  if (!d) return null;
  const p = String(d).slice(0, 10).split('-');
  if (p.length < 3) return null;
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
}

export function fmtEventDate(d) {
  const dt = parseDateOnly(d);
  if (!dt) return '';
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtRel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Eastern wall clock { h, m } from a timestamptz.
export function easternHM(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const s = d.toLocaleString('en-US', {
    timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
  });
  const p = s.split(':');
  return { h: Number(p[0]) % 24, m: Number(p[1]) || 0 };
}

export function fmtTimeET(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
  });
}

// Build a timestamptz from an event date plus an Eastern HH:MM. The 2026 road
// tour runs May through October, entirely inside EDT (UTC-04:00); a winter
// event would need -05:00 here.
export function easternToISO(dateStr, hhmm) {
  if (!dateStr || !hhmm) return null;
  return String(dateStr).slice(0, 10) + 'T' + hhmm + ':00-04:00';
}

// 'HH:MM' in Eastern for an <input type="time">.
export function easternTimeInput(iso) {
  const hm = easternHM(iso);
  if (!hm) return '';
  return ('0' + hm.h).slice(-2) + ':' + ('0' + hm.m).slice(-2);
}

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40) || 'event';
}

export function volunteerName(v) {
  if (!v) return '';
  return [v.first_name, v.last_name].filter(Boolean).join(' ').trim();
}

export function Dot({ color, label }) {
  return (
    <span
      title={label}
      style={{
        display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
        background: color, flex: '0 0 auto',
      }}
    />
  );
}

export function AttendanceDots({ flags }) {
  const on = ATTENDANCE.filter(a => flags && flags[a.key]);
  if (!on.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6, verticalAlign: 'middle' }}>
      {on.map(a => <Dot key={a.key} color={a.color} label={a.label} />)}
    </span>
  );
}

export function AttendanceLegend() {
  return (
    <div className="muted small" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 0 10px' }}>
      {ATTENDANCE.map(a => (
        <span key={a.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Dot color={a.color} label={a.label} />{a.label}
        </span>
      ))}
    </div>
  );
}

export function StatusBadge({ status }) {
  const label = (ASSIGNMENT_STATUSES.find(s => s.key === status) || {}).label || titleCase(status);
  return <span className={`badge ${STATUS_BADGE[status] || 'badge-muted'}`}>{label}</span>;
}

// Flip a pride_event_volunteers row's status. Throws on failure so callers can
// surface the message. set_by records who made the call.
export async function setAssignmentStatus(id, status, actorEmail) {
  const { error } = await supabase()
    .from('pride_event_volunteers')
    .update({ status, set_by: actorEmail || null })
    .eq('id', id);
  if (error) throw error;
}
