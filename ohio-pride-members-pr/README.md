# Ohio Pride PAC — Members Module + Donor Reconciliation (Drop-in PR Bundle)

This bundle separates **Members** from **Donors**, reconciles the founding-member roster with the donor database, and auto-fills county on new data. The **entire database side is already applied to production** (ref `dkdxefzhttkmjhdbkvqn`) and verified; this bundle adds the frontend Members module and commits the migration for repo history.

> Companion to the earlier `ohio-pride-network-pr` bundle. It reuses the same `@/lib/supabase/server` authenticated client shipped there. If that bundle isn't merged yet, copy `src/lib/supabase/*` from it first.

---

## What changed (and why)

### 1. Members ↔ Donors are now separate but linked
- **Members** = the Founding Member roster (`founding_members`), exposed through a new **`members_crm`** view and a **`members`** permission module.
- **Donors** = the unified contribution ledger (`donors`). Every member is now mirrored into `donors` with `source = 'founding_member'`, linked by `donors.founding_member_id`.
- **Prospects** = the prospecting pipeline. Each member's prospect row is now linked to its donor row (`prospects.donor_id`).
- Result: members feed the donor database (for prospecting/upgrade asks) without the two being the same thing.

### 2. Reconciliation (this fixed real gaps in prod)
- **Member numbers:** 1 paying member had no `founding_number` because the old `assign_founding_number()` only numbered *vetted + public* members. Numbering now tracks **membership** (a contribution); vetting controls public display only. Backfilled → members are now numbered **1–164** with no gaps.
- **Donor database:** `donors` had **1** row vs **164** members. Backfilled to **164** linked donor records (deduped against the existing row by email — no duplicates).
- **Prospects:** **164** prospect rows now linked to their donor records (was 0).

### 3. County auto-fill on new data
- New `oh_city_county` lookup + `fill_oh_county()` trigger on **`founding_members`** and **`donors`**. When a row is inserted/updated for an OH city with no county, the county is filled automatically (e.g. "Dayton" → Montgomery). Backfilled the 20 OH members that were missing a county → **0 missing**.

### 4. No double-counting
- `fundraising_dashboard` was summing `founding_members` **plus** `donors`. Since members now also live in `donors`, the view was updated to count only `donors` where `source <> 'founding_member'`. Verified: secured total = member total exactly, `other_pac_donors_count = 0` (until non-member donors are added).

### Auto-sync going forward (verified with a live test)
Inserting a brand-new member now automatically:
1. assigns the next **founding number**,
2. **fills county** from city (OH),
3. creates + links a **donor** record (`source='founding_member'`),
4. links the member's **prospect** to that donor.

Verified end-to-end on production with a temporary row (number 165, county Montgomery, 1 donor, 1 linked prospect) which was then deleted.

---

## CRM change: remove vetted/public filters + sort newest

The public site reads `founding_members_public` (filters `is_public AND is_vetted`) — **leave that as-is** (it powers OhioPride.org/founding-members). The admin CRM must instead read the new unfiltered view:

- **Old (wrong for CRM):** querying `founding_members_public`, or `founding_members` with `.eq('is_public', true).eq('is_vetted', true)`.
- **New:** query **`members_crm`** (no vetted/public filter) ordered by `contributed_at desc` → newest member first. `is_public` / `is_vetted` are returned as **columns** (shown as status chips), not used as filters.

`src/lib/data/members.ts#getMembers()` already does this.

---

## For Claude Code — wiring steps

```
1. Confirm Next.js App Router + @supabase/ssr (same stack as the network bundle).
   Ensure src/lib/supabase/server.ts exists (from ohio-pride-network-pr); if not, copy it in.
2. Copy src/ from this bundle into the repo (merge, don't clobber). Reconcile the "@/..." alias.
3. The migration in supabase/migrations/ is ALREADY APPLIED to prod — commit it for history,
   do not re-run against production (it is idempotent if you must).
4. Find the current members/founding-members admin screen and repoint it at members_crm:
     grep -rn "founding_members_public\|is_vetted\|is_public\|founding_members" src/ app/
   Replace its data fetch with getMembers() from src/lib/data/members.ts (newest-first, no filter).
   If a separate "members" route doesn't exist yet, use the pages in app/(admin)/admin/members/.
5. Add a sidebar link to /admin/members (gate on has_permission('members','read') if nav is permission-aware).
6. Open a PR: "Members module + donor reconciliation + county auto-fill".
```

### Verification queries (run in Supabase SQL editor)

```sql
-- Reconciliation health
select
 (select count(*) from founding_members where founding_number is null) as unnumbered,        -- expect 0
 (select max(founding_number) from founding_members) as max_number,                          -- expect = member count
 (select count(*) from founding_members where state='OH' and (county is null or county='')) as oh_missing_county, -- 0
 (select count(*) from donors where source='founding_member') as donors_from_members,        -- = member count
 (select count(*) from prospects where donor_id is not null) as prospects_linked_donor;       -- = member count

-- Dashboard is not double-counting
select secured_pac_cents, other_pac_donors_count from fundraising_dashboard;
```

---

## File tree

```
ohio-pride-members-pr/
├── README.md
├── supabase/migrations/
│   └── 20260608140000_members_donors_reconcile.sql   # already applied to prod
└── src/
    ├── types/members.ts
    ├── lib/data/members.ts
    └── app/(admin)/admin/members/
        ├── page.tsx                 # CRM: all members, newest first, no vetted/public filter
        ├── [id]/page.tsx            # member detail + donor/prospect linkage
        └── _components/MembersTable.tsx
```

## Data model (after this change)

```
founding_members ──(trigger: county fill, number assign)
       │
       ├── trg_founding_members_to_prospects ─→ prospects ──┐
       │                                                     │ donor_id linked
       └── trg_zz_fm_to_donor ───────────────→ donors ◄──────┘
                                                 source='founding_member'
                                                 founding_member_id → founding_members.id

members_crm  = founding_members + donor link + prospect link   (admin view, no filter, newest first)
donors       = unified ledger; non-member donors have source<>'founding_member'
fundraising_dashboard = founding_members.sum + donors(source<>'founding_member').sum   (no double count)
```

## Notes / assumptions

- Numbering is append-only: the previously-unnumbered member became #164 (the next free number), not inserted mid-sequence, so no public-facing numbers changed.
- County auto-fill is OH-only and city-based (founding_members has no ZIP). The `oh_city_county` table covers the cities currently in your data plus major OH metros; add rows for any new city that comes through unmapped.
- Members→donor sync uses `SECURITY DEFINER` so the public ActBlue/signup path (service role / anon insert into founding_members) still populates the donor ledger.
