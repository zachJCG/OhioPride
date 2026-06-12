#!/usr/bin/env python3
"""
Generate a blank working workbook for the CFOFS exporter.

Writes an .xlsx with three tabs -- Contributions, Expense, Loan -- each carrying
exactly the CFOFS template header row (and nothing else). Humans fill in rows
below the header; cfofs_export.py strips the header on export.

Usage
-----
    python scripts/compliance/make_template.py            # -> compliance_template.xlsx
    python scripts/compliance/make_template.py my.xlsx
"""

import sys

from cfofs_export import CONT_HEADERS, EXPS_HEADERS, LOAN_HEADERS


def main():
    try:
        import openpyxl  # type: ignore
    except ImportError:
        raise SystemExit("Missing dependency. Install:  pip install openpyxl")

    out = sys.argv[1] if len(sys.argv) > 1 else "compliance_template.xlsx"
    wb = openpyxl.Workbook()
    tabs = [
        ("Contributions", CONT_HEADERS),
        ("Expense", EXPS_HEADERS),
        ("Loan", LOAN_HEADERS),
    ]
    # Reuse the default first sheet for the first tab.
    ws = wb.active
    ws.title = tabs[0][0]
    ws.append(tabs[0][1])
    for title, headers in tabs[1:]:
        sheet = wb.create_sheet(title)
        sheet.append(headers)
    wb.save(out)
    print(f"Wrote {out} with tabs: {', '.join(t[0] for t in tabs)}")


if __name__ == "__main__":
    main()
