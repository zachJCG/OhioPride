/* =============================================================================
 * Netlify Function: admin-user-manage
 * -----------------------------------------------------------------------------
 * Service-role bridge for the /admin/users module. Lets a super-admin do the
 * things that need privileged auth APIs:
 *
 *   action: 'invite'              — send a magic-link invite (Supabase Auth)
 *   action: 'update_email'        — change a user's sign-in email atomically
 *                                   (auth.users + public.admin_users)
 *   action: 'set_password'        — set or reset a user's password directly
 *                                   (creates the auth user if missing)
 *   action: 'send_password_reset' — generate a password-reset link and email
 *                                   it via the configured SMTP
 *
 * AUTH:
 *   Caller passes `Authorization: Bearer <supabase access token>`. We verify
 *   the caller has has_permission('users','manage_users') before doing
 *   anything privileged.
 *
 * REQUEST:
 *   POST /.netlify/functions/admin-user-manage
 *   { "action": "...", "email": "...", ...action-specific fields }
 *
 * RESPONSE:
 *   { ok: true, ...action-specific fields }
 *   { ok: false, error: "<code>", detail?: "..." }
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

// Look up an auth user by email. Supabase JS doesn't expose a filter, so we
// page through with a generous page size. Returns null when not found.
async function findAuthUserByEmail(adminSb, email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await adminSb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = (data.users || []).find(u => (u.email || '').toLowerCase() === target);
    if (found) return found;
    if (!data.users || data.users.length < 200) return null;
  }
  return null;
}

function validEmail(s) {
  return typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer (.+)$/i);
  if (!m) return json(401, { ok: false, error: 'missing_bearer' });
  const jwt = m[1];

  let body;
  try { body = await req.json(); }
  catch { return json(400, { ok: false, error: 'invalid_json' }); }

  const action = String((body && body.action) || '').trim();
  const email  = String((body && body.email)  || '').trim().toLowerCase();
  if (!validEmail(email)) return json(400, { ok: false, error: 'invalid_email' });

  // Caller permission check.
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

  const adminSb = adminClient();
  if (!adminSb) {
    return json(503, { ok: false, error: 'service_role_unconfigured' });
  }

  try {
    if (action === 'invite') {
      const fullName = body.full_name ? String(body.full_name).trim() : null;
      const redirectTo = (process.env.PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '') || '') + '/admin/login';
      const { data, error } = await adminSb.auth.admin.inviteUserByEmail(email, {
        data: fullName ? { full_name: fullName } : undefined,
        redirectTo: redirectTo || undefined,
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('already') || msg.includes('exists')) {
          return json(200, { ok: true, invite_sent: false, note: 'user_already_exists' });
        }
        throw error;
      }
      return json(200, { ok: true, invite_sent: true, user_id: data && data.user ? data.user.id : null });
    }

    if (action === 'update_email') {
      const newEmail = String((body && body.new_email) || '').trim().toLowerCase();
      if (!validEmail(newEmail)) return json(400, { ok: false, error: 'invalid_new_email' });
      if (newEmail === email)     return json(200, { ok: true, no_change: true });

      const authUser = await findAuthUserByEmail(adminSb, email);
      if (authUser) {
        const { error } = await adminSb.auth.admin.updateUserById(authUser.id, {
          email: newEmail,
          email_confirm: true,
        });
        if (error) throw error;
      }
      const { error: rowErr } = await adminSb
        .from('admin_users').update({ email: newEmail }).eq('email', email);
      if (rowErr) throw rowErr;
      return json(200, { ok: true, auth_updated: !!authUser, row_updated: true });
    }

    if (action === 'set_password') {
      const newPassword = String((body && body.new_password) || '');
      if (newPassword.length < 8) return json(400, { ok: false, error: 'password_too_short' });

      let authUser = await findAuthUserByEmail(adminSb, email);
      if (!authUser) {
        const { data, error } = await adminSb.auth.admin.createUser({
          email,
          password: newPassword,
          email_confirm: true,
        });
        if (error) throw error;
        return json(200, { ok: true, created: true, user_id: data && data.user ? data.user.id : null });
      }
      const { error } = await adminSb.auth.admin.updateUserById(authUser.id, { password: newPassword });
      if (error) throw error;
      return json(200, { ok: true, updated: true, user_id: authUser.id });
    }

    if (action === 'send_password_reset') {
      const redirectTo = (process.env.PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '') || '') + '/admin/login';
      const { error } = await adminSb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      return json(200, { ok: true, reset_sent: true });
    }

    return json(400, { ok: false, error: 'unknown_action', action });
  } catch (err) {
    console.error(`admin-user-manage[${action}] failed:`, err);
    return json(500, { ok: false, error: 'operation_failed', detail: err.message });
  }
};

