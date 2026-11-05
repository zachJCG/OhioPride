-- =============================================================================
-- Post-election refresh, phase 3 (2026-11-05): incumbent flag + confirmed 2026
-- results, exposed on public_endorsements.
--
-- Additive. Seeds 13 won / 7 lost, confirmed by Zach on 2026-11-05 (work order
-- 7.1). Each seeded row is keyed on its id AND on the editorial `match` key
-- (lower(btrim(candidate_name))) that /endorsements/<slug> resolves through,
-- so a renamed or swapped row cannot be seeded by accident; any disagreement
-- aborts the whole migration and nothing is written.
--
-- Why a new `incumbent` column rather than reusing `is_incumbent`:
--   is_incumbent is the questionnaire answer to "Are you a current or former
--   officeholder?". It is nullable, the public form fills it, and it drives the
--   incumbent-only questions, the admin badges and the board packet. A school
--   board member who wins a council seat is an officeholder (packet: yes) but
--   was not the incumbent in that seat (badge: Elected, not Re-elected). One
--   column cannot be right for both, so `incumbent` is admin-set only and
--   means "held this seat going into the election".
-- =============================================================================

-- ── 1. incumbent: held THIS seat going in. Admin-set, never by the form ──────
alter table public.endorsement_applications
  add column if not exists incumbent boolean not null default false;

comment on column public.endorsement_applications.incumbent is
  'Whether the endorsee held the seat they ran for going into the election. Set in the admin results panel, never by the public form; turns a won result into "Re-elected". Not is_incumbent, which is the questionnaire answer to "Are you a current or former officeholder?".';

-- ── 2. result_updated_at also follows incumbent (it changes the public badge) ─
create or replace function public.endorsement_stamp_result()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.result is distinct from old.result
     or new.result_note is distinct from old.result_note
     or new.incumbent is distinct from old.incumbent then
    new.result_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_endorsement_stamp_result on public.endorsement_applications;
create trigger trg_endorsement_stamp_result
  before update of result, result_note, incumbent on public.endorsement_applications
  for each row execute function public.endorsement_stamp_result();

-- ── 3. Leaving endorsed clears incumbent with the other endorsee-only columns ─
create or replace function public.endorsement_stamp_endorsed_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status = 'endorsed' and old.status is distinct from 'endorsed' then
    new.endorsed_at := coalesce(new.endorsed_at, new.reviewed_at, now());
  elsif new.status is distinct from 'endorsed' then
    new.endorsed_at := null;
    new.is_published := false;
    if new.result is not null or new.result_note is not null or new.incumbent then
      new.result_updated_at := now();
    end if;
    new.result := null;
    new.result_note := null;
    new.incumbent := false;
  end if;
  return new;
end;
$$;

-- ── 4. The anon insert gate pins incumbent too ───────────────────────────────
-- Rewritten rather than supplemented: permissive policies are OR'd, so a
-- second policy would widen the gate instead of narrowing it.
drop policy if exists "anon can submit applications" on public.endorsement_applications;
create policy "anon can submit applications" on public.endorsement_applications
  for insert to anon
  with check (
    status = 'submitted'
    and reviewer_notes is null
    and reviewed_by is null
    and reviewed_at is null
    and endorsed_at is null
    and (photo_path is null or photo_path like ('submissions/' || id::text || '/%'))
    and cycle_id is not null
    and was_late = false
    and public.cycle_accepts_applications(cycle_id)
    and is_published is not true
    and result is null
    and result_note is null
    and result_updated_at is null
    and incumbent is not true
  );

-- ── 5. A result (or incumbency) only on an endorsee ─────────────────────────
-- Current data satisfies it: no non-endorsed row carries a result or note.
alter table public.endorsement_applications
  drop constraint if exists endorsement_result_requires_endorsed;
alter table public.endorsement_applications
  add constraint endorsement_result_requires_endorsed
  check ((result is null and result_note is null and incumbent is not true)
         or status is not distinct from 'endorsed');

-- ── 6. Seed the confirmed 2026 results (work order 7.1) ─────────────────────
do $$
declare
  n_endorsed int; n_updated int; n_won int; n_lost int; n_inc int;
