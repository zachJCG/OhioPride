# June 2026 Pride Sign-Up Import — Review

**Date:** June 23, 2026 (updated June 30, 2026)
**Table:** `public.signup_sheet_imports` (Supabase `dkdxefzhttkmjhdbkvqn`)

---

## Update — June 30, 2026 Re-Scan

A new file, **"Scanned Jun 30, 2026 at 2:57:23 PM.pdf"** (2 pages, 18 filled rows), was added to the Drive folder and processed.

**Result: 11 of 18 rows were already on file (duplicates, skipped); 7 new rows added. Table went 284 → 291. Still zero duplicate emails.**

The Jun 30 file was largely a re-scan of earlier sheets: page 1 repeated the Jun 23 1:00 PM sheet, and page 2 repeated the tail (page 24) of the Jun 23 12:57 PM binder. Dedup was by case-insensitive email, including gmail dot-normalization, which correctly caught near-variants (e.g., `roberts.nicole.e` on the new scan = `robertsnicole.e` already on file). My refined readings of three rows (`steven5889028`, `animebase3214`/"Aihime", `rcrumbak`/Rachel Conley) matched existing rows exactly and were skipped as the same people.

**The 7 new rows (all `needs_review = true`):**

| Pg | Row | Name | Email | ZIP | Confidence | Flag |
|---|---|---|---|---|---|---|
| 1 | 6 | Corey Baker | teachercarey@gmail.com | 43215 | medium | clean |
| 2 | 1 | Jessica Rezin | jurez@hotmail.com | 43225 | low | name 2nd line unclear ("Ashime"?); `j.rez@` vs `jurez@` |
| 2 | 5 | Spencer Kaup | spencer.kaup1@gmail.com | 43224 | medium | phone "n/a" |
| 2 | 8 | Andrew Grazetta | ampguzze9@gmail.com | 44102 | low | **EMAIL ILLEGIBLE — do not send until confirmed** (a `#`-like mark, no `.com` written) |
| 2 | 9 | Jahmar Danel | jahmar.r.danel@gmail.com | 45204 | low | name Jahmar/Jahman; `.com` assumed |
| 2 | 10 | Seth Walker | sethical94@gmail.com | 41032 | low | `.com` assumed; ZIP 41032 + area 859 = Kentucky (out of state) |
| 2 | 11 | Amber Ballard | ballard4norwood@gmail.com | 45212 | medium | sheet had a "C4 board" annotation |

**Readability pass also resolved two long-standing "(name unclear)" placeholders** using the cross-references noted below: `ademlow@yahoo.com` → **Amy Demlow**, and `egamth21@gmail.com` → **Emma Smith** (email may be `egsmth21@gmail.com`, one-letter difference — still flagged to verify).

## What Happened

| Scan | Pages | Result |
|---|---|---|
| Scanned Jun 23, 2026 at 12:57:13 PM.pdf | 24 | 145 new rows added (Columbus Pride binder; the NE Ohio pages in it were already on file and skipped) |
| Scanned Jun 23, 2026 at 1:00:45 PM.pdf | 1 | 7 new rows added |
| Scanned Jun 15, 2026 at 11:57:38 AM.pdf | 12 | Already imported (the existing 132-row batch). Not touched. |
| Scanned Jun 11, 2026 at 8:16:57 PM.pdf | 4 | Skipped — duplicates of the Jun 15 batch (every email already on file) |
| Scanned Jun 11, 2026 at 8:18:26 PM.pdf | 1 | Skipped — duplicate of the Jun 15 batch |

**Net: 152 new rows. Table went from 132 to 284. Zero duplicate emails across the whole table.**
Dedup key was email (case-insensitive). All new rows are flagged `needs_review = true`, and every row's `notes` field carries its locator (scan, page, row) plus any specific uncertainty. Source was handwritten, OCR-read: 57 medium confidence, 95 low. `contact_id` left null for the Contacts module.

`page_no` = page position inside that PDF (open the file and go to that page). `row_no` = the printed row number on the sheet.

## Not Added — Needs Your Eyes (no usable email)

| Scan | Page | Row | What's there |
|---|---|---|---|
| Jun 23 12:57 PM | 10 | 5 | "Malexia D. Truana" — no email written |
| Jun 23 12:57 PM | 18 | 10 | "Stan Dolinsky" — email illegible (looks like "TL...@Dolinskyi") |
| Jun 23 12:57 PM | 18 | 11 | "Vitalik" — no email |
| Jun 23 12:57 PM | 19 | top | Partial row above row 1 — no name, no email, ZIP ~45005 (struck through) |

