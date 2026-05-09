/* ==========================================================================
   OHIO PRIDE — Volunteer Multi-Step Form
   --------------------------------------
   Drives the 5-step volunteer signup form on /volunteer.
   - Per-step navigation with progress bar
   - Lightweight per-step validation (only Step 1 has hard requirements)
   - Single POST to /.netlify/functions/volunteer-submit on final submit
   - Replaces the form with a success state on success
   ========================================================================== */

(function () {
  'use strict';

  var TOTAL_STEPS = 5;
  var SUBMIT_ENDPOINT = '/.netlify/functions/volunteer-submit';

  var form         = document.getElementById('volunteerForm');
  var progressEl   = document.getElementById('vformProgress');
  var progressText = document.getElementById('vformProgressText');
  var progressPct  = document.getElementById('vformProgressPercent');
  var progressFill = document.getElementById('vformProgressFill');
  var errorEl      = document.getElementById('vformError');
  var backBtn      = document.getElementById('vformBack');
  var nextBtn      = document.getElementById('vformNext');
  var submitBtn    = document.getElementById('vformSubmit');
  var successEl    = document.getElementById('vformSuccess');

  if (!form) return;

  var currentStep = 1;

  // --------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------
  function field(name) {
    return form.elements.namedItem(name);
  }

  function val(name) {
    var el = field(name);
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked;
    return (el.value || '').trim();
  }

  function getRadioValue(name) {
    var checked = form.querySelector('[name="' + name + '"]:checked');
    return checked ? checked.value : null;
  }

  function getCheckedValues(name) {
    var inputs = form.querySelectorAll('[name="' + name + '"]:checked');
    var out = [];
    for (var i = 0; i < inputs.length; i++) {
      // Skip non-array checkboxes (consent toggles, prior_campaign_experience)
      if (inputs[i].type === 'checkbox' && inputs[i].value && inputs[i].value !== 'on') {
        out.push(inputs[i].value);
      }
    }
    return out;
  }

  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  // --------------------------------------------------------------------
  // Step rendering
  // --------------------------------------------------------------------
  function showStep(n, opts) {
    var isInitial = opts && opts.initial;

    for (var i = 1; i <= TOTAL_STEPS; i++) {
      var stepEl = form.querySelector('[data-step="' + i + '"]');
      if (stepEl) stepEl.hidden = (i !== n);
    }

    var pct = Math.round((n / TOTAL_STEPS) * 100);
    progressText.textContent = 'Step ' + n + ' of ' + TOTAL_STEPS;
    progressPct.textContent = pct + '%';
    progressFill.style.width = pct + '%';

    backBtn.hidden   = (n === 1);
    nextBtn.hidden   = (n === TOTAL_STEPS);
    submitBtn.hidden = (n !== TOTAL_STEPS) || !isFormComplete();

    clearError();

    if (!isInitial) {
      var heading = form.querySelector('[data-step="' + n + '"] .vform-step-title');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        setTimeout(function () { heading.focus({ preventScroll: true }); }, 30);
      }

      var rect = form.getBoundingClientRect();
      if (rect.top < -20 || rect.top > window.innerHeight * 0.4) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    currentStep = n;
  }

  // --------------------------------------------------------------------
  // Per-step validation
  //   - Step 1: name + email required, email format checked
  //   - Step 2: ZIP format check if present (else free pass)
  //   - Steps 3-5: no hard requirements
  // --------------------------------------------------------------------
  function validateStep(n) {
    clearError();

    if (n === 1) {
      var fn = val('first_name');
      var ln = val('last_name');
      var em = val('email');

      if (!fn || !ln) {
        showError('We need your first and last name.');
        focusFirstEmpty(['first_name', 'last_name']);
        return false;
      }
      if (!em) {
        showError('We need an email so we can follow up.');
        var e1 = field('email'); if (e1) e1.focus();
        return false;
      }
      if (!isValidEmail(em)) {
        showError('That email address looks off. Mind double-checking?');
        var e2 = field('email'); if (e2) e2.focus();
        return false;
      }
    }

    if (n === 2) {
      var zip = val('zip');
      if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
        showError('ZIP should be 5 digits (e.g. 43215).');
        var z = field('zip'); if (z) z.focus();
        return false;
      }
    }

    return true;
  }

  function isFormComplete() {
    var fn = val('first_name');
    var ln = val('last_name');
    var em = val('email');
    if (!fn || !ln || !em || !isValidEmail(em)) return false;

    var zip = val('zip');
    if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return false;

    return true;
  }

  function refreshSubmitVisibility() {
    submitBtn.hidden = (currentStep !== TOTAL_STEPS) || !isFormComplete();
  }

  function focusFirstEmpty(names) {
    for (var i = 0; i < names.length; i++) {
      var el = field(names[i]);
      if (el && !val(names[i])) { el.focus(); return; }
    }
  }

  // --------------------------------------------------------------------
  // Build the JSON payload the function expects
  // --------------------------------------------------------------------
  function buildPayload() {
    return {
      website: val('website') || '',  // honeypot — backend silently drops if filled

      first_name: val('first_name'),
      last_name:  val('last_name'),
      email:      val('email').toLowerCase(),
      phone:      val('phone')    || null,
      pronouns:   val('pronouns') || null,

      city:   val('city')   || null,
      county: val('county') || null,
      zip:    val('zip')    || null,
      registered_voter: getRadioValue('registered_voter'),

      interests:    getCheckedValues('interests'),
      skills:       getCheckedValues('skills'),
      availability: getCheckedValues('availability'),
      time_commitment: getRadioValue('time_commitment'),

      prior_campaign_experience: !!val('prior_campaign_experience'),
      prior_campaign_notes:      val('prior_campaign_notes') || null,

      referral_source:    val('referral_source') || null,
      is_founding_member: !!val('is_founding_member'),
      additional_notes:   val('additional_notes') || null,

      email_optin: !!val('email_optin'),
      sms_optin:   !!val('sms_optin')
    };
  }

  // --------------------------------------------------------------------
  // Submit
  // --------------------------------------------------------------------
  async function submitForm() {
    if (!validateStep(currentStep)) return;

    submitBtn.disabled = true;
    backBtn.disabled = true;
    var originalLabel = submitBtn.textContent;
    submitBtn.textContent = 'Signing you up...';

    var payload = buildPayload();

    try {
      var res = await fetch(SUBMIT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      var data = {};
      try { data = await res.json(); } catch (e) { /* non-fatal */ }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || ('http_' + res.status));
      }

      // SUCCESS — swap form for success state
      form.hidden = true;
      progressEl.hidden = true;
      successEl.hidden = false;

      var heading = document.getElementById('vformSuccessHeading');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        setTimeout(function () { heading.focus({ preventScroll: true }); }, 30);
      }
      successEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      console.error('Volunteer submit failed:', err);
      submitBtn.disabled = false;
      backBtn.disabled = false;
      submitBtn.textContent = originalLabel;
      showError('Something went wrong on our end. Please try again, or email info@ohiopride.org.');
    }
  }

  // --------------------------------------------------------------------
  // Wire up listeners
  // --------------------------------------------------------------------
  nextBtn.addEventListener('click', function () {
    if (validateStep(currentStep)) {
      showStep(currentStep + 1);
    }
  });

  backBtn.addEventListener('click', function () {
    if (currentStep > 1) showStep(currentStep - 1);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitForm();
  });

  // Press Enter inside an input on Steps 1-4 -> Continue (instead of submitting)
  form.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea') return;          // allow newlines in textareas
    if (currentStep < TOTAL_STEPS) {
      e.preventDefault();
      if (validateStep(currentStep)) showStep(currentStep + 1);
    }
  });

  // Show "which campaign?" textarea when prior_campaign_experience toggles on
  var priorToggle = document.getElementById('priorCampaign');
  var priorWrap   = document.getElementById('priorCampaignWrap');
  if (priorToggle && priorWrap) {
    priorToggle.addEventListener('change', function () {
      priorWrap.hidden = !priorToggle.checked;
    });
  }

  form.addEventListener('input', refreshSubmitVisibility);
  form.addEventListener('change', refreshSubmitVisibility);

  // Init
  showStep(1, { initial: true });
})();