begin
  select count(*) into n_endorsed
    from public.endorsement_applications
   where cycle = 2026 and status = 'endorsed';

  -- A fresh database (supabase db reset) has no 2026 endorsees: nothing to seed.
  if n_endorsed = 0 then
    raise notice 'phase 3 seed: no 2026 endorsees in this database; skipped';
    return;
  end if;

  -- status is deliberately not in the SET list: touching it would fire the
  -- clearing trigger. result_updated_at is also stamped by the trigger; it is
  -- set here explicitly because 7.1 asks for it on every seeded row.
  update public.endorsement_applications a
     set result            = s.result,
         incumbent         = s.incumbent,
         result_updated_at = now()
    from (values
      ('cassandra-rice',    '209a8d12-ec3e-4df4-8c6e-26c7da709c55'::uuid, 'cassandra a rice',  'won',  false),
      ('christine-cockley', '633531af-710f-4531-b5a1-25b97d8a98ba'::uuid, 'christine cockley', 'won',  true),
      ('jessica-miranda',   '06be0c4a-80e2-4ad8-9a02-190efd2898d9'::uuid, 'jessica miranda',   'won',  true),
      ('karen-brownlee',    '94437733-b623-4304-8794-92cf6cf7d6d3'::uuid, 'karen brownlee',    'won',  true),
      ('karl-keith',        '61491fda-d647-4936-90f0-87ac93943c0d'::uuid, 'karl keith',        'won',  true),
      ('manisha-kotian',    'cf2aca3d-4683-48fb-beeb-a05ca0fa71ec'::uuid, 'manisha kotian',    'won',  false),
      ('mike-baker',        '73ce227d-51e3-4f36-8509-4cb4607ee362'::uuid, 'mike baker',        'won',  false),
      ('noah-spinner',      'eab14b66-3908-44d0-82ce-dedac4e8a79a'::uuid, 'noah spinner',      'won',  false),
      ('rose-lounsbury',    'fc8390d1-87dd-45a9-b09c-741afd43d1c3'::uuid, 'rose lounsbury',    'won',  false),
      ('sarah-henry',       'ac1e2e5a-53d8-495d-a517-7cf8192ba583'::uuid, 'sarah henry',       'won',  false),
      ('seth-walsh',        'a1ec627b-ba26-4fd3-8eda-269af150f661'::uuid, 'seth walsh',        'won',  false),
      ('stacie-baker',      '1a2227ae-4c3d-47da-99f5-0387d917ef3d'::uuid, 'stacie baker',      'won',  false),
      ('tiffany-evans',     '718efdb2-076f-42c9-9e6c-360d7a2e0bd6'::uuid, 'tiffany evans',     'won',  false),
      ('caleb-price',       'c5f87e2c-7710-4a35-95f8-cc31baaa967c'::uuid, 'caleb price',       'lost', false),
      ('cara-jacob',        'dda61783-8397-4f6e-aebf-21065dfd6473'::uuid, 'cara jacob',        'lost', false),
      ('jeff-givan',        'e0a06beb-59f4-4272-b21e-a6066381f98d'::uuid, 'jeff givan',        'lost', false),
      ('job-perry',         '349eb56f-fe37-483e-b56c-dbcfebe8ddf4'::uuid, 'job esau perry',    'lost', false),
      ('jordan-haire',      '3443671a-9f55-4e0f-981f-29a263989cd5'::uuid, 'jordan haire',      'lost', false),
      ('lora-covrett',      '1b8a7521-41ad-4cca-adce-5a441997ec17'::uuid, 'lora covrett',      'lost', false),
      ('paul-kurtz',        '9f98b7dc-f2cf-42b7-95cd-82b4637771ce'::uuid, 'paul kurtz',        'lost', false)
    ) as s(slug, id, match, result, incumbent)
   where a.id = s.id
     and lower(btrim(a.candidate_name)) = s.match
     and a.cycle = 2026
     and a.status = 'endorsed';
  get diagnostics n_updated = row_count;

  select count(*) filter (where result = 'won'),
         count(*) filter (where result = 'lost'),
         count(*) filter (where result = 'won' and incumbent)
    into n_won, n_lost, n_inc
    from public.endorsement_applications
   where cycle = 2026 and status = 'endorsed';

  if n_endorsed <> 20 or n_updated <> 20 or n_won <> 13 or n_lost <> 7 or n_inc <> 4 then
    raise exception 'phase 3 seed: expected 20 2026 endorsees (13 won, 4 of them incumbents; 7 lost); found % endorsed, % matched, % won, % incumbent winners, % lost. Nothing written.',
      n_endorsed, n_updated, n_won, n_inc, n_lost;
  end if;
end $$;

-- ── 7. Public view: the same 15 columns in order, two appended ──────────────
-- CREATE OR REPLACE only accepts new columns at the end, and it keeps the
-- grants. Never DROP VIEW (that loses them) and never security_invoker: anon
-- has no SELECT on the table itself.
create or replace view public.public_endorsements as
  select id,
         candidate_name,
         pronouns,
         office_sought,
         district,
         election_year,
         website,
         bio,
         is_out,
         coalesce(endorsed_at, reviewed_at, updated_at) as endorsed_at,
         endorsement_path::text                         as endorsement_path,
         county,
         cycle,
         result,
         result_note,
         incumbent,
         race_level::text                               as race_level
    from public.endorsement_applications
   where status = 'endorsed'
     and is_published;

comment on view public.public_endorsements is
  'The only public surface for endorsements: endorsed and published rows, with the cycle year, the election result, whether a winner held the seat going in (incumbent), and the race level. Anon has no SELECT on the table itself.';

-- ── 8. Views are read surfaces (phase 1 review fix, restated for this view) ──
revoke insert, update, delete, truncate, references, trigger
  on public.public_endorsements from anon, authenticated;
