-- The Contacts module could not load: every read of public.contacts_directory
-- failed with "42501: permission denied for table donors".
--
-- contacts_directory is security_invoker, so its join runs as the signed-in
-- admin, and donors was the only table in the whole admin surface with no
-- table-level grant to `authenticated`. Table GRANTs and RLS are separate
-- layers: without the grant, Postgres denies before any policy is evaluated,
-- so the "admin can read all donors" and "admin can insert donors" policies
-- were unreachable. This also broke the person drawer's giving history and
-- the Add gift/check action, which query donors directly.
--
-- Granted to `authenticated` only. `anon` is deliberately excluded: donors
-- holds names, emails, addresses, employers and amounts, and no public page
-- reads it. RLS remains the row-level gate for every statement below.

grant select, insert, update on public.donors to authenticated;
