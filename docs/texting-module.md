# Ohio Pride PAC :: Text Blast module

Person-to-person texting inside `/admin`. Wired against the live
`Ohio Pride` Supabase project (ref `dkdxefzhttkmjhdbkvqn`).

One job: put a personalized text in front of Zach for each person in a
segment, one tap to copy, so he can work a whole list from his phone in
minutes. **He presses send in Messages every time. Nothing is ever sent
automatically, and no carrier or A2P gateway is involved.**

## Pages

| Path                     | Audience | What it does                                                              |
|--------------------------|----------|---------------------------------------------------------------------------|
| `/admin/texting`         | Admin    | List of blasts with progress meters, plus the New blast builder.          |
| `/admin/texting?blast=…` | Admin    | The runner: one card per person, copy number, copy message, sent and next. |

Nav lives in `public/admin/admin-shell.js` under **Comms**, gated on
`texting:read`. The whole module is a single static page,
`public/admin/texting/index.html`, in the same shape as Contacts and
Networking: shell mounts, `admin-shell-ready` fires, the page checks
`has_permission()` and draws.

## The loop

Rapid mode shows one person at a time from a fixed queue:

1. **Copy number** (E.164, `+15135550100`). Switch to Messages, start the thread.
2. **Copy message**, from an editable per-person textarea. Switch back, paste, send.
3. **Sent. Next person** marks it, advances, and shows a 4 second undo toast.

Plus Back, Skip (advances without marking sent), Reset text (drops that
person's override), a sticky progress meter, an "N of M in queue"
counter, filter chips (**Not reached** is the default so the queue
drains), and a Full list mode for browsing or jumping.

Anyone without a usable phone becomes an **email branch** card: a mailto
link and the same Copy message button.

## Message rules

The template lives in `DEFAULT_TPL` at the top of the page script.
`{first}` swaps in each first name; anyone without one falls back to
"Hi there". Voice is warm and short, link on its own line, no em or en
dashes, no hashtags, no emojis, and no "Paid for by" line on texts.

- **"Change the message to ..."** edits the blast template only, via the
  Edit message drawer. Statuses, queue position, and per-person edits all
  survive. People who already have an override keep their text.
- **"New blast for ..."** builds a fresh queue: new segment query, fresh
  statuses, same loop.

Per-person edits save as `message_override` on blur (debounced). Editing a
card back to exactly the template value clears the override rather than
storing a duplicate.

## Segments

Segments are role filters over `public.contacts`, defined in the
`SEGMENTS` array. Adding one is a single line. Every segment applies:

- `is_merged = false` and `do_not_contact` is not true.
- Phones normalized to E.164: strip non-digits, drop a leading 1, require
  exactly 10 digits, prefix `+1`. Anything else is not textable, and the
  person is dropped unless the email branch is switched on.
- `sms_optin` shown as a badge, **not** as a filter by default. Most
  contacts have a phone on file but never checked the SMS box. Texting
  one at a time from Zach's own phone is the model precisely because of
  that. Never route this list through a bulk SMS gateway or API without
  A2P registration first.

Optional filters at build time: region, county, tag, SMS opt-in only,
include the email branch, and "this blast asks for money".

## Flags. Surfaced, never silently fixed

Computed at build time, stored on the recipient row, rendered as badges
with an inline explanation on the card:

| Flag           | Meaning                                                              |
|----------------|-----------------------------------------------------------------------|
| `no_optin`     | Phone on file, never checked the SMS box.                            |
| `firewall`     | Walsh, Russo, Acton. Event or thank-you content only, nothing that reads as campaign coordination or express advocacy. |
| `gov_email`    | `.gov` or `.state.oh.us` address. On a blast marked fundraising, the email branch is hard-blocked for that person. |
| `out_of_state` | Area code outside Ohio.                                              |
| `email_typo`   | Suspected typo (`gmial.`, `.con`, and friends). Fix it in Contacts, not here. |
| `email_only`   | No usable phone; email branch.                                       |

## sms and mailto formats

- iPhone and Mac: `sms:+1555…&body=` plus `encodeURIComponent(message)`
- Android and Chrome: `sms:+1555…?body=` plus the encoded message
- Separator picked from `/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)`

Copy is the primary workflow because it works everywhere. The direct
`sms:` link is secondary and labeled "Try direct link": some embedded and
sandboxed browser frames refuse the handoff.

## Phone version (standalone file)

**Phone version** downloads a self-contained HTML file with the current
queue baked in. Opened in Safari or Chrome on the phone (Files app, then
share to browser), the `sms:` links hand off to Messages properly, since
there is no sandbox in the way. Same loop, `localStorage` instead of
Postgres for statuses and edits.

That file contains names and cell numbers. **Local file only: never
hosted, never committed, never pasted anywhere public.**

## Schema

`supabase/migrations/20260805194710_texting_module.sql` (plus the advisor
follow-up in `…194849_texting_module_harden.sql`):

- `public.text_blasts` — one row per campaign: name, audience, template,
  the `filters` jsonb that records exactly how the segment was built, and
  `is_fundraising`.
- `public.text_blast_recipients` — one row per person. Contact fields are
  **snapshotted at build time** on purpose: a blast is a record of what
  went to what number, and later edits to a contact must not rewrite
  history. `contact_id` remains as the link back.
- `public.text_blast_progress` — counts per blast, `security_invoker` so
  it reads under the caller's RLS.

Statuses live in Postgres, not browser storage, so a queue is resumable
and shows the same progress on the phone and the laptop.

RLS: read requires `is_admin()`, write requires `texting:write`. Role
grants: `super_admin` and `comms_lead` and `volunteer_lead` read/write,
`board_member` read.

## Guardrails

- Zach presses send on every message. No auto-send, no dispatch loop, no
  carrier APIs. Nothing in the schema can send anything.
- PII stays inside the admin and the local phone file.
- Nothing here writes to `compliance_contributions` or
  `compliance_expenditures`.
- New founding members still come in through the normal ActBlue import
  path with the receipt-id-plus-email dedup rule, never from this tool.
