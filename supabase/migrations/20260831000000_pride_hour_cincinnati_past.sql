-- Cincinnati's Pride Hour has happened (2026-08-26). Sunset it.
--
-- The public page was removed on 2026-08-31 and /pride-hour now redirects to
-- /events, where the event lives on as a card under Past. The row stays: it
-- owns the RSVPs that came in, and /admin/events is where the roster is read.
-- Only its status changes, so it stops counting as upcoming.
--
-- The seed in 20260806240000_events_and_rsvps.sql inserts with
-- `on conflict (slug) do nothing`, so this states the new status directly.

update public.events
   set status = 'past'
 where slug = 'pride-hour-cincinnati';
