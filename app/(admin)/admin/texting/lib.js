// Text Blast pure logic: segments, flags, phone normalization, templating.
// Kept free of React and Supabase so it can be unit tested directly.

// Segments map onto contacts.roles[]. Adding one is a line here.
export const SEGMENTS = [
  { key: 'founding_members', label: 'Founding members',      role: 'founding_member' },
  { key: 'volunteers',       label: 'Volunteers',            role: 'volunteer' },
  { key: 'donors',           label: 'Donors',                role: 'donor' },
  { key: 'signups',          label: 'Event sign-ups',        role: 'signup' },
  { key: 'launch_signups',   label: 'Launch day sign-ups',   role: 'launch_signup' },
  { key: 'network',          label: 'Network contacts',      role: 'network' },
  { key: 'press',            label: 'Press',                 role: 'press' },
  { key: 'newsletter',       label: 'Newsletter',            role: 'newsletter' },
  { key: 'all',              label: 'Everyone with a phone', role: null },
];

export const REGIONS = [
  'Northeast Ohio', 'Northwest Ohio', 'Central Ohio', 'Southwest Ohio', 'Southeast Ohio',
];

// Ohio area codes. Anything else gets an out-of-state flag on the card so the
// sender knows before they tap, rather than after.
export const OHIO_AREA_CODES = {
  216: 1, 220: 1, 234: 1, 283: 1, 326: 1, 330: 1, 380: 1, 419: 1,
  436: 1, 440: 1, 513: 1, 567: 1, 614: 1, 740: 1, 937: 1,
};

// Firewall names: event and thank-you content only. Nothing that reads as
// campaign coordination or express advocacy.
export const FIREWALL = ['walsh', 'russo', 'acton'];

export const EMAIL_TYPOS = [
  'gmial.', 'gmai.', 'gmal.', 'yaho.', 'yahooo.', 'hotmial.', 'hotmai.',
  'outlok.', '.con', '.cmo', '.ocm', '.vom',
];

export const FLAG_LABEL = {
  no_optin:     { text: 'No SMS opt-in', kind: 'warn' },
  firewall:     { text: 'Firewall name', kind: 'alert' },
  gov_email:    { text: 'Gov email',     kind: 'alert' },
  out_of_state: { text: 'Out of state',  kind: 'warn' },
  email_typo:   { text: 'Email typo?',   kind: 'warn' },
  bad_phone:    { text: 'Bad number',    kind: 'alert' },
  email_only:   { text: 'Email only',    kind: 'warn' },
};

// House voice: warm, short, sounds like one human texting another. Link on its
// own line. No em or en dashes, no hashtags, no emojis unless typed in.
export const DEFAULT_TPL =
  "Hi {first}, it's Zach with Ohio Pride PAC. Wanted to reach out personally about what we have coming up this month.\n\n" +
  'https://ohiopride.org\n\n' +
  'Would love to hear what you think.';

// E.164 or nothing. Strip non-digits, drop a leading 1, require exactly 10
// digits. Anything else is not textable.
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/[^0-9]/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return null;
  if (d[0] === '0' || d[0] === '1') return null;
  return '+1' + d;
}

export function prettyPhone(e164) {
  if (!e164) return '';
  const d = String(e164).replace(/[^0-9]/g, '').slice(-10);
  if (d.length !== 10) return String(e164);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function areaCode(e164) {
  const d = String(e164 || '').replace(/[^0-9]/g, '');
  return d.slice(-10, -7);
}

// Flags are surfaced on the card, never silently acted on. Computed once at
// build time and frozen onto the recipient row.
export function computeFlags(person, phone) {
  const flags = [];
  const email = String(person.email || '').toLowerCase();
  let last = String(person.last_name || '').toLowerCase().trim();
  if (!last) {
    const parts = String(person.name || person.full_name || '').trim().split(/\s+/);
    if (parts.length > 1) last = parts[parts.length - 1].toLowerCase();
  }

  if (!phone) flags.push(person.email ? 'email_only' : 'bad_phone');
  else if (!OHIO_AREA_CODES[areaCode(phone)]) flags.push('out_of_state');

  if (!person.sms_optin) flags.push('no_optin');
  if (last && FIREWALL.indexOf(last) !== -1) flags.push('firewall');
  if (/\.gov$|\.state\.oh\.us$/.test(email)) flags.push('gov_email');
  if (email && EMAIL_TYPOS.some(t => email.indexOf(t) !== -1)) flags.push('email_typo');
  return flags;
}

// {first} swaps in each first name; anyone without one falls back to "Hi there".
export function renderMessage(row, template) {
  if (row.message_override != null && row.message_override !== '') return row.message_override;
  const first = String(row.first_name || '').trim();
  const body = template == null ? DEFAULT_TPL : template;
  if (first) return body.replace(/\{first\}/g, first);
  return body.replace(/Hi \{first\},/g, 'Hi there,').replace(/\{first\}/g, 'there');
}

// Rough segment math so a long message is obvious before sending. GSM-7 fits
// 160 (153 concatenated); anything outside it forces UCS-2 at 70 (67).
const GSM = /^[A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€\r\n]*$/;

export function segmentInfo(text) {
  const s = String(text || '');
  const gsm = GSM.test(s);
  const per = gsm ? 160 : 70;
  const cat = gsm ? 153 : 67;
  const segments = s.length <= per ? 1 : Math.ceil(s.length / cat);
  return { chars: s.length, segments, unicode: !gsm };
}

// iPhone and Mac want &body=, Android and Chrome want ?body=.
export function smsHref(e164, body, userAgent) {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const sep = /iPad|iPhone|iPod|Macintosh/.test(ua) ? '&' : '?';
  return 'sms:' + e164 + sep + 'body=' + encodeURIComponent(body);
}

export function mailtoHref(addr, subject, body) {
  return 'mailto:' + encodeURIComponent(addr) +
    '?subject=' + encodeURIComponent(subject || '') +
    '&body=' + encodeURIComponent(body || '');
}

export const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Snapshot a contact row into a recipient. Contact fields are frozen at build
// time on purpose: a blast is a record of what was actually sent to what
// number, and later edits to the contact must not rewrite history.
export function snapshotContact(c, includeEmail) {
  const phone = normalizePhone(c.phone);
  if (!phone && (!includeEmail || !c.email)) return null;
  const composed = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return {
    contact_id: c.id,
    full_name: c.full_name || c.name || composed || 'Unnamed',
    first_name: c.first_name || '',
    phone_e164: phone,
    email: c.email ? String(c.email) : null,
    city: c.city || null,
    county: c.county || null,
    region: c.region || null,
    sms_optin: !!c.sms_optin,
    channel: phone ? 'sms' : 'email',
    flags: computeFlags(c, phone),
  };
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:absolute;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('copy failed');
}
