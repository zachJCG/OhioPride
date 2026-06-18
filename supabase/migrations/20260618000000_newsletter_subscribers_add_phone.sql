-- =====================================================================
-- 20260618000000_newsletter_subscribers_add_phone.sql
-- Adds an optional phone column to newsletter signups.
--
-- The homepage hero sign-up form now collects first name, last name,
-- email, phone (optional), and ZIP. Email + the rest already exist on
-- public.newsletter_subscribers; this migration adds `phone`.
--
-- The contacts forward-sync trigger (link_or_create_contact) already
-- reads a `phone` key off the row JSON, so once this column exists a
-- supplied phone number flows through to public.contacts automatically.
--
-- Idempotent: safe to re-run.
-- =====================================================================

alter table public.newsletter_subscribers
  add column if not exists phone text;

-- Anon/authenticated roles insert via the public form (the Netlify
-- function uses the service-role key, but keep the column grant in sync
-- with the other visitor-controlled columns for direct anon inserts).
grant insert (phone) on public.newsletter_subscribers to anon, authenticated;
