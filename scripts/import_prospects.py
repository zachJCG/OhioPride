#!/usr/bin/env python3
"""
Import net-new prospects (cold lists, event lists) into public.prospects.

Server-side ONLY. Uses the Supabase service-role key — never ship this to the
browser. Run locally or in CI.

Environment
-----------
SUPABASE_URL                e.g. https://dkdxefzhttkmjhdbkvqn.supabase.co
SUPABASE_SERVICE_ROLE_KEY   service-role key (kept server-side)

CSV format
----------
Headers (case-insensitive):
    full_name,email,phone,city,county,state,zip,employer,occupation,
    stage,source,priority,owner_email,tags,notes

  - full_name  : required (rows missing it are reported as errors and skipped)
  - tags       : pipe-delimited, e.g. "gala2026|major-donor"
  - source     : defaults to "import"
  - stage      : defaults to "identified"
  - priority   : defaults to "medium"
  - state      : defaults to "OH"
  - owner_email: resolved to owner_id via public.admin_users (unknown -> null)

Dedup
-----
A row is skipped when a prospect already exists with the same lower(email).
Rows without an email are always inserted (no email to dedup on).

Usage
-----
    python scripts/import_prospects.py path/to/list.csv
    python scripts/import_prospects.py path/to/list.csv --dry-run

Exits non-zero if any row errors.
"""

import argparse
import csv
import os
import sys

try:
    from supabase import create_client
except ImportError:
    sys.stderr.write(
        "Missing dependency. Install with:  pip install supabase\n"
    )
    sys.exit(2)

BATCH = 200
VALID_STAGES = {
    "identified", "qualified", "cultivating", "ask_made", "committed",
    "secured", "stewardship", "lapsed", "declined",
}
VALID_PRIORITY = {"low", "medium", "high"}
VALID_SOURCE = {
    "manual", "founding_member", "donor", "volunteer", "event",
    "referral", "website", "import", "other",
}


def env(name):
    val = os.environ.get(name)
    if not val:
        sys.stderr.write(f"Missing required env var: {name}\n")
        sys.exit(2)
    return val


def norm(value):
    value = (value or "").strip()
    return value or None


def build_row(raw, owner_lookup):
    """Map one CSV record to a prospects insert dict. Returns (row, error)."""
    full_name = norm(raw.get("full_name"))
    if not full_name:
        return None, "missing full_name"

    stage = (norm(raw.get("stage")) or "identified").lower()
    if stage not in VALID_STAGES:
        return None, f"invalid stage '{stage}'"
    # Secured rows are owned by the founding-member sync, not imports.
    if stage == "secured":
        return None, "stage 'secured' is managed by founding-member sync"

    priority = (norm(raw.get("priority")) or "medium").lower()
    if priority not in VALID_PRIORITY:
        return None, f"invalid priority '{priority}'"

    source = (norm(raw.get("source")) or "import").lower()
    if source not in VALID_SOURCE:
        return None, f"invalid source '{source}'"

    tags_raw = norm(raw.get("tags"))
    tags = [t.strip() for t in tags_raw.split("|") if t.strip()] if tags_raw else []

    owner_email = norm(raw.get("owner_email"))
    owner_id = owner_lookup.get(owner_email.lower()) if owner_email else None

    row = {
        "full_name": full_name,
        "email": norm(raw.get("email")),
        "phone": norm(raw.get("phone")),
        "city": norm(raw.get("city")),
        "county": norm(raw.get("county")),
        "state": norm(raw.get("state")) or "OH",
        "zip": norm(raw.get("zip")),
        "employer": norm(raw.get("employer")),
        "occupation": norm(raw.get("occupation")),
        "stage": stage,
        "source": source,
        "priority": priority,
        "owner_id": owner_id,
        "tags": tags,
        "notes": norm(raw.get("notes")),
    }
    return row, None


def load_owner_lookup(client):
    """email(lower) -> admin_users.id"""
    resp = client.table("admin_users").select("id, email").execute()
    out = {}
    for u in (resp.data or []):
        if u.get("email"):
            out[u["email"].lower()] = u["id"]
    return out


def load_existing_emails(client):
    """Set of lower(email) already present in prospects (for dedup)."""
    existing = set()
    page = 0
    size = 1000
    while True:
        resp = (
            client.table("prospects")
            .select("email")
            .not_.is_("email", "null")
            .range(page * size, page * size + size - 1)
            .execute()
        )
        rows = resp.data or []
        for r in rows:
            if r.get("email"):
                existing.add(r["email"].lower())
        if len(rows) < size:
            break
        page += 1
    return existing


def main():
    ap = argparse.ArgumentParser(description="Import prospects from a CSV.")
    ap.add_argument("csv_path", help="Path to the CSV file")
    ap.add_argument("--dry-run", action="store_true",
                    help="Parse and report without inserting")
    args = ap.parse_args()

    url = env("SUPABASE_URL")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    client = create_client(url, key)

    try:
        owner_lookup = load_owner_lookup(client)
        existing = load_existing_emails(client)
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"Failed to read existing data: {exc}\n")
        sys.exit(1)

    inserted = 0
    skipped = 0
    errors = 0
    batch = []
    seen_in_file = set()

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

    try:
        with open(args.csv_path, newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            # Normalize header keys to lower-case for forgiving matching.
            reader.fieldnames = [(f or "").strip().lower() for f in (reader.fieldnames or [])]
            for lineno, raw in enumerate(reader, start=2):
                raw = {(k or "").strip().lower(): v for k, v in raw.items()}
                row, err = build_row(raw, owner_lookup)
                if err:
                    errors += 1
                    sys.stderr.write(f"Line {lineno}: {err}\n")
                    continue

                email = (row.get("email") or "").lower()
                if email and (email in existing or email in seen_in_file):
                    skipped += 1
                    continue
                if email:
                    seen_in_file.add(email)

                batch.append(row)
                if len(batch) >= BATCH:
                    flush(batch)
                    batch = []
            flush(batch)
    except FileNotFoundError:
        sys.stderr.write(f"CSV not found: {args.csv_path}\n")
        sys.exit(2)

    prefix = "[dry-run] " if args.dry_run else ""
    print(f"{prefix}inserted={inserted} skipped={skipped} errors={errors}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
