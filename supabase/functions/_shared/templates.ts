// =====================================================================
// Email templates :: Ohio Pride PAC brand v1.1
// All templates return { subject, html, text }.
// HTML uses inline styles for maximum email client compatibility.
// Pride stripe is rendered as 6 solid color cells (universal support)
// rather than a CSS linear-gradient (Outlook drops it).
// =====================================================================

import type { EndorsementApplication } from "./types.ts";

// ---- Brand tokens ----
const NAVY    = "#0F2233";
const CYAN    = "#73D7EE";
const WHITE   = "#FFFFFF";
const PAPER   = "#F7F8FA";
const INK     = "#0F2233";
const INK_SOFT  = "#4A5C6E";
const INK_MUTE  = "#7A8896";
const SUCCESS_SOFT = "#E8F4EE";
const SUCCESS = "#1F7A4D";

const PRIDE = ["#E40303", "#FF8C00", "#FFED00", "#008026", "#004DFF", "#750787"];

const DISCLAIMER = "Paid for by Ohio Pride PAC. Zachary R. Joseph, Director.";
const DIRECTOR_NAME = "Zachary R. Joseph";
const DIRECTOR_TITLE = "Director, Ohio Pride PAC";
const REPLY_TO = "screening@ohiopride.org";

// ---- Helpers ----
export function htmlEscape(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  } catch {
    return "";
  }
}

function formatOffice(app: EndorsementApplication): string {
  const parts: string[] = [];
  if (app.office_sought) parts.push(app.office_sought);
  if (app.district) parts.push(app.district);
  if (app.election_year) parts.push(String(app.election_year));
  return parts.join(", ");
}

// ---- Layout fragments ----
function prideStripe(height = 8): string {
  const cells = PRIDE.map(c =>
    `<td style="background:${c};line-height:0;font-size:0;height:${height}px;">&nbsp;</td>`
  ).join("");
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;table-layout:fixed;">
      <tr>${cells}</tr>
    </table>
  `;
}

function header(eyebrow?: string): string {
  const eyebrowHtml = eyebrow
    ? `<td align="right" style="font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">${htmlEscape(eyebrow)}</td>`
    : `<td>&nbsp;</td>`;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${NAVY};">
      <tr>
        <td style="padding:20px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td align="left" style="font-family:Helvetica,Arial,sans-serif;line-height:1;">
                <span style="color:rgba(255,255,255,0.65);font-size:20px;font-weight:400;">Ohio</span><span style="color:${WHITE};font-size:20px;font-weight:700;">Pride</span>&nbsp;<span style="color:${CYAN};font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">P&nbsp;A&nbsp;C</span>
              </td>
              ${eyebrowHtml}
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function footer(): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${NAVY};">
      <tr>
        <td align="center" style="padding:20px 32px 16px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;color:${WHITE};font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">${DISCLAIMER}</p>
          <p style="margin:0;color:rgba(255,255,255,0.55);font-size:11px;">
            <a href="https://ohiopride.org" style="color:rgba(255,255,255,0.65);text-decoration:underline;">ohiopride.org</a>
          </p>
        </td>
      </tr>
    </table>
  `;
}

function shell(eyebrow: string | undefined, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>Ohio Pride PAC</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};font-family:Georgia,serif;color:${INK};-webkit-text-size-adjust:100%;">
  <span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Ohio Pride PAC notification.</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAPER};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${WHITE};border-radius:6px;overflow:hidden;box-shadow:0 1px 2px rgba(15,34,51,0.04),0 8px 24px rgba(15,34,51,0.06);">
          <tr><td style="line-height:0;font-size:0;">${prideStripe(10)}</td></tr>
          <tr><td>${header(eyebrow)}</td></tr>
          <tr><td>${content}</td></tr>
          <tr><td>${footer()}</td></tr>
          <tr><td style="line-height:0;font-size:0;">${prideStripe(7)}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---- Common style blocks ----
