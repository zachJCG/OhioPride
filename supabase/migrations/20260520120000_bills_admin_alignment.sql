-- =============================================================================
-- 20260520120000_bills_admin_alignment.sql
-- Reconciles /admin/bills with /admin/legislators, /scorecard, and /issues.
--
-- Before this migration:
--   * /admin/bills (admin/bills/index.html) reads columns that don't exist
--     on public.bills: bill_number, category, chamber_of_origin, introduced_on,
--     last_action_on, is_featured, what_it_does, impact, equality_impact_note,
--     legal_risks, official_bill_url, bill_text_pdf_url, enacted_text_url.
--   * As a result the admin grid renders mostly empty cells and the intern
--     has no way to add or edit a bill.
--
-- After this migration:
--   1. Those columns exist on public.bills (additive, idempotent).
--   2. Existing rows are backfilled from the columns the Netlify bills.mjs
--      function and /issues already populate (label -> bill_number,
--      chamber -> chamber_of_origin, categories[1] -> category).
--   3. A bills_canonical view exposes a normalised shape both the public
--      /issues page and /admin/bills can read from.
--   4. RLS write policy already exists from 20260520020000 (bills:write).
--      We add an extra grant for INSERT so the admin client (authenticated
--      user with bills:write) can create new rows via PostgREST.
--
-- Idempotent. Safe to re-apply.
-- =============================================================================


-- 1. Add the columns /admin/bills expects.
alter table public.bills
  add column if not exists bill_number          text,
  add column if not exists category             text,
  add column if not exists chamber_of_origin    text
    check (chamber_of_origin in ('house','senate','joint') or chamber_of_origin is null),
  add column if not exists introduced_on        date,
  add column if not exists last_action_on       date,
  add column if not exists is_featured          boolean      not null default false,
  add column if not exists what_it_does         text,
  add column if not exists impact               text,
  add column if not exists equality_impact_note text,
  add column if not exists legal_risks          text,
  add column if not exists official_bill_url    text,
  add column if not exists bill_text_pdf_url    text,
  add column if not exists enacted_text_url     text;


-- 2. Backfill from columns the public site already populates.
update public.bills
   set bill_number = label
 where bill_number is null
   and label is not null;

update public.bills
   set chamber_of_origin = chamber
 where chamber_of_origin is null
   and chamber in ('house','senate','joint');

update public.bills
   set category = coalesce(category, categories[1])
 where category is null
   and categories is not null
   and cardinality(categories) > 0;


-- 3. Indexes for the admin grid sorts.
create index if not exists bills_bill_number_idx     on public.bills (bill_number);
create index if not exists bills_status_idx          on public.bills (status);
create index if not exists bills_introduced_on_idx   on public.bills (introduced_on);
create index if not exists bills_last_action_on_idx  on public.bills (last_action_on);


-- 4. Canonical read view both surfaces can share.
drop view if exists public.bills_canonical;
create view public.bills_canonical as
select
  b.id,
  b.slug,
  coalesce(b.bill_number, b.label)              as bill_number,
  b.label,
  b.title,
  b.nickname,
  b.official_title,
  b.stance,
  b.status,
  b.status_label,
  b.status_color,
  coalesce(b.chamber_of_origin, b.chamber)      as chamber,
  b.category,
  b.categories,
  b.category_labels,
  b.summary,
  b.what_it_does,
  b.impact,
  b.equality_impact_note,
  b.legal_risks,
  b.sponsors_text,
  b.last_action,
  b.last_action_on,
  b.introduced_on,
  b.next_date,
  b.house_vote,
  b.current_step,
  b.is_featured,
  b.is_active,
  b.display_order,
  b.ga,
  coalesce(b.url, '/issues/' || b.slug)            as url,
  b.legislature_url,
  coalesce(b.official_bill_url, b.legislature_url) as official_bill_url,
  coalesce(b.bill_text_pdf_url, b.text_url)        as bill_text_pdf_url,
  b.enacted_text_url,
  b.created_at,
  b.updated_at
from public.bills b;

grant select on public.bills_canonical to anon, authenticated;


-- 5. Reaffirm INSERT/UPDATE grants for the admin client.
grant insert, update, delete on public.bills to authenticated;


-- 6. Helper: deterministic slug suggestion when the intern creates a bill.
create or replace function public.suggest_bill_slug(p_bill_number text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_bill_number, ''), '\s+', '', 'g'));
$$;

grant execute on function public.suggest_bill_slug(text) to anon, authenticated;


-- 7. Documentation.
comment on column public.bills.bill_number          is 'Display label for the admin grid. Falls back to label.';
comment on column public.bills.chamber_of_origin    is 'Originating chamber. Mirrors the public chamber column.';
comment on column public.bills.category             is 'Single primary category. Long form lives in categories[].';
comment on column public.bills.introduced_on        is 'Date the bill was introduced. Drives the admin grid sort.';
comment on column public.bills.last_action_on       is 'Date of last recorded action. Drives the admin grid sort.';
comment on column public.bills.is_featured          is 'When true, the bill is pinned to the top of /issues.';
comment on column public.bills.what_it_does         is 'Plain-language explainer shown on the per-bill detail page.';
comment on column public.bills.equality_impact_note is 'Specific note on how the bill affects LGBTQ+ Ohioans.';
comment on column public.bills.legal_risks          is 'Constitutional and statutory concerns.';
comment on column public.bills.official_bill_url    is 'Canonical link to the bill page at legislature.ohio.gov.';
comment on column public.bills.bill_text_pdf_url    is 'Direct PDF of the bill text.';
comment on column public.bills.enacted_text_url     is 'Link to the enacted text (if the bill became law).';
