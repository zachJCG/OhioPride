-- ============================================================
-- 20260427000400_matt_joseph_circle_and_samuel_dorf.sql
-- 1. Upgrade Matt Joseph to Founding Circle ($100/mo). The
--    20260427000100 seed used WHERE NOT EXISTS, so if ActBlue
--    had already created his row at $25 one-time (Founding
--    Member), the seed skipped him and the public page rendered
--    the wrong tier. Force the canonical amount/recurrence here.
-- 2. Insert Samuel Dorf (Oakwood, Montgomery; City Council).
--    Idempotent.
-- ============================================================

-- 1. Matt Joseph -> Founding Circle (10000 cents monthly).
--    Match by lower(full_name) LIKE so middle initials/suffixes don't matter.
--    Scoped to the most recent contribution row for that person.
WITH matt AS (
    SELECT id FROM public.founding_members
    WHERE LOWER(full_name) LIKE 'matthew%joseph%'
       OR LOWER(full_name) LIKE 'matt%joseph%'
    ORDER BY contributed_at DESC
    LIMIT 1
)
UPDATE public.founding_members
   SET amount_cents = 10000,
       recurrence   = 'monthly',
       city         = COALESCE(city, 'Dayton'),
       county       = COALESCE(county, 'Montgomery'),
       elected_office = COALESCE(elected_office, 'City Commissioner'),
       jurisdiction   = COALESCE(jurisdiction, 'City of Dayton')
 WHERE id IN (SELECT id FROM matt);

-- 2. Samuel Dorf - Oakwood, Montgomery County, City Council.
INSERT INTO public.founding_members
  (full_name, display_name, amount_cents, recurrence,
   city, county, elected_office, jurisdiction,
   is_public, is_vetted, contributed_at, notes)
SELECT
  'Samuel Dorf', 'Samuel Dorf', 2500, 'one_time',
  'Oakwood', 'Montgomery', 'City Council', 'City of Oakwood',
  true, true, '2026-04-27 18:00:00+00',
  'Founding member #5. Oakwood City Council. Roster confirmed by ZRJ.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.founding_members
   WHERE LOWER(full_name) LIKE 'samuel%dorf%'
      OR LOWER(full_name) LIKE 'sam%dorf%'
);

-- 3. Re-assign founding_number to any public+vetted row that doesn't
--    have one yet (e.g. the Samuel Dorf row we just inserted), starting
--    one above the current max so existing numbers are preserved.
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY contributed_at, full_name) AS rn
    FROM public.founding_members
   WHERE is_public = true
     AND is_vetted = true
     AND founding_number IS NULL
),
nextstart AS (
  SELECT COALESCE(MAX(founding_number), 0) AS base FROM public.founding_members
)
UPDATE public.founding_members fm
   SET founding_number = ns.base + o.rn
  FROM ordered o, nextstart ns
 WHERE fm.id = o.id;
