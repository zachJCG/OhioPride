-- Endorsement votes reduce to yes / no / abstain.
--
-- The seven-value ladder (endorse, lean_endorse, neutral, lean_decline,
-- decline, abstain, recuse) asked the board to express a degree of enthusiasm
-- when the only decision the bylaws recognize is whether the PAC endorses.
-- Every graded value had to be collapsed back into for/against/other to be
-- counted anyway, so the nuance was recorded and then discarded. The
-- recommendation field carries any nuance a member wants on the record.
--
-- Mapping of the old vocabulary:
--   endorse, lean_endorse        -> yes
--   decline, lean_decline        -> no
--   neutral, abstain, recuse     -> abstain
--
-- In practice all live rows are 'endorse', so this is a rename for the data
-- that exists; the other branches are here so the migration is correct against
-- any environment that did record them.

alter table public.endorsement_reviews
  drop constraint if exists endorsement_reviews_vote_check;

update public.endorsement_reviews set vote = case vote
  when 'endorse'      then 'yes'
  when 'lean_endorse' then 'yes'
  when 'decline'      then 'no'
  when 'lean_decline' then 'no'
  when 'neutral'      then 'abstain'
  when 'recuse'       then 'abstain'
  else vote
end
where vote in ('endorse', 'lean_endorse', 'decline', 'lean_decline', 'neutral', 'recuse');

alter table public.endorsement_reviews
  add constraint endorsement_reviews_vote_check
  check (vote in ('yes', 'no', 'abstain'));
