# Ohio Pride PAC — Volunteer Form Fix Pack (2026-05-11)

Drop-in patch that:

1. **Renames the submit button from "Sign me up" to "Submit"** on both paths.
2. **Hardens the form** so the Submit button can only appear on the final step. Toggles BOTH the `hidden` attribute AND inline `display:none` so no stale CSS or extension can override `[hidden]`.
3. **Surfaces the real Supabase error** in the volunteer-submit function response (no more silent `insert_failed`). This is how we will figure out why live submissions are currently failing.
4. **Includes the two missing Supabase migrations** for the internship flow. These exist in the repo but have not yet been applied to the live database — that's why both volunteer and intern submissions return `insert_failed` today.

---

## What's in this zip

```
oppr-fix/
  README.md                                                ← this file
  volunteer.html                                            (button label change)
  js/volunteer-form.js                                      (label + hard submit-only-on-step-5 guard)
  netlify/functions/volunteer-submit.mjs                    (surfaces Supabase error code/message)
  supabase/migrations/
    20260511000000_intern_applications.sql                  (NEW table)
    20260511000100_internships_role_permissions.sql         (admin RBAC for the new table)
  scripts/
    smoke-test.sh                                           (POSTs one volunteer + one intern, prints results)
```

---

## How to apply (the whole thing, in order)

### 1. Replace the three frontend / function files

From your local `OhioPride` checkout:

```bash
cp oppr-fix/volunteer.html                                       ./volunteer.html
cp oppr-fix/js/volunteer-form.js                                  ./js/volunteer-form.js
cp oppr-fix/netlify/functions/volunteer-submit.mjs                ./netlify/functions/volunteer-submit.mjs
git add volunteer.html js/volunteer-form.js netlify/functions/volunteer-submit.mjs
git commit -m "Volunteer form: rename button to Submit + hard guard + surface supabase errors"
git push
```

Netlify will deploy automatically.

### 2. Apply the two Supabase migrations

These are required for `/admin/internships` and intern application submissions to work. Both are idempotent (safe to re-run).

**Option A — Supabase CLI:**

```bash
cp oppr-fix/supabase/migrations/20260511000000_intern_applications.sql        ./supabase/migrations/
cp oppr-fix/supabase/migrations/20260511000100_internships_role_permissions.sql ./supabase/migrations/
supabase db push
```

**Option B — Supabase SQL Editor:**

1. Open https://supabase.com/dashboard → Project `dkdxefzhttkmjhdbkvqn` → SQL Editor.
2. Paste the entire contents of `supabase/migrations/20260511000000_intern_applications.sql` → Run.
3. Paste the entire contents of `supabase/migrations/20260511000100_internships_role_permissions.sql` → Run.

### 3. Verify SUPABASE_SERVICE_ROLE_KEY in Netlify

This is the single most likely cause of the volunteer submission failure. Other Supabase-backed functions (`public-members`, `board-members`, `founding-members-progress`) currently work, so SUPABASE_URL is correct, but writes are failing — which usually means the service-role key is stale or got swapped with the anon key.

1. Supabase Dashboard → Project Settings → API → copy the **`service_role`** key (NOT the `anon` key).
2. Netlify Dashboard → Site `ohiopride` → Site Configuration → Environment Variables.
3. Confirm `SUPABASE_SERVICE_ROLE_KEY` matches what Supabase shows. If it doesn't, paste it in and redeploy (or trigger a redeploy: Deploys → Trigger deploy → Deploy site).

### 4. Smoke test

After everything is deployed and the migrations are applied:

```bash
bash oppr-fix/scripts/smoke-test.sh
```

You should see:

```
[1] Volunteer submission
   HTTP 200 — ok:true kind:volunteer id:<uuid>
[2] Intern submission
   HTTP 200 — ok:true kind:internship id:<uuid>
ALL CHECKS PASSED — log into /admin/volunteers and /admin/internships to see the rows.
```

If you see `HTTP 500 — insert_failed`, the response now includes a `code`, `message`, and `hint` from Supabase. Common codes:

