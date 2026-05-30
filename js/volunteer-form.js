/* ==========================================================================
   OHIO PRIDE — Volunteer / Intern Multi-Step Form
   ----------------------------------------------
   Drives the 5-step signup form on /volunteer.

   Two paths:
     - "volunteer"  -> POST /.netlify/functions/volunteer-submit { application_type: "volunteer", ... }
                      (writes to public.volunteers)
     - "internship" -> POST /.netlify/functions/volunteer-submit { application_type: "internship", ... }
                      (writes to public.intern_applications)

   Behaviour:
     - Per-step navigation with progress bar
     - Per-step validation
     - "Sign me up" / "Submit application" button is hidden until the
       progress bar reaches 100%
     - Replaces the form with a success state on success
     - Public API: window.VolunteerForm.setPath(path, prefill)
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
  var headingEl    = document.getElementById('vformHeading');
  var ledeEl       = document.getElementById('vformLede');
  var pathBtns     = document.querySelectorAll('.vform-path');
  var appTypeInput = document.getElementById('applicationType');

  if (!form) return;

  var state = {
    path: 'volunteer',  // 'volunteer' | 'internship'
    step: 1,
    submitting: false,
  };

  // --------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------
  function field(name) {
    var el = form.elements.namedItem(name);
    if (!el) return null;
    if (el instanceof RadioNodeList) return el;
    return el;
  }
  function val(name) {
    var el = field(name);
    if (!el) return '';
    if (el instanceof RadioNodeList) {
      // "value" of a RadioNodeList returns the checked radio value, or ''.
      return (el.value || '').trim();
    }
    if (el.type === 'checkbox') return el.checked;
    return (el.value || '').trim();
  }
  function getCheckedValues(name) {
    var inputs = form.querySelectorAll('[name="' + name + '"]:checked');
    var out = [];
    for (var i = 0; i < inputs.length; i++) {
      var v = inputs[i].value;
      if (v && v !== 'on') out.push(v);
    }
    return out;
  }
  function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }
  function isValidUrl(s) {
    if (!s) return true;
    try {
      var u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) { return false; }
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
  function showStep(n) {
    state.step = n;

    // For each step container, show only the one that matches the current
    // step AND either has no data-path or matches the current path.
    var allSteps = form.querySelectorAll('.vform-step');
    for (var i = 0; i < allSteps.length; i++) {
      var s        = allSteps[i];
      var sStep    = parseInt(s.dataset.step, 10);
      var sPath    = s.dataset.path;          // '' | 'volunteer' | 'internship'
      var matchStep = sStep === n;
      var matchPath = !sPath || sPath === state.path;
      s.hidden = !(matchStep && matchPath);
    }

    var pct = Math.round((n / TOTAL_STEPS) * 100);
    progressText.textContent = 'Step ' + n + ' of ' + TOTAL_STEPS;
    progressPct.textContent  = pct + '%';
    progressFill.style.width = pct + '%';

    // Hard rule: submit is ONLY visible on the absolute last step.
    // Belt-and-suspenders: toggle both the `hidden` attribute AND the
    // inline `display` style so no stale CSS can override [hidden].
    var atFinish = (n === TOTAL_STEPS);
    backBtn.hidden   = (n === 1);
    backBtn.style.display   = (n === 1)   ? 'none' : '';
    nextBtn.hidden   = atFinish;
    nextBtn.style.display   = atFinish    ? 'none' : '';
    submitBtn.hidden = !atFinish;
    submitBtn.style.display = atFinish    ? ''     : 'none';
    submitBtn.textContent = 'Submit';

    clearError();

    // Move focus to the visible step heading
    var heading = form.querySelector('.vform-step:not([hidden]) .vform-step-title');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      setTimeout(function () { try { heading.focus({ preventScroll: true }); } catch (e) {} }, 30);
    }

    var rect = form.getBoundingClientRect();
    if (rect.top < -20 || rect.top > window.innerHeight * 0.4) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // --------------------------------------------------------------------
  // Path switching (Volunteer <-> Intern)
  // --------------------------------------------------------------------
  function setPath(path, opts) {
    if (path !== 'volunteer' && path !== 'internship') return;
    state.path = path;
    appTypeInput.value = path;

    pathBtns.forEach(function (b) {
      var on = b.dataset.path === path;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (path === 'internship') {
      headingEl.textContent = 'Apply for an Ohio Pride internship';
      ledeEl.textContent = 'Five quick steps. Tell us who you are, where you live, the position, your background, and a short statement. Apps reviewed weekly.';
    } else {
      headingEl.textContent = 'Sign up to volunteer';
      ledeEl.textContent = 'Five quick steps. Tell us who you are, where you live, and how you want to help. We will follow up within a few days with a way to plug in.';
    }

    // Optional pre-fill (e.g. from an "Apply" CTA on a position card).
    if (opts && opts.position) {
      var sel = document.getElementById('internPosition');
      if (sel) sel.value = opts.position;
    }

    // Restart at step 1 so the user sees the right intro screens.
    showStep(1);
  }

  // --------------------------------------------------------------------
  // Per-step validation
  //   - Step 1 (both): name + email required
  //   - Step 2 (both): ZIP format check if present
  //   - Step 3 intern: position + term required
  //   - Step 5 intern: statement required, resume URL must look like a URL
  // --------------------------------------------------------------------
  function validateStep(n) {
    clearError();

    if (n === 1) {
      var fn = val('first_name'), ln = val('last_name'), em = val('email');
      if (!fn || !ln) {
        showError('We need your first and last name.');
        focusFirstEmpty(['first_name','last_name']);
        return false;
      }
      if (!em || !isValidEmail(em)) {
        showError('That email address looks off. Mind double-checking?');
        var e = field('email'); if (e) e.focus();
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

    if (n === 3 && state.path === 'internship') {
      if (!val('position')) {
        showError('Please pick the position you are applying for.');
        var p = field('position'); if (p) p.focus();
        return false;
      }
      if (!val('term')) {
        showError('Please pick which term you want.');
        return false;
      }
      var hrs = val('weekly_hours');
      if (hrs && (isNaN(+hrs) || +hrs < 1 || +hrs > 40)) {
        showError('Hours per week should be between 1 and 40.');
        return false;
      }
    }

    if (n === 5 && state.path === 'internship') {
      if (!val('statement_of_interest')) {
        showError('A brief statement of interest is required. Even a paragraph is fine.');
        var t = field('statement_of_interest'); if (t) t.focus();
        return false;
      }
      var resume = val('resume_url');
      if (resume && !isValidUrl(resume)) {
        showError('That resume link looks off. Use a full URL like https://drive.google.com/...');
        return false;
      }
      var portfolio = val('portfolio_url');
      if (portfolio && !isValidUrl(portfolio)) {
        showError('That portfolio link looks off. Use a full URL.');
        return false;
      }
    }

    return true;
  }
  function focusFirstEmpty(names) {
    for (var i = 0; i < names.length; i++) {
      var el = field(names[i]);
      if (el && !val(names[i])) { el.focus(); return; }
    }
  }

  // --------------------------------------------------------------------
  // Build payloads
  // --------------------------------------------------------------------
  function resolvePronouns() {
    var dropdown = val('pronouns');
    if (dropdown === 'other') return val('pronouns_other') || null;
    return dropdown || null;
  }
  function buildVolunteerPayload() {
    return {
      application_type: 'volunteer',
      website: val('website') || '',  // honeypot

      first_name: val('first_name'),
      last_name:  val('last_name'),
      email:      val('email').toLowerCase(),
      phone:      val('phone') || null,
      pronouns:   resolvePronouns(),

      city:   val('city')   || null,
      county: val('county') || null,
      zip:    val('zip')    || null,
      registered_voter: val('registered_voter') || null,

      interests:    getCheckedValues('interests'),
      skills:       getCheckedValues('skills'),
      availability: getCheckedValues('availability'),
      time_commitment: val('time_commitment') || null,
      tshirt_size:  val('tshirt_size') || null,

      prior_campaign_experience: !!val('prior_campaign_experience'),
      prior_campaign_notes:      val('prior_campaign_notes') || null,

      referral_source:    val('referral_source') || null,
      is_founding_member: !!val('is_founding_member'),
      additional_notes:   val('additional_notes') || null,

      email_optin: !!val('email_optin'),
      sms_optin:   !!val('sms_optin')
    };
  }
  function buildInternPayload() {
    return {
      application_type: 'internship',
      website: val('website') || '',  // honeypot

      first_name: val('first_name'),
      last_name:  val('last_name'),
      email:      val('email').toLowerCase(),
      phone:      val('phone') || null,
      pronouns:   resolvePronouns(),

      city:   val('city')   || null,
      county: val('county') || null,
      zip:    val('zip')    || null,

      position:        val('position'),
      term:            val('term'),
      start_date_pref: val('start_date_pref') || null,
      weekly_hours:    val('weekly_hours') ? parseInt(val('weekly_hours'), 10) : null,
      credit_hours:    val('credit_hours') ? parseFloat(val('credit_hours')) : null,

      institution:           val('institution') || null,
      program_major:         val('program_major') || null,
      class_year:            val('class_year') || null,
      faculty_sponsor_name:  val('faculty_sponsor_name') || null,
      faculty_sponsor_email: val('faculty_sponsor_email') || null,

      resume_url:           val('resume_url') || null,
      portfolio_url:        val('portfolio_url') || null,
      statement_of_interest: val('statement_of_interest'),
      prior_experience:     val('prior_experience') || null,
      why_ohio_pride:       val('why_ohio_pride') || null,
      referral_source:      val('referral_source_intern') || null,
      is_founding_member:   false,

      email_optin: !!val('intern_email_optin'),
      sms_optin:   false
    };
  }

  // --------------------------------------------------------------------
  // Submit
  // --------------------------------------------------------------------
  function submitForm() {
    if (state.submitting) return;
    if (!validateStep(state.step)) return;

    state.submitting = true;
    submitBtn.disabled = true;
    backBtn.disabled = true;
    var originalLabel = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';

    var payload = state.path === 'internship'
      ? buildInternPayload()
      : buildVolunteerPayload();

    fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, status: res.status, body: data };
        });
      })
      .then(function (r) {
        if (!r.ok || !r.body || r.body.ok !== true) {
          var msg = (r.body && r.body.error) || ('http_' + r.status);
          throw new Error(msg);
        }
        // SUCCESS — swap form for success state
        var pathBeforeReset = state.path;
        var pos = pathBeforeReset === 'internship' ? val('position') : '';
        renderSuccess(pathBeforeReset, pos);
      })
      .catch(function (err) {
        console.error('Volunteer/intern submit failed:', err);
        state.submitting = false;
        submitBtn.disabled = false;
        backBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        var msg = err && /name_required|valid_email_required|invalid_zip|position_required|term_required|statement_required|invalid_url/.test(err.message)
          ? prettyError(err.message)
          : 'Something went wrong on our end. Please try again, or email info@ohiopride.org.';
        showError(msg);
      });
  }

  function prettyError(code) {
    switch (code) {
      case 'name_required':         return 'We need your first and last name.';
      case 'valid_email_required':  return 'Please give us a valid email address.';
      case 'invalid_zip':           return 'ZIP should be 5 digits (e.g. 43215).';
      case 'position_required':     return 'Please pick a position.';
      case 'term_required':         return 'Please pick a term.';
      case 'statement_required':    return 'A brief statement of interest is required.';
      case 'invalid_url':           return 'One of your links looks off. Use a full URL.';
      default:                      return 'Please double-check the form and try again.';
    }
  }

  function renderSuccess(path, positionId) {
    form.hidden = true;
    progressEl.hidden = true;
    document.querySelector('.vform-paths').hidden = true;

    var heading = document.getElementById('vformSuccessHeading');
    var msg     = document.getElementById('vformSuccessMsg');

    if (path === 'internship') {
      var label = positionId;
      if (window.OhioPrideInternPositions) {
        var match = window.OhioPrideInternPositions.find(function (p) { return p.id === positionId; });
        if (match) label = match.title;
      }
      heading.textContent = 'Application received.';
      msg.textContent = 'Thanks for applying for the ' + (label || 'Ohio Pride internship') +
        '. We review applications weekly and will reach out if it looks like a fit. ' +
        'Look for a confirmation receipt in your inbox.';
    } else {
      heading.textContent = 'You are in.';
      msg.textContent = 'Thanks for signing up to volunteer with Ohio Pride. We will be in touch within a few days with concrete ways to plug in.';
    }

    successEl.hidden = false;
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      setTimeout(function () { try { heading.focus({ preventScroll: true }); } catch (e) {} }, 30);
    }
    successEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --------------------------------------------------------------------
  // Wire up listeners
  // --------------------------------------------------------------------
  nextBtn.addEventListener('click', function () {
    if (validateStep(state.step)) showStep(state.step + 1);
  });
  backBtn.addEventListener('click', function () {
    if (state.step > 1) showStep(state.step - 1);
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submitForm();
  });
  // Press Enter on Steps 1-4 -> Continue (not submit)
  form.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea') return;
    if (state.step < TOTAL_STEPS) {
      e.preventDefault();
      if (validateStep(state.step)) showStep(state.step + 1);
    }
  });

  // Path tabs
  pathBtns.forEach(function (btn) {
    btn.addEventListener('click', function () { setPath(btn.dataset.path); });
  });

  // Toggle "which campaign?" textarea (volunteer path)
  var priorToggle = document.getElementById('priorCampaign');
  var priorWrap   = document.getElementById('priorCampaignWrap');
  if (priorToggle && priorWrap) {
    priorToggle.addEventListener('change', function () {
      priorWrap.hidden = !priorToggle.checked;
    });
  }

  // Reveal the t-shirt size picker when someone opts in to march in a parade
  var walkParadeToggle = document.getElementById('interestWalkParade');
  var tshirtWrap       = document.getElementById('tshirtSizeWrap');
  if (walkParadeToggle && tshirtWrap) {
    walkParadeToggle.addEventListener('change', function () {
      tshirtWrap.hidden = !walkParadeToggle.checked;
      if (walkParadeToggle.checked) {
        var sel = document.getElementById('tshirtSize');
        if (sel) setTimeout(function () { sel.focus(); }, 30);
      }
    });
  }

  // Toggle "other pronouns" input
  var pronounsSelect    = document.getElementById('pronouns');
  var pronounsOtherWrap = document.getElementById('pronounsOtherWrap');
  if (pronounsSelect && pronounsOtherWrap) {
    pronounsSelect.addEventListener('change', function () {
      var isOther = pronounsSelect.value === 'other';
      pronounsOtherWrap.hidden = !isOther;
      if (isOther) {
        var input = document.getElementById('pronounsOther');
        if (input) setTimeout(function () { input.focus(); }, 30);
      }
    });
  }

  // Allow ?path=internship or ?position=<id> in the URL to deep-link
  // straight into intern mode (e.g. from social posts).
  try {
    var params = new URLSearchParams(window.location.search);
    var qPath = params.get('path');
    var qPosition = params.get('position');
    if (qPath === 'internship' || qPath === 'intern' || qPosition) {
      setPath('internship', { position: qPosition || '' });
    }
  } catch (e) {}

  // Public API for other modules
  window.VolunteerForm = {
    setPath: setPath,
    showStep: showStep
  };

  // Init
  showStep(1);
})();
