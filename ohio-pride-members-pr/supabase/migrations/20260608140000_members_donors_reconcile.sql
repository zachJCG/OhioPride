-- ============================================================================
-- Ohio Pride PAC :: Members module + Donor reconciliation + County auto-fill
-- Migration: 20260608140000_members_donors_reconcile
--
-- ALREADY APPLIED to production (ref dkdxefzhttkmjhdbkvqn) on 2026-06-08 and verified.
-- Committed here for repo history + dev branches. Idempotent.
--
-- Summary:
--   1. OH city->county lookup + auto-fill trigger on founding_members & donors.
--   2. Member-number reconciliation: every paying member is numbered (vetting only
--      controls PUBLIC display, not membership).
--   3. Members -> Donors reconciliation + auto-sync trigger, with prospect linkage.
--      'donors.source' prevents double-counting in fundraising_dashboard.
--   4. members_crm view (no public/vetted filter, newest first) + 'members' module perms.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) OH city -> county auto-fill
-- ----------------------------------------------------------------------------
create table if not exists public.oh_city_county (
  city_key text primary key,
  county   text not null
);

insert into public.oh_city_county (city_key, county) values
  ('cincinnati','Hamilton'),('columbus','Franklin'),('lima','Allen'),('coshocton','Coshocton'),
  ('maineville','Warren'),('morrow','Warren'),('new albany','Franklin'),('reynoldsburg','Franklin'),
  ('tipp city','Miami'),('upper arlington','Franklin'),('worthington','Franklin'),
  ('dayton','Montgomery'),('cleveland','Cuyahoga'),('akron','Summit'),('toledo','Lucas'),
  ('canton','Stark'),('youngstown','Mahoning'),('springfield','Clark'),('kettering','Montgomery'),
  ('hamilton','Butler'),('middletown','Butler'),('dublin','Franklin'),('westerville','Franklin'),
  ('gahanna','Franklin'),('hilliard','Franklin'),('grove city','Franklin'),('delaware','Delaware'),
  ('lancaster','Fairfield'),('newark','Licking'),('mansfield','Richland'),('elyria','Lorain'),
  ('lorain','Lorain'),('parma','Cuyahoga'),('lakewood','Cuyahoga'),('beavercreek','Greene'),
  ('fairborn','Greene'),('xenia','Greene'),('oxford','Butler'),('athens','Athens'),
  ('bowling green','Wood'),('findlay','Hancock'),('marion','Marion'),('zanesville','Muskingum'),
  ('chillicothe','Ross'),('portsmouth','Scioto'),('sandusky','Erie'),('warren','Trumbull'),
  ('boardman','Mahoning'),('strongsville','Cuyahoga'),('mentor','Lake'),('euclid','Cuyahoga'),
  ('cuyahoga falls','Summit'),('stow','Summit'),('north olmsted','Cuyahoga'),('dover','Tuscarawas'),
  ('wooster','Wayne'),('ashland','Ashland'),('tiffin','Seneca'),('fremont','Sandusky'),
  ('defiance','Defiance'),('bellefontaine','Logan'),('troy','Miami'),('piqua','Miami'),
  ('sidney','Shelby'),('wilmington','Clinton'),('washington court house','Fayette'),
  ('circleville','Pickaway'),('logan','Hocking'),('marietta','Washington'),('cambridge','Guernsey'),
  ('steubenville','Jefferson'),('ironton','Lawrence'),('gallipolis','Gallia'),('wapakoneta','Auglaize'),
  ('van wert','Van Wert'),('celina','Mercer'),('greenville','Darke'),('urbana','Champaign'),
  ('london','Madison'),('mount vernon','Knox'),('bucyrus','Crawford'),('norwalk','Huron'),
  ('medina','Medina'),('wadsworth','Medina'),('barberton','Summit'),('massillon','Stark'),
  ('alliance','Stark'),('salem','Columbiana'),('east liverpool','Columbiana'),('ravenna','Portage'),
  ('kent','Portage'),('aurora','Portage'),('hudson','Summit'),('twinsburg','Summit'),
  ('solon','Cuyahoga'),('painesville','Lake'),('willoughby','Lake'),('ashtabula','Ashtabula'),
  ('conneaut','Ashtabula'),('pickerington','Fairfield'),('grandview heights','Franklin'),
  ('bexley','Franklin'),('powell','Delaware'),('mason','Warren'),('lebanon','Warren'),
  ('loveland','Hamilton'),('blue ash','Hamilton'),('norwood','Hamilton'),('milford','Clermont'),
  ('batavia','Clermont'),('perrysburg','Wood'),('sylvania','Lucas'),('huber heights','Montgomery'),
  ('centerville','Montgomery'),('miamisburg','Montgomery'),('vandalia','Montgomery'),('oakwood','Montgomery')
