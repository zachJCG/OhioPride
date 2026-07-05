-- =============================================================================
-- contact_submissions — replaces Netlify Forms at the Vercel migration
-- -----------------------------------------------------------------------------
-- The contact / connect / launch-day forms used Netlify Forms + the
-- submission-created.js email notifier. Vercel has no Forms product, so the
-- forms now POST to /api/contact-submit, which inserts here (service role)
-- and sends the Resend notification. Upgrade over the old flow: every
-- contact request is now a queryable record instead of an entry in
-- Netlify's inbox.
-- =============================================================================

create table if not exists public.contact_submissions (
  id             uuid primary key default gen_random_uuid(),
  form_name      text not null default 'contact',   -- contact | connect | launch-day-rsvp
  name           text not null,
  email          text not null,
  phone          text,
  subject        text,
  message        text,
  organization   text,
  payload        jsonb,          -- form-specific extras (e.g. RSVP title)
  source_page    text,           -- Referer header
  submission_ip  text,
  user_agent     text,
  created_at     timestamptz not null default now()
);

comment on table public.contact_submissions is
  'Public website form submissions (contact, connect, launch-day RSVP). Written server-side by /api/contact-submit with the service role.';

alter table public.contact_submissions enable row level security;

-- No anon policies: the public never reads or writes this table directly.
-- The function writes with the service role (bypasses RLS); admins read
-- through their JWT-scoped client.
drop policy if exists contact_submissions_admin_read on public.contact_submissions;
create policy contact_submissions_admin_read
  on public.contact_submissions
  for select
  to authenticated
  using (public.is_admin());

create index if not exists contact_submissions_created_at_idx
  on public.contact_submissions (created_at desc);

create index if not exists contact_submissions_email_idx
  on public.contact_submissions (lower(email));
