-- Run AFTER the code PR removing public/launch-day.html + public/js/launch-signup.js is deployed.
-- Table is already empty and anon-revoked; rows live in archive.launch_signups_20260806.
--
-- merge_contacts() still repoints launch_signups.contact_id, so the function
-- must drop that line FIRST or every merge in the Contacts review queue would
-- start failing with "relation launch_signups does not exist". This is the
-- live function body minus that one update.

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
  update newsletter_subscribers     set contact_id = p_winner where contact_id = p_loser;
  update network_contacts           set contact_id = p_winner where contact_id = p_loser;
  update press_conference_attendees set contact_id = p_winner where contact_id = p_loser;
  update signup_sheet_imports       set contact_id = p_winner where contact_id = p_loser;
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

drop table if exists public.launch_signups;
