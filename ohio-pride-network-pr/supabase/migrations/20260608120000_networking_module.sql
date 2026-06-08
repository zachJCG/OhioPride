-- ============================================================================
-- Ohio Pride PAC :: Networking Module
-- Migration: 20260608120000_networking_module
--
-- Regionally-focused relationship + warm-intro-path tracker.
-- Modeled on the existing prospects / pac_prospects / c4_prospects pattern:
--   * base tables with RLS via public.has_permission(module, action)
--   * security_invoker views (same as *_pipeline views)
--   * role_permissions seeded for a new 'networking' module
--
-- IDEMPOTENT: safe to run on a fresh dev branch or re-run on production.
-- NOTE: This was already applied to the production project (ref dkdxefzhttkmjhdbkvqn)
--       on 2026-06-08. It is committed here for repo history + Supabase branching.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABLES
-- ----------------------------------------------------------------------------
create table if not exists public.network_contacts (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  full_name             text not null,
  first_name            text,
  last_name             text,
  title                 text,
  organization          text,
  sector                text,
  email                 text,
  phone                 text,
  linkedin_url          text,
  website               text,
  city                  text,
  county                text,
  region                text,                 -- 'Statewide','National','Out-of-state', or an OH metro
  state                 text default 'OH',
  zip                   text,
  influence_tier        text default 'contact', -- principal | connector | gatekeeper | staffer | contact
  relationship_strength int  check (relationship_strength between 1 and 5),
  warmth                text default 'cold',    -- cold | warm | hot
  is_target             boolean not null default false,
  is_connector          boolean not null default false,
  priority              text default 'medium',  -- low | medium | high
  status                text default 'active',  -- active | dormant | do_not_contact | archived
  do_not_contact        boolean not null default false,
  owner_id              uuid,
  card_image_path       text,
  tags                  text[] not null default '{}',
  source                text,
  how_they_help         text,
  ask_context           text,
  last_contacted_at     timestamptz,
  next_action           text,
  next_action_date      date,
  notes                 text
);

create table if not exists public.network_introductions (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  connector_id        uuid not null references public.network_contacts(id) on delete cascade,
  target_id           uuid not null references public.network_contacts(id) on delete cascade,
  relationship_label  text,
  strength            int  not null default 3 check (strength between 1 and 5),
  status              text not null default 'potential', -- potential | requested | made | declined | blocked
  confidence          text default 'medium',
  notes               text,
  requested_at        timestamptz,
  made_at             timestamptz,
  constraint network_intro_no_self check (connector_id <> target_id),
  constraint network_intro_unique  unique (connector_id, target_id)
);

create table if not exists public.network_activities (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  contact_id    uuid not null references public.network_contacts(id) on delete cascade,
  activity_type text not null default 'note',  -- note | call | email | meeting | event | intro_made
  subject       text,
  body          text,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid,
  actor_email   text,
  metadata      jsonb not null default '{}'::jsonb
);

create table if not exists public.network_business_cards (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  image_path    text,
  raw_notes     text,
  parsed        jsonb not null default '{}'::jsonb,
  captured_at   timestamptz not null default now(),
  event_context text,
  location      text,
  region        text,
  county        text,
  status        text not null default 'inbox',  -- inbox | processed | discarded
  contact_id    uuid references public.network_contacts(id) on delete set null
);

-- ----------------------------------------------------------------------------
-- 2) INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_netc_region       on public.network_contacts (region);
create index if not exists idx_netc_county       on public.network_contacts (county);
create index if not exists idx_netc_is_target    on public.network_contacts (is_target)    where is_target;
create index if not exists idx_netc_is_connector on public.network_contacts (is_connector) where is_connector;
create index if not exists idx_netc_status       on public.network_contacts (status);
create index if not exists idx_netc_owner        on public.network_contacts (owner_id);
create index if not exists idx_netc_tags         on public.network_contacts using gin (tags);
create index if not exists idx_neti_connector    on public.network_introductions (connector_id);
create index if not exists idx_neti_target       on public.network_introductions (target_id);
create index if not exists idx_neti_status       on public.network_introductions (status);
create index if not exists idx_neta_contact      on public.network_activities (contact_id, occurred_at desc);
create index if not exists idx_netbc_status      on public.network_business_cards (status);

