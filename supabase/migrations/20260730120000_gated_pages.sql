-- =============================================================================
-- gated_pages: content for internal, access-controlled pages.
-- =============================================================================
-- Why this table exists
-- --------------------
-- Pages like /governor-guide are internal while a compliance review is open,
-- but ohiopride.org's source is a public repository. Storing their content in
-- the repo would publish it no matter how good the gate is, which is why the
-- guide has been shipping as an AES-encrypted blob decrypted in the browser.
-- That works, but the content can only be edited by decrypting, editing, and
-- re-encrypting, and the blob has to survive a document.write() rewrite, which
-- is what broke the lineup on iOS Safari.
--
-- Keeping the body here instead means the page is an ordinary server-rendered
-- route: the content never reaches a client that has not passed the gate, and
-- editing is a database update.
--
-- Access model
-- ------------
-- No public read. RLS is on and there is no policy for anon or authenticated,
-- so the only way in is the service-role key, which lives server side in the
-- Next.js route. The gate itself (Supabase magic links for /governor-guide,
-- shared password for /PRTraining) is enforced in middleware before the route
-- ever loads a row.

create table if not exists public.gated_pages (
  slug          text primary key,
  title         text        not null,
  body_html     text        not null,
  -- Kept out of the index and out of link previews until publication is a
  -- deliberate act. The Next route reads this to decide whether to emit
  -- Open Graph tags and an indexable robots directive.
  is_public     boolean     not null default false,
  -- Free text so the page can show "Last verified July 30, 2026" without the
  -- editor having to touch a timestamp column that also tracks edits.
  verified_note text,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

comment on table public.gated_pages is
  'Bodies of internal, access-controlled pages. Service-role read only; never exposed to anon.';

create or replace function public.gated_pages_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gated_pages_set_updated_at on public.gated_pages;
create trigger gated_pages_set_updated_at
  before update on public.gated_pages
  for each row execute function public.gated_pages_touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: deny by default, no public policy on purpose.
-- -----------------------------------------------------------------------------
alter table public.gated_pages enable row level security;

-- service_role bypasses RLS, but the explicit policy documents the intent and
-- keeps the grant surface obvious to the next reader.
drop policy if exists "gated_pages service_role all" on public.gated_pages;
create policy "gated_pages service_role all"
  on public.gated_pages
  for all
  to service_role
  using (true)
  with check (true);

-- Deliberately no grant to anon or authenticated. If a future admin editor
-- needs browser-side writes, gate it through an /api route using the service
-- role rather than widening this.
revoke all on public.gated_pages from anon, authenticated;
