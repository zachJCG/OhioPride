-- =====================================================================
-- 20260805000000_texting_module.sql
--
-- Person-to-person text blasts, as a first-class /admin module.
--
-- WHY:
--   Zach texts segments (founding members, volunteers, sign-ups) one by
--   one from his own phone, in Messages. That is deliberate: most of
--   these contacts have a phone on file but never checked the SMS box,
--   so a bulk gateway is off the table until A2P registration exists.
--   What he needs is a queue that survives switching apps, closing the
--   tab, and moving between phone and laptop.
--
--   Before this, the queue lived in browser storage on one device. This
--   moves it into Postgres so a blast is durable, resumable, and shows
--   the same progress everywhere.
--
-- ADDS
--   - public.text_blast_recipient_status  (enum)
--   - public.text_blasts                  (one row per campaign)
--   - public.text_blast_recipients        (one row per person in queue)
--   - public.text_blast_progress          (view: counts per blast)
--   - role_permissions for the new `texting` module
--
-- DOES NOT ADD
--   Any send path. Nothing in this schema dispatches a message. Rows
--   are marked sent by the human who pressed send in Messages.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- 1. Enum
-- ---------------------------------------------------------------------
do $$ begin
  create type public.text_blast_recipient_status as enum ('queued','sent','skipped');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 2. text_blasts
--
--    `filters` records exactly how the segment was built (role, region,
--    county, tag, opt-in only) so a blast can be explained months later
--    and rebuilt without guesswork.
-- ---------------------------------------------------------------------
create table if not exists public.text_blasts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  audience_key     text not null,
  audience_label   text not null,
  template         text not null,
  filters          jsonb not null default '{}'::jsonb,
  -- Fundraising blasts may not go to government addresses. Set at build
  -- time so the runner can hard-block the email branch for .gov / .state.oh.us.
  is_fundraising   boolean not null default false,
  status           text not null default 'active'
                   check (status in ('active','archived')),
  created_by       citext,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);

create index if not exists idx_text_blasts_status  on public.text_blasts (status, created_at desc);
create index if not exists idx_text_blasts_creator on public.text_blasts (created_by);

-- ---------------------------------------------------------------------
-- 3. text_blast_recipients
--
--    Contact fields are snapshotted at build time on purpose: a blast is
--    a record of what was actually sent to what number, and later edits
--    to the contact record must not rewrite history. contact_id stays as
--    the link back for 360-degree lookups.
--
--    `flags` carries the data-quality and compliance tags surfaced on the
--    card (no_optin, firewall, gov_email, out_of_state, email_typo).
--    They are shown to the human, never silently acted on.
-- ---------------------------------------------------------------------
create table if not exists public.text_blast_recipients (
  id                uuid primary key default gen_random_uuid(),
  blast_id          uuid not null references public.text_blasts(id) on delete cascade,
  contact_id        uuid references public.contacts(id) on delete set null,
  queue_order       integer not null default 0,

  full_name         text,
  first_name        text,
  phone_e164        text,
  email             text,
  city              text,
  county            text,
  region            text,
  sms_optin         boolean not null default false,

  channel           text not null default 'sms' check (channel in ('sms','email')),
  flags             text[] not null default '{}',

  status            public.text_blast_recipient_status not null default 'queued',
  message_override  text,
  sent_at           timestamptz,
  sent_by           citext,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_tbr_blast_order  on public.text_blast_recipients (blast_id, queue_order);
create index if not exists idx_tbr_blast_status on public.text_blast_recipients (blast_id, status);
create index if not exists idx_tbr_contact      on public.text_blast_recipients (contact_id);

-- One appearance per person per blast.
create unique index if not exists uq_tbr_blast_contact
  on public.text_blast_recipients (blast_id, contact_id)
  where contact_id is not null;

-- Keep updated_at honest and stamp sent_at exactly when status flips to
-- 'sent' (clearing it on undo, which is a status flip back to 'queued').
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

drop trigger if exists trg_tbr_touch on public.text_blast_recipients;
create trigger trg_tbr_touch
  before insert or update on public.text_blast_recipients
  for each row execute function public.text_blast_recipients_touch();

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

drop trigger if exists trg_text_blasts_touch on public.text_blasts;
create trigger trg_text_blasts_touch
  before update on public.text_blasts
  for each row execute function public.text_blasts_touch();

-- ---------------------------------------------------------------------
-- 4. Progress view — powers the list page's meters without pulling
--    every recipient row down to the browser.
--
--    security_invoker so the view reads under the caller's RLS rather
--    than the owner's. A view that quietly bypassed RLS on a table full
--    of cell numbers is exactly the wrong default.
-- ---------------------------------------------------------------------
create or replace view public.text_blast_progress
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

-- ---------------------------------------------------------------------
-- 5. RLS
--
--    Recipient rows carry names and cell numbers, so read is admin-only
--    and write needs texting:write. Nothing here is public, ever.
-- ---------------------------------------------------------------------
alter table public.text_blasts           enable row level security;
alter table public.text_blast_recipients enable row level security;

drop policy if exists "admin can read text_blasts"              on public.text_blasts;
drop policy if exists "texting writers can write text_blasts"   on public.text_blasts;
drop policy if exists "admin can read text_blast_recipients"    on public.text_blast_recipients;
drop policy if exists "texting writers can write recipients"    on public.text_blast_recipients;

create policy "admin can read text_blasts"
  on public.text_blasts for select to authenticated
  using (public.is_admin());

create policy "texting writers can write text_blasts"
  on public.text_blasts for all to authenticated
  using (public.has_permission('texting','write'))
  with check (public.has_permission('texting','write'));

create policy "admin can read text_blast_recipients"
  on public.text_blast_recipients for select to authenticated
  using (public.is_admin());

create policy "texting writers can write recipients"
  on public.text_blast_recipients for all to authenticated
  using (public.has_permission('texting','write'))
  with check (public.has_permission('texting','write'));

grant select on public.text_blast_progress to authenticated;

-- ---------------------------------------------------------------------
-- 6. Role permissions for the new module
--
--    Texting reaches personal cell numbers, so it stays narrow: the
--    director, comms, and the volunteer lead (volunteer shift reminders).
--    Board members get read so they can see what went out.
-- ---------------------------------------------------------------------
insert into public.role_permissions (role_slug, module, action)
select 'super_admin','texting', a
from   unnest(array['read','write','admin','manage_users']) a
on conflict do nothing;

insert into public.role_permissions (role_slug, module, action)
select rs,'texting', a
from   unnest(array['comms_lead','volunteer_lead']) rs
cross join unnest(array['read','write']) a
on conflict do nothing;

insert into public.role_permissions (role_slug, module, action)
values ('board_member','texting','read')
on conflict do nothing;

comment on table public.text_blasts is
  'Person-to-person text campaigns. Zach presses send in Messages for every recipient; nothing in this schema dispatches messages.';
comment on table public.text_blast_recipients is
  'One person per row in a blast queue. Contact fields are snapshotted at build time so the record reflects what was actually sent. Contains PII (cell numbers) — admin read only.';
