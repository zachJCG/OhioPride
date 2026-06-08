# MailerLite integration

Wires MailerLite into the site for two jobs:

1. **Email from `/admin`** — the `/admin/email` page lets a comms admin compose an
   email and instant-send it as a campaign to one or more MailerLite groups.
2. **Email after form submissions** — when someone submits the newsletter,
   volunteer, or internship form, we upsert them into MailerLite and add them to
   a group. A MailerLite **automation triggered on group join** then sends the
   welcome / confirmation email.

> **Why automations, not transactional?** MailerLite has no transactional /
> single-recipient send endpoint (that's MailerSend). The only ways to email
> someone through MailerLite are a bulk campaign or an automation. So the
> per-submission "custom email" is delivered by syncing the person into a group
> and letting a group-join automation fire. The group is created automatically
> the first time a form is submitted.

## Environment variables (set in the Netlify dashboard)

| Variable | Required | Purpose |
|---|---|---|
| `MAILERLITE_API_KEY` | **Yes** | MailerLite "connect" API token. Server-side only — never shipped to the browser. |
| `MAILERLITE_FROM_EMAIL` | For `/admin` sending | The "from" address for admin campaigns. **Must be a verified MailerLite sender** or the send is rejected. Can be overridden per-send in the composer. |
| `MAILERLITE_FROM_NAME` | No | Default "from" name (defaults to `Ohio Pride PAC`). |
| `MAILERLITE_NEWSLETTER_GROUP` | No | Group name for newsletter signups (default `Newsletter`). |
| `MAILERLITE_VOLUNTEER_GROUP` | No | Group name for volunteer signups (default `Volunteers`). |
| `MAILERLITE_INTERNSHIP_GROUP` | No | Group name for internship applicants (default `Internship Applicants`). |

## One-time MailerLite setup

1. Add and **verify a sender** (domain/email) in MailerLite, then set
   `MAILERLITE_FROM_EMAIL` to it.
2. (Optional but recommended) Create automations triggered by **"when a
   subscriber joins a group"** for the `Newsletter`, `Volunteers`, and
   `Internship Applicants` groups. The body of those emails is the
   welcome/confirmation message. The groups appear automatically after the first
   form submission, or you can create them by name ahead of time.

## Code map

- `netlify/functions/lib/mailerlite.mjs` — shared API client (subscribers,
  groups, campaigns) + `syncSubscriberSafe()` fire-and-forget helper.
- `netlify/functions/newsletter-submit.mjs`,
  `netlify/functions/volunteer-submit.mjs` — sync submitters into MailerLite
  after the DB write (best-effort; never blocks or fails the form).
- `netlify/functions/admin-email-send.mjs` — auth-gated
  (`has_permission('news','write')`) endpoint that lists groups/campaigns and
  sends a campaign.
- `admin/email/index.html` — the composer UI (linked in the admin sidebar under
  **Comms → Email**).
