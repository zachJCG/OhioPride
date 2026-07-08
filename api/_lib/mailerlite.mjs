/* =============================================================================
 * Shared MailerLite client (server-side only)
 * -----------------------------------------------------------------------------
 * Thin wrapper around the MailerLite "connect" REST API
 * (https://connect.mailerlite.com/api). Used by:
 *
 *   - the public form handlers (newsletter-submit, volunteer-submit), to sync
 *     a submitter into a MailerLite group so a group-join automation can send
 *     them a welcome / confirmation email; and
 *   - admin-email-send, to compose and instant-send a campaign to a group.
 *
 * The API key lives ONLY in the MAILERLITE_API_KEY environment variable (set in
 * the Vercel dashboard). It is never shipped to the browser — every call in
 * here runs inside a serverless function.
 *
 * IMPORTANT — what MailerLite can and can't do:
 *   MailerLite has NO transactional / single-recipient send endpoint (that is
 *   MailerSend's job). The only ways to email someone are (a) a bulk campaign
 *   to a group/segment, or (b) an automation triggered by group membership.
 *   So the per-submission "custom email" is delivered by syncing the person
 *   into a named group and letting a MailerLite automation fire on join.
 * ============================================================================= */

const API_BASE = 'https://connect.mailerlite.com/api';

// Per-instance cache of group-name -> group-id, so repeated form submissions
// on a warm function instance don't re-list groups every time.
const groupIdCache = new Map();

export function isConfigured() {
  return !!process.env.MAILERLITE_API_KEY;
}

/**
 * Low-level fetch against the MailerLite API. Throws on non-2xx with a tagged
 * Error carrying `.status` and the parsed `.body` so callers can decide whether
 * to surface or swallow it.
 */
async function ml(path, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  const key = process.env.MAILERLITE_API_KEY;
  if (!key) {
    const err = new Error('mailerlite_unconfigured');
    err.code = 'unconfigured';
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error(`mailerlite_${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// -----------------------------------------------------------------------------
// Subscribers
// -----------------------------------------------------------------------------

/**
 * Upsert a subscriber. POST /subscribers is an upsert keyed on email
 * (201 created / 200 updated). `groups` are *added* (never removed by omission),
 * and `fields` values are merged in.
 *
 *   upsertSubscriber({ email, fields: { name, last_name }, groups: ['123'] })
 */
export async function upsertSubscriber({ email, fields, groups, status } = {}) {
  if (!email) throw new Error('email_required');
  const payload = { email };
  if (fields && Object.keys(fields).length) payload.fields = fields;
  if (Array.isArray(groups) && groups.length) payload.groups = groups;
  if (status) payload.status = status;
  return ml('/subscribers', { method: 'POST', body: payload });
}

// -----------------------------------------------------------------------------
// Groups
// -----------------------------------------------------------------------------

export async function listGroups({ limit = 100 } = {}) {
  return ml(`/groups?limit=${encodeURIComponent(limit)}`);
}

export async function createGroup(name) {
  return ml('/groups', { method: 'POST', body: { name } });
}

/**
 * Resolve a group id by name, creating the group if it doesn't exist yet.
 * Cached per warm instance. Returns the group id as a string.
 */
export async function findOrCreateGroupId(name) {
  const key = String(name || '').trim();
  if (!key) throw new Error('group_name_required');
  if (groupIdCache.has(key)) return groupIdCache.get(key);

  const res = await listGroups({ limit: 100 });
  const existing = (res?.data || []).find(
    (g) => (g.name || '').trim().toLowerCase() === key.toLowerCase()
  );
  if (existing) {
    groupIdCache.set(key, existing.id);
    return existing.id;
  }

  const created = await createGroup(key);
  const id = created?.data?.id || created?.id;
  if (id) groupIdCache.set(key, id);
  return id;
}

// -----------------------------------------------------------------------------
// Campaigns (bulk send, used by /admin)
// -----------------------------------------------------------------------------

export async function listCampaigns({ limit = 25, filter } = {}) {
  // The campaigns endpoint rejects a limit below 10 with a 422.
  const safeLimit = Math.min(100, Math.max(10, Number(limit) || 25));
  const params = new URLSearchParams({ limit: String(safeLimit) });
  if (filter) params.set('filter[status]', filter);
  return ml(`/campaigns?${params.toString()}`);
}

/**
 * Create a regular campaign. HTML body goes in emails[0].content.
 *   createCampaign({ name, subject, fromName, from, replyTo, html, groups: ['42'] })
 */
export async function createCampaign({
  name, subject, fromName, from, replyTo, html, groups,
} = {}) {
  if (!name) throw new Error('name_required');
  if (!subject) throw new Error('subject_required');
  if (!from) throw new Error('from_required');
  if (!html) throw new Error('content_required');

  const emailObj = { subject, from_name: fromName || from, from, content: html };
  if (replyTo) emailObj.reply_to = replyTo;

  const payload = { name, type: 'regular', emails: [emailObj] };
  if (Array.isArray(groups) && groups.length) payload.groups = groups;

  return ml('/campaigns', { method: 'POST', body: payload });
}

/**
 * Schedule (or instant-send) a previously created campaign.
 *   scheduleCampaign(id)                       -> instant
 *   scheduleCampaign(id, { delivery: 'instant' })
 */
export async function scheduleCampaign(campaignId, schedule = { delivery: 'instant' }) {
  if (!campaignId) throw new Error('campaign_id_required');
  return ml(`/campaigns/${encodeURIComponent(campaignId)}/schedule`, {
    method: 'POST',
    body: schedule,
  });
}

/**
 * Convenience: create a campaign and instant-send it in one shot.
 * Returns { campaign, scheduled }.
 */
export async function sendCampaign(opts) {
  const created = await createCampaign(opts);
  const campaignId = created?.data?.id || created?.id;
  if (!campaignId) {
    const err = new Error('campaign_create_no_id');
    err.body = created;
    throw err;
  }
  const scheduled = await scheduleCampaign(campaignId, { delivery: 'instant' });
  return { campaign: created?.data || created, scheduled: scheduled?.data || scheduled };
}

// -----------------------------------------------------------------------------
// Fire-and-forget helper for public form handlers
// -----------------------------------------------------------------------------

/**
 * Best-effort sync of a form submitter into MailerLite. Resolves the named
 * group (creating it if needed) and upserts the subscriber into it. NEVER
 * throws — returns { ok, skipped?, error? } so a MailerLite hiccup can never
 * break a public form submission.
 */
export async function syncSubscriberSafe({ email, fields, groupName, status } = {}) {
  if (!isConfigured()) return { ok: false, skipped: 'unconfigured' };
  if (!email) return { ok: false, skipped: 'no_email' };
  try {
    let groups;
    if (groupName) {
      const id = await findOrCreateGroupId(groupName);
      if (id) groups = [id];
    }
    await upsertSubscriber({ email, fields, groups, status });
    return { ok: true };
  } catch (err) {
    // Log for observability, but swallow so the form still succeeds.
    console.error('mailerlite syncSubscriberSafe failed:', err.status || '', err.message, err.body || '');
    return { ok: false, error: err.message };
  }
}
