# Ohio Pride PAC — Supabase Wiring Bundle (2026-04-27)

Drop-in PR bundle. Wires the Founding Members directory and Launch-Day RSVP
form to Supabase, plus an admin runbook and a site-wiring audit.

## What's in this bundle

```
founding-members.html                        # New: Supabase-backed directory
js/launch-signup.js                          # New: drop-in form handler
SQL Migration/
  20260427000000_founding_members_directory_fields.sql
  20260427000100_founding_members_seed_directory_data.sql
  20260427000200_launch_signups.sql
  ADMIN-RUNBOOK.md                           # Team-member guide
  LAUNCH-DAY-FORM-PATCH.md                   # 2-line HTML edit
  SITE-WIRING-AUDIT.md                       # Punch list for next sprint
```

Place each file at the same path inside the repo. The `SQL Migration/` files
sit next to the existing `20260424000000_scorecard.sql` etc.

## Deploy steps

### 1. Apply the SQL migrations

In order:

```bash
psql "$DATABASE_URL" -f "SQL Migration/20260427000000_founding_members_directory_fields.sql"
psql "$DATABASE_URL" -f "SQL Migration/20260427000100_founding_members_seed_directory_data.sql"
psql "$DATABASE_URL" -f "SQL Migration/20260427000200_launch_signups.sql"
```

(These were already applied to the live Ohio Pride Supabase project on
2026-04-27. If your environment is fresh, run them. They are idempotent.)

What they do:
- Add `city`, `county`, `elected_office`, `jurisdiction`, `public_quote`,
  `founding_number` to `public.founding_members`.
- Validate `county` against the 88 Ohio counties.
- Rebuild `public.founding_members_public` to expose the new fields without
  leaking PII (full_name, email, notes stay private).
- Backfill counties for the seeded three; insert Matt Joseph (Founding
  Circle, Dayton City Commissioner); assign founding numbers 1..4.
- Create `public.launch_signups` with anon-INSERT-only RLS for the RSVP form.

### 2. Drop the new files into the site

- `founding-members.html` replaces the existing file at the repo root.
- `js/launch-signup.js` is new.

### 3. Apply the launch-day form patch

See `SQL Migration/LAUNCH-DAY-FORM-PATCH.md`. Two edits:
- Add `data-launch-form data-source="launch-day-rsvp"` to the existing
  `<form>` tag in `launch-day.html`.
- Replace the inline Google-Sheets `<script>` block with
  `<script src="/js/launch-signup.js" defer></script>`.

The original Drive file was sync-locked when this bundle was assembled, so
the patched file is not included. Apply the two edits in the editor.

### 4. Verify

After deploy:
- Hit `/founding-members` and confirm 4 members render with Matt Joseph
  showing the Elected pin and the "Founding Members In Office" strip.
- Hit `/launch-day` and submit a test RSVP, then check
  `select * from public.launch_signups order by created_at desc limit 1`.

## Read this before merging

`SQL Migration/SITE-WIRING-AUDIT.md` — the headline finding is that
`/issues.html` and `/scorecard.html` still read from static JS files even
though the database is current. Wiring those is a follow-up PR; this PR
does not block on them.

## Anon key

The Supabase publishable / anon key is committed in
`founding-members.html` and `js/launch-signup.js`. That is by design for
client-side Supabase. Security is enforced by RLS policies, not by hiding
the key. If the key is rotated, update both files in the same place near
the top of the script.
