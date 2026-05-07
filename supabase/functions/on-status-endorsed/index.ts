// =====================================================================
// Edge Function :: on-status-endorsed
//
// Triggered by: Postgres AFTER UPDATE trigger on
//   public.endorsement_applications via pg_net.http_post,
//   only when status transitions TO 'endorsed'.
//
// Sends one email:
//   1. Congratulations to the candidate
//
// Auto-publish note:
//   The public /endorsements page reads live from the
//   public_endorsements view. As soon as status flips to 'endorsed',
//   the candidate appears on the public page on next page load.
//   No build hook or cache invalidation is needed for the current
//   architecture. If we add CDN caching later, this is the place to
//   trigger a purge.
//
// Required env vars (same as on-new-application):
//   RESEND_API_KEY
//   WEBHOOK_SECRET
//   FROM_EMAIL
// =====================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sendEmail } from "../_shared/resend.ts";
import { endorsementCongratsEmail } from "../_shared/templates.ts";
import type { WebhookPayload } from "../_shared/types.ts";

const env = {
  RESEND_API_KEY: Deno.env.get("RESEND_API_KEY") ?? "",
  WEBHOOK_SECRET: Deno.env.get("WEBHOOK_SECRET") ?? "",
  FROM_EMAIL:     Deno.env.get("FROM_EMAIL")     ?? "Ohio Pride PAC <screening@ohiopride.org>",
};

const REPLY_TO = "screening@ohiopride.org";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // ---- Authenticate the webhook ----
  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${env.WEBHOOK_SECRET}`;
  if (!env.WEBHOOK_SECRET || auth !== expected) {
    return json(401, { error: "Unauthorized" });
  }

  // ---- Parse payload ----
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const app = payload?.record;
  if (!app || !app.id || !app.email || !app.candidate_name) {
    return json(400, { error: "Missing required application fields" });
  }

  // Defense in depth: even if the trigger fires us, we double-check
  // the transition. Skip if status isn't 'endorsed' or if it was
  // already endorsed before.
  if (app.status !== "endorsed") {
    return json(200, { ok: true, skipped: "status_not_endorsed" });
  }
  if (payload.old_record && payload.old_record.status === "endorsed") {
    return json(200, { ok: true, skipped: "already_endorsed" });
  }

  if (!env.RESEND_API_KEY) {
    return json(500, { error: "RESEND_API_KEY not configured" });
  }

  // ---- Send congratulations ----
  const email = endorsementCongratsEmail(app);
  const result = await sendEmail(env.RESEND_API_KEY, {
    from:           env.FROM_EMAIL,
    to:             app.email,
    subject:        email.subject,
    html:           email.html,
    text:           email.text,
    reply_to:       REPLY_TO,
    idempotencyKey: `${app.id}_endorsed`,
    tags: [
      { name: "type",           value: "endorsement_congrats" },
      { name: "application_id", value: app.id },
    ],
  });

  return json(200, {
    ok:              result.ok,
    application_id:  app.id,
    candidate_email: result.ok
      ? { ok: true, id: result.id }
      : { ok: false, error: result.error, status: result.status },
    auto_publish:    "implicit (public page reads live from public_endorsements view)",
  });
});
