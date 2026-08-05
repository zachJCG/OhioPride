-- =====================================================================
-- 20260805194849_texting_module_harden.sql
--
-- Advisor follow-up to the texting module, applied minutes after it.
--
--   1. Pin search_path on both trigger functions.
--   2. Rebuild text_blast_progress with security_invoker so it reads
--      under the caller's RLS instead of the owner's. A view sitting on
--      a table of personal cell numbers must not quietly bypass RLS.
--
-- Both changes are also folded into 20260805194710_texting_module.sql so
-- a fresh install lands here directly. This file exists because that is
-- the order production actually saw, and re-running it is a no-op.
-- =====================================================================

create or replace function public.text_blast_recipients_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.status = 'sent' and old.status is distinct from 'sent' then
      new.sent_at := coalesce(new.sent_at, now());
    elsif new.status <> 'sent' then
      new.sent_at := null;
      new.sent_by := null;
    end if;
  end if;
  return new;
end $$;

create or replace function public.text_blasts_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'archived' and old.status is distinct from 'archived' then
    new.archived_at := coalesce(new.archived_at, now());
  elsif new.status <> 'archived' then
    new.archived_at := null;
  end if;
  return new;
end $$;

drop view if exists public.text_blast_progress;

create view public.text_blast_progress
with (security_invoker = on) as
select
  b.id                  as blast_id,
  count(r.id)                                              as total,
  count(r.id) filter (where r.status = 'sent')             as sent,
  count(r.id) filter (where r.status = 'skipped')          as skipped,
  count(r.id) filter (where r.status = 'queued')           as queued,
  count(r.id) filter (where r.channel = 'email')           as email_only,
  max(r.sent_at)                                           as last_sent_at
from public.text_blasts b
left join public.text_blast_recipients r on r.blast_id = b.id
group by b.id;

grant select on public.text_blast_progress to authenticated;
