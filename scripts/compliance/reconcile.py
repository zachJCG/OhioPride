#!/usr/bin/env python3
"""
Bank reconciliation for the compliance module.

Ties the working ledger -- the same 3-tab workbook the CFOFS exporter reads --
to the money that actually moved through the bank account during a period:

    money IN  : Contributions (revenue) + cash actually borrowed (31-C loans)
    money OUT : Expenses + loan payments made

Each ledger cash event is matched to a bank-statement line by equal signed
amount within a date window. The report shows what cleared, what's in the books
but NOT on the statement (uncleared / missing), what's on the statement but NOT
in the books (unrecorded -- bank fees, an unlogged contribution, etc.), and
whether the ledger net ties to the bank net for the period.

Note: 31-N debts (unpaid invoices, director advances awaiting reimbursement)
are obligations, not cash movements, so they are excluded from reconciliation.
Only real cash events reconcile to the bank.

Usage
-----
    python scripts/compliance/reconcile.py workbook.xlsx statement.csv
    python scripts/compliance/reconcile.py workbook.xlsx statement.xlsx \
        --period-start 2026-01-01 --period-end 2026-06-30 \
        --opening-balance 1000.00 --tolerance-days 5 --output-dir ./out

Bank statement
--------------
CSV or Excel. Columns are auto-detected from the header row:
  - date        : a column containing "date" / "posted" / "posting"
  - description : "description" / "memo" / "details" / "payee" / "name"
  - amount      : either ONE signed "amount" column (debits negative), OR
                  separate "debit"/"withdrawal" and "credit"/"deposit" columns.
Override any of these with --bank-*-col flags if the header is unusual.

Exits non-zero if anything is unmatched or the period is out of balance.
"""

import argparse
import csv
import os
import sys
from datetime import datetime
from decimal import Decimal

from cfofs_export import (
    CONT_IDS, EXPS_IDS, LOAN_IDS, collapse, data_rows, fmt_amount,
    load_config, match_tabs, parse_amount, parse_date, read_workbook, row_fields,
)


# --------------------------------------------------------------------------- #
# Small value type for a single cash event (ledger or bank)
# --------------------------------------------------------------------------- #

class Event:
    __slots__ = ("date", "amount", "desc", "source", "ref", "matched_to")

    def __init__(self, dt, amount, desc, source, ref=""):
        self.date = dt              # datetime.date
        self.amount = amount        # Decimal, signed (+ in, - out)
        self.desc = desc            # str
        self.source = source        # e.g. "Contributions", "Expense", "Bank"
        self.ref = ref              # workbook row / bank row reference
        self.matched_to = None      # the Event it paired with


def to_date(value):
    """Reuse the exporter's date parser, returning a date object (or None)."""
    text, err = parse_date(value)
    if err or not text:
        return None
    return datetime.strptime(text, "%m/%d/%Y").date()


# --------------------------------------------------------------------------- #
# Ledger cash events from the workbook
# --------------------------------------------------------------------------- #

