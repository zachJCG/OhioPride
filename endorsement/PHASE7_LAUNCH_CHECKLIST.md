# Ohio Pride PAC :: Endorsement System Launch Checklist

Status: Pre-launch
Target launch date: **Wednesday, June 17, 2026**
Owner: Zachary R. Joseph, Director

---

## 1. Test Candidate Submission Template

Copy and paste this template into the live form at `/endorsement/screening` to verify end-to-end. Use the email exactly as written so it filters cleanly out of real submissions.

### Step 1: Candidate Information

| Field | Value |
|---|---|
| Full name | `Test Candidate Smith` |
| Pronouns | `they/them` |
| Office sought | `Ohio House of Representatives` |
| District | `District 99 (test)` |
| Election year | `2026` |
| Party | `Democratic` |
| Out as LGBTQ+ | `Yes` |
| Committee name | `Friends of Test Candidate` |
| Treasurer | `Pat Test` |
| Email | `screening+test@ohiopride.org` |
| Phone | `614-555-0199` |
| Website | `https://example.com` |

### Step 2: Core Positions (all Yes)

For each question pick **Yes** and paste the same explanation: "Test submission. Verifying end-to-end flow. This response is not a real position."

### Step 3: Legislative Commitment

- Top three priorities: `1. Test priority A 2. Test priority B 3. Test priority C`
- Bills to champion: `Test bill name. This is a test submission.`
- Safety: `Test response. Verifying form capture for the safety question.`

### Step 4: Vision and Ohio Context

- Intersection: `Test response. Verifying long-form capture and line break preservation. Line one. Line two.`
- Why endorsement: `Test response. Verifying the why question.`

### Step 5: Background and Attestation

- Bio: `Test bio. Two short sentences. Used to verify card rendering on public page.`
- Conflicts: `None.`
- Attestation: **check the box**
- Signature: `Test Candidate Smith`

Submit. Should land on `/endorsement/screening/thank-you`.

### Cleanup query (after testing)

```sql
delete from public.endorsement_applications
where email = 'screening+test@ohiopride.org';
```

---

## 2. End-to-End Validation Steps

Run through every box. Each should be ticked before launch.

### Form submission

- [ ] `/endorsement/screening` loads, no console errors
- [ ] Pride stripe renders top and bottom
- [ ] Wordmark renders correctly with cyan PAC suffix
- [ ] Step 1 (Candidate Info) accepts all 12 fields
- [ ] Required field validation triggers on Next click
- [ ] Two-column row layout collapses to single column on mobile
- [ ] Step 2 (Core Positions) renders 5 question blocks
- [ ] Yes/No buttons style correctly when selected
- [ ] Required explanation textareas trigger validation
- [ ] Step 3 (Legislative Commitment) shows 3 textareas
- [ ] Step 4 (Vision and Ohio Context) shows 2 textareas
- [ ] Step 5 (Background and Attestation) shows bio, conflicts, attestation, signature, date
- [ ] Honeypot field is invisible (inspect DOM, confirm `position: absolute; left: -9999px`)
- [ ] Refresh mid-form, confirm autosave restored data
- [ ] Submit redirects to `/endorsement/screening/thank-you`
- [ ] Thank-you page shows pride banner, "What Happens Next" timeline, screening contact

### Admin: row appears

- [ ] `/admin/endorsements` redirects to login when not authenticated
- [ ] Magic-link email arrives within 1 minute
- [ ] Clicking the link signs you in and lands on the list
- [ ] Test submission appears at the top of the list, status "Submitted"
- [ ] Stat counts at top reflect the new row (Total +1, New +1)
- [ ] Search by "Test Candidate" filters correctly
- [ ] Status filter and office filter work
- [ ] Sort by Submitted, Candidate, Office, Status all work

### Admin: detail view

- [ ] Clicking the row opens `/admin/endorsements/detail?id=...`
- [ ] All Section 1 fields populate
- [ ] All 5 core positions show with green/red bars matching Yes/No
- [ ] Sections 3, 4, 5 render with cyan-bar response panels
- [ ] Audit Trail at bottom shows correct timestamps
- [ ] Status dropdown defaults to current status
- [ ] Reviewer Notes textarea is empty
- [ ] Saving with a new note persists after refresh
- [ ] Status badge in header updates after Save

### PDF generation

