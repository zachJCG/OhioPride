-- ============================================================
-- 20260427000500_matt_joseph_back_to_founding_member.sql
-- Reverts the upgrade in 20260427000400. Matt Joseph is a
-- Founding Member ($25 one-time), not Founding Circle.
-- Idempotent.
-- ============================================================

WITH matt AS (
    SELECT id FROM public.founding_members
    WHERE LOWER(full_name) LIKE 'matthew%joseph%'
       OR LOWER(full_name) LIKE 'matt%joseph%'
    ORDER BY contributed_at DESC
    LIMIT 1
)
UPDATE public.founding_members
   SET amount_cents = 2500,
       recurrence   = 'one_time'
 WHERE id IN (SELECT id FROM matt);
