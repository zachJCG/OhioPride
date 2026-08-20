/* =============================================================================
 * Shared submission notifier (server-side only)
 * -----------------------------------------------------------------------------
 * Sends "you have a new submission" emails to staff via Resend. Used by every
 * public form handler so a submission never sits unseen in Supabase:
 *
 *   contact      -> lib/functions/form-submit.mjs          (contact + connect + RSVPs)
 *   newsletter   -> lib/functions/newsletter-submit.mjs
 *   volunteer    -> lib/functions/volunteer-submit.mjs     (volunteer + internship)
 *   volunteer    -> lib/functions/pride-volunteer-submit.mjs
 *   endorsement  -> lib/functions/endorsement-notify.mjs
 *
 * This is a NOTIFICATION channel, not a marketing one. The confirmation email
 * the *submitter* receives is still MailerLite's job (see lib/mailerlite.mjs);
 * MailerLite has no transactional send, which is why staff alerts go through
 * Resend instead.
 *
 * Env:
 *   RESEND_API_KEY          required — without it every call is a no-op
 *   RESEND_FROM_EMAIL       optional — default onboarding@resend.dev
 *   SITE_URL                optional — default https://ohiopride.org (admin links)
 *   SUBMISSION_NOTIFY_TO    optional — comma-separated, overrides every kind
 *   NOTIFY_CONTACT_TO       optional — comma-separated, per-kind override
 *   NOTIFY_NEWSLETTER_TO      "
 *   NOTIFY_VOLUNTEER_TO       "
 *   NOTIFY_ENDORSEMENT_TO     "
 *   NOTIFY_DISABLED_KINDS   optional — comma-separated kill switch, e.g. "newsletter"
 *
 * Every export is best-effort: notifications must never fail a submission that
 * already made it into the database. Callers do not need to try/catch.
 * ============================================================================= */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Ohio Pride PAC <onboarding@resend.dev>';
const SEND_TIMEOUT_MS = 8000;

// Where each kind lands when no env override is set. zach@ohiopride.org is on
// every kind — that is the whole point of the module. Additional addresses are
// per-kind inboxes that were already receiving mail before it existed.
const DEFAULT_RECIPIENTS = {
  contact:     ['zach@ohiopride.org', 'info@ohiopride.org'],
  newsletter:  ['zach@ohiopride.org'],
  volunteer:   ['zach@ohiopride.org'],
  endorsement: ['zach@ohiopride.org'],
};

const ENV_KEY_BY_KIND = {
  contact:     'NOTIFY_CONTACT_TO',
  newsletter:  'NOTIFY_NEWSLETTER_TO',
  volunteer:   'NOTIFY_VOLUNTEER_TO',
  endorsement: 'NOTIFY_ENDORSEMENT_TO',
};

export function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const addr of list) {
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

/**
 * Resolve the recipient list for a submission kind.
 *
 * Precedence: per-kind env -> global env -> built-in defaults. The legacy
 * FORM_NOTIFY_TO is folded into the contact defaults rather than treated as an
 * override, so the value already set in Vercel adds an inbox instead of
 * silently removing the one this module exists to serve.
 */
export function recipientsFor(kind) {
  const perKind = splitList(process.env[ENV_KEY_BY_KIND[kind]]);
  if (perKind.length) return dedupe(perKind);

  const global = splitList(process.env.SUBMISSION_NOTIFY_TO);
  if (global.length) return dedupe(global);

  const defaults = DEFAULT_RECIPIENTS[kind] || DEFAULT_RECIPIENTS.contact;
  if (kind === 'contact') return dedupe([...defaults, ...splitList(process.env.FORM_NOTIFY_TO)]);
  return dedupe(defaults);
}

export function isKindDisabled(kind) {
  return splitList(process.env.NOTIFY_DISABLED_KINDS)
    .map((s) => s.toLowerCase())
    .includes(String(kind).toLowerCase());
}

function esc(value) {
  return String(value == null ? '' : value).replace(
    /[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]),
  );
}

// Turn one field value into display text. Arrays are the common case here —
// volunteer interests, skills and availability are all text[] columns.
function renderValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.filter((v) => v != null && v !== '').join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

/**
 * Normalize `fields` (a plain object, insertion-ordered) into [label, text]
 * pairs, dropping anything empty so the email shows only what was filled in.
 */
