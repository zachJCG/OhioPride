-- Contacts module 07: atomic merge function.
-- Repoints every linked table from loser -> winner, unions arrays, keeps the most
-- complete scalar values, and tombstones the loser. Called from the admin UI.
-- NOTE: superseded by 08, which adds an is_admin() guard + tightens grants.
-- Applied to production 2026-06-15 (version 20260615164615).

create or replace function public.merge_contacts(p_winner uuid, p_loser uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
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
$$;
