// Shared vocabulary and formatting for the Prospects module. The stage list,
// labels, and colors match the pipeline convention the static console used, so
// a stage saved here reads the same everywhere else.

export const STAGES = [
  'identified', 'qualified', 'cultivating', 'ask_made', 'committed',
  'secured', 'stewardship', 'lapsed', 'declined',
];

export const STAGE_LABEL = {
  identified: 'Identified', qualified: 'Qualified', cultivating: 'Cultivating',
  ask_made: 'Ask Made', committed: 'Committed', secured: 'Secured',
  stewardship: 'Stewardship', lapsed: 'Lapsed', declined: 'Declined',
};

export const STAGE_COLOR = {
  identified: '#64748B', qualified: '#234A66', cultivating: '#1A3A52',
  ask_made: '#C2740A', committed: '#9A6700', secured: '#008026',
  stewardship: '#066B23', lapsed: '#9CA3AF', declined: '#9B2C2C',
};

export const STATUS_OPTIONS = ['active', 'on_hold', 'archived'];
export const STATUS_LABEL = { active: 'Active', on_hold: 'On hold', archived: 'Archived' };

export const PRIORITY_OPTIONS = ['low', 'medium', 'high'];
export const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };

export const TYPE_OPTIONS = [
  { value: 'individual', label: 'Individuals' },
  { value: 'committee', label: 'Committees' },
];

export const titleize = (s) =>
  String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// next_action_date is a date column. Parsing "2026-08-10" as UTC midnight and
// then printing it in a US timezone shows the day before, so anchor at noon.
export const fmtDay = (v) => {
  if (!v) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function ownerLabel(u) {
  return (u && (u.full_name || u.email)) || '';
}
