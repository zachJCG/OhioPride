# Compliance module — Ohio SOS CFOFS export

Takes a working spreadsheet (`.xls` / `.xlsx`) with three tabs —
**Contributions**, **Expense**, **Loan** — and exports three **import-ready,
header-less CSV files** that load into the Ohio Secretary of State Campaign
Finance Online Filing System (CFOFS) via *Other Tasks → Upload Transaction
Files*.

```
out/16372_CONT_PostPrimary2026.csv   # Schedule 31-A contributions
out/16372_EXPS_PostPrimary2026.csv   # Schedule 31-B expenditures
out/16372_LOAN_PostPrimary2026.csv   # Schedule 31-N debts / 31-C loans
```

> CFOFS validates 31-A, 31-B and 31-N/31-C in **separate** upload steps. Never
> combine schedules in one file. Each CSV has **no header row** — CFOFS rejects
> the header line as a bad record. The header lives in the source workbook for
> human editing and is stripped on export.

This module replaces the old `budget` module for filing purposes. (The live
`/admin/finance/budget` expense ledger is unrelated and stays as-is.)

## Install

```bash
pip install -r scripts/compliance/requirements.txt
# openpyxl (.xlsx), xlrd>=2.0 (.xls). PyYAML is optional.
```

## Use

1. Generate a blank workbook (or reuse last period's):

   ```bash
   python scripts/compliance/make_template.py myfiling.xlsx
   ```

   Fill in rows **below** the header on each tab. Column order is fixed and
   must match the template exactly.

2. Set the per-filing config in `scripts/compliance/config.yaml`:

   ```yaml
   entity: "16372"            # filenames only — NEVER a PAC REG NUMBER column
   report: "PostPrimary2026"  # filenames only
   output_dir: "./out"
   form_of_contribution_code: "4"   # VERIFY via CFOFS Data Download
   ```

3. Export:

   ```bash
   python scripts/compliance/cfofs_export.py myfiling.xlsx
   # or override config inline:
   python scripts/compliance/cfofs_export.py myfiling.xlsx \
       --entity 16372 --report PostPrimary2026 --output-dir ./out
   ```

4. Read the validation report. Fix any **blocking errors** (the offending file
   is held, not written) and re-run. Upload each clean CSV in its own CFOFS
   step, review the system-generated cover page, and tie the cross-foot totals
   before submitting.

## What it normalizes

- **Dates** → `MM/DD/YYYY`. Excel serials (e.g. `46128` → `04/16/2026`), date
  objects, and text dates are all handled; unparseable dates block the row.
- **Amounts** → plain decimal, two places, no `$`, commas, or parentheses.
  Negative amounts are invalid in these schedules.
- **ZIP** → first 5 digits (ZIP+4 truncated).
- **Text** → trimmed, internal double spaces collapsed; ALL-CAPS names and
  cities converted to Proper Case (mixed case the human typed is left alone;
  organization names in the NON INDIVIDUAL columns are left verbatim so
  acronyms like `LLC` / `PAC` / `NAACP` aren't mangled).
- **FORM OF CONTRIBUTION** → SOS code. Display labels like `ELECTRONIC
  TRANSFER` are mapped (→ `4`); blank cells use `form_of_contribution_code`; a
  text label that can't be mapped blocks the row.
- **ITEM NUMBER** → sequential integer from 1 within each file (source values
  ignored).
- **SCHEDULE CODE** → `31A` / `31B` fixed; Loan reads `31N` (debt) or `31C`
  (loan) from the row, default `31N`.

## Blocking validations (the file is held until fixed)

| Schedule | Blocks on |
|----------|-----------|
| 31-A Contributions | missing address/city/state/ZIP · both name and NON INDIVIDUAL filled · neither filled · unparseable date · amount ≤ 0 · FORM left as a text label |
| 31-B Expense | missing payee (name and NON INDIVIDUAL both blank) · missing address fields · unparseable date · amount ≤ 0 |
| 31-N/31-C Loan | missing creditor name/entity · missing **or placeholder** address · unparseable date · `OUTSTANDING BALANCE ≠ PRIOR + INCURRED − PAYMENT` · negative amount · bad schedule code |

Non-blocking **warnings** (printed, file still written): missing employer for
an individual contributor, missing purpose on an expense, a PAC REG NUMBER that
equals the filing entity, a loan payment amount with no payment date.

## Bank reconciliation (`reconcile.py`)

Ties the **same workbook** to the money that actually moved through the bank
account for a period — so expenses and revenue reconcile to cash in and out.

```bash
python scripts/compliance/reconcile.py myfiling.xlsx statement.csv \
    --period-start 2026-01-01 --period-end 2026-06-30 \
    --opening-balance 1000.00 --write-worksheet
```

- **Money in** = Contributions + cash actually borrowed (31-C loan proceeds).
  **Money out** = Expenses + loan payments made. 31-N debts are obligations,
  not cash, so they're excluded.
- Each ledger cash event is matched to a bank line by **equal signed amount
  within a date window** (`--tolerance-days`, default ±5), nearest date wins.
- The report shows: what cleared, what's **in the books but not on the
  statement** (uncleared or missing), what's **on the statement but not in the
  books** (unrecorded — bank fees, an unlogged gift), and whether ledger net
  ties to bank net. Exits non-zero when anything is unmatched or out of balance.
- **Bank statement** is CSV or Excel; columns auto-detect from the header
  (`date` / `description` / `amount`, or split `debit`/`credit`). Override with
  `--bank-date-col`, `--bank-amount-col`, `--bank-debit-col`,
  `--bank-credit-col`, `--bank-desc-col` if a header is unusual.
- `--write-worksheet` emits `{ENTITY}_RECON_{REPORT}.csv` — a line-by-line
  worksheet (status, date, amount, source, matched bank line) for the treasurer.

## Source

- Column orders/headers: Ohio SOS CFOFS Excel upload template, tabs CONT / EXPS
  / LOAN. Loan column 5 header is the official misspelling `NON INDIDIVUAL` —
  kept verbatim (CFOFS matches on position).
- File format & validation behavior: SOS *File Format & Excel Template
  Instructions* and Form 30-N.
- The FORM OF CONTRIBUTION legend is **not** published in scrapable text —
  confirm via CFOFS *Data Download* of a prior report, or call the Campaign
  Finance Division at 614-466-3111.