const eyebrowStyle = `font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;`;
const titleStyle   = `font-family:Helvetica,Arial,sans-serif;color:${INK};font-size:24px;font-weight:800;line-height:1.2;letter-spacing:-0.01em;margin:0 0 16px;`;
const bodyStyle    = `font-family:Georgia,serif;color:${INK_SOFT};font-size:15px;line-height:1.65;margin:0 0 14px;`;
const labelStyle   = `font-family:Helvetica,Arial,sans-serif;color:${INK_MUTE};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 4px;`;
const valueStyle   = `font-family:Georgia,serif;color:${INK};font-size:14px;line-height:1.5;margin:0 0 14px;`;
const buttonWrapStyle = `padding:24px 0 8px;`;
const buttonStyle  = `display:inline-block;background:${NAVY};color:${WHITE};font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;text-decoration:none;padding:14px 24px;border-radius:4px;`;
const sigStyle     = `font-family:Georgia,serif;color:${INK};font-size:14px;margin:24px 0 0;`;
const sigLineStyle = `font-family:Georgia,serif;color:${INK_SOFT};font-size:13px;font-style:italic;margin:2px 0 0;`;
const ruleStyle    = `border:0;border-top:1px solid #E8EBEF;margin:24px 0;`;

// =====================================================================
// 1. CANDIDATE CONFIRMATION (on new application)
// =====================================================================
export function candidateConfirmationEmail(app: EndorsementApplication) {
  const firstName = app.candidate_name.split(/\s+/)[0] || "there";
  const officeLine = formatOffice(app);
  const submittedDate = formatDate(app.created_at);

  const html = shell("Application Received", `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="padding:36px 32px 28px;">
          <p style="${eyebrowStyle}">Application Received</p>
          <h1 style="${titleStyle}">Thank you for applying.</h1>
          <p style="${bodyStyle}">Hi ${htmlEscape(firstName)},</p>
          <p style="${bodyStyle}">We received your endorsement application for <strong style="color:${INK};">${htmlEscape(officeLine)}</strong> on ${htmlEscape(submittedDate)}. Our Screening Committee will take it from here.</p>

          <hr style="${ruleStyle}" />

          <p style="${eyebrowStyle}">What Happens Next</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
            <tr><td valign="top" width="32" style="font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:14px;font-weight:800;padding:6px 0;">1</td>
                <td style="${bodyStyle}padding:6px 0;">The Screening Committee reviews your responses, typically within two to three weeks.</td></tr>
            <tr><td valign="top" width="32" style="font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:14px;font-weight:800;padding:6px 0;">2</td>
                <td style="${bodyStyle}padding:6px 0;">We may follow up by email if we have clarifying questions or want to schedule a brief candidate conversation.</td></tr>
            <tr><td valign="top" width="32" style="font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:14px;font-weight:800;padding:6px 0;">3</td>
                <td style="${bodyStyle}padding:6px 0;">The full Board votes on endorsements on a rolling basis. You will hear from us either way.</td></tr>
            <tr><td valign="top" width="32" style="font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:14px;font-weight:800;padding:6px 0;">4</td>
                <td style="${bodyStyle}padding:6px 0;">If endorsed, you will be featured on our public endorsements page and we will coordinate on rollout and announcement timing.</td></tr>
          </table>

          <p style="${bodyStyle}">Questions in the meantime? Just reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:${INK};text-decoration:underline;">${REPLY_TO}</a>.</p>

          <p style="${sigStyle}">In solidarity,</p>
          <p style="font-family:Helvetica,Arial,sans-serif;color:${INK};font-size:15px;font-weight:700;margin:6px 0 0;">${DIRECTOR_NAME}</p>
          <p style="${sigLineStyle}">${DIRECTOR_TITLE}</p>
        </td>
      </tr>
    </table>
  `);

  const text = [
    `Hi ${firstName},`,
    "",
    `We received your endorsement application for ${officeLine} on ${submittedDate}. Our Screening Committee will take it from here.`,
    "",
    "What happens next:",
    "1. The Screening Committee reviews your responses, typically within two to three weeks.",
    "2. We may follow up by email if we have clarifying questions or want to schedule a brief candidate conversation.",
    "3. The full Board votes on endorsements on a rolling basis. You will hear from us either way.",
    "4. If endorsed, you will be featured on our public endorsements page and we will coordinate on rollout and announcement timing.",
    "",
    `Questions? Reply to this email or write to ${REPLY_TO}.`,
    "",
    "In solidarity,",
    DIRECTOR_NAME,
    DIRECTOR_TITLE,
    "",
    "---",
    DISCLAIMER,
    "https://ohiopride.org",
  ].join("\n");

  return {
    subject: `We received your application | Ohio Pride PAC`,
    html,
    text,
  };
}

