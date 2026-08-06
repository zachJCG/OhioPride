/* ==========================================================================
   rsvp-form.js
   Drop-in handler for any Ohio Pride PAC RSVP / signup form.

   Posts the submission to /api/form-submit, which stores it in
   public.form_submissions and emails a notification to the team.
   (Replaces the retired launch-signup.js, which wrote to the
   launch_signups table removed on 2026-08-06.)

   USAGE
   -----
   1. Give your <form> inputs standard `name`s, e.g.:
        email, first_name, last_name, organization (optional)
   2. Add these data attributes to the <form>:
        data-rsvp-form
        data-form-name="pride-hour-cincinnati"   // must be allowed by form-submit
   3. Optionally include a <div data-rsvp-success hidden>...</div>
      below the form. The script will reveal it on success.
   4. Drop this script tag in the page (defer is fine):
        <script src="/js/rsvp-form.js" defer></script>
   ========================================================================== */

(function () {
  function bind(form) {
    if (form.__rsvpBound) return;
    form.__rsvpBound = true;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"], input[type="submit"]');
      var originalText = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = "Submitting…"; }

      var fd = new FormData(form);
      fd.set("form-name", form.getAttribute("data-form-name") || "rsvp");

      fetch("/api/form-submit", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fd).toString()
      }).then(function (resp) {
        if (!resp.ok) throw new Error("bad status " + resp.status);
        var success = document.querySelector("[data-rsvp-success]");
        if (success) {
          form.style.display = "none";
          success.hidden = false;
          success.style.display = "block";
        } else if (btn) {
          btn.textContent = "You are in! ✨";
        }
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = originalText || "Count Me In"; }
        window.alert("Something went wrong saving your RSVP. Please try again or email zach@ohiopride.org directly.");
      });
    });
  }

  function init() {
    document.querySelectorAll("form[data-rsvp-form]").forEach(bind);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
