-- Migration: import June 30, 2026 Pride sign-up re-scan into public.signup_sheet_imports
-- Source scan: "Scanned Jun 30, 2026 at 2:57:23 PM.pdf"
-- Context: the Jun 30 scan was largely a re-scan of the Jun 23 sign-up sheets. Of its 18 OCR'd
--   rows, 11 were already on file (matched by email) and were skipped; only these 7 are new.
--   All carry needs_review = true.
-- State: ALREADY APPLIED to remote project dkdxefzhttkmjhdbkvqn on 2026-06-30 via MCP.
--   This file exists for version-control parity. It is IDEMPOTENT: the NOT EXISTS guard
--   skips any email already present, so re-running (e.g. `supabase db push`) inserts nothing new.
-- Dedup key: lower(email). page_no = PDF page index within the scan; row_no = printed sheet row.
-- contact_id intentionally left NULL (linked separately via the Contacts module).

BEGIN;

INSERT INTO public.signup_sheet_imports
  (source_file, page_no, row_no, name, email, phone, zip, confidence, notes)
SELECT DISTINCT ON (lower(v.email))
  v.source_file, v.page_no, v.row_no, v.name, v.email, v.phone, v.zip, v.confidence, v.notes
FROM (VALUES
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf',1,6,'Corey Baker','teachercarey@gmail.com',NULL,'43215','medium','Jun 30 scan p1 r6. No phone on sheet. Columbus 43215.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf',2,1,'Jessica Rezin','jurez@hotmail.com','614-565-4369','43225','low','Jun 30 scan p2 r1. Name 2nd line unclear (looks like "Ashime"); email could be j.rez@ or jurez@hotmail.com. Columbus 43225.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf',2,5,'Spencer Kaup','spencer.kaup1@gmail.com',NULL,'43224','medium','Jun 30 scan p2 r5. Phone written "n/a". Columbus 43224.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf',2,8,'Andrew Grazetta','ampguzze9@gmail.com','330-265-0167','44102','low','Jun 30 scan p2 r8. EMAIL ILLEGIBLE - best guess ampguzze9@gmail.com; sheet shows a #-like mark and no ".com". DO NOT SEND until confirmed. Cleveland 44102.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf',2,9,'Jahmar Danel','jahmar.r.danel@gmail.com','513-592-9454','45204','low','Jun 30 scan p2 r9. Name Jahmar/Jahman Danel; email ".com" not written (assumed). ZIP ~45204 (Cincinnati).'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf',2,10,'Seth Walker','sethical94@gmail.com','859-962-7187','41032','low','Jun 30 scan p2 r10. Email ".com" not written (assumed). ZIP 41032 + area code 859 = Kentucky (out of state) - verify.'),
  ('Scanned Jun 30, 2026 at 2:57:23 PM.pdf',2,11,'Amber Ballard','ballard4norwood@gmail.com','513-675-7885','45212','medium','Jun 30 scan p2 r11. Norwood/Cincinnati 45212. Sheet had a "C4 board" annotation next to this row.')
) AS v(source_file,page_no,row_no,name,email,phone,zip,confidence,notes)
WHERE NOT EXISTS (
  SELECT 1 FROM public.signup_sheet_imports s WHERE lower(s.email::text) = lower(v.email)
)
ORDER BY lower(v.email), v.page_no, v.row_no;

COMMIT;