on conflict (city_key) do nothing;

create or replace function public.lookup_oh_county(p_city text, p_state text)
returns text language sql stable as $$
  select case
    when coalesce(p_state,'OH') <> 'OH' then null
    when p_city is null or btrim(p_city) = '' then null
    else (select county from public.oh_city_county where city_key = lower(btrim(p_city)))
  end;
$$;

create or replace function public.fill_oh_county()
returns trigger language plpgsql as $$
begin
  if (new.county is null or btrim(new.county) = '')
     and coalesce(new.state,'OH') = 'OH'
     and new.city is not null and btrim(new.city) <> '' then
    new.county := coalesce(public.lookup_oh_county(new.city, new.state), new.county);
  end if;
  return new;
end $$;

drop trigger if exists trg_fm_fill_county on public.founding_members;
create trigger trg_fm_fill_county before insert or update on public.founding_members
  for each row execute function public.fill_oh_county();

drop trigger if exists trg_donors_fill_county on public.donors;
create trigger trg_donors_fill_county before insert or update on public.donors
  for each row execute function public.fill_oh_county();

update public.founding_members fm
set county = public.lookup_oh_county(fm.city, fm.state)
where (fm.county is null or btrim(fm.county) = '')
  and coalesce(fm.state,'OH') = 'OH'
  and public.lookup_oh_county(fm.city, fm.state) is not null;

-- ----------------------------------------------------------------------------
-- 2) Member-number reconciliation
-- ----------------------------------------------------------------------------
create or replace function public.assign_founding_number()
returns trigger language plpgsql as $$
begin
  if new.founding_number is null then
    perform pg_advisory_xact_lock(hashtext('founding_number_seq'));
    select coalesce(max(founding_number),0) + 1
      into new.founding_number from public.founding_members;
  end if;
  return new;
end;
$$;

do $$
declare r record; nextn int;
begin
  for r in
    select id from public.founding_members
    where founding_number is null
    order by contributed_at nulls last, created_at
  loop
    select coalesce(max(founding_number),0)+1 into nextn from public.founding_members;
    update public.founding_members set founding_number = nextn where id = r.id;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Members -> Donors reconciliation + auto-sync
-- ----------------------------------------------------------------------------
alter table public.donors add column if not exists source text not null default 'manual';
alter table public.donors add column if not exists founding_member_id uuid references public.founding_members(id) on delete set null;

-- NOTE: plain (non-partial) unique index so it can serve as an ON CONFLICT arbiter.
-- NULL founding_member_id values are treated as distinct, so non-member donors are fine.
drop index if exists public.donors_founding_member_uniq;
create unique index if not exists donors_founding_member_uniq on public.donors(founding_member_id);