def ledger_events(workbook_path):
    sheets = read_workbook(workbook_path)
    tabs = match_tabs(sheets)
    events = []
    missing = []

    if tabs["CONT"]:
        _, rows = tabs["CONT"]
        for rownum, raw in data_rows(rows):
            f = row_fields(raw, CONT_IDS)
            amount, _ = parse_amount(f.get("amount"))
            dt = to_date(f.get("date"))
            if amount and amount > 0 and dt:
                name = (collapse(f.get("non_individual"))
                        or collapse(f"{collapse(f.get('first'))} {collapse(f.get('last'))}".strip())
                        or "contribution")
                events.append(Event(dt, amount, name, "Contributions", f"row {rownum}"))
    else:
        missing.append("Contributions")

    if tabs["EXPS"]:
        _, rows = tabs["EXPS"]
        for rownum, raw in data_rows(rows):
            f = row_fields(raw, EXPS_IDS)
            amount, _ = parse_amount(f.get("amount"))
            dt = to_date(f.get("date"))
            if amount and amount > 0 and dt:
                payee = (collapse(f.get("non_individual"))
                         or collapse(f"{collapse(f.get('first'))} {collapse(f.get('last'))}".strip())
                         or collapse(f.get("purpose")) or "expense")
                events.append(Event(dt, -amount, payee, "Expense", f"row {rownum}"))
    else:
        missing.append("Expense")

    if tabs["LOAN"]:
        _, rows = tabs["LOAN"]
        for rownum, raw in data_rows(rows):
            f = row_fields(raw, LOAN_IDS)
            code = (collapse(f.get("schedule_code")).upper() or "31N")
            creditor = (collapse(f.get("non_individual"))
                        or collapse(f"{collapse(f.get('first'))} {collapse(f.get('last'))}".strip())
                        or "loan")
            # Cash actually borrowed this period (31-C loans only) is money in.
            if code == "31C":
                incurred, _ = parse_amount(f.get("amount_incurred"))
                dt = to_date(f.get("date_incurred"))
                if incurred and incurred > 0 and dt:
                    events.append(Event(dt, incurred, f"{creditor} (loan proceeds)",
                                        "Loan", f"row {rownum}"))
            # A payment made this period is money out (debts and loans alike).
            payment, _ = parse_amount(f.get("payment_amount"))
            pay_dt = to_date(f.get("payment_date"))
            if payment and payment > 0 and pay_dt:
                events.append(Event(pay_dt, -payment, f"{creditor} (payment)",
                                    "Loan", f"row {rownum}"))
    else:
        missing.append("Loan")

    return events, missing


# --------------------------------------------------------------------------- #
# Bank statement events
# --------------------------------------------------------------------------- #

def load_table(path):
    """Return (lower_headers, data_row_lists) for a CSV or Excel statement."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".csv":
        with open(path, newline="", encoding="utf-8-sig") as fh:
            rows = list(csv.reader(fh))
    else:
        sheets = read_workbook(path)
        if not sheets:
            raise SystemExit(f"No sheets found in {path}")
        rows = next(iter(sheets.values()))
    if not rows:
        raise SystemExit(f"Empty statement: {path}")
    headers = [collapse(h).lower() for h in rows[0]]
    return headers, rows[1:]


def _find_col(headers, keywords, override=None):
    if override:
        target = override.strip().lower()
        for i, h in enumerate(headers):
            if h == target:
                return i
        raise SystemExit(f"Column '{override}' not found. Headers: {headers}")
    for i, h in enumerate(headers):
        if any(k in h for k in keywords):
            return i
    return None


def bank_events(path, args):
    headers, rows = load_table(path)
    date_i = _find_col(headers, ("date", "posted", "posting"), args.bank_date_col)
    desc_i = _find_col(headers, ("description", "memo", "details", "payee", "name"),
                       args.bank_desc_col)
    amount_i = _find_col(headers, ("amount", "value"), args.bank_amount_col)
    debit_i = _find_col(headers, ("debit", "withdrawal", "withdraw"), args.bank_debit_col)
    credit_i = _find_col(headers, ("credit", "deposit"), args.bank_credit_col)

    if date_i is None:
        raise SystemExit(f"Could not find a date column. Headers: {headers}")

    use_split = (debit_i is not None or credit_i is not None) and amount_i is None
    if amount_i is None and not use_split:
        raise SystemExit(
            "Could not find an amount column (need a signed 'amount', or "
            f"'debit'/'credit' columns). Headers: {headers}")

    events = []
    for n, row in enumerate(rows, start=2):
        if all(c is None or str(c).strip() == "" for c in row):
            continue

        def cell(i):
            return row[i] if (i is not None and i < len(row)) else None

        dt = to_date(cell(date_i))
        if dt is None:
            continue  # skip non-transaction lines (subtotals, blanks)

        if use_split:
            debit, _ = parse_amount(cell(debit_i))
            credit, _ = parse_amount(cell(credit_i))
            amount = (credit or Decimal("0")) - (debit or Decimal("0"))
        else:
            amount, _ = parse_amount(cell(amount_i))
        if amount is None or amount == 0:
            continue

        desc = collapse(cell(desc_i)) if desc_i is not None else ""
        events.append(Event(dt, amount.quantize(Decimal("0.01")), desc, "Bank", f"row {n}"))
    return events


# --------------------------------------------------------------------------- #
# Matching
# --------------------------------------------------------------------------- #

def in_period(event, start, end):
    if start and event.date < start:
        return False
    if end and event.date > end:
        return False
    return True


def match(ledger, bank, tolerance_days):
    """Greedy match on equal signed amount within the date window (nearest date
    wins). Mutates each Event's matched_to."""
    bank_by_amount = {}
    for b in bank:
        bank_by_amount.setdefault(b.amount, []).append(b)

    for led in sorted(ledger, key=lambda e: e.date):
        candidates = [b for b in bank_by_amount.get(led.amount, []) if b.matched_to is None]
        best = None
        best_gap = None
        for b in candidates:
            gap = abs((b.date - led.date).days)
            if gap <= tolerance_days and (best_gap is None or gap < best_gap):
                best, best_gap = b, gap
        if best is not None:
            led.matched_to = best
            best.matched_to = led


