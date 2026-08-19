-- Cincinnati's Pride Hour now starts at 6:30 PM, not 6:00.
--
-- The seed in 20260806240000_events_and_rsvps.sql inserts with
-- `on conflict (slug) do nothing`, so it cannot correct a row that already
-- exists in production. This states the new time directly.
--
-- The end time is unchanged (8:00 PM); the flyer and every public page now
-- read "6:30 - 8:00 PM".

update public.events
   set starts_at = '2026-08-26 18:30:00-04'
 where slug = 'pride-hour-cincinnati';