## Not Added — Likely Duplicate Person (your call)

| Scan | Page | Row | Why held back |
|---|---|---|---|
| Jun 23 12:57 PM | 9 | 2 | "Cassandra Quinones" with `creamkaraoke@gmail.com`. Almost certainly the same person already on file as `onsenkarack@gmail.com` (Cassandra Quinnes, 443xx). Left out to avoid a duplicate. Add the second email if you want it. |

## Name Clarifications for Existing Rows

These Jun 23 sheets clarify two rows in the existing Jun 15 batch that were logged as "(name unclear)":

- `egamth21@gmail.com` (existing, "(name unclear)") → appears as **Emma Smith** on a Jun 23 sheet, written `egsmth21@gmail.com`. The two emails differ by one letter (egamth21 vs egsmth21); confirm which is correct.
- `ademlow@yahoo.com` (existing, "(name unclear)") → appears as **Amy Demlow** on Jun 23 12:57 PM, p12 r3.

## Highest-Priority Verifications (added, but low confidence)

Name/email mismatches, assumed values, and out-of-state ZIPs worth a quick look:

| Scan | Pg | Row | Name as read | Email as read | Flag |
|---|---|---|---|---|---|
| Jun 23 12:57 | 7 | 5 | Matt Longbottom | kayla.longbottom6@gmail.com | name vs email |
| Jun 23 12:57 | 8 | 6 | Tray (or Carl) Sanders | tray_sander@hotmail.com | name, email domain, ZIP |
| Jun 23 12:57 | 10 | 3 | "Photo King" | thingsmak201@gmail.com | wrote a nickname |
| Jun 23 12:57 | 10 | 4 | Yoshie E. Martin | yox.martinezyahawa@gmail.com | email |
| Jun 23 12:57 | 10 | 8 | Madeline (no last name) | madacton@msn.com | partial name |
| Jun 23 12:57 | 10 | 10 | Nicole (no last name) | navybean@gmail.com | partial name |
| Jun 23 12:57 | 13 | 8 | Jackie Dodson | jdsroolguy1986@gmail.com | name + email |
| Jun 23 12:57 | 14 | 5 | Stephen Dunn | ssdunn107@yahoo.com | name, email, ZIP 44062 |
| Jun 23 12:57 | 16 | 4 | Kat Bonop | 14kate2@gmail.com | name + no ZIP |
| Jun 23 12:57 | 16 | 7 | Brice Burner | drderonte@aol.com | name vs email |
| Jun 23 12:57 | 18 | 4 | Shane Topper | amonust@gmail.com | name vs email |
| Jun 23 12:57 | 18 | 8 | Marquita Mathis | mmathis@gmail.com | sheet had no ".com"; assumed |
| Jun 23 12:57 | 19 | 2 | Britne Kimberlin | codykimberlin2000@outlook.com | name vs email |
| Jun 23 12:57 | 19 | 3 | Leona Spears | leona.brown2012@gmail.com | name vs email |
| Jun 23 12:57 | 20 | 3 | Ashley Williams | awill@muskingum.edu | ZIP 47632 (out of state?) |
| Jun 23 12:57 | 20 | 12 | Brittany Speakman | adrismommy510@icloud.com | name vs email |
| Jun 23 12:57 | 24 | 4 | CJ Parker | cjparl6@gmail.com | ZIP 46239 (Indiana?) |
| Jun 23 12:57 | 24 | 7 | Cole Roberts | robertsnicole.e@gmail.com | name vs email (Nicole?) |
| Jun 23 1:00 | 1 | 1 | Bruce Redden | brucebredden@gmail.com | sheet had no ".com"; assumed |
| Jun 23 1:00 | 1 | 2 | Dez Mets | otmets@gmail.com | first letters of email unclear |

## Pull the Full Review Set

Every new row (sorted by sheet position) for the Contacts module:

```sql
select source_file, page_no, row_no, name, email, phone, zip, confidence, notes
from public.signup_sheet_imports
where imported_at::date = date '2026-06-23'
order by source_file, page_no, row_no;
```

Just the low-confidence ones to prioritize:

```sql
select source_file, page_no, row_no, name, email, notes
from public.signup_sheet_imports
where imported_at::date = date '2026-06-23' and confidence = 'low'
order by source_file, page_no, row_no;
```