# --------------------------------------------------------------------------- #
# Reporting
# --------------------------------------------------------------------------- #

def total(events):
    return sum((e.amount for e in events), Decimal("0.00"))


def fmt_signed(amount):
    return f"{amount:>12,.2f}"


def run(args):
    cfg = load_config(args.config)
    output_dir = args.output_dir or cfg.get("output_dir", "./out")

    start = datetime.strptime(args.period_start, "%Y-%m-%d").date() if args.period_start else None
    end = datetime.strptime(args.period_end, "%Y-%m-%d").date() if args.period_end else None

    if not os.path.exists(args.workbook):
        sys.stderr.write(f"Workbook not found: {args.workbook}\n")
        return 2
    if not os.path.exists(args.statement):
        sys.stderr.write(f"Statement not found: {args.statement}\n")
        return 2

    ledger, missing_tabs = ledger_events(args.workbook)
    bank = bank_events(args.statement, args)

    # Default the period to the bank statement's own date span when not given.
    if start is None and bank:
        start = min(e.date for e in bank)
    if end is None and bank:
        end = max(e.date for e in bank)

    ledger = [e for e in ledger if in_period(e, start, end)]
    bank = [e for e in bank if in_period(e, start, end)]

    match(ledger, bank, args.tolerance_days)

    matched = [e for e in ledger if e.matched_to is not None]
    unmatched_ledger = [e for e in ledger if e.matched_to is None]
    unmatched_bank = [e for e in bank if e.matched_to is None]

    in_total = total([e for e in ledger if e.amount > 0])
    out_total = total([e for e in ledger if e.amount < 0])
    ledger_net = in_total + out_total
    bank_net = total(bank)
    difference = (ledger_net - bank_net).quantize(Decimal("0.01"))

    width = 76
    print("=" * width)
    print("Bank reconciliation")
    print(f"  Workbook : {args.workbook}")
    print(f"  Statement: {args.statement}")
    print(f"  Period   : {start or '(start of data)'}  ->  {end or '(end of data)'}"
          f"   (match window +/- {args.tolerance_days} days)")
    print("=" * width)

    if missing_tabs:
        print("  ! Workbook tabs not found (skipped): " + ", ".join(missing_tabs))

    print("\nLedger (your books):")
    print(f"  money in  (revenue + loan proceeds) ... {fmt_signed(in_total)}")
    print(f"  money out (expenses + loan payments) .. {fmt_signed(out_total)}")
    print(f"  net movement .......................... {fmt_signed(ledger_net)}")
    print("\nBank statement:")
    print(f"  net movement (credits - debits) ....... {fmt_signed(bank_net)}")
    if args.opening_balance is not None:
        opening = Decimal(args.opening_balance).quantize(Decimal("0.01"))
        print(f"  opening balance ....................... {fmt_signed(opening)}")
        print(f"  computed closing (opening + net) ...... {fmt_signed(opening + bank_net)}")

    print("\nReconciliation:")
    print(f"  matched items ......................... {len(matched)}")
    print(f"  in books, NOT on statement ............ {len(unmatched_ledger)}")
    print(f"  on statement, NOT in books ............ {len(unmatched_bank)}")
    print(f"  ledger net - bank net ................. {fmt_signed(difference)}"
          + ("   ** OUT OF BALANCE **" if difference != 0 else "   (in balance)"))

    if unmatched_ledger:
        print("\nIn your books but not on the statement "
              "(uncleared, or missing from the bank file):")
        for e in sorted(unmatched_ledger, key=lambda x: x.date):
            print(f"  {e.date}  {fmt_signed(e.amount)}  {e.source:<13} {e.ref:<8} {e.desc}")

    if unmatched_bank:
        print("\nOn the statement but not in your books "
              "(unrecorded -- add a ledger entry, e.g. bank fee or unlogged gift):")
        for e in sorted(unmatched_bank, key=lambda x: x.date):
            print(f"  {e.date}  {fmt_signed(e.amount)}  {e.ref:<8} {e.desc}")

    # Optional worksheet CSV for the treasurer.
    if args.write_worksheet:
        entity = args.entity or cfg.get("entity", "")
        report = args.report or cfg.get("report", "")
        stem = "_".join([p for p in (entity, "RECON", report) if p]) or "reconciliation"
        path = os.path.join(output_dir, f"{stem}.csv")
        os.makedirs(output_dir, exist_ok=True)
        with open(path, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["status", "date", "amount", "source", "ref", "description",
                        "matched_date", "matched_description"])
            for e in ledger:
                m = e.matched_to
                w.writerow(["matched" if m else "unmatched_in_books", e.date,
                            fmt_amount(e.amount), e.source, e.ref, e.desc,
                            m.date if m else "", m.desc if m else ""])
            for e in unmatched_bank:
                w.writerow(["unmatched_on_statement", e.date, fmt_amount(e.amount),
                            "Bank", e.ref, e.desc, "", ""])
        print(f"\nWROTE  {path}")

    print()
    out_of_balance = difference != 0 or unmatched_ledger or unmatched_bank
    return 1 if out_of_balance else 0


