-- Advisor hardening: pin search_path on the 11 functions flagged by the
-- Supabase security advisor as function_search_path_mutable. Pure hardening,
-- no behavior change: every one of these already resolves its objects in
-- public. (The security_definer_view findings are NOT bulk-fixed here — views
-- like founding_members_public and legislator_scorecard are definer on
-- purpose so the public site can read curated slices of RLS-locked tables;
-- see docs/db/advisors-2026-08-06.md for the per-view breakdown.)

alter function public.assign_founding_number() set search_path = public;
alter function public.event_weight(p_stage text) set search_path = public;
alter function public.fill_oh_county() set search_path = public;
alter function public.lookup_oh_county(p_city text, p_state text) set search_path = public;
alter function public.resolve_legislator_vote(p_chamber text, p_district integer, p_party text, p_roll_call_id uuid) set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.state_full_name(code text) set search_path = public;
alter function public.suggest_bill_slug(p_bill_number text) set search_path = public;
alter function public.sync_public_with_vetted() set search_path = public;
alter function public.tasks_touch_timestamps() set search_path = public;
alter function public.volunteers_set_updated_at() set search_path = public;
