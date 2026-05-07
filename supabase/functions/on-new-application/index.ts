// =====================================================================
// Edge Function :: on-new-application
//
// Triggered by: Postgres AFTER INSERT trigger on
//   public.endorsement_applications via pg_net.http_post
//
// Sends two emails:
//   1. Confirmation to the candidate
//   2. Alert to the Director
//
// Required env vars (Supabase Edge Function secrets):
//   RESEND_API_KEY          (re_...)
//   WEBHOOK_SECRET          (matches the value stored in Vault)
//   FROM_EMAIL              (e.g. "Ohio Pride PAC <screening@ohiopride.org>")
//   ADMIN_EMAIL             (zach@ohiopride.org)
//   ADMIN_DETAIL_BASE_URL   (https://ohiopride.org/admin/endorsements/detail)
// =====================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sendEmail } from "../_shared/resend.ts";
import {
  candidateConfirmationEmail,
  directorAlertEmail,
} from "../_shared/templates.ts";
import type { WebhookPayload } from "../_shared/types.ts";

const env = {
  RESEND_API_KEY:        Deno.env.get("RESEND_API_KEY")        ?? "",
  WEBHOOK_SECRET:        Deno.env.get("WEBHOOK_SECRET")        ?? "",
  FROM_EMAIL:            Deno.env.get("FROM_EMAIL")            ?? "Ohio Pride PAC <screening@ohiopride.org>",
  ADMIN_EMAIL:           Deno.env.get("ADMIN_EMAIL")           ?? "zach@ohiopride.org",
  ADMIN_DETAIL_BASE_URL: Deno.env.get("ADMIN_DETAIL_BASE_URL") ?? "https://ohiopride.org/admin/endorsements/detail",
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

  // Server-side env sanity check
  if (!env.RESEND_API_KEY) {
    return json(500, { error: "RESEND_API_KEY not configured" });
  }

  const adminUrl = `${env.ADMIN_DETAIL_BASE_URL}?id=${encodeURIComponent(app.id)}`;

  // ---- 1. Candidate confirmation ----
  const candEmail = candidateConfirmationEmail(app);
  const candResult = await sendEmail(env.RESEND_API_KEY, {
    from:           env.FROM_EMAIL,
    to:             app.email,
    subject:        candEmail.subject,
    html:           candEmail.html,
    text:           candEmail.text,
    reply_to:       REPLY_TO,
    idempotencyKey: `${app.id}_candidate_confirm`,
    tags: [
      { name: "type",           value: "candidate_confirmation" },
      { name: "application_id", value: app.id },
    ],
  });

  // ---- 2. Director alert ----
  const adminEmail = directorAlertEmail(app, adminUrl);
  const adminResult = await sendEmail(env.RESEND_API_KEY, {
    from:           env.FROM_EMAIL,
    to:             env.ADMIN_EMAIL,
    subject:        adminEmail.subject,
    html:           adminEmail.html,
    text:           adminEmail.text,
    reply_to:       app.email, // Director can reply directly to candidate
    idempotencyKey: `${app.id}_admin_alert`,
    tags: [
      { name: "type",           value: "director_alert" },
      { name: "application_id", value: app.id },
    ],
  });

  // ---- Respond ----
  // Even if one fails, return 200 so Postgres doesn't retry the whole
  // trigger (which would cause duplicate sends on the side that worked).
  // Idempotency keys protect us anyway, but we want clean logs.
  return json(200, {
    ok:               candResult.ok && adminResult.ok,
    application_id:   app.id,
    candidate_email:  candResult.ok
      ? { ok: true, id: candResult.id }
      : { ok: false, error: candResult.error, status: candResult.status },
    director_alert:   adminResult.ok
      ? { ok: true, id: adminResult.id }
      : { ok: false, error: adminResult.error, status: adminResult.status },
  });
});
