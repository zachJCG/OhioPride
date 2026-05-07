// =====================================================================
// Thin Resend API wrapper
// Docs: https://resend.com/docs/api-reference/emails/send-email
// =====================================================================

interface SendEmailArgs {
  from:           string;
  to:             string | string[];
  subject:        string;
  html:           string;
  text?:          string;
  reply_to?:      string;
  /** Pass an idempotency key to deduplicate retries. */
  idempotencyKey?: string;
  /** Tags surface in the Resend dashboard for filtering. */
  tags?:          { name: string; value: string }[];
}

interface SendResult {
  ok:    boolean;
  id?:   string;
  error?: string;
  status: number;
}

export async function sendEmail(
  apiKey: string,
  args: SendEmailArgs
): Promise<SendResult> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type":  "application/json",
  };
  if (args.idempotencyKey) {
    headers["Idempotency-Key"] = args.idempotencyKey;
  }

  const body: Record<string, unknown> = {
    from:    args.from,
    to:      Array.isArray(args.to) ? args.to : [args.to],
    subject: args.subject,
    html:    args.html,
  };
  if (args.text)     body.text     = args.text;
  if (args.reply_to) body.reply_to = args.reply_to;
  if (args.tags)     body.tags     = args.tags;

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: `network: ${(e as Error).message}`, status: 0 };
  }

  let data: { id?: string; message?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* ignore body parse errors */
  }

  if (!res.ok) {
    return {
      ok:     false,
      status: res.status,
      error:  data.message || `Resend returned ${res.status}`,
    };
  }
  return { ok: true, id: data.id, status: res.status };
}
