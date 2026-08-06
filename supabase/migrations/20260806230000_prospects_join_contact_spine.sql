-- Put pac_prospects on the contacts spine so one person can be a contact, a
-- member, a volunteer, a network contact and a prospect at the same time,
-- which is how the People modules are organised.
--
-- Every other people table already links this way through the generic
-- link_or_create_contact() trigger, which reads the row's email and either
-- adopts the existing contact or creates one, adding its role.
--
-- No backfill: all 657 current prospects were built from public record
-- research and none carries an email, so there is nothing to match on. Name
-- matching 657 rows automatically would merge the wrong people, so linking
-- happens the moment a prospect gains an email, and by hand from the module
-- before then.

alter table public.pac_prospects
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists idx_pac_prospects_contact on public.pac_prospects (contact_id);

drop trigger if exists trg_link_contact on public.pac_prospects;
create trigger trg_link_contact
  before insert or update of email on public.pac_prospects
  for each row execute function public.link_or_create_contact('prospect');

-- merge_contacts has to repoint prospects too, or a merge would strand them
-- on the tombstoned contact. This is the live body plus that one line.
create or replace function public.merge_contacts(p_winner uuid, p_loser uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'merge_contacts: not authorized' using errcode = '42501';
  end if;
  if p_winner = p_loser then return; end if;
  update donors                     set contact_id = p_winner where contact_id = p_loser;
  update volunteers                 set contact_id = p_winner where contact_id = p_loser;
  update pride_volunteers           set contact_id = p_winner where contact_id = p_loser;
  update founding_members           set contact_id = p_winner where contact_id = p_loser;
  update launch_signups             set contact_id = p_winner where contact_id = p_loser;
  update newsletter_subscribers     set contact_id = p_winner where contact_id = p_loser;
  update network_contacts           set contact_id = p_winner where contact_id = p_loser;
  update press_conference_attendees set contact_id = p_winner where contact_id = p_loser;
  update signup_sheet_imports       set contact_id = p_winner where contact_id = p_loser;
  update pac_prospects              set contact_id = p_winner where contact_id = p_loser;
  update contacts w set
    roles   = (select array(select distinct unnest(w.roles   || l.roles))),
    sources = (select array(select distinct unnest(w.sources || l.sources))),
    tags    = (select array(select distinct unnest(w.tags    || l.tags))),
    phone   = coalesce(w.phone, l.phone),
    zip     = coalesce(w.zip, l.zip),
    city    = coalesce(w.city, l.city),
    county  = coalesce(w.county, l.county),
    region  = coalesce(w.region, l.region),
    full_name = coalesce(w.full_name, l.full_name)
  from contacts l where w.id = p_winner and l.id = p_loser;
  update contacts set is_merged = true, merged_into = p_winner, needs_review = false
   where id = p_loser;
end;
$function$;

-- The People modules read this to show, from any person, which modules they
-- appear in. security_invoker so it reads under the caller's RLS.
drop view if exists public.person_modules;
create view public.person_modules
with (security_invoker = on) as
select
  c.id as contact_id,
  c.email,
  c.full_name,
  exists (select 1 from public.donors d            where d.contact_id = c.id) as is_donor,
  exists (select 1 from public.founding_members f  where f.contact_id = c.id) as is_member,
  exists (select 1 from public.volunteers v        where v.contact_id = c.id) as is_volunteer,
  exists (select 1 from public.network_contacts n  where n.contact_id = c.id) as is_network,
  exists (select 1 from public.pac_prospects p     where p.contact_id = c.id) as is_prospect,
  exists (select 1 from public.newsletter_subscribers s where s.contact_id = c.id) as is_newsletter
from public.contacts c
where c.is_merged = false;

grant select on public.person_modules to authenticated;
