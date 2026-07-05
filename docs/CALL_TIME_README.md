# Call Time — mobile call-time module

A mobile-first donor call workflow inside the admin console. One person rips
through a prioritized list of PAC prospects, calls/texts in one tap, logs the
outcome in one tap, and the backend auto-schedules the follow-up.

It lives under **Fundraising → Call Time** (PAC side of the legal wall) and is
gated on the `pac_prospects` module. It never touches the c4 (`c4_prospects`)
side.

## Where it is

| File | Purpose |
|------|---------|
| `admin/fundraising/call-time/index.html` | Call Time home (`/admin/fundraising/call-time`) — queue + today bar + filters |
| `admin/fundraising/call-time/followups/index.html` | Follow-ups due (`/admin/fundraising/call-time/followups`) — morning callback view |
| `admin/fundraising/call-time.js` | The engine. `window.CALL_TIME.init({ mode })` |
| `admin/fundraising/call-time.css` | Mobile-first styles (dark theme, reuses admin tokens) |
| `admin/admin-shell.js` | Nav entry added under the Fundraising group (`fundraising_calltime`, phone icon) |

Both pages load the standard admin stack (`admin-shell.js` boots auth + the
sidebar, then dispatches `admin-shell-ready` with the authenticated Supabase
client). The module wires to that client — it does **not** create its own and
does **not** use the service-role key in the browser.

## Screens

### 1. Call Time home (`mode: 'queue'`)
- **Sticky today stat bar** from `call_time_today_stats` (filtered to the
  signed-in user's email): Dials, Convos, Pledged $ today, Follow-ups. Tapping
  **Follow-ups** filters the queue to `queue_bucket='follow_up_due'`. A session
  **goal ring** tracks `touches` against a target you set (tap the ring).
- **Filter chips** (sticky, horizontally scrollable): Priority, Bucket, Region
  (matches `county`/`city`), and the top `tags`. Last-used filter is persisted
  in `localStorage` (`ct.filters.v1`).
- **Queue list** from `call_time_queue` (already server-ordered: follow-ups due
  → new high-capacity → in-progress). Each compact card shows name, priority
  dot, capacity, `occupation @ employer`, a bucket chip, last outcome /
  attempts, and a 📵 marker when `has_phone=false`.
- **Start calling** opens the first item in focus mode and auto-advances after
  each log.
- **Swipe** a queue row: left = snooze 1 week, right = skip for this session.

### 2. Call Card (the core screen)
- Header: name, priority, capacity, city/county, best time to call, "view full
  record" link.
- **One-tap contact row** using the view's precomputed hrefs — real anchors:
  `Call → tel_href`, `Text → sms_href` (+ pre-filled body), `Email →
  mailto_href`. Disabled + "No phone" when `has_phone=false`.
- Context block: `evidence`, suggested ask (`ask_target_cents`), `tags`, and the
  last 3 timeline rows (`call_time_prospect_timeline`).
- **Disposition pad**: one-tap buttons generated at runtime from
  `call_dispositions` (ordered by `sort_order`, grouped by `category`, colored
  win/progress/attempt/touch/closed/remove). Amount-capturing dispositions
  (`captures_amount=true`) reveal quick chips ($25/$50/$100/$250/custom) and a
  sticky **Log** confirm bar. Other dispositions log on the single tap.
- Optional collapsed one-line note.
- **Snooze** chips: Tomorrow / 3 days / 1 week / 1 month → `snooze_prospect`.

### 3. Follow-ups (`mode: 'followups'`)
- List from `call_time_followups_due` (most overdue first, shows `days_overdue`).
  Tapping a row opens the same Call Card (hydrated from `call_time_queue` by id).

## Backend contract (already built + verified — do not rebuild)

Supabase project `dkdxefzhttkmjhdbkvqn`. RLS enforced via
`has_permission('pac_prospects', 'read'|'write')`.

**Reads (RLS-safe `security_invoker` views):**
- `call_time_queue` — prioritized list. Helper cols: `queue_bucket`, `has_phone`,
  `tel_href`, `sms_href`, `mailto_href`, plus all display fields.
- `call_time_followups_due` — overdue callbacks (+ `days_overdue`).
- `call_time_today_stats` — `touches, calls, conversations, wins,
  pledged_cents_today, followups_scheduled` per `actor_email`.
- `call_time_prospect_timeline` — recent activity per `prospect_id`.
- `call_dispositions` — drives the outcome buttons (read at runtime, never
  hardcoded).

**Writes (RPC — these do every side effect; the UI never recomputes follow-up
dates, stages, or committed totals):**
```js
supabase.rpc('log_call_activity', {
  p_prospect_id, p_disposition, p_activity_type = 'call',
  p_notes, p_amount_cents, p_duration_seconds, p_follow_up_at = null,
  p_actor_id = null, p_actor_email   // = session.user.email
}); // returns the inserted pac_prospect_activities row (id, follow_up_at, …)

supabase.rpc('snooze_prospect', { p_prospect_id, p_days = 7 });
```
`log_call_activity` writes the activity, bumps `attempts_count`, sets
`last_contacted_at`/`last_outcome`, advances `stage`, adds pledged amounts to
`committed_amount_cents`, sets `next_action_date`/`snooze_until` to the auto
follow-up date, and flips `do_not_contact`/archives on "Do not contact".

## Time-savers implemented
- **Auto-advance** to the next prospect immediately after logging (no "next" tap).
- **Dial-and-stage**: tapping **Call** pre-arms `no_answer` so a missed call is a
  single confirm; answering just means picking the real outcome.
- **Pre-filled SMS templates** (editable in ⚙️ Settings, stored in
  `localStorage` `ct.sms.v1`): `{first_name}`, `{full_name}`, `{city}` injected
  into the Text button's `body=`.
- **Optimistic UI**: logging removes the card and advances instantly; the stat
  bar bumps immediately, then reconciles against the server. **5-second Undo**
  snapshots the prospect's writable fields before the RPC, then deletes the
  activity + restores the row.
- **Swipe** to snooze/skip, **resume** last prospect + filter, **session goal
  ring**, **skeleton loaders**, and **prefetch** of the next 1–2 cards.

## Settings & local state (`localStorage`)
| Key | Holds |
|-----|-------|
| `ct.filters.v1` | last-used filter chips |
| `ct.sms.v1` | SMS template |
| `ct.goal.v1` | session dial goal |
| `ct.lastProspect.v1` | last opened prospect (resume) |

## Data note
As of build, all 201 queue prospects have **no phone number** (`phone` /
`phone_mobile` empty), so the Call/Text buttons render as "No phone" and the
queue shows 📵. The module is fully functional — the dialer buttons light up
automatically the moment numbers are populated on `pac_prospects`. The Email
path and outcome logging work today.
