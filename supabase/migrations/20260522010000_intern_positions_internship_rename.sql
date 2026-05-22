-- ============================================================================
-- Intern application positions: rename to volunteer/internship vocabulary.
--   chief_of_staff          (unchanged)
--   graphics_social_media   -> digital_internship
--   volunteer_coordinator   -> volunteer_internship
--   legislative_director    -> legislative_internship
--   policy_aide             -> legislative_internship   (collapsed; same scope)
-- ============================================================================

alter table public.intern_applications
  drop constraint if exists intern_applications_position_check;

update public.intern_applications
   set position = case position
     when 'graphics_social_media' then 'digital_internship'
     when 'volunteer_coordinator' then 'volunteer_internship'
     when 'legislative_director'  then 'legislative_internship'
     when 'policy_aide'           then 'legislative_internship'
     else position
   end
 where position in (
   'graphics_social_media',
   'volunteer_coordinator',
   'legislative_director',
   'policy_aide'
 );

alter table public.intern_applications
  add constraint intern_applications_position_check
  check (position in (
    'chief_of_staff',
    'legislative_internship',
    'volunteer_internship',
    'digital_internship'
  ));

create or replace view public.intern_applications_admin as
select
  ia.*,
  case ia.position
    when 'chief_of_staff'          then 'Chief of Staff'
    when 'legislative_internship'  then 'Legislative Internship'
    when 'volunteer_internship'    then 'Volunteer Internship'
    when 'digital_internship'      then 'Digital Internship'
    else ia.position
  end as position_label,
  case ia.term
    when 'summer_2026' then 'Summer 2026'
    when 'fall_2026'   then 'Fall 2026'
    when 'either'      then 'Summer or Fall 2026'
    else ia.term
  end as term_label
from public.intern_applications ia;

grant select on public.intern_applications_admin to authenticated;
