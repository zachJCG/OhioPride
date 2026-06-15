-- Contacts module 08: advisor hardening for the forward-sync + merge functions.
-- Both functions were created with the default EXECUTE grant to PUBLIC, which made
-- merge_contacts callable by anon via RPC. This guards merge with is_admin() and
-- removes anon/public execute from both. Trigger functions fire regardless of the
-- caller's EXECUTE grant, so revoking from anon/authenticated does not break sync.
-- Applied to production 2026-06-15 (version 20260615164821).

create or replace function public.merge_contacts(p_winner uuid, p_loser uuid)
returns void language plpgsql security definer set search_path = public as $$
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

-- Trigger function: not meant to be called directly. Triggers fire regardless of EXECUTE grant.
revoke all on function public.link_or_create_contact() from public, anon, authenticated;
grant execute on function public.link_or_create_contact() to service_role;

-- Merge: admins (authenticated) + service_role only; never anon/public.
revoke all on function public.merge_contacts(uuid, uuid) from public, anon;
grant execute on function public.merge_contacts(uuid, uuid) to authenticated, service_role;