// =====================================================================
// 2. DIRECTOR ALERT (on new application)
// =====================================================================
export function directorAlertEmail(app: EndorsementApplication, adminUrl: string) {
  const officeLine = formatOffice(app);
  const submittedAt = new Date(app.created_at).toLocaleString("en-US", {
    dateStyle: "medium", timeStyle: "short",
  });

  const html = shell("New Application", `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="padding:36px 32px 28px;">
          <p style="${eyebrowStyle}">New Endorsement Application</p>
          <h1 style="${titleStyle}">${htmlEscape(app.candidate_name)}</h1>
          <p style="${bodyStyle}">A new candidate has submitted an endorsement application. Quick details below; full responses are in the admin dashboard.</p>

          <hr style="${ruleStyle}" />

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="50%" valign="top" style="padding-right:12px;">
                <p style="${labelStyle}">Office Sought</p>
                <p style="${valueStyle}">${htmlEscape(officeLine || "Not provided")}</p>
              </td>
              <td width="50%" valign="top" style="padding-left:12px;">
                <p style="${labelStyle}">Pronouns</p>
                <p style="${valueStyle}">${htmlEscape(app.pronouns || "Not provided")}</p>
              </td>
            </tr>
            <tr>
              <td width="50%" valign="top" style="padding-right:12px;">
                <p style="${labelStyle}">Email</p>
                <p style="${valueStyle}"><a href="mailto:${htmlEscape(app.email)}" style="color:${INK};text-decoration:underline;">${htmlEscape(app.email)}</a></p>
              </td>
              <td width="50%" valign="top" style="padding-left:12px;">
                <p style="${labelStyle}">Party</p>
                <p style="${valueStyle}">${htmlEscape(app.party || "Not provided")}</p>
              </td>
            </tr>
            <tr>
              <td colspan="2" valign="top">
                <p style="${labelStyle}">Submitted</p>
                <p style="${valueStyle}">${htmlEscape(submittedAt)}</p>
              </td>
            </tr>
          </table>

          <div style="${buttonWrapStyle}">
            <a href="${adminUrl}" style="${buttonStyle}">Open in Admin</a>
          </div>

          <p style="font-family:Georgia,serif;color:${INK_MUTE};font-size:12px;font-style:italic;margin:24px 0 0;">Sent automatically by the Ohio Pride PAC notification system.</p>
        </td>
      </tr>
    </table>
  `);

  const text = [
    `New Endorsement Application`,
    ``,
    `Candidate: ${app.candidate_name}${app.pronouns ? ` (${app.pronouns})` : ""}`,
    `Office: ${officeLine || "Not provided"}`,
    `Email: ${app.email}`,
    `Party: ${app.party || "Not provided"}`,
    `Submitted: ${submittedAt}`,
    ``,
    `Open in admin: ${adminUrl}`,
    ``,
    `Sent automatically by the Ohio Pride PAC notification system.`,
  ].join("\n");

  return {
    subject: `[New Application] ${app.candidate_name} for ${app.office_sought}`,
    html,
    text,
  };
}

