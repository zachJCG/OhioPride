// Networking vocabulary and formatters, shared by the directory page, the
// contact drawer, and the card capture screen.
//
// The region list is networking's own 10-value taxonomy. It is deliberately not
// the 5 quadrant regions Contacts uses, so do not swap one for the other.
export const REGIONS = [
  'Statewide', 'Greater Columbus', 'Greater Cincinnati', 'Greater Cleveland',
  'Greater Dayton', 'Akron/Canton', 'Toledo', 'Southeast Ohio', 'National', 'Out-of-state',
];

export const WARMTH = ['cold', 'warm', 'hot'];
export const WARMTH_LABEL = { cold: 'Cold', warm: 'Warm', hot: 'Hot' };
export const WARMTH_COLOR = { cold: '#64748B', warm: '#C2740A', hot: '#9B2C2C' };

export const TIERS = ['principal', 'connector', 'gatekeeper', 'staffer', 'contact'];
export const TIER_LABEL = {
  principal: 'Principal', connector: 'Connector', gatekeeper: 'Gatekeeper',
  staffer: 'Staffer', contact: 'Contact',
};

export const PRIORITY = ['high', 'medium', 'low'];
export const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

export const STATUSES = ['active', 'dormant', 'do_not_contact', 'archived'];
export const STATUS_LABEL = {
  active: 'Active', dormant: 'Dormant', do_not_contact: 'Do not contact', archived: 'Archived',
};

export const INTRO_STATUS = ['potential', 'requested', 'made', 'declined', 'blocked'];
export const INTRO_STATUS_LABEL = {
  potential: 'Potential', requested: 'Requested', made: 'Made',
  declined: 'Declined', blocked: 'Blocked',
};

export const ACTIVITY_TYPES = ['note', 'call', 'email', 'meeting', 'event', 'intro_made'];
export const ACTIVITY_LABEL = {
  note: 'Note', call: 'Call', email: 'Email', meeting: 'Meeting',
  event: 'Event', intro_made: 'Intro made',
};
export const ACTIVITY_ICON = {
  note: '✎', call: '☎', email: '✉',
  meeting: '\u{1F465}', event: '⚑', intro_made: '\u{1F91D}',
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

export const relTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
};

export const ownerLabel = (u) => (u ? (u.full_name || u.email) : '');

export const trimOrNull = (v) => {
  const s = String(v == null ? '' : v).trim();
  return s.length ? s : null;
};

export const stars = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0)));

export const contactLabel = (c) =>
  c.full_name + (c.organization ? ` (${c.organization})` : '');
