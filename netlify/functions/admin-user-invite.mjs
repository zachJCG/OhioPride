/* =============================================================================
 * Netlify Function: admin-user-invite
 * -----------------------------------------------------------------------------
 * Provisions a Supabase Auth account for a teammate that an authorized admin
 * has just added in /admin/users. The admin_users row is already written by
 * the client (RLS gates that to has_permission('users','manage_users')); this
 * function only handles the auth side, which needs the service-role key.
 *
 * AUTH:
 *   Caller passes `Authorization: Bearer <supabase access token>`. We verify
 *   the caller is an admin and has `users:manage_users` before doing anything.
 *
 * REQUEST:
 *   POST /.netlify/functions/admin-user-invite
 *   { "email": "person@ohiopride.org", "full_name": "Optional Name" }
 *
 * RESPONSE:
 *   { ok: true, invite_sent: true,  user_id: "...auth-uuid..." }
 *   { ok: true, invite_sent: false, note: "service_role_unconfigured" }  // soft-fail
 *
 * NOTES:
 *   - This is a soft-fail design: if SUPABASE_SERVICE_ROLE_KEY isn't set, we
 *     still return ok:true so the admin_users row write feels successful. The
 *     client surfaces a warning to the admin in that case.
 *   - We use inviteUserByEmail, which sends a magic link the user clicks to
 *     set their own password. No password ever flows through this function.
 * ============================================================================= */

import { createClient } from '@supabase/supabase-js';

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

function adminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export default async (req, _ctx) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer (.+)$/i);
  if (!m) return json(401, { ok: false, error: 'missing_bearer' });
  const jwt = m[1];

  let body;
  try { body = await req.json(); }
  catch { return json(400, { ok: false, error: 'invalid_json' }); }

  const email = String(body && body.email || '').trim().toLowerCase();
  const fullName = body && body.full_name ? String(body.full_name).trim() : null;
  if (!email) return json(400, { ok: false, error: 'missing_email' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(400, { ok: false, error: 'invalid_email' });
  }

  // 1) Verify the caller can manage users.
  const userSb = userClient(jwt);
  if (!userSb) return json(500, { ok: false, error: 'server_misconfigured' });

  const { data: allowed, error: permErr } = await userSb.rpc('has_permission', {
    p_module: 'users',
    p_action: 'manage_users',
  });
  if (permErr) {
    console.error('has_permission rpc failed:', permErr);
    return json(500, { ok: false, error: 'permission_check_failed' });
  }
  if (!allowed) return json(403, { ok: false, error: 'not_authorized' });

  // 2) Try to send the auth invite. If service-role isn't wired up, soft-fail
  //    so the admin_users row the client wrote stays useful as an assignment
  //    target — the human just has to be invited manually later.
  const adminSb = adminClient();
  if (!adminSb) {
    return json(200, {
      ok: true,
      invite_sent: false,
      note: 'service_role_unconfigured',
    });
  }

  // Use the magic-link invite. If the user already exists, this returns
  // user_already_exists; treat that as a no-op success.
  const redirectTo = (process.env.URL || process.env.DEPLOY_URL || '') + '/admin/login';
  const { data: invited, error: inviteErr } = await adminSb.auth.admin.inviteUserByEmail(
    email,
    {
      data: fullName ? { full_name: fullName } : undefined,
      redirectTo: redirectTo || undefined,
    }
  );

  if (inviteErr) {
    const msg = (inviteErr.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('exists')) {
      return json(200, { ok: true, invite_sent: false, note: 'user_already_exists' });
    }
    console.error('invite failed:', inviteErr);
    return json(500, { ok: false, error: 'invite_failed', detail: inviteErr.message });
  }

  return json(200, {
    ok: true,
    invite_sent: true,
    user_id: invited && invited.user ? invited.user.id : null,
  });
};

export const config = { path: '/.netlify/functions/admin-user-invite' };