// =====================================================================
// 3. ENDORSEMENT CONGRATULATIONS (on status -> endorsed)
// =====================================================================
export function endorsementCongratsEmail(app: EndorsementApplication) {
  const firstName = app.candidate_name.split(/\s+/)[0] || "there";
  const officeLine = formatOffice(app);

  const html = shell("Endorsed", `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td style="padding:36px 32px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
            <tr>
              <td style="background:${SUCCESS_SOFT};color:${SUCCESS};font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 14px;border-radius:999px;">
                &#10003; Endorsed
              </td>
            </tr>
          </table>

          <h1 style="${titleStyle}">Congratulations, ${htmlEscape(firstName)}.</h1>
          <p style="${bodyStyle}">Ohio Pride PAC has officially endorsed your campaign for <strong style="color:${INK};">${htmlEscape(officeLine)}</strong>. We are proud to stand with you and to amplify the work you are doing for LGBTQ+ Ohioans.</p>

          <hr style="${ruleStyle}" />

          <p style="${eyebrowStyle}">What Happens From Here</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
            <tr><td valign="top" width="32" style="font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:14px;font-weight:800;padding:6px 0;">1</td>
                <td style="${bodyStyle}padding:6px 0;">Your endorsement is now live on <a href="https://ohiopride.org/endorsements" style="color:${INK};text-decoration:underline;">ohiopride.org/endorsements</a>. You can share that link in your campaign materials and social media.</td></tr>
            <tr><td valign="top" width="32" style="font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:14px;font-weight:800;padding:6px 0;">2</td>
                <td style="${bodyStyle}padding:6px 0;">Within the next week, we will coordinate with you on a public announcement, including social rollout timing and any quotes or photos you'd like featured.</td></tr>
            <tr><td valign="top" width="32" style="font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:14px;font-weight:800;padding:6px 0;">3</td>
                <td style="${bodyStyle}padding:6px 0;">Your campaign is invited to our regular endorsement coordination calls (monthly during election cycles), and you have a direct line to us for any rapid response needs.</td></tr>
            <tr><td valign="top" width="32" style="font-family:Helvetica,Arial,sans-serif;color:${CYAN};font-size:14px;font-weight:800;padding:6px 0;">4</td>
                <td style="${bodyStyle}padding:6px 0;">If you would like Ohio Pride PAC's logo or talking points for your materials, just reply to this email.</td></tr>
          </table>

          <p style="${bodyStyle}">Thank you for the work you are doing for Ohio. We are with you the whole way.</p>

          <p style="${sigStyle}">In solidarity,</p>
          <p style="font-family:Helvetica,Arial,sans-serif;color:${INK};font-size:15px;font-weight:700;margin:6px 0 0;">${DIRECTOR_NAME}</p>
          <p style="${sigLineStyle}">${DIRECTOR_TITLE}</p>
        </td>
      </tr>
    </table>
  `);

  const text = [
    `Congratulations, ${firstName}.`,
    "",
    `Ohio Pride PAC has officially endorsed your campaign for ${officeLine}. We are proud to stand with you and to amplify the work you are doing for LGBTQ+ Ohioans.`,
    "",
    "What happens from here:",
    "1. Your endorsement is now live on https://ohiopride.org/endorsements. You can share that link in your campaign materials and social media.",
    "2. Within the next week, we will coordinate with you on a public announcement, including social rollout timing and any quotes or photos you'd like featured.",
    "3. Your campaign is invited to our regular endorsement coordination calls (monthly during election cycles), and you have a direct line to us for any rapid response needs.",
    "4. If you would like Ohio Pride PAC's logo or talking points for your materials, just reply to this email.",
    "",
    "Thank you for the work you are doing for Ohio. We are with you the whole way.",
    "",
    "In solidarity,",
    DIRECTOR_NAME,
    DIRECTOR_TITLE,
    "",
    "---",
    DISCLAIMER,
    "https://ohiopride.org",
  ].join("\n");

  return {
    subject: `Endorsed by Ohio Pride PAC: Welcome to the team`,
    html,
    text,
  };
}
