-- =============================================================================
-- Board retreat: reject retired August dates server-side
-- -----------------------------------------------------------------------------
-- Six August 2026 dates are hard conflicts for the Director or Secretary, or
-- have three of four submitters unavailable, so they were removed from the
-- /board-retreat scheduling grid:
--
--   2026-08-01, 2026-08-08, 2026-08-15, 2026-08-16, 2026-08-22, 2026-08-23
--
-- The grid no longer renders them, but the client must not be the only gate.
-- This replaces submit_board_retreat() to raise 'date_not_available' if any
-- submitted slot lands on a retired date, so a stale or crafted client cannot
-- write orphaned rows back into board_retreat_slots.
--
-- Nothing else about the function changes. The table schemas are untouched.
-- =============================================================================

create or replace function public.submit_board_retreat(
  p_respondent_id uuid,
  p_notes text,
  p_slots jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_submission_id uuid;
  v_has_submitted boolean;
  v_name          text;
begin
  select has_submitted, full_name
    into v_has_submitted, v_name
  from public.board_retreat_respondents
  where id = p_respondent_id
  for update;

  if not found then
    raise exception 'respondent_not_found';
  end if;

  if v_has_submitted then
    raise exception 'already_submitted';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'no_slots_selected';
  end if;

  -- Retired dates: mirror of EXCLUDED_DATES in /board-retreat/index.html.
  if exists (
    select 1
    from jsonb_array_elements(p_slots) as elem
    where (elem->>'date')::date in (
      date '2026-08-01', date '2026-08-08', date '2026-08-15',
      date '2026-08-16', date '2026-08-22', date '2026-08-23'
    )
  ) then
    raise exception 'date_not_available';
  end if;

  insert into public.board_retreat_submissions (respondent_id, respondent_name, notes)
  values (p_respondent_id, v_name, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_submission_id;

  insert into public.board_retreat_slots (submission_id, slot_date, segment, mode)
  select
    v_submission_id,
    (elem->>'date')::date,
    elem->>'segment',
    elem->>'mode'
  from jsonb_array_elements(p_slots) as elem;

  update public.board_retreat_respondents
     set has_submitted = true,
         submitted_at  = now()
   where id = p_respondent_id;

  return v_submission_id;
end;
$function$;
