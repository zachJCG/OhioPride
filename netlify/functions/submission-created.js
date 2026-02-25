// Ohio Pride PAC — Form Submission Email Notification
// Triggered automatically by Netlify when a form submission is created

exports.handler = async function (event) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set");
    return { statusCode: 500, body: "Missing email configuration" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body).payload;
  } catch (e) {
    console.error("Failed to parse event body:", e);
    return { statusCode: 400, body: "Invalid payload" };
  }

  const formName = payload.form_name || "Unknown Form";
  const data = payload.data || {};
  const submittedAt = payload.created_at
    ? new Date(payload.created_at).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : new Date().toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

  const name = data.name || "Not provided";
  const email = data.email || "Not provided";
  const phone = data.phone || "Not provided";
  const subject = data.subject || "General Inquiry";
  const message = data.message || "No message provided";

  // Subject line badge based on topic
  const subjectBadgeColors = {
    "General Inquiry": { bg: "#E8F0FE", text: "#1A73E8" },
    "Gala Sponsorship": { bg: "#FFF3E0", text: "#E65100" },
    "Founding Membership": { bg: "#F3E5F5", text: "#7B1FA2" },
    Volunteering: { bg: "#E8F5E9", text: "#2E7D32" },
    "Media / Press": { bg: "#FFF8E1", text: "#F57F17" },
    "Endorsement Request": { bg: "#FCE4EC", text: "#C62828" },
    "Donation Question": { bg: "#E0F7FA", text: "#00695C" },
    Other: { bg: "#F5F5F5", text: "#616161" },
  };

  const badge = subjectBadgeColors[subject] || subjectBadgeColors["Other"];

  // Use verified domain or Resend onboarding domain as fallback
  const fromAddress = process.env.RESEND_FROM_EMAIL || "Ohio Pride PAC <onboarding@resend.dev>";

  const htmlEmail = `
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
                      ${subject}
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
                ${submittedAt} ET
              </p>

              <!-- Contact Info Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fc;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:16px;">
                          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:4px;">From</div>
                          <div style="font-size:18px;font-weight:600;color:#1a1a2e;">${name}</div>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td width="50%" style="padding-right:12px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:4px;">Email</div>
                                <a href="mailto:${email}" style="font-size:14px;color:#E040FB;text-decoration:none;font-weight:500;">${email}</a>
                              </td>
                              <td width="50%" style="padding-left:12px;">
                                <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8e8ea0;font-weight:600;margin-bottom:4px;">Phone</div>
                                <div style="font-size:14px;color:#1a1a2e;">${phone}</div>
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
                <p style="margin:0;font-size:15px;line-height:1.7;color:#2d2d3a;white-space:pre-wrap;">${message}</p>
              </div>

              <!-- Reply Button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td align="center" style="background:linear-gradient(135deg,#E040FB 0%,#7C4DFF 100%);border-radius:8px;">
                    <a href="mailto:${email}?subject=Re: ${subject} — Ohio Pride PAC" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">
                      Reply to ${name.split(" ")[0]}
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
                This notification was sent from the contact form on <a href="https://ohiopride.org" style="color:#E040FB;text-decoration:none;">ohiopride.org</a>.
                You can also view all submissions in the <a href="https://app.netlify.com/projects/ohiopride/forms" style="color:#E040FB;text-decoration:none;">Netlify dashboard</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: ["info@ohiopride.org"],
        subject: `[Ohio Pride PAC] ${subject} — ${name}`,
        html: htmlEmail,
        reply_to: email,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", JSON.stringify(result));
      return { statusCode: response.status, body: JSON.stringify(result) };
    }

    console.log("Email sent successfully:", result.id);
    return { statusCode: 200, body: JSON.stringify({ success: true, id: result.id }) };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