- [ ] Generate PDF button shows loading state on click
- [ ] PDF downloads / opens in new tab successfully
- [ ] PDF page count is 2 to 4 pages depending on content
- [ ] Pride stripes render top and bottom of every page
- [ ] Navy header has "OhioPride PAC" wordmark and "ENDORSEMENT APPLICATION" eyebrow
- [ ] Footer disclaimer present on every page
- [ ] Page number renders centered in cyan
- [ ] All 5 sections render with correct color-coded badges
- [ ] No em dashes or en dashes anywhere in the PDF
- [ ] Refresh detail page, "Open Last PDF" link appears
- [ ] Click "Open Last PDF" → opens via signed URL

### Status change to endorsed

- [ ] Set status to "Endorsed" in admin, click Save
- [ ] Header badge turns green and reads "ENDORSED"
- [ ] Public `/endorsements` page shows the candidate within 30 seconds (page reload)
- [ ] Card shows correct office level via filter chips (Federal/State/Local)
- [ ] Bio renders, campaign link works, "Endorsed" pill present
- [ ] Year filter dropdown includes the test year
- [ ] Office level filter chips correctly classify the test row

### Email triggers (Phase 5)

- [ ] Candidate confirmation email arrives within 1 minute of form submission
- [ ] Email subject reads: "We received your application | Ohio Pride PAC"
- [ ] Email renders correctly in Gmail web, Gmail mobile, Apple Mail
- [ ] Reply-to is `screening@ohiopride.org`
- [ ] Director alert email arrives in Zach's inbox within 1 minute
- [ ] Subject includes candidate name and office
- [ ] "Open in Admin" button links correctly
- [ ] Reply-to on director email is the candidate's email
- [ ] Endorsement congrats email arrives when status flips to "endorsed"
- [ ] Subject reads: "Endorsed by Ohio Pride PAC: Welcome to the team"
- [ ] All three emails have working pride stripe, wordmark, footer disclaimer
- [ ] Resend dashboard shows three emails dispatched per test cycle

### Idempotency

- [ ] Re-Save the same status without change → no duplicate email sent
- [ ] Flip status away from endorsed and back → only first transition sends email (subsequent flips back blocked by trigger logic)

---

## 3. Pre-Launch QA Checklist

### Browser compatibility

- [ ] Chrome desktop (latest)
- [ ] Safari desktop (latest)
- [ ] Firefox desktop (latest)
- [ ] Safari iOS (iPhone)
- [ ] Chrome Android
- [ ] Edge desktop

### Accessibility

- [ ] Form labels associated with inputs
- [ ] Tab order flows top to bottom
- [ ] Focus rings visible on all interactive elements
- [ ] Screen reader can read all sections (test with VoiceOver or NVDA)
- [ ] Color contrast passes WCAG AA on all text
- [ ] All images have alt text or are marked decorative
- [ ] Errors announced to assistive tech on submit

### Security

- [ ] Service role key is NOT in any client-side code
- [ ] Anon key is the only Supabase key in the form and admin pages
- [ ] Webhook secret is in Supabase Vault, not in source
- [ ] Resend API key is server-only on Edge Functions
- [ ] PDF function rejects requests without valid JWT
- [ ] PDF function rejects requests from non-admin emails
- [ ] Email triggers only fire from authenticated webhook calls
- [ ] Direct anonymous query against `endorsement_applications` only returns endorsed rows
- [ ] Sensitive fields (email, phone, reviewer_notes) never visible in browser network tab

### Performance

- [ ] Form first paint under 2 seconds on 3G
- [ ] Admin list loads under 3 seconds with 50+ rows
- [ ] PDF generation completes under 5 seconds
- [ ] Public endorsements page first paint under 2 seconds
- [ ] No render-blocking external resources (fonts load async)

### Content

- [ ] No em dashes or en dashes anywhere in any output
- [ ] Disclaimer "Paid for by Ohio Pride PAC. Zachary R. Joseph, Director." on every page and email
- [ ] No mention of David Donofrio in any disclaimer
- [ ] "out" used everywhere, never "openly"
- [ ] All copy proofread by at least two people

---

## 4. Content Needed Before Going Live

| Item | Status | Owner | Due |
|---|---|---|---|
| Final questionnaire copy approved by Board | Draft (Phase 2) | Board | June 3 |
| Candidate FAQ approved | Draft (this doc) | Director + Comms | June 3 |
| Screening Committee internal guide | Not started | Director | June 10 |
| Public endorsements page intro copy | Draft (Phase 6) | Comms | June 3 |
| Email template review by Comms | Draft (Phase 5) | Comms | June 3 |
| Resend domain verified and warming | Not started | Director | June 10 |
| Privacy notice link in form footer | Not started | Director | June 14 |
| Comms plan: announcement email + social rollout | Not started | Comms | June 14 |

