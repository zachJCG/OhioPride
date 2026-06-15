-- Contacts module 10: fuzzy duplicate finder.
-- Enables pg_trgm and a trigram index on contacts.name, then exposes an admin-only
-- RPC that suggests likely duplicates for a contact by: same phone, same last name +
-- ZIP, or trigram-similar name. Never auto-merges. SECURITY DEFINER with an is_admin()
-- gate so it returns nothing to non-admins. anon execute revoked.
-- Applied to production 2026-06-15 (version 20260615170117).

create extension if not exists pg_trgm;
create index if not exists contacts_name_trgm on public.contacts using gin (name gin_trgm_ops);

create or replace function public.contacts_possible_duplicates(p_id uuid)
returns table (
  id uuid, name text, email text, phone text, region text,
  roles text[], needs_review boolean, match_reason text, score real
)
language sql stable security definer set search_path = public as $$
  with me as (select * from public.contacts where id = p_id)
  select c.id, c.name, c.email::text, c.phone, c.region, c.roles, c.needs_review,
    case
      when me.phone is not null
           and length(regexp_replace(me.phone,'[^0-9]','','g')) >= 10
           and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') = regexp_replace(me.phone,'[^0-9]','','g')
        then 'Same phone'
      when me.last_name is not null and me.zip is not null
           and lower(c.last_name) = lower(me.last_name) and c.zip = me.zip
        then 'Same last name + ZIP'
      else 'Similar name'
    end as match_reason,
    similarity(coalesce(c.name,''), coalesce(me.name,'')) as score
  from public.contacts c cross join me
  where public.is_admin()
    and c.id <> me.id
    and coalesce(c.is_merged, false) = false
    and (
      (me.phone is not null and length(regexp_replace(me.phone,'[^0-9]','','g')) >= 10
         and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') = regexp_replace(me.phone,'[^0-9]','','g'))
      or (me.last_name is not null and me.zip is not null
         and lower(c.last_name) = lower(me.last_name) and c.zip = me.zip)
      or (me.name is not null and length(me.name) >= 4
         and similarity(coalesce(c.name,''), me.name) >= 0.4)
    )
  order by score desc nulls last
  limit 25;
$$;

revoke all on function public.contacts_possible_duplicates(uuid) from public, anon;
grant execute on function public.contacts_possible_duplicates(uuid) to authenticated, service_role;
