-- ALREADY APPLIED to the live Supabase project (dkdxefzhttkmjhdbkvqn) on 2026-08-06 via MCP.
-- Kept in the repo for history/parity. DO NOT re-apply.

-- The endorsements admin already queried these; the tables never existed. Columns match the page payloads.
create table public.endorsement_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.endorsement_applications(id) on delete cascade,
  reviewer_user_id uuid,
  reviewer_email citext not null,
  reviewer_name text,
  vote text not null check (vote in ('endorse','lean_endorse','neutral','lean_decline','decline','abstain','recuse')),
  recommendation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, reviewer_email)
);
create trigger trg_endorsement_reviews_updated before update on public.endorsement_reviews
  for each row execute function public.set_updated_at();

create table public.endorsement_assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.endorsement_applications(id) on delete cascade,
  assignee_user_id uuid,
  assignee_email citext not null,
  assignee_name text,
  role_label text,
  assigned_by text,
  assigned_at timestamptz not null default now()
);

create table public.endorsement_activity (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.endorsement_applications(id) on delete cascade,
  actor_email text,
  actor_name text,
  event_type text not null,
  summary text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_endorsement_reviews_app     on public.endorsement_reviews(application_id);
create index idx_endorsement_assignments_app on public.endorsement_assignments(application_id);
create index idx_endorsement_activity_app    on public.endorsement_activity(application_id);

alter table public.endorsement_reviews     enable row level security;
alter table public.endorsement_assignments enable row level security;
alter table public.endorsement_activity    enable row level security;
-- (read policies: has_permission('endorsements','read'); write: has_permission('endorsements','write') -- applied live)
grant select, insert, update, delete on public.endorsement_reviews, public.endorsement_assignments, public.endorsement_activity to authenticated;
