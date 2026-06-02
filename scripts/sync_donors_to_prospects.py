#!/usr/bin/env python3
"""
Sync public.donors -> public.prospects (optional, on-demand).

The founding-member sync is automatic in Postgres. This script is the
on-demand bridge for the compliance `donors` table: it mirrors donor rows
into the pipeline so staff can cultivate / steward them in the CRM.

Server-side ONLY. Uses the Supabase service-role key — never ship to the
browser. Run locally or in CI.

Idempotent on donor_id: a donor already linked to a prospect (matching
donor_id) is skipped, so re-running never duplicates.

Environment
-----------
SUPABASE_URL                e.g. https://dkdxefzhttkmjhdbkvqn.supabase.co
SUPABASE_SERVICE_ROLE_KEY   service-role key

Usage
-----
    python scripts/sync_donors_to_prospects.py             # stage = secured (they gave)
    python scripts/sync_donors_to_prospects.py --stage identified
    python scripts/sync_donors_to_prospects.py --dry-run

Exits non-zero if any insert errors.
"""

import argparse
import os
import sys

try:
    from supabase import create_client
except ImportError:
    sys.stderr.write("Missing dependency. Install with:  pip install supabase\n")
    sys.exit(2)

BATCH = 200


def env(name):
    val = os.environ.get(name)
    if not val:
        sys.stderr.write(f"Missing required env var: {name}\n")
        sys.exit(2)
    return val


def norm(value):
    value = (value or "").strip() if isinstance(value, str) else value
    return value or None


def fetch_all(client, table, columns, page_size=1000):
    out = []
    page = 0
    while True:
        resp = (
            client.table(table)
            .select(columns)
            .range(page * page_size, page * page_size + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        out.extend(rows)
        if len(rows) < page_size:
            break
        page += 1
    return out


def main():
    ap = argparse.ArgumentParser(description="Mirror donors into prospects.")
    ap.add_argument("--stage", default="secured",
                    help="Stage for new prospect rows (default: secured)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Report without inserting")
    args = ap.parse_args()

    url = env("SUPABASE_URL")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    client = create_client(url, key)

    try:
        donors = fetch_all(client, "donors",
                           "id, full_name, email, phone, city, county, state, zip, "
                           "occupation, employer, notes")
        prospects = fetch_all(client, "prospects", "donor_id, email")
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"Failed to read data: {exc}\n")
        sys.exit(1)

    linked_donor_ids = {p["donor_id"] for p in prospects if p.get("donor_id")}
    # Also avoid creating a duplicate where an unlinked prospect already
    # matches the donor by email (mirrors the founding-member pattern).
    prospect_emails = {p["email"].lower() for p in prospects if p.get("email")}

    inserted = 0
    skipped = 0
    errors = 0
    batch = []

    def flush(rows):
        nonlocal inserted, errors
        if not rows or args.dry_run:
            inserted += len(rows)
            return
        try:
            client.table("prospects").insert(rows).execute()
            inserted += len(rows)
        except Exception as exc:  # noqa: BLE001
            errors += len(rows)
            sys.stderr.write(f"Batch insert failed ({len(rows)} rows): {exc}\n")

    for d in donors:
        if d["id"] in linked_donor_ids:
            skipped += 1
            continue
        email = (d.get("email") or "").lower()
        if email and email in prospect_emails:
            skipped += 1
            continue

        if not norm(d.get("full_name")):
            errors += 1
            sys.stderr.write(f"Donor {d['id']}: missing full_name, skipped\n")
            continue

        row = {
            "full_name": d["full_name"],
            "email": norm(d.get("email")),
            "phone": norm(d.get("phone")),
            "city": norm(d.get("city")),
            "county": norm(d.get("county")),
            "state": norm(d.get("state")) or "OH",
            "zip": norm(d.get("zip")),
            "occupation": norm(d.get("occupation")),
            "employer": norm(d.get("employer")),
            "notes": norm(d.get("notes")),
            "stage": args.stage,
            "source": "donor",
            "donor_id": d["id"],
        }
        batch.append(row)
        if email:
            prospect_emails.add(email)
        if len(batch) >= BATCH:
            flush(batch)
            batch = []
    flush(batch)

    prefix = "[dry-run] " if args.dry_run else ""
    print(f"{prefix}inserted={inserted} skipped={skipped} errors={errors}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