-- ----------------------------------------------------------------------------
-- 3) updated_at TRIGGERS (reuse existing public.set_updated_at)
-- ----------------------------------------------------------------------------
drop trigger if exists trg_netc_updated on public.network_contacts;
create trigger trg_netc_updated before update on public.network_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_neti_updated on public.network_introductions;
create trigger trg_neti_updated before update on public.network_introductions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4) RLS
-- ----------------------------------------------------------------------------
alter table public.network_contacts      enable row level security;
alter table public.network_introductions enable row level security;
alter table public.network_activities     enable row level security;
alter table public.network_business_cards enable row level security;

-- network_contacts
drop policy if exists netc_select on public.network_contacts;
create policy netc_select on public.network_contacts for select to authenticated
  using (has_permission('networking','read'));
drop policy if exists netc_insert on public.network_contacts;
create policy netc_insert on public.network_contacts for insert to authenticated
  with check (has_permission('networking','write'));
drop policy if exists netc_update on public.network_contacts;
create policy netc_update on public.network_contacts for update to authenticated
  using (has_permission('networking','write')) with check (has_permission('networking','write'));
drop policy if exists netc_delete on public.network_contacts;
create policy netc_delete on public.network_contacts for delete to authenticated
  using (has_permission('networking','admin'));

-- network_introductions
drop policy if exists neti_select on public.network_introductions;
create policy neti_select on public.network_introductions for select to authenticated
  using (has_permission('networking','read'));
drop policy if exists neti_insert on public.network_introductions;
create policy neti_insert on public.network_introductions for insert to authenticated
  with check (has_permission('networking','write'));
drop policy if exists neti_update on public.network_introductions;
create policy neti_update on public.network_introductions for update to authenticated
  using (has_permission('networking','write')) with check (has_permission('networking','write'));
drop policy if exists neti_delete on public.network_introductions;
create policy neti_delete on public.network_introductions for delete to authenticated
  using (has_permission('networking','admin'));

-- network_activities
drop policy if exists neta_select on public.network_activities;
create policy neta_select on public.network_activities for select to authenticated
  using (has_permission('networking','read'));
drop policy if exists neta_insert on public.network_activities;
create policy neta_insert on public.network_activities for insert to authenticated
  with check (has_permission('networking','write'));
drop policy if exists neta_update on public.network_activities;
create policy neta_update on public.network_activities for update to authenticated
  using (has_permission('networking','write')) with check (has_permission('networking','write'));
drop policy if exists neta_delete on public.network_activities;
create policy neta_delete on public.network_activities for delete to authenticated
  using (has_permission('networking','admin'));

-- network_business_cards
drop policy if exists netbc_select on public.network_business_cards;
create policy netbc_select on public.network_business_cards for select to authenticated
  using (has_permission('networking','read'));
drop policy if exists netbc_insert on public.network_business_cards;
create policy netbc_insert on public.network_business_cards for insert to authenticated
  with check (has_permission('networking','write'));
drop policy if exists netbc_update on public.network_business_cards;
create policy netbc_update on public.network_business_cards for update to authenticated
  using (has_permission('networking','write')) with check (has_permission('networking','write'));
drop policy if exists netbc_delete on public.network_business_cards;
create policy netbc_delete on public.network_business_cards for delete to authenticated
  using (has_permission('networking','admin'));

-- ----------------------------------------------------------------------------
-- 5) ROLE PERMISSIONS (idempotent seed for new 'networking' module)
-- ----------------------------------------------------------------------------
insert into public.role_permissions(role_slug, module, action)
select v.role_slug, 'networking', v.action
from (values
  ('super_admin','read'),('super_admin','write'),('super_admin','admin'),('super_admin','manage_users'),
  ('treasurer','read'),('treasurer','write'),
  ('board_member','read'),('board_member','write'),
  ('comms_lead','read'),
  ('legislative_lead','read')
) as v(role_slug, action)
where not exists (
  select 1 from public.role_permissions rp
  where rp.role_slug = v.role_slug and rp.module = 'networking' and rp.action = v.action
);

