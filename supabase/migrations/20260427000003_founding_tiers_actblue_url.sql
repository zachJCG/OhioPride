-- =============================================================================
-- 20260427000003_founding_tiers_actblue_url.sql
-- Adds the per-tier ActBlue URL so the public /founding-members page can
-- wrap each tier-legend card in a real anchor that goes straight to
-- ActBlue. URLs match the buttons currently hardcoded in
-- /donate/founding-member.html, so nothing changes on the donate page;
-- this just lets every other surface that lists tiers reuse them.
-- =============================================================================

alter table public.founding_member_tiers
    add column if not exists actblue_url text;

update public.founding_member_tiers
   set actblue_url = case slug
       when 'stonewall-sustainer' then 'https://secure.actblue.com/donate/ohio-pride-pac?amount=19.69&recurring=true&refcode=website_founding_stonewall'
       when 'founding-member'     then 'https://secure.actblue.com/donate/ohio-pride-pac?amount=25&refcode=website_founding_member'
       when 'pride-builder'       then 'https://secure.actblue.com/donate/ohio-pride-pac?amount=50&recurring=true&refcode=website_founding_pride_builder'
       when 'founding-circle'     then 'https://secure.actblue.com/donate/ohio-pride-pac?amount=100&recurring=true&refcode=website_founding_circle'
       when 'founding-patron'     then 'https://secure.actblue.com/donate/ohio-pride-pac?refcode=website_founding_patron'
       else actblue_url
   end
 where actblue_url is null
    or actblue_url = '';
