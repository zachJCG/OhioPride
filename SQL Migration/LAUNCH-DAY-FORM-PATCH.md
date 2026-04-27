# Launch-Day Form: Supabase Patch

The `launch_signups` table is live (migration `20260427000200_launch_signups.sql`).
The drop-in script is at `/js/launch-signup.js`.

## Two-Line HTML Patch

In `launch-day.html`, do these two things:

### 1. Add `data-launch-form` and `data-source` to the existing `<form>` tag

Find:

```html
<form id="rsvpForm" name="launch-day-rsvp" method="POST" data-netlify="true" netlify-honeypot="bot-field">
```

Replace with:

```html
<form id="rsvpForm" name="launch-day-rsvp" method="POST" data-netlify="true" netlify-honeypot="bot-field" data-launch-form data-source="launch-day-rsvp">
```

### 2. Replace the Google-Sheets submit handler with the new module

Find the inline `<script>` that contains `GOOGLE_SCRIPT_URL` and the `fetch('/', ...)` block (roughly lines 800–860). Delete the entire `<script>...</script>` block.

Replace it with:

```html
<script src="/js/launch-signup.js" defer></script>
```

That is the whole change.

## What Stays The Same
- The form fields. `email`, `first_name`, `last_name`, `organization`, `title`.
- Netlify Forms still receives the post for email notifications. Anti-spam honeypot still works.
- The success message div continues to display on success. If it has the attribute `data-launch-success`, the new script will reveal it; otherwise it falls back to a button label change.

## Where The Data Goes
- `public.launch_signups` table on Supabase (Ohio Pride project).
- Read access is service_role only. Use the Supabase dashboard or the existing `actblue-sync.mjs`-style export pattern to pull a CSV.
- Anon role can INSERT but cannot SELECT, so the email list is not exposed publicly.

## Reusing The Form Elsewhere
Any RSVP-style form on the site can use the same pattern. Just add `data-launch-form` and a custom `data-source="<event-name>"`. Submissions tag themselves and you can filter by source in the dashboard.