create or replace function public.donor_sync_founding_member(p_fm_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare fm public.founding_members%rowtype; v_donor_id uuid;
begin
  select * into fm from public.founding_members where id = p_fm_id;
  if not found then return; end if;

  insert into public.donors as d
    (full_name, email, city, county, state, amount_cents, recurrence,
     actblue_contribution_id, actblue_receipt_id, contributed_at, reason, source, founding_member_id)
  values
    (coalesce(nullif(fm.full_name,''), fm.display_name, 'Anonymous'), fm.email, fm.city, fm.county, fm.state,
     fm.amount_cents, fm.recurrence, fm.actblue_contribution_id, fm.actblue_receipt_id,
     fm.contributed_at, 'Founding Member', 'founding_member', fm.id)
  on conflict (founding_member_id) do update set
     full_name = excluded.full_name, email = excluded.email, city = excluded.city,
     county = excluded.county, state = excluded.state, amount_cents = excluded.amount_cents,
     recurrence = excluded.recurrence, actblue_contribution_id = excluded.actblue_contribution_id,
     actblue_receipt_id = excluded.actblue_receipt_id, contributed_at = excluded.contributed_at,
     source = 'founding_member'
  returning d.id into v_donor_id;

  update public.prospects
     set donor_id = v_donor_id
   where founding_member_id = fm.id and (donor_id is distinct from v_donor_id);
end $$;

create or replace function public.donor_sync_fm_trigger()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.donor_sync_founding_member(new.id);
  return new;
end $$;

-- 'zz' prefix => fires AFTER trg_founding_members_to_prospects (so the prospect exists).
drop trigger if exists trg_zz_fm_to_donor on public.founding_members;
create trigger trg_zz_fm_to_donor after insert or update on public.founding_members
  for each row execute function public.donor_sync_fm_trigger();

-- Backfill (dedup-safe)
update public.donors d
set founding_member_id = fm.id, source = 'founding_member'
from public.founding_members fm
where d.founding_member_id is null
  and d.email is not null and fm.email is not null
  and lower(d.email::text) = lower(fm.email::text);

insert into public.donors
  (full_name, email, city, county, state, amount_cents, recurrence,
   actblue_contribution_id, actblue_receipt_id, contributed_at, reason, source, founding_member_id)
select coalesce(nullif(fm.full_name,''), fm.display_name, 'Anonymous'), fm.email, fm.city, fm.county, fm.state,
       fm.amount_cents, fm.recurrence, fm.actblue_contribution_id, fm.actblue_receipt_id,
       fm.contributed_at, 'Founding Member', 'founding_member', fm.id
from public.founding_members fm
where not exists (select 1 from public.donors d where d.founding_member_id = fm.id);

update public.prospects p
set donor_id = d.id
from public.donors d
where d.founding_member_id = p.founding_member_id
  and p.founding_member_id is not null
  and p.donor_id is distinct from d.id;

-- Dashboard: exclude member-sourced donor rows so totals are not double-counted.
create or replace view public.fundraising_dashboard as
select
  ( (select coalesce(sum(amount_cents),0) from public.founding_members)
    + (select coalesce(sum(amount_cents),0) from public.donors where source is distinct from 'founding_member')
  ) as secured_pac_cents,
  (select count(*) from public.founding_members) as founding_members_count,
  1969 as founding_members_target,
  (select count(*) from public.donors where source is distinct from 'founding_member') as other_pac_donors_count,
  (select count(*) from public.pac_prospects
     where status='active' and (stage <> all (array['secured','declined','lapsed']))) as pac_pipeline_count,
  (select coalesce(sum(committed_amount_cents),0) from public.pac_prospects where status='active') as pac_committed_cents,
  (select coalesce(sum(capacity_estimate_cents),0) from public.pac_prospects where status='active') as pac_capacity_cents,
  (select count(*) from public.c4_prospects
     where status='active' and (stage <> all (array['secured','declined','lapsed']))) as c4_pipeline_count,
  (select coalesce(sum(committed_amount_cents),0) from public.c4_prospects where status='active') as c4_committed_cents,
  (select coalesce(sum(capacity_estimate_cents),0) from public.c4_prospects where status='active') as c4_capacity_cents;

-- ----------------------------------------------------------------------------
-- 4) members_crm view (no public/vetted filter, newest first) + perms
-- ----------------------------------------------------------------------------
create or replace view public.members_crm
with (security_invoker = on) as
select
  fm.id,
  fm.founding_number,
  coalesce(nullif(fm.display_name,''), nullif(fm.full_name,''), 'Anonymous') as display_name,
  fm.full_name, fm.email, fm.city, fm.county, fm.state, fm.elected_office, fm.jurisdiction,
  public.founding_member_tier(fm.amount_cents, fm.recurrence) as tier,
  fm.amount_cents, fm.recurrence, fm.public_quote, fm.is_public, fm.is_vetted,
  fm.contributed_at, fm.contributed_at as member_since, fm.created_at, fm.updated_at,
  d.id as donor_id, d.source as donor_source,
  p.id as prospect_id, p.stage as prospect_stage
from public.founding_members fm
left join public.donors d    on d.founding_member_id = fm.id
left join public.prospects p on p.founding_member_id = fm.id
order by fm.contributed_at desc nulls last, fm.founding_number desc nulls last;

grant select on public.members_crm to authenticated;

insert into public.role_permissions(role_slug, module, action)
select v.role_slug, 'members', v.action
from (values
  ('super_admin','read'),('super_admin','write'),('super_admin','admin'),('super_admin','manage_users'),
  ('treasurer','read'),('treasurer','write'),
  ('board_member','read'),
  ('comms_lead','read')
) as v(role_slug, action)
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_slug = v.role_slug and rp.module = 'members' and rp.action = v.action
);
