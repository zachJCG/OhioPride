/* ==========================================================================
   newsletter-signup.js
   Powers the newsletter capture form on /signup. Validates client-side and
   POSTs to /.netlify/functions/newsletter-submit.

   If the visitor arrives from the homepage newsletter band, an ?email=...
   query param prefills the email field so they don't retype it.
   ========================================================================== */

(function () {
  'use strict';

  var SUBMIT_ENDPOINT = '/.netlify/functions/newsletter-submit';
  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  var form = document.getElementById('newsletter-form');
  if (!form) return;

  var submitBtn = document.getElementById('nl-submit');
  var emailInput = document.getElementById('nl-email');

  // Prefill email from ?email= when forwarded from the homepage band.
  try {
    var params = new URLSearchParams(window.location.search);
    var qpEmail = params.get('email');
    if (qpEmail && emailInput && !emailInput.value) {
      emailInput.value = qpEmail.trim();
    }
  } catch (e) { /* no-op */ }

  function showError(msg) {
    var box = document.getElementById('newsletter-error');
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function hideError() {
    var box = document.getElementById('newsletter-error');
    if (box) box.hidden = true;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError();

    var email = (emailInput.value || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }

    var payload = {
      website: (document.getElementById('nl-website') || {}).value || '',
      email: email,
      first_name: (form.first_name.value || '').trim() || null,
      last_name: (form.last_name.value || '').trim() || null,
      zip: (form.zip.value || '').trim() || null,
      referrer: document.referrer || null,
      source: 'signup_page'
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing you up...';

    fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().then(function (j) { return { status: r.status, body: j }; });
      })
      .then(function (res) {
        if (res.body && res.body.ok) {
          form.style.display = 'none';
          var conf = document.getElementById('signup-confirm');
          if (conf) {
            conf.hidden = false;
            conf.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Me Up';
        showError('Something went wrong. Please try again, or email zach@ohiopride.org.');
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Me Up';
        showError('Something went wrong. Please try again, or email zach@ohiopride.org.');
      });
  });
})();
