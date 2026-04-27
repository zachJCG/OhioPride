-- =====================================================================
-- 20260427000001_founding_members_county_from_zip.sql
-- Make founding_members.county_name authoritatively driven by ZIP.
--
-- Adds:
--   * founding_members.zip column (5-char text, normalized)
--   * founding_members.county_name column (derived)
--   * trigger: on insert/update, set county_name from ohio_zip_county
--   * back-fill for existing rows
--
-- Assumes:
--   * public.founding_members exists (created in 20260421000000_initial_schema.sql)
--   * public.ohio_zip_county exists (created in 20260427000000_ohio_zip_county.sql)
--
-- Safe to run more than once (uses IF NOT EXISTS / CREATE OR REPLACE).
-- =====================================================================

ALTER TABLE public.founding_members
    ADD COLUMN IF NOT EXISTS zip            TEXT,
    ADD COLUMN IF NOT EXISTS county_name    TEXT,
    ADD COLUMN IF NOT EXISTS county_fips    TEXT,
    ADD COLUMN IF NOT EXISTS display_order  INTEGER;

CREATE INDEX IF NOT EXISTS idx_founding_members_zip            ON public.founding_members (zip);
CREATE INDEX IF NOT EXISTS idx_founding_members_county_name    ON public.founding_members (county_name);
CREATE INDEX IF NOT EXISTS idx_founding_members_display_order  ON public.founding_members (display_order NULLS LAST);

-- ---------------------------------------------------------------------
-- Normalise ZIP to 5-digit string (handles "45420-1234" and stray spaces)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_zip(p_zip TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(LPAD(LEFT(REGEXP_REPLACE(COALESCE(p_zip, ''), '[^0-9]', '', 'g'), 5), 5, '0'), '');
$$;

-- ---------------------------------------------------------------------
-- Trigger: keep county_name / county_fips in sync with zip
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_founding_members_set_county()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_zip TEXT;
    v_county_name TEXT;
    v_county_fips TEXT;
BEGIN
    v_zip := public.normalize_zip(NEW.zip);
    NEW.zip := v_zip;

    IF v_zip IS NULL THEN
        NEW.county_name := NULL;
        NEW.county_fips := NULL;
        RETURN NEW;
    END IF;

    SELECT county_name, county_fips
      INTO v_county_name, v_county_fips
      FROM public.ohio_zip_county
     WHERE zip = v_zip
       AND is_primary_county = TRUE
     LIMIT 1;

    NEW.county_name := v_county_name;
    NEW.county_fips := v_county_fips;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_founding_members_set_county ON public.founding_members;
CREATE TRIGGER trg_founding_members_set_county
    BEFORE INSERT OR UPDATE OF zip ON public.founding_members
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_founding_members_set_county();

-- ---------------------------------------------------------------------
-- Back-fill existing rows
-- ---------------------------------------------------------------------
UPDATE public.founding_members fm
SET    zip         = public.normalize_zip(fm.zip),
       county_name = z.county_name,
       county_fips = z.county_fips
FROM   public.ohio_zip_county z
WHERE  z.is_primary_county = TRUE
  AND  z.zip = public.normalize_zip(fm.zip);

-- Clear county on rows whose ZIP didn't match (rare: PO-Box-only ZIPs, out-of-state)
UPDATE public.founding_members
SET    county_name = NULL,
       county_fips = NULL
WHERE  zip IS NOT NULL
  AND  zip NOT IN (SELECT zip FROM public.ohio_zip_county WHERE is_primary_county = TRUE);
