-- Contacts module 06: forward-sync triggers.
-- Keeps public.contacts canonical going forward. On insert/update of `email` on any
-- person table, upsert the canonical contact by email and stamp contact_id. Defensive
-- reads via to_jsonb(NEW) so one function works across tables with different shapes.
-- Applied to production 2026-06-15 (version 20260615164603).

create or replace function public.link_or_create_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j           jsonb := to_jsonb(new);
  v_role      text  := tg_argv[0];
  v_email     citext;
  v_full      text;
  v_first     text;
  v_last      text;
  v_phone     text;
  v_zip       text;
  v_city      text;
  v_county    text;
  v_id        uuid;
begin
  v_email := nullif(btrim(lower(coalesce(j->>'email',''))), '')::citext;
  if v_email is null or v_email::text not like '%@%.%' then
    return new;
  end if;

  v_full  := nullif(btrim(coalesce(j->>'full_name','')), '');
  v_first := nullif(btrim(coalesce(j->>'first_name','')), '');
  v_last  := nullif(btrim(coalesce(j->>'last_name','')), '');
  v_phone := nullif(btrim(coalesce(j->>'phone','')), '');
  v_zip   := nullif(btrim(coalesce(j->>'zip','')), '');
  v_city  := nullif(btrim(coalesce(j->>'city','')), '');
  v_county:= nullif(btrim(coalesce(j->>'county','')), '');

  insert into public.contacts (email, full_name, first_name, last_name, phone, zip, city, county,
                               roles, sources, source)
  values (v_email, v_full, v_first, v_last, v_phone, v_zip, v_city, v_county,
          array[v_role], array[v_role], v_role)
  on conflict (email) do update set
    roles      = (select array(select distinct unnest(public.contacts.roles   || array[v_role]))),
    sources    = (select array(select distinct unnest(public.contacts.sources || array[v_role]))),
    full_name  = coalesce(public.contacts.full_name, excluded.full_name),
    first_name = coalesce(public.contacts.first_name, excluded.first_name),
    last_name  = coalesce(public.contacts.last_name, excluded.last_name),
    phone      = coalesce(public.contacts.phone, excluded.phone),
    zip        = coalesce(public.contacts.zip, excluded.zip),
    city       = coalesce(public.contacts.city, excluded.city),
    county     = coalesce(public.contacts.county, excluded.county),
    updated_at = now()
  returning id into v_id;

  new.contact_id := v_id;
  return new;
end;
$$;

drop trigger if exists trg_link_contact on public.donors;
create trigger trg_link_contact before insert or update of email on public.donors
  for each row execute function public.link_or_create_contact('donor');

drop trigger if exists trg_link_contact on public.volunteers;
create trigger trg_link_contact before insert or update of email on public.volunteers
  for each row execute function public.link_or_create_contact('volunteer');

drop trigger if exists trg_link_contact on public.pride_volunteers;
create trigger trg_link_contact before insert or update of email on public.pride_volunteers
  for each row execute function public.link_or_create_contact('volunteer');

drop trigger if exists trg_link_contact on public.founding_members;
create trigger trg_link_contact before insert or update of email on public.founding_members
  for each row execute function public.link_or_create_contact('founding_member');

drop trigger if exists trg_link_contact on public.launch_signups;
create trigger trg_link_contact before insert or update of email on public.launch_signups
  for each row execute function public.link_or_create_contact('launch_signup');

drop trigger if exists trg_link_contact on public.newsletter_subscribers;
create trigger trg_link_contact before insert or update of email on public.newsletter_subscribers
  for each row execute function public.link_or_create_contact('newsletter');

drop trigger if exists trg_link_contact on public.network_contacts;
create trigger trg_link_contact before insert or update of email on public.network_contacts
  for each row execute function public.link_or_create_contact('network');

drop trigger if exists trg_link_contact on public.press_conference_attendees;
create trigger trg_link_contact before insert or update of email on public.press_conference_attendees
  for each row execute function public.link_or_create_contact('press');
