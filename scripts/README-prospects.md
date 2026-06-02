# Prospect import tooling

Server-side helpers for loading **net-new** prospect lists into
`public.prospects`. The founding-member → prospect sync is automatic in
Postgres; these scripts are only for cold lists, event lists, and the
optional `donors` mirror.

> **Service-role only.** Both scripts use the Supabase **service-role key**.
> Run them locally or in CI. Never put the service-role key in browser code
> or commit it to the repo.

## Setup

```bash
pip install supabase
export SUPABASE_URL="https://dkdxefzhttkmjhdbkvqn.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

## `import_prospects.py`

Import a CSV of cultivated contacts.

```bash
python scripts/import_prospects.py path/to/list.csv
python scripts/import_prospects.py path/to/list.csv --dry-run
```

**CSV headers** (case-insensitive):

```
full_name,email,phone,city,county,state,zip,employer,occupation,stage,source,priority,owner_email,tags,notes
```

- `full_name` — **required**.
- `tags` — pipe-delimited, e.g. `gala2026|major-donor`.
- `source` — defaults to `import`.
- `stage` — defaults to `identified` (`secured` is rejected; it belongs to the
  founding-member sync).
- `priority` — defaults to `medium`.
- `state` — defaults to `OH`.
- `owner_email` — resolved to `owner_id` via `admin_users`; unknown emails
  become `null`.

**Dedup:** a row is skipped when a prospect already exists with the same
`lower(email)`. Rows without an email are always inserted. Inserts run in
batches of 200.

## `sync_donors_to_prospects.py`

Mirror the compliance `donors` table into the pipeline. Idempotent on
`donor_id`.

```bash
python scripts/sync_donors_to_prospects.py                 # stage = secured
python scripts/sync_donors_to_prospects.py --stage identified
python scripts/sync_donors_to_prospects.py --dry-run
```

A donor already linked (matching `donor_id`) — or matching an existing
prospect by email — is skipped. New rows get `source = 'donor'` and the
`donor_id` set.

## Output

Both scripts print a one-line summary and exit non-zero on any error:

```
inserted=42 skipped=7 errors=0
```
