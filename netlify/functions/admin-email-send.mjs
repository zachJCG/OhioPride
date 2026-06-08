/* =============================================================================
 * Netlify Function: admin-email-send
 * -----------------------------------------------------------------------------
 * Powers the /admin/email composer. Lets a comms-permitted admin send a one-off
 * email blast to one or more MailerLite groups.
 *
 * AUTH:
 *   Caller passes `Authorization: Bearer <supabase access token>`. We verify
 *   has_permission('news','write') before touching MailerLite. (The "news"
 *   module is the comms/outbound module in the role matrix.)
 *
 * REQUEST:
 *   GET  /.netlify/functions/admin-email-send
 *        -> { ok, configured, default_from, default_from_name, groups, campaigns }
 *
 *   POST /.netlify/functions/admin-email-send
 *        { subject, html, group_ids: [..], from?, from_name?, reply_to? }
 *        -> { ok, campaign_id }
 *
 * The MailerLite API key lives only in MAILERLITE_API_KEY (server env).
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';
import {
  isConfigured, listGroups, listCampaigns, sendCampaign,
} from './lib/mailerlite.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function userClient(jwt) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireCommsAdmin(req) {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer (.+)$/i);
  if (!m) return { error: json(401, { ok: false, error: 'missing_bearer' }) };

  const sb = userClient(m[1]);
  if (!sb) return { error: json(500, { ok: false, error: 'server_misconfigured' }) };

  const { data: allowed, error } = await sb.rpc('has_permission', {
    p_module: 'news',
    p_action: 'write',
  });
  if (error) {
    console.error('admin-email-send permission check failed:', error);
    return { error: json(500, { ok: false, error: 'permission_check_failed' }) };
  }
  if (!allowed) return { error: json(403, { ok: false, error: 'not_authorized' }) };
  return { sb };
}

export default async (req) => {
  const gate = await requireCommsAdmin(req);
  if (gate.error) return gate.error;

  const defaultFrom     = process.env.MAILERLITE_FROM_EMAIL || '';
  const defaultFromName = process.env.MAILERLITE_FROM_NAME  || 'Ohio Pride PAC';

  // ---------------------------------------------------------------------------
  // GET — surface what the composer needs.
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    if (!isConfigured()) {
      return json(200, {
        ok: true, configured: false,
        default_from: defaultFrom, default_from_name: defaultFromName,
        groups: [], campaigns: [],
      });
    }
    try {
      const [groupsRes, campaignsRes] = await Promise.all([
        listGroups({ limit: 100 }),
        listCampaigns({ limit: 10 }).catch(() => ({ data: [] })),
      ]);
      const groups = (groupsRes?.data || []).map((g) => ({
        id: g.id,
        name: g.name,
        active_count: g.active_count ?? null,
      }));
      const campaigns = (campaignsRes?.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        subject: c.emails?.[0]?.subject || null,
        scheduled_for: c.scheduled_for || null,
        created_at: c.created_at || null,
      }));
      return json(200, {
        ok: true, configured: true,
        default_from: defaultFrom, default_from_name: defaultFromName,
        groups, campaigns,
      });
    } catch (err) {
      console.error('admin-email-send GET failed:', err.status || '', err.message, err.body || '');
      return json(502, { ok: false, error: 'mailerlite_error', detail: err.message });
    }
  }

  // ---------------------------------------------------------------------------
  // POST — create + instant-send a campaign.
  // ---------------------------------------------------------------------------
  if (req.method === 'POST') {
    if (!isConfigured()) {
      return json(503, { ok: false, error: 'mailerlite_unconfigured' });
    }

    let body;
    try { body = await req.json(); }
    catch { return json(400, { ok: false, error: 'invalid_json' }); }

    const subject = String(body.subject || '').trim();
    const html    = String(body.html || '').trim();
    const fromName = String(body.from_name || defaultFromName || '').trim();
    const from    = String(body.from || defaultFrom || '').trim().toLowerCase();
    const replyTo = body.reply_to ? String(body.reply_to).trim().toLowerCase() : null;
    const groupIds = Array.isArray(body.group_ids)
      ? body.group_ids.map((g) => String(g)).filter(Boolean)
      : [];

    if (!subject) return json(400, { ok: false, error: 'subject_required' });
    if (!html)    return json(400, { ok: false, error: 'content_required' });
    if (!groupIds.length) return json(400, { ok: false, error: 'group_required' });
    if (!from || !EMAIL_RE.test(from)) {
      return json(400, { ok: false, error: 'valid_from_required',
        detail: 'Set MAILERLITE_FROM_EMAIL to a verified sender, or pass a valid "from".' });
    }
    if (replyTo && !EMAIL_RE.test(replyTo)) {
      return json(400, { ok: false, error: 'invalid_reply_to' });
    }

    const campaignName = `Admin blast — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

    try {
      const { campaign } = await sendCampaign({
        name: campaignName,
        subject, fromName, from, replyTo, html,
        groups: groupIds,
      });
      return json(200, { ok: true, campaign_id: campaign?.id || null });
    } catch (err) {
      console.error('admin-email-send POST failed:', err.status || '', err.message, err.body || '');
      // Surface MailerLite's validation message (e.g. unverified sender) so the
      // admin can fix it — never contains the API key.
      return json(502, {
        ok: false, error: 'send_failed',
        detail: err.body?.message || err.message,
        errors: err.body?.errors || null,
      });
    }
  }

  return json(405, { ok: false, error: 'method_not_allowed' });
};

export const config = { path: '/.netlify/functions/admin-email-send' };