-- ----------------------------------------------------------------------------
-- 6) GRANTS
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.network_contacts      to authenticated;
grant select, insert, update, delete on public.network_introductions to authenticated;
grant select, insert, update, delete on public.network_activities     to authenticated;
grant select, insert, update, delete on public.network_business_cards to authenticated;

-- ----------------------------------------------------------------------------
-- 7) VIEWS (security_invoker = on, same as *_pipeline views)
-- ----------------------------------------------------------------------------
create or replace view public.network_contacts_directory
with (security_invoker = on) as
select
  c.*,
  au.full_name as owner_name,
  (select count(*) from public.network_activities a where a.contact_id = c.id)           as activity_count,
  (select max(a.occurred_at) from public.network_activities a where a.contact_id = c.id) as last_activity_at,
  (select count(*) from public.network_introductions i where i.target_id    = c.id)      as inbound_path_count,
  (select count(*) from public.network_introductions i where i.connector_id = c.id)      as outbound_intro_count
from public.network_contacts c
left join public.admin_users au on au.id = c.owner_id;

create or replace view public.network_intro_paths
with (security_invoker = on) as
select
  i.id, i.status, i.strength, i.confidence, i.relationship_label, i.notes,
  i.requested_at, i.made_at, i.created_at,
  conn.id as connector_id, conn.full_name as connector_name, conn.organization as connector_org,
  conn.region as connector_region, conn.county as connector_county,
  conn.relationship_strength as connector_closeness,
  tgt.id as target_id, tgt.full_name as target_name, tgt.organization as target_org,
  tgt.region as target_region, tgt.county as target_county,
  tgt.influence_tier as target_tier, tgt.is_target as target_is_target, tgt.priority as target_priority
from public.network_introductions i
join public.network_contacts conn on conn.id = i.connector_id
join public.network_contacts tgt  on tgt.id  = i.target_id;

create or replace view public.network_target_paths
with (security_invoker = on) as
select
  p.target_id, p.target_name, p.target_org, p.target_region, p.target_county,
  p.target_tier, p.target_priority,
  count(*)                                  as path_count,
  max(p.strength)                           as best_strength,
  count(*) filter (where p.status = 'made') as paths_made,
  string_agg(
    p.connector_name || ' (' || coalesce(p.connector_region, p.connector_county, '?')
      || ', ' || p.strength || '/5, ' || p.status || ')',
    '; ' order by p.strength desc, p.connector_name
  ) as connector_paths
from public.network_intro_paths p
group by 1,2,3,4,5,6,7;

create or replace view public.network_by_region
with (security_invoker = on) as
select
  coalesce(nullif(region,''),'Unspecified')               as region,
  count(*)                                                 as contact_count,
  count(*) filter (where is_target)                        as target_count,
  count(*) filter (where is_connector)                     as connector_count,
  count(*) filter (where warmth = 'hot')                   as hot_count,
  count(*) filter (where warmth = 'warm')                  as warm_count,
  count(*) filter (where next_action_date is not null
                     and next_action_date <= current_date) as actions_due
from public.network_contacts
where status <> 'archived'
group by 1
order by contact_count desc;

grant select on public.network_contacts_directory to authenticated;
grant select on public.network_intro_paths         to authenticated;
grant select on public.network_target_paths        to authenticated;
grant select on public.network_by_region           to authenticated;

-- ----------------------------------------------------------------------------
-- 8) STORAGE: private bucket for business-card images
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('network-cards', 'network-cards', false)
on conflict (id) do nothing;

drop policy if exists network_cards_read on storage.objects;
create policy network_cards_read on storage.objects for select to authenticated
  using (bucket_id = 'network-cards' and has_permission('networking','read'));
drop policy if exists network_cards_write on storage.objects;
create policy network_cards_write on storage.objects for insert to authenticated
  with check (bucket_id = 'network-cards' and has_permission('networking','write'));
drop policy if exists network_cards_update on storage.objects;
create policy network_cards_update on storage.objects for update to authenticated
  using (bucket_id = 'network-cards' and has_permission('networking','write'))
  with check (bucket_id = 'network-cards' and has_permission('networking','write'));
drop policy if exists network_cards_delete on storage.objects;
create policy network_cards_delete on storage.objects for delete to authenticated
  using (bucket_id = 'network-cards' and has_permission('networking','admin'));
