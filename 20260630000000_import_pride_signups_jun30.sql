-- Migration: import June 30, 2026 Pride sign-up scan (new rows only)
-- Source scan: "Scanned Jun 30, 2026 at 2:57:23 PM.pdf" (Google Drive folder 1OKmcluRGt42CjjKfXslBxuWECeFbe2dn)
-- Applied to prod (Supabase dkdxefzhttkmjhdbkvqn) on 2026-06-30 via the Supabase MCP.
-- Committed here for version-control parity only.
--
-- Idempotent: every row is guarded by NOT EXISTS on the citext email (case-insensitive).
-- Re-running this migration inserts nothing new and is safe in CI / shadow DBs.
--
-- Context: the Jun 30 scan was a 2-page RE-SCAN that overlapped the Jun 23 sheets.
-- Of its 18 filled rows, 11 were already on file (deduped by email, incl. gmail dot-variants
-- like roberts.nicole.e vs robertsnicole.e) and were skipped. The 7 genuinely new rows are below.
-- All rows: needs_review = true; contact_id left null (linked later via the Contacts module).

insert into public.signup_sheet_imports
  (source_file, page_no, row_no, name, email, phone, zip, confidence, needs_review, notes)
select v.source_file, v.page_no, v.row_no, v.name, v.email::citext, v.phone, v.zip, v.confidence, true, v.notes
from (values
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf', 1, 6,  'Corey Baker',    'teachercarey@gmail.com',     null,          '43215', 'medium', 'Jun 30 scan p1 r6. No phone on sheet. Columbus 43215.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf', 2, 1,  'Jessica Rezin',  'jurez@hotmail.com',          '614-565-4369','43225', 'low',    'Jun 30 scan p2 r1. Name 2nd line unclear (looks like "Ashime"); email could be j.rez@ or jurez@hotmail.com. Columbus 43225.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf', 2, 5,  'Spencer Kaup',   'spencer.kaup1@gmail.com',    null,          '43224', 'medium', 'Jun 30 scan p2 r5. Phone written "n/a". Columbus 43224.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf', 2, 8,  'Andrew Grazetta','ampguzze9@gmail.com',        '330-265-0167','44102', 'low',    'Jun 30 scan p2 r8. EMAIL ILLEGIBLE - best guess ampguzze9@gmail.com; sheet shows a #-like mark and no ".com". DO NOT SEND until confirmed. Cleveland 44102.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf', 2, 9,  'Jahmar Danel',   'jahmar.r.danel@gmail.com',   '513-592-9454','45204', 'low',    'Jun 30 scan p2 r9. Name Jahmar/Jahman Danel; email ".com" not written (assumed). ZIP ~45204 (Cincinnati).'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf', 2, 10, 'Seth Walker',    'sethical94@gmail.com',       '859-962-7187','41032', 'low',    'Jun 30 scan p2 r10. Email ".com" not written (assumed). ZIP 41032 + area code 859 = Kentucky (out of state) - verify.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf', 2, 11, 'Amber Ballard',  'ballard4norwood@gmail.com',  '513-675-7885','45212', 'medium', 'Jun 30 scan p2 r11. Norwood/Cincinnati 45212. Sheet had a "C4 board" annotation next to this row.')
) as v(source_file, page_no, row_no, name, email, phone, zip, confidence, notes)
where not exists (
  select 1 from public.signup_sheet_imports s where s.email = v.email::citext
);

-- Verify (optional):
--   select count(*) from public.signup_sheet_imports;                                          -- expect 291
--   select count(*) from public.signup_sheet_imports where imported_at::date = date '2026-06-30'; -- expect 7
