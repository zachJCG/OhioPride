# Ohio Pride PAC, Daily Bill Tracker Workflow

This document describes the standard operating procedure when Zach asks Claude to check the bills, do the daily update, or any similar request indicating a bill-verification session. Claude should follow this workflow consistently so the output is predictable across days and the audit trail in Supabase stays clean.

## Triggering phrases

When Zach types any of the following (or close variants), Claude should execute the full daily verification workflow described below:

- "check the bills"
- "daily bill check"
- "daily update" or "morning update"
- "run through the tracker"
- "what needs attention today"

When the phrasing is clearly a question about a single bill rather than the whole tracker ("what's HB 249 at?", "any movement on SB 70?"), Claude should do the single-bill version of the workflow instead, look up that one bill, verify its current state against the Ohio Legislature source, report findings, and record the verification. All the same conventions apply, just scoped to one bill.

## What the workflow does, at a high level

The daily bill-check has three phases, performed in this order. Claude should work through all three in a single pass and produce one consolidated report at the end.

Phase one is reconnaissance. Claude queries the bill-verification-status endpoint to get the current state of every tracked bill, grouped into three priority buckets: bills needing verification (not checked in 7+ days or never), bills with pending activity from a prior check (drift detected or new activity found), and stable bills (recently confirmed, no pending work). The counts alone are the first thing Claude reports, because they tell Zach whether today is a quiet day or a busy one.

Phase two is the actual verification work. For each bill in the "needs verification" and "recently active" groups, Claude visits the Ohio Legislature bill page and compares what it finds against what the database shows. For bills in the stable group, Claude does not re-verify by default, those bills are within their verification window and re-checking them would be wasted effort. If Zach explicitly asks for a full sweep, Claude can re-check stable bills too, but the default behavior is to trust the recent verification.

Phase three is recording and reporting. For each bill checked, Claude records the outcome via the record_bill_verification SQL function, and then produces a single consolidated report for Zach at the end.

## Sources and their priority order

The research the team did on Ohio legislative sources established a clear hierarchy. Claude should follow it consistently:

The Ohio Legislature bill pages at legislature.ohio.gov are the primary working source. Every tracked bill has a canonical URL stored in the database as legislature_url. These pages have Status, Votes, and Committee Activity tabs that together cover everything needed for daily verification. The research document confirmed these are reliable and fast to read.

The House and Senate journals are the source of record for floor votes. When a roll call needs to be reconciled against the journal for the first time (to move it from provisional to verified status), Claude should cite the journal page. The journals are at ohiolegislature.gov/publications/session-journals.

Committee reports and committee minutes are the source of record for committee votes. The House rules require these to be posted within 7 days of the meeting; Senate rules require equivalent records.

The Ohio Secretary of State current-session page is the source of record for enacted bills and their filed text. When a bill transitions to signed-into-law status, Claude should switch any full-text link to the SOS page.

When sources disagree, Claude should always trust the higher-priority source and record the discrepancy in the verification notes. The journal wins over the bill page if they differ on member names or tallies.

## Tools Claude uses

Claude has access to Supabase via an MCP connection. The specific operations needed for this workflow are:

For the initial reconciliation, Claude queries the bills-last-verified view or calls the bill-verification-status Netlify function (whichever is more convenient in the moment). The function returns the pre-bucketed groups; the view returns the raw data to bucket in memory.

For fetching the authoritative bill state from the Ohio Legislature website, Claude uses the web_fetch tool with the legislature_url stored for each bill. Claude should fetch the status, votes, and committee activity tabs as needed. For HB 249 this would be https://www.legislature.ohio.gov/legislation/136/hb249 and its sub-pages.

For recording verification outcomes, Claude calls the public.record_bill_verification SQL function via the Supabase MCP. The function signature takes the bill slug, checker name (always "claude" for this workflow unless Zach specifies otherwise), outcome, optional notes, and optional observed values if drift was detected.

For updating bill rows when an actual status change is confirmed, Claude writes an UPDATE statement against the bills table via Supabase. The update should include the new status_id (looked up by slug from bill_statuses), the new current_step_index, the new last_action, the updated pipeline_dates JSON, and any new vote summary fields. After the update, Claude should still record a verification row, the outcome in that case is "new_activity" rather than "drift_detected," because the drift has been resolved.

For adding new roll calls, Claude inserts into the roll_calls table, populating journal_page_reference with a placeholder like "[pending journal verification]" and setting verification_status to "provisional." If Claude has time during the same session to cross-reference the journal, it can update those fields; if not, they stay provisional and show up in a future session as pending work.

## Conventions for recording verifications

The outcome field on bill_verifications has five valid values. Claude should pick the correct one based on what was found:

"confirmed" means the Ohio Legislature page shows exactly what the database shows. This is the most common outcome and represents a successful no-op verification. The bill has not changed since the last check.

"drift_detected" means the Ohio Legislature page shows different data than what the database stores, but the discrepancy looks like an editorial or data-entry issue rather than actual legislative activity. For example, a bill might be stored as "In Committee" but the source shows it was referred to a different committee than what the database says. The underlying state is unchanged, but the stored data was incomplete or stale.

"new_activity" means the Ohio Legislature page shows legislative action that has occurred since the last check. A new committee hearing, a new vote, a status change, a transmission between chambers. This is the outcome that requires follow-up action: Claude should update the bill row, add any new roll calls, and then record the verification.

