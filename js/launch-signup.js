/* ==========================================================================
   launch-signup.js
   Drop-in handler for any Ohio Pride PAC RSVP / signup form.

   Inserts the submission into public.launch_signups (Supabase) and
   keeps the existing Netlify Forms post for redundancy + email
   notification. No backend code required.

   USAGE
   -----
   1. Make sure your <form> has these fields with these `name`s:
        email, first_name, last_name, organization (optional), title (optional)
   2. Add these data attributes to the <form>:
        data-launch-form
        data-source="launch-day-rsvp"     // any short string for tagging
   3. Optionally include a <div data-launch-success hidden>...</div>
      below the form. The script will reveal it on success.
   4. Drop this script tag in the page (defer is fine):
        <script src="/js/launch-signup.js" defer></script>

   That is it. No other code changes needed.
   ========================================================================== */

(function () {
  var SUPABASE_URL = "https://dkdxefzhttkmjhdbkvqn.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZHhlZnpodHRrbWpoZGJrdnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTk5NjksImV4cCI6MjA5MjM5NTk2OX0.l6wUMIdUX5Es4Jvh8fRTvnlYrMQKzYy_NEGBFJ1iMj4";

  function postToSupabase(payload) {
    // Anon role has INSERT but not SELECT on launch_signups. Do not request
    // the inserted row back (no return=representation, no resolution=*) or
    // PostgREST will 42501 even though the write succeeds.
    return fetch(SUPABASE_URL + "/rest/v1/launch_signups", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload)
    });
  }

  function postToNetlify(form) {
    var fd = new FormData(form);
    return fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fd).toString()
    });
  }

  function bind(form) {
    if (form.__lsBound) return;
    form.__lsBound = true;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"], input[type="submit"]');
      var originalText = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = "Submitting\u2026"; }

      var fd = new FormData(form);
      var payload = {
        email: (fd.get("email") || "").trim(),
        first_name: (fd.get("first_name") || "").trim(),
        last_name: (fd.get("last_name") || "").trim(),
        organization: (fd.get("organization") || "").trim() || null,
        title: (fd.get("title") || "").trim() || null,
        source: form.getAttribute("data-source") || "launch-day-rsvp",
        user_agent: navigator.userAgent || null,
        referrer: document.referrer || null
      };

      var calls = [postToSupabase(payload)];
      if (form.hasAttribute("data-netlify")) calls.push(postToNetlify(form));

      Promise.allSettled(calls).then(function (results) {
        var supabaseOk = results[0].status === "fulfilled" && results[0].value && results[0].value.ok;
        if (!supabaseOk) {
          if (btn) { btn.disabled = false; btn.textContent = originalText || "Count Me In"; }
          window.alert("Something went wrong saving your signup. Please try again or email zach@ohiopride.org directly.");
          return;
        }
        var success = document.querySelector('[data-launch-success]');
        if (success) {
          form.style.display = "none";
          success.hidden = false;
          success.style.display = "block";
        } else {
          if (btn) btn.textContent = "You are in! \u2728";
        }
      });
    });
  }

  function init() {
    document.querySelectorAll('form[data-launch-form]').forEach(bind);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
