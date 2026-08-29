# Daily Bill Check — How to Use It

This is the operator's reference for the daily bill-verification workflow. It is meant to live in your own notes, not in the Claude project instructions. The project instructions tell Claude how to do the work; this document tells you how to invoke the work.

## One-time setup

Before your first daily check, two things need to happen in order. First, the Round 5 migration (20260425000000_daily_verification.sql) needs to be applied to Supabase. Until that migration runs, the bill_verifications table does not exist and the workflow will fail. Second, the project instructions document should be pasted into the project instructions field for the Ohio Pride PAC project in Claude.ai. That field is under the project settings, and it accepts a few thousand characters of text that gets automatically applied to every conversation in the project.

After those two steps are complete, the daily check is ready to run. You will notice no visible change to the project — the instructions operate silently in the background and only kick in when you use one of the triggering phrases described in the instructions document.

## How to use it day-to-day

The normal invocation is to open a new conversation in the Ohio Pride PAC project and type one of the triggering phrases. "Check the bills" is the shortest. Claude will work through the verification routine on its own and produce a consolidated report at the end.

The first daily check you run after setting everything up will take longer than subsequent ones, because every bill shows up in the "needs verification" bucket on day one. Claude will work through all of them in a single pass and the report will be detailed. Subsequent daily checks will be much shorter — typically 22 stable bills confirmed with no action needed, plus occasional new activity or drift to handle.

If you want to check on a specific bill rather than the full tracker, ask about it directly. "What's HB 249 at?" or "any movement on SB 70?" will trigger the single-bill version of the workflow: Claude looks up that one bill, verifies it against the Ohio Legislature source, and records the verification. The report format is a single paragraph rather than the full consolidated structure.

If something in Claude's report is unclear or needs follow-up action, just respond conversationally. Claude has context for the whole session and can elaborate, make a correction, or take an additional action without needing you to re-explain what was happening.

## What you should expect to see

On a quiet day, the report will be short. Something like: "22 bills checked. All confirmed. No new activity, no drift, nothing needs review. Pending work queue is unchanged." On days like this you do not need to do anything — the check is already done and recorded.

On a day with real legislative activity, the report will have a "new activity" section describing what happened and what was updated. Claude will have updated the relevant bill row in Supabase already, so the issues page on the website will reflect the change automatically the next time visitors load it. Your job is to read the report and decide whether the activity warrants any scoring changes to the affected legislators. If it does, you do that manually in the Supabase dashboard; Claude will not adjust scores autonomously.

Occasionally you will see a "needs review" section. These are cases where Claude found something ambiguous and wanted your judgment before proceeding. Usually this is a committee action whose meaning depends on procedural context, or an amendment that might change a bill's stance. Read the description, make the call, and tell Claude what to do.

The "pending work" section is the running backlog. It includes things like provisional roll calls that need journal verification, or bills whose source page was temporarily unreachable. This section tends to grow slowly over time as minor loose ends accumulate. About once a week, it is worth asking Claude to work through the pending-work items to keep the backlog from getting large.

## What to do if something goes wrong

If Claude's report says it could not reach Supabase or that some operation failed, the most likely cause is that the Round 5 migration has not been applied to your Supabase project. Check by opening the Supabase dashboard, navigating to the Table Editor, and confirming that a bill_verifications table exists. If it does not, run the migration and try again.

If Claude's report looks empty or confused — "no bills in any group" or similar — the bills_last_verified view may not have been created. The Round 5 migration creates it; if the migration partially completed, the view may be missing. The fix is to re-run the migration, which is idempotent and safe to re-run.

If the Ohio Legislature website is down or returning errors for many bills, the report will show several "source_unavailable" outcomes. This happens occasionally with any government website. Wait a few hours and run the check again.

If the report describes activity on a bill that you do not believe is in the tracker, the most likely cause is that someone on the team added a bill to the database since the last time you looked. Ask Claude to list the current bill roster and confirm.

## Related workflows that are separate from the daily check

Some work should happen in its own sessions rather than as part of the daily check. The daily check is deliberately scoped to verification and routine updates, and these other workflows are worth handling separately because they involve different kinds of judgment.

Score reassessment is a separate workflow. When you want to update a legislator's votes_score or sponsorship_score based on recent activity, open a new conversation and describe what you want to change. Claude will help you think through the adjustment but will not make it autonomously.

Adding a new bill to the tracker is a separate workflow. When you want to start tracking a bill that is not currently in the database, open a new conversation and give Claude the bill number and a short description of why it belongs in the tracker. Claude will propose the right stance, category tags, and initial status based on the Ohio Legislature page, and you approve the insertion.

Journal reconciliation is a separate workflow that you do weekly or monthly rather than daily. When the pending-work section has accumulated provisional roll calls, open a new conversation and ask Claude to work through the journal reconciliation. Claude will fetch the relevant journal PDFs, match the roll calls against them, and update the verification_status and journal_page_reference fields on the roll_calls rows.

Keeping these workflows distinct is what makes the daily check stay light. If you tried to do everything in one session, the daily check would take an hour and be exhausting. As separate workflows with different rhythms, each one stays manageable.
