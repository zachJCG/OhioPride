-- =============================================================================
-- ActBlue auto-sync: run log, refunds and cancellations, richer member rows
-- (2026-09-08)
-- -----------------------------------------------------------------------------
-- The hourly ActBlue cron had never ingested a contribution (it called an
-- endpoint ActBlue answers with 404, with credentials that were never set).
-- This migration is the database side of the rewrite in lib/actblue.mjs and
-- lib/functions/actblue-sync.mjs:
--
--   1. founding_members and donors carry the ActBlue fields the sync reads
--      (phone, address, zip, refcode, ActBlue donor id) plus two stamps:
--      `refunded_at` and `recurring_cancelled_at`. Nothing is ever deleted by
--      the sync; a refunded seat is marked, and the public count and roster
--      stop counting it.
--   2. founding_member_tiers.actblue_url: the 2026-04-27 migration that added
--      it never reached production, so /api/founding-member-tiers has been
--      returning 500 and the tier cards on /founding-members fell back to the
--      static markup. Same column, same URLs.
--   3. The founding -> donors fan-out copies the new fields, filling blanks
--      only, so a value the 2026-08-06 rollup reconciliation filled is never
--      blanked by a founding row that lacks it.
--   4. County fill falls back from city to ZIP now that both tables have a
--      ZIP. The value is checked against ohio_counties before it is used so
--      the founding_members county constraint cannot reject an insert.
--   5. founding_members_progress() and founding_members_public exclude
--      refunded seats; contacts_directory's giving rollup ignores refunded
--      gifts.
--   6. public.actblue_sync_runs: one row per run (cron, manual, backfill,
--      dry run) with the window, counts, and a bounded plan/problem detail.
--      Readable by anyone with donors:read (the Members page shows it);
--      written by the service role only.
--
-- APPLIED TO PRODUCTION 2026-09-08 (as `actblue_sync_runs_and_refunds` via
-- MCP); see docs/db/CHANGES-2026-09-08.md. Idempotent: safe to re-run.
-- =============================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.founding_members
  add column if not exists phone                  text,
  add column if not exists address1               text,
  add column if not exists zip                    text,
  add column if not exists refcode                text,
  add column if not exists actblue_donor_id       text,
  add column if not exists refunded_at            timestamptz,
  add column if not exists recurring_cancelled_at timestamptz;

comment on column public.founding_members.address1
  is 'Private. ActBlue donor address line 1. Never exposed on the public roster.';
comment on column public.founding_members.zip
  is 'Private. ActBlue donor ZIP (5 digits). Feeds county fill and the contact record.';
comment on column public.founding_members.refcode
  is 'ActBlue refcode that drove the membership contribution (e.g. website_founding_member).';
comment on column public.founding_members.actblue_donor_id
  is 'ActBlue "Donor ID": stable across a donor''s contributions even if their email changes.';
comment on column public.founding_members.refunded_at
  is 'Set by the ActBlue sync when the membership payment is refunded. The seat no longer counts toward 1,969 and leaves the public roster; the row is kept.';
comment on column public.founding_members.recurring_cancelled_at
  is 'Set by the ActBlue sync when a monthly series is cancelled (recurrence flips to cancelled).';

alter table public.donors
  add column if not exists fee_cents              integer,
  add column if not exists recurrence_number      integer,
  add column if not exists kind                   text,
  add column if not exists actblue_donor_id       text,
  add column if not exists refunded_at            timestamptz,
  add column if not exists recurring_cancelled_at timestamptz;

comment on column public.donors.recurrence_number
  is 'ActBlue "Recurrence Number": 1 for the first payment of a series, 2+ for later installments.';
comment on column public.donors.kind
  is 'ActBlue form kind the payment came through: page or event.';
comment on column public.donors.refunded_at
  is 'Set by the ActBlue sync when this payment is refunded. Excluded from giving rollups; the row is kept.';

create index if not exists idx_founding_members_receipt on public.founding_members (actblue_receipt_id);
create index if not exists idx_founding_members_email   on public.founding_members (email);
create index if not exists idx_donors_receipt           on public.donors (actblue_receipt_id);
create index if not exists idx_donors_email             on public.donors (email);

-- ── 2. Tier ActBlue URLs (2026-04-27 migration, finally applied) ────────────
alter table public.founding_member_tiers
  add column if not exists actblue_url text;