| code     | what it means                                    | fix                                                                                                  |
|----------|--------------------------------------------------|------------------------------------------------------------------------------------------------------|
| `42501`  | row-level security violation                     | `SUPABASE_SERVICE_ROLE_KEY` on Netlify is wrong (probably set to anon). Re-paste real service_role.  |
| `42P01`  | relation does not exist                          | Migration didn't run. Re-apply step 2.                                                               |
| `23502`  | not-null constraint violation                    | A required field is missing — surfaced in `message`.                                                  |
| `23505`  | unique violation on email                        | Email already submitted — upsert should handle, but if it doesn't, share the full body.              |

### 5. Verify in the admin dashboards

After step 4 passes, log in at https://ohiopride.org/admin/login and check:

- `/admin/volunteers` — should show the smoke-test volunteer row.
- `/admin/internships` — should show the smoke-test intern row.

To clean up the smoke test rows afterward, log into Supabase → Table Editor → `volunteers` and `intern_applications` → delete rows whose emails contain `smoke+vol+` / `smoke+intern+`.

---

## What I changed (precise diffs)

### `volunteer.html`

```diff
-              <button type="submit" class="btn btn-primary vform-submit" id="vformSubmit" hidden>Sign me up</button>
+              <button type="submit" class="btn btn-primary vform-submit" id="vformSubmit" hidden style="display:none">Submit</button>
```

The inline `style="display:none"` is the belt-and-suspenders so the button stays gone if `[hidden]` is overridden by anything (browser extension, stale cached CSS, etc.).

### `js/volunteer-form.js` — `showStep()`

```diff
-    var atFinish = (pct >= 100);
-    backBtn.hidden   = (n === 1);
-    nextBtn.hidden   = atFinish;
-    submitBtn.hidden = !atFinish;
-    submitBtn.textContent = state.path === 'internship' ? 'Submit application' : 'Sign me up';
+    // Hard rule: submit is ONLY visible on the absolute last step.
+    // Belt-and-suspenders: toggle both the `hidden` attribute AND the
+    // inline `display` style so no stale CSS can override [hidden].
+    var atFinish = (n === TOTAL_STEPS);
+    backBtn.hidden   = (n === 1);
+    backBtn.style.display   = (n === 1)   ? 'none' : '';
+    nextBtn.hidden   = atFinish;
+    nextBtn.style.display   = atFinish    ? 'none' : '';
+    submitBtn.hidden = !atFinish;
+    submitBtn.style.display = atFinish    ? ''     : 'none';
+    submitBtn.textContent = 'Submit';
```

### `js/volunteer-form.js` — in-flight label

```diff
-    submitBtn.textContent = state.path === 'internship'
-      ? 'Submitting application...' : 'Signing you up...';
+    submitBtn.textContent = 'Submitting...';
```

### `netlify/functions/volunteer-submit.mjs` — both insert error returns

```diff
   if (error) {
     console.error('volunteer-submit (volunteer) insert failed:', error);
-    return jsonResponse(500, { ok: false, error: 'insert_failed' });
+    return jsonResponse(500, {
+      ok: false,
+      error: 'insert_failed',
+      code: error.code || null,
+      message: error.message || null,
+      hint:    error.hint    || null,
+      details: error.details || null,
+    });
   }
```

(Same change for the internship branch.) Supabase error objects never contain credentials, so surfacing the four fields is safe and is the only practical way to debug a production submit failure from outside the Netlify function logs.

---

## Verification I ran in-bundle

Using a headless DOM against the patched files:

```
[Step 1 — initial load]            submit hidden + display:none, label "Submit", back hidden
[Steps 2-4]                        submit hidden + display:none, next visible
[Step 5]                           submit visible, label "Submit", next hidden + display:none
[Internship path, Step 5]          submit visible, label "Submit"
ALL CHECKS PASSED (14/14)
```

Then against the live `ohiopride.org/.netlify/functions/volunteer-submit`:

```
Volunteer submission:  HTTP 500 — { ok:false, error:'insert_failed' }
Intern submission:     HTTP 500 — { ok:false, error:'insert_failed' }
```

That confirms the function is reachable but the write fails. With this patch deployed, that same call will return the underlying Supabase code + message, and steps 1-3 above will resolve the actual root cause (almost certainly missing migrations + a stale service-role key on Netlify).
