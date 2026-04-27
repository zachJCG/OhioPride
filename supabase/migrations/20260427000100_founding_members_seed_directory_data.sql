-- ============================================================
-- 20260427000100_founding_members_seed_directory_data.sql
-- Backfills county for the original three. Inserts Matt Joseph
-- (Founding Circle, Dayton City Commissioner). Assigns
-- founding_number 1..N to public+vetted rows in contribution
-- order with full_name as a deterministic tie-breaker.
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. County backfill for the seeded three
UPDATE public.founding_members SET county = 'Montgomery'
  WHERE full_name = 'Nicole Green' AND county IS NULL;
UPDATE public.founding_members SET county = 'Hamilton'
  WHERE full_name = 'Zachary Smith' AND county IS NULL;
UPDATE public.founding_members SET county = 'Hamilton'
  WHERE full_name = 'Jesse Shepherd' AND county IS NULL;

-- 2. Matt Joseph: Founding Circle ($100/month), Dayton City Commissioner.
INSERT INTO public.founding_members
  (full_name, display_name, amount_cents, recurrence,
   city, county, elected_office, jurisdiction,
   is_public, is_vetted, contributed_at, notes)
SELECT
  'Matt Joseph', 'Matt Joseph', 10000, 'monthly',
  'Dayton', 'Montgomery', 'City Commissioner', 'City of Dayton',
  true, true, '2026-04-27 12:00:00+00',
  'First elected official in the Founding Circle. Roster confirmed by ZRJ.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.founding_members WHERE full_name = 'Matt Joseph'
);

-- 3. Assign founding_number to any public+vetted member without one,
--    starting one above the current max so existing numbers are preserved.
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