update public.founding_member_tiers
   set actblue_url = case slug
       when 'stonewall-sustainer' then 'https://secure.actblue.com/donate/ohio-pride-pac?amount=19.69&recurring=true&refcode=website_founding_stonewall'
       when 'founding-member'     then 'https://secure.actblue.com/donate/ohio-pride-pac?amount=25&refcode=website_founding_member'
       when 'pride-builder'       then 'https://secure.actblue.com/donate/ohio-pride-pac?amount=50&recurring=true&refcode=website_founding_pride_builder'
       when 'founding-circle'     then 'https://secure.actblue.com/donate/ohio-pride-pac?amount=100&recurring=true&refcode=website_founding_circle'
       when 'founding-patron'     then 'https://secure.actblue.com/donate/ohio-pride-pac?refcode=website_founding_patron'
       else actblue_url
   end
 where actblue_url is null or actblue_url = '';

-- ── 3. Founding -> donors fan-out carries the new fields ────────────────────
create or replace function public.donor_sync_founding_member(p_fm_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare fm public.founding_members%rowtype; v_donor_id uuid;
begin
  select * into fm from public.founding_members where id = p_fm_id;
  if not found then return; end if;

  insert into public.donors as d
    (full_name, email, phone, address1, city, county, state, zip, employer, occupation,
     amount_cents, recurrence, recurrence_number,
     actblue_contribution_id, actblue_receipt_id, actblue_donor_id, refcode,
     contributed_at, refunded_at, recurring_cancelled_at,
     reason, source, founding_member_id)
  values
    (coalesce(nullif(fm.full_name,''), fm.display_name, 'Anonymous'), fm.email, fm.phone, fm.address1,
     fm.city, fm.county, fm.state, fm.zip, fm.employer, fm.occupation,
     fm.amount_cents, fm.recurrence, 1,
     fm.actblue_contribution_id, fm.actblue_receipt_id, fm.actblue_donor_id, fm.refcode,
     fm.contributed_at, fm.refunded_at, fm.recurring_cancelled_at,
     'Founding Member', 'founding_member', fm.id)
  on conflict (founding_member_id) do update set
     full_name  = excluded.full_name,
     email      = excluded.email,
     city       = excluded.city,
     county     = excluded.county,
     state      = excluded.state,
     amount_cents = excluded.amount_cents,
     recurrence   = excluded.recurrence,
     actblue_contribution_id = excluded.actblue_contribution_id,
     actblue_receipt_id      = excluded.actblue_receipt_id,
     contributed_at = excluded.contributed_at,
     -- the founding row is the source of truth for its own refund/cancel stamps
     refunded_at            = excluded.refunded_at,
     recurring_cancelled_at = excluded.recurring_cancelled_at,
     -- fill-never-overwrite: the rollup reconciliation may have filled these
     phone            = coalesce(d.phone, excluded.phone),
     address1         = coalesce(d.address1, excluded.address1),
     zip              = coalesce(d.zip, excluded.zip),
     employer         = coalesce(d.employer, excluded.employer),
     occupation       = coalesce(d.occupation, excluded.occupation),
     refcode          = coalesce(d.refcode, excluded.refcode),
     actblue_donor_id = coalesce(d.actblue_donor_id, excluded.actblue_donor_id),
     recurrence_number = coalesce(d.recurrence_number, 1),
     source = 'founding_member'
  returning d.id into v_donor_id;

  -- link the prospect that was created from this founding member
  update public.prospects
     set donor_id = v_donor_id
   where founding_member_id = fm.id
     and (donor_id is distinct from v_donor_id);
end $$;

-- ── 4. County: city first, then ZIP, always a valid Ohio county ─────────────
create or replace function public.fill_oh_county()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare v text;
begin
  if (new.county is null or btrim(new.county) = '')
     and coalesce(new.state,'OH') = 'OH' then
    if new.city is not null and btrim(new.city) <> '' then
      v := public.lookup_oh_county(new.city, new.state);
    end if;
    if v is null and new.zip is not null and btrim(new.zip) <> '' then
      v := public.county_for_zip(new.zip);
      if v is not null and not exists (select 1 from public.ohio_counties c where c.name = v) then
        v := null;
      end if;
    end if;
    if v is not null then
      new.county := v;
    end if;
  end if;
  return new;
end $$;

-- ── 5. Refunded seats stop counting ─────────────────────────────────────────
create or replace function public.founding_members_progress()
returns table(member_count integer, goal integer, total_cents bigint, percent_to_goal numeric)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select
    count(*)::integer                                            as member_count,
    1969                                                         as goal,
    coalesce(sum(amount_cents), 0)::bigint                       as total_cents,
    least(
      round((count(*)::numeric / 1969) * 100, 2),
      100
    )                                                            as percent_to_goal
  from public.founding_members
  where refunded_at is null
$$;

create or replace view public.founding_members_public as
 select id,
    founding_number,
    coalesce(nullif(display_name, ''::text), nullif(full_name, ''::text), 'Anonymous'::text) as display_name,
    founding_member_tier(amount_cents, recurrence) as tier,
    city,
    county,
    state,
    elected_office,
    jurisdiction,
    public_quote,
    contributed_at,
        case
            when ((elected_office is not null) and (elected_office <> ''::text)) then
            case
                when ((jurisdiction is not null) and (jurisdiction <> ''::text)) then ((elected_office || ', '::text) || jurisdiction)
                else elected_office
            end
            when ((state is not null) and (state <> ''::text) and (city is not null) and (city <> ''::text)) then ((city || ', '::text) || state)
            when ((state is not null) and (state <> 'OH'::text)) then ('from '::text || state_full_name(state))
            when (state = 'OH'::text) then null::text
            when ((city is not null) and (city <> ''::text)) then city
            else null::text
        end as card_subtitle
   from founding_members
  where ((is_public = true) and (is_vetted = true) and (refunded_at is null));

create or replace view public.contacts_directory
with (security_invoker = true) as
 select c.id,
    c.email,
    c.full_name,
    c.first_name,
    c.last_name,
    c.phone,
    c.address1,
    c.city,
    c.county,
    c.region,
    c.state,
    c.zip,
    c.employer,
    c.occupation,
    c.roles,
    c.tags,
    c.sources,
    c.needs_review,
    c.review_reason,
    c.do_not_contact,
    c.email_optin,
    c.sms_optin,
    c.notes,
    c.created_at,
    c.updated_at,
    g.total_cents,
    g.gifts,
    g.first_gift_at,
    g.last_gift_at,
    (fm.id is not null) as is_founding_member,
    fm.founding_number,
    (v.id is not null) as is_volunteer,
    v.status as volunteer_status,
    (n.id is not null) as is_network,
    (ns.id is not null) as is_newsletter
   from (((((contacts c
     left join lateral ( select sum(d.amount_cents) as total_cents,
            count(*) as gifts,
            min(d.contributed_at) as first_gift_at,
            max(d.contributed_at) as last_gift_at
           from donors d
          where (d.contact_id = c.id) and (d.refunded_at is null)) g on (true))
     left join lateral ( select f.id,
            f.founding_number
           from founding_members f
          where (f.contact_id = c.id)
          order by f.contributed_at
         limit 1) fm on (true))
     left join lateral ( select vv.id,
            vv.status
           from volunteers vv
          where (vv.contact_id = c.id)
          order by vv.created_at
         limit 1) v on (true))
     left join lateral ( select nn.id
           from network_contacts nn
          where (nn.contact_id = c.id)
         limit 1) n on (true))
     left join lateral ( select s.id
           from newsletter_subscribers s
          where (s.contact_id = c.id)
         limit 1) ns on (true))
  where (not c.is_merged);

-- ── 6. Run log ──────────────────────────────────────────────────────────────
create table if not exists public.actblue_sync_runs (
  id                     uuid primary key default gen_random_uuid(),
  started_at             timestamptz not null default now(),
  finished_at            timestamptz,
  duration_ms            integer,
  status                 text not null default 'running'
                         check (status in ('running', 'ok', 'error')),
  trigger                text not null
                         check (trigger in ('cron', 'manual', 'backfill')),
  triggered_by           text,
  dry_run                boolean not null default false,
  range_start            timestamptz not null,
  range_end              timestamptz not null,
  csv_types              text[] not null default '{}'::text[],
  rows_seen              integer not null default 0,
  rows_skipped           integer not null default 0,
  founding_inserted      integer not null default 0,
  founding_updated       integer not null default 0,
  donors_inserted        integer not null default 0,
  donors_skipped         integer not null default 0,
  refunds_applied        integer not null default 0,
  cancellations_applied  integer not null default 0,
  contacts_created       integer not null default 0,
  contacts_enriched      integer not null default 0,
  error                  text,
  detail                 jsonb not null default '{}'::jsonb
);

comment on table public.actblue_sync_runs
  is 'One row per ActBlue sync run (hourly cron, admin "Sync now", backfill, dry run). Written by the service role; readable with donors:read. detail holds a bounded plan (ids, refcodes, actions) and any row-level problems.';

create index if not exists idx_actblue_sync_runs_started on public.actblue_sync_runs (started_at desc);
create index if not exists idx_actblue_sync_runs_status  on public.actblue_sync_runs (status, started_at desc);

alter table public.actblue_sync_runs enable row level security;

drop policy if exists "donors readers can see sync runs" on public.actblue_sync_runs;
create policy "donors readers can see sync runs" on public.actblue_sync_runs
  for select to authenticated using (public.has_permission('donors', 'read'));

drop policy if exists "service role manages sync runs" on public.actblue_sync_runs;
create policy "service role manages sync runs" on public.actblue_sync_runs
  for all to service_role using (true) with check (true);

revoke all on public.actblue_sync_runs from anon;
grant select on public.actblue_sync_runs to authenticated;
grant all on public.actblue_sync_runs to service_role;