function normalizeFields(fields) {
  if (!fields) return [];
  const entries = Array.isArray(fields) ? fields : Object.entries(fields);
  const out = [];
  for (const [label, raw] of entries) {
    const text = renderValue(raw).trim();
    if (!text) continue;
    out.push([String(label), text.length > 4000 ? `${text.slice(0, 4000)}…` : text]);
  }
  return out;
}

function siteUrl() {
  const raw = process.env.SITE_URL || 'https://ohiopride.org';
  return raw.replace(/\/+$/, '');
}

function buildHtml({ title, fields, adminPath, adminLabel }) {
  const rows = fields
    .map(
      ([label, value]) =>
        `<tr>
           <td style="padding:7px 16px 7px 0;color:#5b6675;font-size:11px;letter-spacing:.6px;text-transform:uppercase;vertical-align:top;white-space:nowrap;">${esc(label)}</td>
           <td style="padding:7px 0;color:#0F2233;font-size:14px;line-height:1.5;">${esc(value).replace(/\n/g, '<br>')}</td>
         </tr>`,
    )
    .join('');

  const button = adminPath
    ? `<p style="margin:24px 0 0;">
         <a href="${esc(siteUrl() + adminPath)}"
            style="display:inline-block;background:#0F2233;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:6px;">
           ${esc(adminLabel || 'Open in the admin console')}
         </a>
       </p>`
    : '';

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;padding:8px;">
  <div style="height:4px;background:#73D7EE;border-radius:3px;"></div>
  <h1 style="color:#0F2233;font-size:20px;margin:20px 0 2px;">${esc(title)}</h1>
  <p style="color:#8891a0;margin:0 0 20px;font-size:13px;">ohiopride.org</p>
  <table style="border-collapse:collapse;width:100%;">${rows}</table>
  ${button}
</div>`;
}

function buildText({ title, fields, adminPath }) {
  const lines = [title, ''];
  for (const [label, value] of fields) lines.push(`${label}: ${value}`);
  if (adminPath) lines.push('', siteUrl() + adminPath);
  return lines.join('\n');
}

/**
 * Send one staff notification.
 *
 * @param {object}  opts
 * @param {string}  opts.kind        contact | newsletter | volunteer | endorsement
 * @param {string}  opts.title       headline, also the fallback subject
 * @param {string} [opts.subject]    overrides the generated subject line
 * @param {object} [opts.fields]     label -> value, rendered in order, empties dropped
 * @param {string} [opts.replyTo]    submitter's address, so Reply just works
 * @param {string} [opts.adminPath]  path on the site for the CTA button
 * @param {string} [opts.adminLabel] CTA button label
 * @param {string[]} [opts.to]       explicit recipients, bypassing recipientsFor()
 *
 * @returns {Promise<{ok: boolean, skipped?: string, status?: number}>} never rejects
 */
export async function notifySubmission(opts) {
  const { kind, title, subject, fields, replyTo, adminPath, adminLabel } = opts || {};

  try {
    if (isKindDisabled(kind)) return { ok: false, skipped: 'kind_disabled' };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(`notify(${kind}): RESEND_API_KEY unset, notification not sent`);
      return { ok: false, skipped: 'unconfigured' };
    }

    const to = dedupe(opts.to?.length ? opts.to : recipientsFor(kind));
    if (!to.length) return { ok: false, skipped: 'no_recipients' };

    const normalized = normalizeFields(fields);
    const payload = {
      from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to,
      subject: subject || `[Ohio Pride PAC] ${title}`,
      html: buildHtml({ title, fields: normalized, adminPath, adminLabel }),
      text: buildText({ title, fields: normalized, adminPath }),
    };
    // Reply-To points at the submitter so staff can answer straight from the
    // alert. Resend rejects a malformed address outright, so only set it when
    // it actually looks like one.
    if (replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) payload.reply_to = replyTo;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.error(`notify(${kind}): resend returned ${res.status}`, await res.text().catch(() => ''));
        return { ok: false, status: res.status };
      }
      return { ok: true, status: res.status };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Swallowed on purpose: the row is already written, and a failed alert must
    // never turn a successful submission into an error for the visitor.
    console.error(`notify(${kind}): send failed`, err);
    return { ok: false, skipped: 'error' };
  }
}
