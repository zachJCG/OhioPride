-- Run AFTER the code PR removing public/launch-day.html + public/js/launch-signup.js is deployed.
-- Table is already empty and anon-revoked; rows live in archive.launch_signups_20260806.
drop table if exists public.launch_signups;
