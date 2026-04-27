-- ============================================================
-- 20260427000000_founding_members_directory_fields.sql
-- Adds geographic, elected-office, quote, and sequence-number
-- fields to founding_members. Rebuilds founding_members_public
-- view to expose them. Preserves the PII boundary (full_name,
-- email, notes never leave the view layer).
-- Powers the Founding Members directory page.
-- ============================================================

-- 1. New columns on founding_members
ALTER TABLE public.founding_members
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS elected_office text,
  ADD COLUMN IF NOT EXISTS jurisdiction text,
  ADD COLUMN IF NOT EXISTS public_quote text,
  ADD COLUMN IF NOT EXISTS founding_number integer;

COMMENT ON COLUMN public.founding_members.city IS 'Optional city of residence. Public via the public view.';
COMMENT ON COLUMN public.founding_members.county IS 'Ohio county of residence. Validated against the 88-county list. Public via the public view.';
COMMENT ON COLUMN public.founding_members.elected_office IS 'Title of any office the member currently holds (e.g. "City Commissioner"). Optional. Triggers the elected-official badge on the public site.';
COMMENT ON COLUMN public.founding_members.jurisdiction IS 'Where the member''s office sits (e.g. "City of Dayton", "OH-30"). Optional.';
COMMENT ON COLUMN public.founding_members.public_quote IS 'Optional one-line "why I joined" quote. Member must consent.';
COMMENT ON COLUMN public.founding_members.founding_number IS 'Sequential 1..1969 position assigned in contribution order. Stable once set.';

-- 2. Validate counties against the 88
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'founding_members_county_valid'
  ) THEN
    ALTER TABLE public.founding_members
      ADD CONSTRAINT founding_members_county_valid
      CHECK (county IS NULL OR county IN (
        'Adams','Allen','Ashland','Ashtabula','Athens','Auglaize','Belmont','Brown','Butler','Carroll',
        'Champaign','Clark','Clermont','Clinton','Columbiana','Coshocton','Crawford','Cuyahoga','Darke','Defiance',
        'Delaware','Erie','Fairfield','Fayette','Franklin','Fulton','Gallia','Geauga','Greene','Guernsey',
        'Hamilton','Hancock','Hardin','Harrison','Henry','Highland','Hocking','Holmes','Huron','Jackson',
        'Jefferson','Knox','Lake','Lawrence','Licking','Logan','Lorain','Lucas','Madison','Mahoning',
        'Marion','Medina','Meigs','Mercer','Miami','Monroe','Montgomery','Morgan','Morrow','Muskingum',
        'Noble','Ottawa','Paulding','Perry','Pickaway','Pike','Portage','Preble','Putnam','Richland',
        'Ross','Sandusky','Scioto','Seneca','Shelby','Stark','Summit','Trumbull','Tuscarawas','Union',
        'Van Wert','Vinton','Warren','Washington','Wayne','Williams','Wood','Wyandot'
      ));
  END IF;
END $$;

-- 3. Founding number constraints
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'founding_members_number_unique') THEN
    ALTER TABLE public.founding_members
      ADD CONSTRAINT founding_members_number_unique UNIQUE (founding_number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'founding_members_number_range') THEN
    ALTER TABLE public.founding_members
      ADD CONSTRAINT founding_members_number_range
      CHECK (founding_number IS NULL OR (founding_number >= 1 AND founding_number <= 1969));
  END IF;
END $$;

-- 4. Helpful indexes for directory queries
CREATE INDEX IF NOT EXISTS idx_founding_members_county
  ON public.founding_members (county) WHERE is_public = true AND is_vetted = true;
CREATE INDEX IF NOT EXISTS idx_founding_members_elected
  ON public.founding_members (elected_office) WHERE elected_office IS NOT NULL AND is_public = true AND is_vetted = true;
CREATE INDEX IF NOT EXISTS idx_founding_members_number
  ON public.founding_members (founding_number);

-- 5. Rebuild the public view to expose directory fields
DROP VIEW IF EXISTS public.founding_members_public;
CREATE VIEW public.founding_members_public AS
  SELECT
    id,
    founding_number,
    COALESCE(NULLIF(display_name, ''), 'Anonymous') AS display_name,
    founding_member_tier(amount_cents, recurrence) AS tier,
    city,
    county,
    elected_office,
    jurisdiction,
    public_quote,
    contributed_at
  FROM public.founding_members
  WHERE is_public = true
    AND is_vetted = true;

COMMENT ON VIEW public.founding_members_public IS
  'Public-facing founding members. Excludes PII (full_name, email, notes). Powers the Founding Members directory page.';

GRANT SELECT ON public.founding_members_public TO anon, authenticated;
