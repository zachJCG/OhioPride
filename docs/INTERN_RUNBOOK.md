# Ohio Pride PAC — Scorecard & Bills Intern Runbook

Welcome. This is the playbook for keeping the public scorecard and bill tracker accurate. Everything on the four pages below pulls from the same Supabase tables. If you make a change in the admin, the public site picks it up within a minute.

## The four pages, the four tables

| Public page | Admin page | Supabase table | What lives here |
|---|---|---|---|
| /scorecard | /admin/legislators | `legislators`, `score_snapshots` | One row per lawmaker. Their grade is built from votes + sponsorships. |
| /scorecard (votes) | /admin/legislators (Roll Calls section) | `roll_calls`, `legislator_vote_exceptions` | Each tracked vote, and any time a member broke party line. |
| /scorecard (sponsorship) | /admin/legislators (Sponsorship section) | `legislator_sponsorships` | Who signed onto which bill, as primary or co-sponsor. |
| /issues, /issues/&lt;slug&gt; | /admin/bills | `bills`, `bill_pipeline_steps` | The bills we are tracking, with stance, status, summary, and links. |

Rule of thumb: if you would describe the change as "Senator X did Y on bill Z," it is a roll call. If it's "Rep X added their name to bill Z," it is a sponsorship. If it's "Bill Z moved from committee to floor," it is a bill status update.

## Daily workflows

### Add a new bill

1. Open https://ohiopride.org/admin/bills.
2. Click **+ New Bill**.
3. Fill in:
   - **Bill number**: exactly as the General Assembly prints it (e.g. `HB 312`).
   - **Slug**: auto-filled from bill number (e.g. `hb312`). Leave it alone unless you have a reason to override.
   - **Title**: short editorial title we use across the site (e.g. "Drag Ban").
   - **Stance**: Opposes / Supports / Mixed. This is our editorial call, not the parliamentary state.
   - **Status**: Introduced / In Committee / Passed House / Passed Senate / Enacted / Dead.
   - **Chamber of origin**: House or Senate.
   - **GA**: 136th unless it's a historical bill.
   - **Category**: short tag (e.g. `trans_health`, `schools`, `religious_imposition`).
   - **Introduced on / Last action on**: real dates.
   - **Summary**: one paragraph for /issues and /scorecard reference.
   - **What it does**, **Equality impact**, **Legal risks**: long-form explainers for the per-bill detail page.
   - **Official bill URL**: legislature.ohio.gov page for this bill.
   - **Bill text PDF URL**: direct PDF link.
4. Click **Save bill**. The bill appears on /issues within one minute (hard refresh).

### Log a roll call

1. Open https://ohiopride.org/admin/legislators.
2. Find the lawmaker (search by name or district).
3. Expand their row, scroll to the **Roll Calls** section.
4. Click **Add roll call**.
5. Fill in:
   - **Bill**: pick from the dropdown of tracked bills.
   - **Stage**:
     - `pass` — chamber-of-origin floor passage
     - `concur` — concurrence on the other chamber's amendments
     - `override` — veto override
     - `committee` — substantive vote to report out of committee
     - `amend` — stand-alone amendment vote
     - `introduce` — referral or introduction motion
   - **Vote date**: the day the chamber actually voted.
   - **Label**: short caption (e.g. "House passage 63-32").
   - **Yeas / Nays**: chamber-wide totals.
6. Choose this member's vote: Y / N / NV / E.
7. If the member broke party line, add a short note in **Exception notes** so it shows up on the lawmaker's card.
8. Click **Save vote**.

The grade does NOT change until you publish. See "Publish to the public site" below.

### Add or remove a sponsorship

1. /admin/legislators, expand the lawmaker, scroll to **Sponsorship**.
2. For each tracked bill there is a dropdown: Not a sponsor / Co-sponsor / Primary.
3. Set the role, click **Save**.

Primary sponsorship counts double in the score. Co-sponsorship counts once.

### Publish to the public site

The /admin/legislators page shows two numbers per lawmaker:
- **Draft**: what the math gives them right now, based on every roll call and sponsorship logged so far.
- **Published**: what /scorecard is currently showing.

If Draft and Published disagree, the lawmaker has unpublished changes.

1. Review the lawmaker's draft. Confirm everything looks right.
2. Click **Publish** on their card (publishes one lawmaker).
3. Or click **Publish all** at the top of the page (publishes every lawmaker whose draft differs from their published number).
4. /scorecard updates within one minute.

You need the `legislators:write` permission for this. Ask Zach if your account does not show the button.

### Move a bill's status

1. /admin/bills → click **Edit** on the bill.
2. Change **Status** (e.g. In Committee → Passed House).
3. Change **Last action on** to the date that happened.
4. Save.

The change shows up on /issues and on every roll call that references this bill.

### Pin a bill to the top of /issues

1. /admin/bills → Edit the bill → check **Featured** → Save.
2. Featured bills sort to the top of the public /issues grid.

### Delete a bill

1. /admin/bills → Edit the bill → **Delete** at the bottom-left of the modal.
2. Confirm. This cascades to its sponsorships and pipeline steps, but does NOT delete roll calls that referenced it.
3. Only do this for genuinely-erroneous bills (typo, duplicate). If a bill failed, set Status = Dead instead.

## Things to never do

- Do not change a bill's **slug** after it has been published. The slug is the join key for roll calls and sponsorships. Changing it breaks the link.
- Do not paste donor PII (full names, addresses, ZIPs beyond what the donor agreed to publish) into any bill field.
- Do not write the scorecard math anywhere outside the migration files. The math (50 + Vf×4 + Vc×4 + S×2, clamped 0–100; multipliers 1.25 override / 1.00 pass + concur / 0.75 committee / 0.50 amend / 0.25 intro) is fixed. If you think it needs to change, talk to Zach first because it has to update on the published /methodology page at the same time.

## Quick verification you can run yourself

Open the Supabase SQL editor and paste `scripts/verify-scorecard-math.sql` from this PR bundle. Every `ok` column in section 2 and 3 should be `true`. If anything returns `false`, stop and tell Zach immediately.

## Who to ask

- Math questions, methodology changes, anything on /scorecard or /methodology: Zach.
- Login/permissions, "the publish button is missing": Zach.
- Specific roll call dispute from a lawmaker's office: log it, then escalate to Zach with the chamber journal citation.