### Questionnaire copy approval session

Schedule a 30-minute Board call to walk through the 10 questions and the candidate FAQ. Record any wording changes and apply before launch.

### Screening Committee internal guide

A short document for the Screening Committee covering:
- How to access the admin dashboard (login link, magic-link flow)
- What each application section means and how to evaluate
- Scoring rubric (if any) and decision rules
- Escalation path (when to flag for full Board vote vs. fast-track)
- Conflict of interest disclosure expectations for committee members
- Communication protocol with candidates during review
- Confidentiality expectations for unpublished applications

### Public endorsements page intro copy

Current draft on `/endorsements`:
> Ohio Pride PAC endorses candidates who demonstrate strong, consistent support for LGBTQ+ equality. Each candidate below has been vetted by our Screening Committee and approved by our Board.
> **Endorse. Mobilize. Fight for Ohio.**

Comms to review and approve as-is or revise.

---

## 5. Soft-Launch Sequence

Anchored to the May 22 press conference. Public form launch target: **Wednesday, June 17, 2026**.

### Week of May 18 to 24: Public launch of Ohio Pride PAC

- [ ] May 22 (Friday): Press conference at Ohio Statehouse
- [ ] May 23 to 24: Monitor reception, address any urgent feedback

### Week of May 25 to 31: System hardening

- [ ] Apply Phase 1 to 6 to production Supabase project
- [ ] Deploy Phase 2, 3, 4, 6 to Netlify production
- [ ] Deploy Phase 5 Edge Functions and verify webhook triggers fire end-to-end
- [ ] Internal team test of full flow using `screening+test@ohiopride.org`

### Week of June 1 to 7: Board approvals

- [ ] Tuesday June 2: Board call to approve final questionnaire copy
- [ ] Comms reviews and finalizes candidate FAQ, public intro, email templates
- [ ] Director writes the Screening Committee internal guide
- [ ] Lock all copy by Friday June 5

### Week of June 8 to 14: Beta with friendly candidates

- [ ] Monday June 8: Send beta link to 2 to 3 friendly candidates already on the radar (e.g., Jeff Givan, others)
- [ ] Collect feedback throughout the week
- [ ] Fix any bugs surfaced (target zero by Friday June 12)
- [ ] Friday June 12: Final pre-launch QA review

### Week of June 15 to 21: Public launch

- [ ] Tuesday June 16: Final dry run, test full flow one more time
- [ ] **Wednesday June 17: Public launch.** Update homepage with link, push social posts (per Ari's June dual-post plan)
- [ ] Tuesday June 23 at 9:30 AM ET: Announcement email to the 178-contact political list via Action Network or Mailchimp

### Week of June 22+: Operate

- [ ] Monitor inbox for candidate inquiries
- [ ] Track first wave of submissions
- [ ] Schedule first Screening Committee review session (target: first Tuesday after 5+ applications received)

---

## 6. Launch Day Runbook (June 17)

Order of operations on launch day, in order:

1. 8:00 AM: Final smoke test of public form, admin, PDF, public page, emails
2. 9:00 AM: Update `ohiopride.org/` homepage with link to `/endorsement/screening`
3. 9:30 AM: First social post (per Ari's plan): announcement that endorsement applications are open
4. 10:00 AM: Send heads-up email to the Board with link, FAQ, and ask for one share each
5. 11:00 AM: Send heads-up to friendly press contacts
6. Throughout day: Monitor Resend dashboard, Supabase logs, any new submissions
7. 5:00 PM: Day-one report. Submission count, any issues, social engagement.

---

## 7. Rollback Plan

If something breaks badly post-launch:

- **Form 500 errors**: revert the most recent Netlify deploy via the Netlify dashboard
- **Submissions blocked at DB level**: check RLS policies haven't been changed; rerun Phase 1 SQL if needed
- **Emails not firing**: check Edge Function env vars and Resend dashboard; webhook triggers degrade gracefully if Vault secret is unset (no insert/update is blocked, just no email)
- **Spam flood**: temporarily disable anon INSERT policy via SQL editor, troubleshoot honeypot or add Cloudflare Turnstile (Phase 2 originally supported it)
- **PDF function 500s**: PDF gen is non-blocking; admins can still review applications in the dashboard. Fix at leisure.
- **Public page broken**: take down `/endorsements` route in Netlify, restore later