"source_unavailable" means Claude was unable to reach the Ohio Legislature page, or the page returned an error. The bill has not been checked, and someone should try again later.

"needs_review" means Claude found something ambiguous that requires human judgment before it can be resolved. Use this outcome sparingly, if Claude can describe what it found in clear terms, the outcome is probably drift_detected or new_activity. needs_review is for genuinely unclear situations, like a committee action whose meaning depends on procedural context Claude cannot assess.

The notes field on each verification should be concise but specific. For confirmed verifications, "Status unchanged; last committee hearing still March 25" is plenty. For new_activity outcomes, notes should include what specifically was found and what was updated. For drift_detected, notes should describe the mismatch and what was reconciled.

## Report format

After working through the verification list, Claude produces a single consolidated report for Zach. The report should follow this structure consistently, because consistency across days is what lets Zach scan quickly and spot what's different.

The report begins with a one-sentence headline that summarizes the day in operational terms. "22 bills checked; 1 new activity, 3 drift corrections, 18 confirmed." This is the executive summary and should be honest about whether today was busy or quiet.

The report then has a "New activity" section if any was found. For each bill with new activity, a short paragraph describes what happened, what was updated in the database, and what (if anything) still needs human attention. If there was no new activity, this section is replaced with "No new legislative activity since last check."

The report then has a "Drift corrections" section for each bill where stored data did not match the source. Same format as new activity: one paragraph per bill, describing what was mismatched and how it was reconciled.

The report then has a "Needs review" section only if Claude flagged any bills as needing human judgment. If none, this section is omitted entirely rather than shown as empty.

The report ends with a "Pending work" section that lists anything Claude noticed but did not resolve in this session. Provisional roll calls that need journal verification, bills where the source was unavailable and should be rechecked, or any other loose ends. This section tells Zach what to expect in the next session.

The report should be written in plain prose, in paragraphs rather than bullet lists. No headers larger than a short bold phrase. No emoji. No elaborate formatting. The goal is a quick read, not a ceremony.

## When to stop and ask

Claude should proceed autonomously through the full workflow without asking Zach for input on any of the following:

Routine confirmations of unchanged bills. If the Ohio Legislature page matches the database, record the confirmation and move on.

Minor status updates that are unambiguous. A bill moving from "Referred to Committee" to "In Committee Hearings" is a routine transition and Claude should update the bill row and record the verification without asking.

Provisional roll call entries for new floor votes when the Ohio Legislature votes page shows a clear tally. Enter them as provisional, record the new activity, and move on.

Claude should stop and ask Zach before proceeding on the following:

Any change that would affect a legislator's score. Composite scores are computed at view time from public.bills, public.roll_calls, public.legislator_vote_exceptions, and the LEGISLATOR_SPONSORSHIPS map in /js/scorecard-data.js using the v6 formula score = clamp(0, 100, round(50 + (Vf*4) + (Vc*4) + (S*2))). There are no stored subscore columns on a legislators table, so Claude should not "set" them. If a new floor vote, committee vote, or sponsorship attribution would meaningfully shift a legislator's grade, Claude flags it in the daily report and waits for Zach to approve adding the underlying evidence (a roll_calls row, a vote exception, or a sponsorship entry). News and quotes are no longer scored as of v6.

Any change to a bill's stance (anti / pro / mixed). Stance is an editorial call. If Claude notices that a bill's content appears to have been substantially amended in a way that might change its stance, it flags this for Zach rather than re-labeling autonomously.

Any addition of a new bill to the tracker. Adding a bill is a deliberate editorial decision about what to track. Claude surfaces unfamiliar bills that appeared in the source material but does not insert new rows into the bills table on its own.

Anything that touches the grade_scale, bill_categories, or bill_statuses lookup tables. These are configuration, not data, and changing them is always a deliberate decision.

## Minimum context Claude needs before the first daily check

When Zach first starts using this workflow, he should confirm that the Round 5 migration has been applied to Supabase (the bill_verifications table and related infrastructure). Until then, the bills_last_verified view returns no verification data and every bill appears as "never verified." That's fine for the first session, everything just starts in the needs_verification bucket and gets populated as Claude works through it, but it's worth knowing so the first day's report is not mysterious.

## What this workflow deliberately does not do

The workflow does not compute scores automatically from vote events. The scorecard's editorial layer remains where it is: staff judgment about what each legislator's record means. When new votes land, the workflow records them and surfaces them to Zach in the report, but does not adjust legislator scores. If Zach wants to reassess a score based on new voting activity, he does it manually, and Claude helps him think it through if he asks.

The workflow does not create roll_calls rows for votes on bills not in the tracker. Only the 22 (or however many) tracked bills get verified. If the research pulls up an interesting vote on an untracked bill, Claude mentions it in the report but does not create data for it.

The workflow does not proactively fetch journal PDFs to reconcile every provisional roll call on every daily check. That's a heavier operation. Claude only reconciles a specific provisional roll call when Zach asks for it explicitly, when the daily check touches that bill for another reason, or when the pending-work section has grown large enough that clearing some of it seems worthwhile.

These three exclusions are what distinguishes the "daily check" workflow from a full rebuild. The daily check is meant to be light, fast, and repeatable. The fuller operations, score recalibration, journal reconciliation, adding new bills, happen in separate sessions with their own workflows.
