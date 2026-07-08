/* =============================================================================
 * Shared contact-form core (server-side only)
 * -----------------------------------------------------------------------------
 * Transport-neutral handler behind /api/contact-submit. Lives in _lib so the
 * Vercel function (api/contact-submit.mjs) and the temporary Netlify twin
 * (netlify/functions/contact-submit.mjs, kept until Netlify is
 * decommissioned) run byte-identical logic during the cutover window.
 *
 * Replaces Netlify Forms + submission-created.js for the three public forms:
 *   contact.html ("contact"), connect.html ("connect"),
 *   launch-day.html ("launch-day-rsvp").
 *
 * Does both jobs the Netlify plumbing did — and one it couldn't:
 *   1. Persists the submission to public.contact_submissions (service role),
 *      so every contact request is a queryable record the admin can see.
 *   2. Sends the notification email to info@ohiopride.org via Resend, reusing
 *      the HTML template from the old submission-created.js. Email is
 *      best-effort: a Resend hiccup never loses the submission.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_FORMS = new Set(['contact', 'connect', 'launch-day-rsvp']);

// contact.html submits slugs; connect.html submits its own slugs; the email
// template and admin view want human labels. Unknown values pass through.
const SUBJECT_LABELS = {
  'general':             'General Inquiry',
  'volunteering':        'Volunteering',
  'volunteer':           'Volunteering',
  'founding-membership': 'Founding Membership',
  'legislative':         'Legislative Issues',
  'endorsements':        'Endorsement Request',
  'endorsement':         'Endorsement Request',
  'media':               'Media / Press',
  'press':               'Media / Press',
  'candidate':           'Candidate Inquiry',
  'partnership':         'Partnership / Coalition',
};

function clean(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return max && s.length > max ? s.slice(0, max) : s;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Subject line badge based on topic — carried over from submission-created.js.
const SUBJECT_BADGE_COLORS = {
  'General Inquiry':      { bg: '#E8F0FE', text: '#1A73E8' },
  'Founding Membership':  { bg: '#F3E5F5', text: '#7B1FA2' },
  'Volunteering':         { bg: '#E8F5E9', text: '#2E7D32' },
  'Media / Press':        { bg: '#FFF8E1', text: '#F57F17' },
  'Endorsement Request':  { bg: '#FCE4EC', text: '#C62828' },
  'Legislative Issues':   { bg: '#E0F7FA', text: '#00695C' },
  'Candidate Inquiry':    { bg: '#E8F0FE', text: '#1A73E8' },
  'Partnership / Coalition': { bg: '#FFF3E0', text: '#E65100' },
  'Launch Day RSVP':      { bg: '#F3E5F5', text: '#7B1FA2' },
  'Other':                { bg: '#F5F5F5', text: '#616161' },
};

function buildEmailHtml({ name, email, phone, subject, message, submittedAt }) {
  const badge = SUBJECT_BADGE_COLORS[subject] || SUBJECT_BADGE_COLORS['Other'];
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone || 'Not provided');
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message || 'No message provided');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;border-radius:12px 12px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">
                      <span style="color:#ffffff;">Ohio</span><span style="color:#E040FB;">Pride</span> <span style="color:rgba(255,255,255,0.6);font-weight:400;font-size:16px;">PAC</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;background:${badge.bg};color:${badge.text};padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;letter-spacing:0.3px;">
                      ${safeSubject}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px;">

              <!-- Title -->
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a2e;">
                New Contact Form Submission
              </h1>
              <p style="margin:0 0 32px;font-size:14px;color:#8e8ea0;">
                ${escapeHtml(submittedAt)} ET
              </p>

              <!-- Contact Info Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fc;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:16px;">
                          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:4px;">From</div>
                          <div style="font-size:18px;font-weight:600;color:#1a1a2e;">${safeName}</div>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td width="50%" style="padding-right:12px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:4px;">Email</div>
                                <a href="mailto:${safeEmail}" style="font-size:14px;color:#E040FB;text-decoration:none;font-weight:500;">${safeEmail}</a>
                              </td>
                              <td width="50%" style="padding-left:12px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:4px;">Phone</div>
                                <div style="font-size:14px;color:#1a1a2e;">${safePhone}</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:8px;">Message</div>
              <div style="background-color:#fafafa;border-left:3px solid #E040FB;padding:20px;border-radius:0 8px 8px 0;margin-bottom:32px;">
                <p style="margin:0;font-size:15px;line-height:1.7;color:#2d2d3a;white-space:pre-wrap;">${safeMessage}</p>
              </div>

              <!-- Reply Button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td align="center" style="background:linear-gradient(135deg,#E040FB 0%,#7C4DFF 100%);border-radius:8px;">
                    <a href="mailto:${safeEmail}?subject=Re: ${safeSubject} — Ohio Pride PAC" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">
                      Reply to ${escapeHtml(String(name).split(' ')[0])}
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fc;padding:24px 40px;border-radius:0 0 12px 12px;border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#8e8ea0;line-height:1.6;">
                This notification was sent from a form on <a href="https://ohiopride.org" style="color:#E040FB;text-decoration:none;">ohiopride.org</a>.
                Submissions are also stored in Supabase (contact_submissions).
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Process one contact-form submission.
 *
 * @param {object} body     parsed JSON request body (may be null)
 * @param {object} meta     { referer, userAgent, ip }
 * @returns {{ status: number, body: object }}
 */