def main():
    ap = argparse.ArgumentParser(
        description="Reconcile the ledger workbook to a bank statement for a period.")
    ap.add_argument("workbook", help="The 3-tab working workbook (.xls/.xlsx)")
    ap.add_argument("statement", help="Bank statement (.csv/.xls/.xlsx)")
    default_config = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
    ap.add_argument("--config", default=default_config)
    ap.add_argument("--period-start", help="YYYY-MM-DD (default: earliest bank date)")
    ap.add_argument("--period-end", help="YYYY-MM-DD (default: latest bank date)")
    ap.add_argument("--tolerance-days", type=int, default=5,
                    help="Date window for matching by amount (default 5)")
    ap.add_argument("--opening-balance", help="Opening bank balance, for a balance check")
    ap.add_argument("--output-dir", dest="output_dir")
    ap.add_argument("--entity")
    ap.add_argument("--report")
    ap.add_argument("--write-worksheet", action="store_true",
                    help="Write a {ENTITY}_RECON_{REPORT}.csv reconciliation worksheet")
    ap.add_argument("--bank-date-col")
    ap.add_argument("--bank-desc-col")
    ap.add_argument("--bank-amount-col")
    ap.add_argument("--bank-debit-col")
    ap.add_argument("--bank-credit-col")
    args = ap.parse_args()
    sys.exit(run(args))


if __name__ == "__main__":
    main()
