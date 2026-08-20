# Submission notifications

Staff get an email whenever someone submits one of the public forms. Every
alert is sent by `lib/notify.mjs` through Resend.

## What is covered

| Form | Handler | Kind | Table |
|------|---------|------|-------|
| Contact (`/contact`) | `lib/functions/form-submit.mjs` | `contact` | `form_submissions` |
| Connect (`/connect`) | `lib/functions/form-submit.mjs` | `contact` | `form_submissions` |
| Event / Pride Hour RSVPs | `lib/functions/form-submit.mjs` | `contact` | `event_rsvps` |
| Newsletter (`/signup`) | `lib/functions/newsletter-submit.mjs` | `newsletter` | `newsletter_subscribers` |
| Volunteer (`/volunteer`) | `lib/functions/volunteer-submit.mjs` | `volunteer` | `volunteers` |
| Internship (`/volunteer`) | `lib/functions/volunteer-submit.mjs` | `volunteer` | `intern_applications` |
| Pride road tour (`/pride/signup`) | `lib/functions/pride-volunteer-submit.mjs` | `volunteer` | `pride_volunteers` |
| Endorsement (`/endorsement/screening`) | `lib/functions/endorsement-notify.mjs` | `endorsement` | `endorsement_applications` |

Each email carries the submitted fields, a `Reply-To` set to the submitter, and
a button into the right admin module.

## This is not the submitter's confirmation email

Two different channels, easy to confuse:

- **Staff alerts (this doc)** go through **Resend**, because it is the only
  transactional sender wired up.
- **The confirmation the submitter receives** still comes from **MailerLite**,
  fired by a group-join automation. See `docs/mailerlite-setup.md`.

## Environment

Only one variable is required:

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `RESEND_API_KEY` | **yes** | — | Without it, nothing sends. Every handler logs a warning and continues. |
| `RESEND_FROM_EMAIL` | no | `Ohio Pride PAC <onboarding@resend.dev>` | Use a verified ohiopride.org sender in production. |
| `SITE_URL` | no | `https://ohiopride.org` | Base for the admin button. |
| `SUBMISSION_NOTIFY_TO` | no | — | Comma-separated. Overrides recipients for **every** kind. |
| `NOTIFY_CONTACT_TO` | no | — | Comma-separated. Per-kind override. |
| `NOTIFY_NEWSLETTER_TO` | no | — | " |
| `NOTIFY_VOLUNTEER_TO` | no | — | " |
| `NOTIFY_ENDORSEMENT_TO` | no | — | " |
| `NOTIFY_DISABLED_KINDS` | no | — | Comma-separated kill switch, e.g. `newsletter`. |
| `SUBMISSION_WEBHOOK_SECRET` | no | — | Enables the endorsement database webhook (below). |
| `ENDORSEMENT_NOTIFY_WINDOW_MS` | no | `900000` (15 min) | How recent an application must be for the browser ping to email about it. |

**Default recipients**, when no override is set:

- `contact` → `zach@ohiopride.org`, `info@ohiopride.org`
- everything else → `zach@ohiopride.org`

Precedence is per-kind env → global env → the defaults above. The legacy
`FORM_NOTIFY_TO` is *added* to the contact defaults rather than replacing them,
so the value already set in Vercel adds an inbox instead of quietly removing
the one the alerts exist to reach.

### Adding a recipient

Set the variable in Vercel and redeploy. To send volunteer alerts to two people:

```
NOTIFY_VOLUNTEER_TO=zach@ohiopride.org,volunteers@ohiopride.org
```

### Turning one off

Newsletter signups are the highest-volume form. To stop those alerts without
touching the others:

```
NOTIFY_DISABLED_KINDS=newsletter
```

## Endorsements are the odd one out

Every other form posts to a function, so the notification hangs off that server
hop. The screening form does not: `/endorsement/screening` inserts straight
into `endorsement_applications` from the browser with the anon key. There is no
server hop, so `/api/endorsement-notify` *is* the hop.

After a successful insert the page pings that endpoint with the candidate's
email address and nothing else. The endpoint then reads the row itself using
the service role and builds the email from what the database returns — the
request body only selects which row to read, so nothing a caller sends can be
echoed into an email. Two guards bound it:

- The address must match an application created within
  `ENDORSEMENT_NOTIFY_WINDOW_MS`. Knowing a candidate's email is not enough to
  make the endpoint email about an older application.
- No matching row returns `{ ok: true, notified: false }`, which is also what a
  probe gets. The response never reveals whether an address is known.

The ping uses `navigator.sendBeacon` (with a `keepalive` fetch fallback) so it
survives the redirect to the thank-you page.

### Optional: the database webhook backstop

The browser ping is best-effort. If a candidate closes the tab in the
milliseconds between the insert and the beacon, no email goes out. A Supabase
database webhook closes that gap, and also catches rows created any other way.

It is **opt-in**: without `SUBMISSION_WEBHOOK_SECRET` set, the endpoint refuses
webhook-shaped payloads with `404 webhook_disabled`. To enable it:

1. Set `SUBMISSION_WEBHOOK_SECRET` to a long random string in Vercel.
2. In Supabase → Database → Webhooks, create a webhook on
   `public.endorsement_applications`, event `INSERT`.
3. Point it at `https://ohiopride.org/api/endorsement-notify` with an
   `x-webhook-secret` header carrying the same value.

With both paths live a candidate can generate two emails for one application.
If that becomes annoying, prefer the webhook and delete the `notifyStaff(...)`
call in `public/endorsement/screening/index.html`.

## Verifying

`RESEND_API_KEY` is the only thing that has to be right. To confirm end to end,
submit the contact form on the deployed site and watch the function log: a
successful send is silent, and any failure logs `notify(<kind>): ...`.

A notification failure never fails a submission. The row is already written by
the time the email is attempted, and `notifySubmission()` swallows everything —
a missing API key, a Resend 4xx, a network timeout — so a visitor never sees an
error because an internal alert did not go out. The trade-off is that a
misconfigured sender fails quietly, which is why the log line matters.
