-- Endorsement votes are endorse / decline / abstain.
--
-- Follows 20260807000000, which collapsed the seven-value ladder to three.
-- The count was right but the words were wrong: the board is not answering a
-- yes/no question, it is deciding whether the PAC endorses. "Endorse" and
-- "Decline" name the action being taken, and they match the application
-- statuses (endorsed / declined) the vote drives.
--
--   yes -> endorse
--   no  -> decline
--   abstain unchanged

alter table public.endorsement_reviews
  drop constraint if exists endorsement_reviews_vote_check;

update public.endorsement_reviews set vote = case vote
  when 'yes' then 'endorse'
  when 'no'  then 'decline'
  else vote
end
where vote in ('yes', 'no');

alter table public.endorsement_reviews
  add constraint endorsement_reviews_vote_check
  check (vote in ('endorse', 'decline', 'abstain'));
