-- =====================================================================
-- 20260427_current_donor_reorder.sql
-- Apply public display order: Zach, Jesse, Nicole, Matt.
-- ZIP -> county is derived automatically by the trigger on founding_members.
--
-- Run AFTER:
--   * 20260427000000_ohio_zip_county.sql
--   * 20260427000001_founding_members_county_from_zip.sql
--
-- Idempotent.
-- =====================================================================

-- Match by lower(full_name) LIKE so middle initials, suffixes, etc. don't get
-- in the way. Each UPDATE is scoped to the most-recent contribution for that
-- person, in case there are multiple rows under the same name.

WITH zach AS (
    SELECT id FROM public.founding_members
    WHERE LOWER(full_name) LIKE 'zachary%smith%' OR LOWER(full_name) = 'zach smith'
    ORDER BY contributed_at DESC LIMIT 1
)
UPDATE public.founding_members SET zip = '45202', display_order = 1
WHERE id IN (SELECT id FROM zach);

WITH jesse AS (
    SELECT id FROM public.founding_members
    WHERE LOWER(full_name) LIKE 'jesse%shepherd%'
    ORDER BY contributed_at DESC LIMIT 1
)
UPDATE public.founding_members SET zip = '45248', display_order = 2
WHERE id IN (SELECT id FROM jesse);

WITH nicole AS (
    SELECT id FROM public.founding_members
    WHERE LOWER(full_name) LIKE 'nicole%green%'
    ORDER BY contributed_at DESC LIMIT 1
)
UPDATE public.founding_members SET zip = '45420', display_order = 3
WHERE id IN (SELECT id FROM nicole);

WITH matt AS (
    SELECT id FROM public.founding_members
    WHERE LOWER(full_name) LIKE 'matthew%joseph%' OR LOWER(full_name) LIKE 'matt%joseph%'
    ORDER BY contributed_at DESC LIMIT 1
)
UPDATE public.founding_members SET zip = '45420', display_order = 4
WHERE id IN (SELECT id FROM matt);

-- 3. Verification
SELECT display_order, full_name, zip, county_name, usps_city, amount
FROM   public.founding_members
WHERE  LOWER(full_name) IN (
        LOWER('Zachary V Smith'),
        LOWER('Jesse Shepherd'),
        LOWER('Nicole Green'),
        LOWER('Matthew Joseph')
       )
ORDER  BY display_order;
