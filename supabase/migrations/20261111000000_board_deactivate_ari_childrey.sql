-- =============================================================================
-- Board: deactivate Ari Childrey (2026-11-11)
-- -----------------------------------------------------------------------------
-- Removes Ari Childrey from the public /board grid. Requested by Zach on
-- 2026-11-11; the founding board is now nine members, and the /board and
-- /about copy ("Nine fierce Ohioans", the hero numeral, the board-member stat)
-- ships with this change.
--
-- Soft delete, not a DELETE. `board_members.is_active` exists for exactly this
-- case: /api/board-members filters on is_active = true, so flipping the flag
-- drops the card while the row, the bio and the display_order survive if she
-- ever rejoins. A hard delete would also orphan anything referencing the id
-- (site_leadership.board_member_id, for instance).
--
-- Idempotent and self-checking: keyed on the name, and the DO block aborts if
-- the row is missing (renamed row, wrong environment) so the migration cannot
-- pass silently without doing what it claims. Re-running it is a no-op once
-- is_active is already false.
--
-- NOT in scope: her Supabase Auth account and admin role grants from
-- docs/db/applied-2026-08-06/03_contacts_no_email_backfill_and_board_access.sql
-- (comms_lead + board_member) are untouched. Revoking admin access is a
-- separate decision.
-- =============================================================================

do $$
declare
  touched integer;
begin
  update public.board_members
     set is_active  = false,
         updated_at = now()
   where name = 'Ari Childrey';

  get diagnostics touched = row_count;

  if touched = 0 then
    raise exception
      'board_members row for "Ari Childrey" not found; refusing to apply silently';
  end if;
end $$;
