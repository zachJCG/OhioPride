import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/contact
 *
 * Replaces Netlify Forms + the submission-created.js notification webhook.
 * Accepts form-encoded or JSON, validates the basics, and emails the
 * submission to info@ohiopride.org via Resend (RESEND_API_KEY).
 *
 * Redirects to /contact?thanks=1 for plain form posts; returns JSON for
 * fetch() callers (Accept: application/json).
 */

const SUBJECT_LABELS: Record<string, string> = {
  general:               'General Inquiry',
  volunteering:          'Volunteering',
  'founding-membership': 'Founding Membership',
  legislative:           'Legislative Issues',
  endorsements:          'Endorsement Request',
  media:                 'Media / Press',
  donation:              'Donation Question',
  other:                 'Other',
};

const SUBJECT_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  'General Inquiry':      { bg: '#E8F0FE', text: '#1A73E8' },
  'Founding Membership':  { bg: '#F3E5F5', text: '#7B1FA2' },
  Volunteering:           { bg: '#E8F5E9', text: '#2E7D32' },
  'Media / Press':        { bg: '#FFF8E1', text: '#F57F17' },
  'Endorsement Request':  { bg: '#FCE4EC', text: '#C62828' },
  'Donation Question':    { bg: '#E0F7FA', text: '#00695C' },
  'Legislative Issues':   { bg: '#E3F2FD', text: '#1565C0' },
  Other:                  { bg: '#F5F5F5', text: '#616161' },
};

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmail(opts: {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  submittedAt: string;
}): string {
  const { name, email, phone, subject, message, submittedAt } = opts;
  const badge = SUBJECT_BADGE_COLORS[subject] || SUBJECT_BADGE_COLORS.Other;
  const firstName = name.split(' ')[0] || name;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;border-radius:12px 12px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td><span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;"><span style="color:#ffffff;">Ohio</span><span style="color:#E040FB;">Pride</span> <span style="color:rgba(255,255,255,0.6);font-weight:400;font-size:16px;">PAC</span></span></td>
            <td align="right"><span style="display:inline-block;background:${badge.bg};color:${badge.text};padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;letter-spacing:0.3px;">${htmlEscape(subject)}</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:40px;">
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#1a1a2e;">New Contact Form Submission</h1>
          <p style="margin:0 0 32px;font-size:14px;color:#8e8ea0;">${htmlEscape(submittedAt)} ET</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fc;border-radius:10px;margin-bottom:28px;"><tr><td style="padding:24px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:4px;">From</div>
            <div style="font-size:18px;font-weight:600;color:#1a1a2e;margin-bottom:16px;">${htmlEscape(name)}</div>
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td width="50%" style="padding-right:12px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:4px;">Email</div>
                <a href="mailto:${htmlEscape(email)}" style="font-size:14px;color:#E040FB;text-decoration:none;font-weight:500;">${htmlEscape(email)}</a>
              </td>
              <td width="50%" style="padding-left:12px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:4px;">Phone</div>
                <div style="font-size:14px;color:#1a1a2e;">${htmlEscape(phone)}</div>
              </td>
            </tr></table>
          </td></tr></table>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:8px;">Message</div>
          <div style="background-color:#fafafa;border-left:3px solid #E040FB;padding:20px;border-radius:0 8px 8px 0;margin-bottom:32px;">
            <p style="margin:0;font-size:15px;line-height:1.7;color:#2d2d3a;white-space:pre-wrap;">${htmlEscape(message)}</p>
          </div>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;"><tr>
            <td align="center" style="background:linear-gradient(135deg,#E040FB 0%,#7C4DFF 100%);border-radius:8px;">
              <a href="mailto:${htmlEscape(email)}?subject=Re: ${htmlEscape(subject)} — Ohio Pride PAC" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Reply to ${htmlEscape(firstName)}</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background-color:#f8f9fc;padding:24px 40px;border-radius:0 0 12px 12px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#8e8ea0;line-height:1.6;">
            Sent from the contact form on <a href="https://www.ohiopride.org" style="color:#E040FB;text-decoration:none;">ohiopride.org</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function readFields(req: NextRequest): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const body = (await req.json()) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) out[k] = v == null ? '' : String(v);
    return out;
  }
  const fd = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) out[k] = typeof v === 'string' ? v : '';
  return out;
}

export async function POST(req: NextRequest) {
  const fields = await readFields(req);

  const name    = (fields.fullName || fields.name || '').trim();
  const email   = (fields.email || '').trim();
  const phone   = (fields.phone || '').trim() || 'Not provided';
  const rawSubj = (fields.subject || '').trim();
  const subject = SUBJECT_LABELS[rawSubj] || rawSubj || 'General Inquiry';
  const message = (fields.message || '').trim();

  // Honeypot — Netlify Forms had `bot-field`. Keep the same trap so spam
  // bots filling every field still get rejected.
  if ((fields['bot-field'] || '').trim().length > 0) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!name || !email || !message) {
    return NextResponse.json(
      { ok: false, error: 'missing_required_fields' },
      { status: 400 },
    );
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Ohio Pride PAC <onboarding@resend.dev>';

  const acceptsJson = (req.headers.get('accept') || '').includes('application/json');

  if (!RESEND_API_KEY) {
    // Fail open: log and acknowledge so a missing env var does not look broken
    // to users. The submission is lost; reconfigure RESEND_API_KEY in Vercel.
    console.error('[contact] RESEND_API_KEY not set; submission discarded');
    return acceptsJson
      ? NextResponse.json({ ok: false, error: 'email_not_configured' }, { status: 503 })
      : NextResponse.redirect(new URL('/contact?error=email-not-configured', req.url), 303);
  }

  const submittedAt = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday:  'long',
    year:     'numeric',
    month:    'long',
    day:      'numeric',
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
  });

  const html = renderEmail({ name, email, phone, subject, message, submittedAt });

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
      html,
      reply_to: email,
    }),
  });

  if (!resp.ok) {
    const errorBody = await resp.text();
    console.error('[contact] Resend error', resp.status, errorBody.slice(0, 500));
    return acceptsJson
      ? NextResponse.json({ ok: false, error: 'send_failed' }, { status: 502 })
      : NextResponse.redirect(new URL('/contact?error=send-failed', req.url), 303);
  }

  return acceptsJson
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL('/contact?thanks=1', req.url), 303);
}
