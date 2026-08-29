# Ohio Pride PAC :: Endorsement System

Complete build of the candidate endorsement system for ohiopride.org. Seven phases, end to end. Drop the file structures into matching paths in your Netlify and Supabase project repos.

---

## What's in This Bundle

```
ohio-pride-endorsement-system/
├── README.md                           ← you are here
│
├── phase1/                             Database foundation
│   ├── 01_endorsement_system.sql       Single-paste SQL for Supabase
│   └── (no setup notes; SQL is self-documenting)
│
├── phase2/                             Public form (Cloudflare Turnstile version)
│   ├── endorsement/screening/index.html
│   ├── endorsement/screening/thank-you/index.html
│   └── PHASE2_SETUP.md
│
├── phase3/                             Form (Cloudflare-stripped) + Admin dashboard
│   ├── endorsement/screening/index.html        (USE THIS, not phase2's)
│   ├── endorsement/screening/thank-you/index.html
│   ├── admin/endorsements/admin.css
│   ├── admin/endorsements/index.html           (list)
│   ├── admin/endorsements/login/index.html
│   ├── admin/endorsements/detail/index.html
│   └── PHASE3_SETUP.md
│
├── phase4/                             PDF generation (Netlify Function)
│   ├── netlify.toml
│   ├── netlify/functions/generate-endorsement-pdf.py
│   ├── netlify/functions/requirements.txt
│   ├── sample-application.pdf          Reference output
│   └── PHASE4_SETUP.md
│
├── phase5/                             Email triggers (Supabase Edge Functions)
│   ├── supabase/migrations/20260505_endorsement_notification_triggers.sql
│   ├── supabase/functions/_shared/types.ts
│   ├── supabase/functions/_shared/resend.ts
│   ├── supabase/functions/_shared/templates.ts
│   ├── supabase/functions/on-new-application/index.ts
│   ├── supabase/functions/on-status-endorsed/index.ts
│   ├── email-preview-1-candidate-confirmation.html  Reference renders
│   ├── email-preview-2-director-alert.html
│   ├── email-preview-3-endorsement-congrats.html
│   └── PHASE5_SETUP.md
│
├── phase6/                             Public endorsements page
│   ├── endorsements/index.html
│   ├── preview-desktop.png             Reference render
│   ├── preview-mobile.png              Reference render
│   └── PHASE6_SETUP.md
│
└── phase7/                             Launch checklist + candidate FAQ
    ├── PHASE7_LAUNCH_CHECKLIST.md      For Notion (with task checkboxes)
    └── CANDIDATE_FAQ.md                Public-facing FAQ
```

---

## Important: Phase 2 vs Phase 3 Form

Phase 2's form file integrates Cloudflare Turnstile. Phase 3's form file replaces Turnstile with a honeypot + timing check (no Cloudflare needed). **Use Phase 3's version.** Phase 2 is preserved for reference in case you ever add Cloudflare later.

---

## Deployment Order

Apply in this order for a clean build:

1. **Phase 1**: paste SQL into Supabase SQL Editor. Create the `endorsement-pdfs` Storage bucket. Configure Auth.
2. **Phase 2/3**: deploy form and admin pages to Netlify. Paste anon key into config blocks. Deploy.
3. **Phase 4**: deploy PDF Netlify Function. Set environment variables (incl. `SUPABASE_SERVICE_ROLE_KEY`).
4. **Phase 5**: apply trigger migration. Set `webhook_secret` in Vault. Deploy Edge Functions. Set Resend API key, webhook secret, and FROM/ADMIN env vars.
5. **Phase 6**: deploy public endorsements page. Paste anon key.
6. **Phase 7**: print the launch checklist and walk it. When green across the board, ship.

Each phase has its own setup notes with exact env var names, SQL snippets, and test plans.

---

## What's Wired Up

- **Live form** at `ohiopride.org/endorsement/screening` with multi-step UX, autosave, validation, honeypot spam protection
- **Admin dashboard** at `ohiopride.org/admin/endorsements` with magic-link auth, sortable list, detail view, status updates, reviewer notes
- **Branded PDF generator** at `/.netlify/functions/generate-endorsement-pdf` producing 2-4 page applications on Ohio Pride letterhead
- **Email notifications** via Resend on form submission (candidate + director) and on endorsement (candidate)
- **Public endorsements page** at `ohiopride.org/endorsements` with live data, filters by Federal/State/Local + year, candidate cards
- **Auto-publish** when status flips to "endorsed" (no manual cache invalidation needed)
- **Privacy-first design** with RLS at every layer; sensitive fields never exposed to anon

---

## Brand Compliance

Every output in this bundle follows Ohio Pride PAC brand v1.1:

- Navy `#0F2233` and Light Blue (Cyan) `#73D7EE` dominant
- Pride gradient on top and bottom stripes
- Montserrat for headlines, Roboto Slab for body (or web-safe fallbacks where fonts can't be bundled)
- Disclaimer "Paid for by Ohio Pride PAC. Zachary R. Joseph, Director." on every page, email, and PDF
- "out" used everywhere, never "openly"
- No em dashes or en dashes anywhere

---

## Soft-Launch Target: June 17, 2026

See `phase7/PHASE7_LAUNCH_CHECKLIST.md` for the full sequence.

---

*Built end to end across seven phases. Endorse. Mobilize. Fight for Ohio.*
