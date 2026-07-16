-- =============================================================================
-- form_submissions: destination for the contact / connect / launch-day-rsvp
-- forms after migrating off Netlify Forms. Written only by the /api/form-submit
-- Vercel function using the Supabase service role (bypasses RLS).
--
-- This migration is ADDITIVE and does not touch any existing table. It does NOT
-- touch the CFOFS compliance ledgers or any compliance data.
-- =============================================================================

create table if not exists public.form_submissions (
  id          uuid primary key default gen_random_uuid(),
  form_name   text not null,
  data        jsonb not null default '{}'::jsonb,
  name        text,
  email       text,
  subject     text,
  ip          text,
  user_agent  text,
  referrer    text,
  created_at  timestamptz not null default now()
);

alter table public.form_submissions enable row level security;

create index if not exists form_submissions_created_idx on public.form_submissions (created_at desc);
create index if not exists form_submissions_form_idx    on public.form_submissions (form_name);

-- Admin read access, consistent with other admin_read tables (is_admin() already
-- exists and is used by the admin-dashboard function). No anon/public policies:
-- the service role writes; nothing else reads without admin.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_admin') then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'form_submissions'
        and policyname = 'admins read form_submissions'
    ) then
      create policy "admins read form_submissions"
        on public.form_submissions
        for select
        using (public.is_admin());
    end if;
  end if;
end $$;