export async function processContactSubmission(body, meta = {}) {
  if (!body || typeof body !== 'object') {
    return { status: 400, body: { ok: false, error: 'invalid_json' } };
  }

  // Honeypot — 'company' (new forms), 'website' and 'bot-field' (legacy
  // field names). Bots fill hidden fields; pretend success, write nothing.
  for (const trap of ['company', 'website', 'bot-field']) {
    if (typeof body[trap] === 'string' && body[trap].trim() !== '') {
      return { status: 200, body: { ok: true, id: null, kind: 'honeypot' } };
    }
  }

  const form_name = ALLOWED_FORMS.has(body.form_name) ? body.form_name : 'contact';
  const isRsvp = form_name === 'launch-day-rsvp';

  // Name arrives as `fullName`/`name` (contact) or first_name + last_name
  // (connect, launch-day).
  const name = clean(body.name, 200)
    || clean(body.fullName, 200)
    || [clean(body.first_name, 100), clean(body.last_name, 100)].filter(Boolean).join(' ')
    || null;
  const email = clean(body.email, 320)?.toLowerCase() || null;
  const phone = clean(body.phone, 40);
  const organization = clean(body.organization, 200);
  const message = clean(body.message, 5000);

  if (!email || !EMAIL_RE.test(email)) {
    return { status: 400, body: { ok: false, error: 'valid_email_required' } };
  }
  if (!name) {
    return { status: 400, body: { ok: false, error: 'name_required' } };
  }
  // The RSVP form has no message field; the two contact forms require one.
  if (!isRsvp && !message) {
    return { status: 400, body: { ok: false, error: 'message_required' } };
  }

  const rawSubject = clean(body.subject, 120);
  const subject = isRsvp
    ? 'Launch Day RSVP'
    : (SUBJECT_LABELS[rawSubject?.toLowerCase()] || rawSubject || 'General Inquiry');

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('contact-submit: missing supabase env');
    return { status: 500, body: { ok: false, error: 'server_misconfigured' } };
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Anything form-specific beyond the fixed columns (e.g. RSVP title) rides
  // along in the payload jsonb so no field is ever silently dropped.
  const KNOWN = new Set([
    'form_name', 'name', 'fullName', 'first_name', 'last_name', 'email',
    'phone', 'subject', 'message', 'organization',
    'company', 'website', 'bot-field', 'form-name',
  ]);
  const extras = {};
  for (const [k, v] of Object.entries(body)) {
    if (!KNOWN.has(k) && v != null && v !== '') extras[k] = v;
  }

  // 1) Persist to our own database — the CRM upgrade over Netlify's inbox.
  const { data, error } = await supabase
    .from('contact_submissions')
    .insert({
      form_name,
      name,
      email,
      phone,
      subject,
      message,
      organization,
      payload: Object.keys(extras).length ? extras : null,
      source_page: clean(meta.referer, 500),
      submission_ip: meta.ip || null,
      user_agent: clean(meta.userAgent, 500),
    })
    .select('id')
    .single();

  if (error) {
    console.error('contact-submit insert failed:', error);
    return { status: 500, body: { ok: false, error: 'db_write_failed', message: error.message } };
  }

  // 2) Notify via Resend (best-effort — the submission is already saved).
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY) {
    const submittedAt = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const fromAddress =
      process.env.RESEND_FROM_EMAIL || 'Ohio Pride PAC <onboarding@resend.dev>';
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: ['info@ohiopride.org'],
          subject: `[Ohio Pride PAC] ${subject} — ${name}`,
          html: buildEmailHtml({ name, email, phone, subject, message, submittedAt }),
          reply_to: email,
        }),
      });
      if (!resp.ok) {
        console.error('contact-submit Resend error:', resp.status, await resp.text());
      }
    } catch (err) {
      console.error('contact-submit Resend send failed:', err);
    }
  } else {
    console.error('contact-submit: RESEND_API_KEY not set — skipping notification email');
  }

  return { status: 200, body: { ok: true, id: data?.id || null } };
}
