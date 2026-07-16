/* ==========================================================================
   pride-signup.js
   Powers /pride/signup: validates the form client-side and POSTs to
   /api/pride-volunteer-submit.

   Signup is region-based, not per-event. The /pride page shows the tour
   schedule for visibility; this form just captures who wants to help and
   where in Ohio they can show up.
   ========================================================================== */

(function () {
  'use strict';

  var SUBMIT_ENDPOINT = '/api/pride-volunteer-submit';

  var form = document.getElementById('pride-volunteer-form');
  if (!form) return;

  // ---- validation + submit gate ----
  var submitBtn = document.getElementById('pv-submit');
  function requiredOk() {
    var first = form.first_name.value.trim();
    var last = form.last_name.value.trim();
    var email = form.email.value.trim();
    var region = form.preferred_region.value;
    var consent = document.getElementById('pv-consent').checked;
    var emailOk = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
    return !!(first && last && emailOk && region && consent);
  }
  function refreshGate() {
    if (submitBtn) submitBtn.disabled = !requiredOk();
  }
  form.addEventListener('input', refreshGate);
  form.addEventListener('change', refreshGate);

  // Vehicle capacity reveal
  var hasVehicle = document.getElementById('pv-has-vehicle');
  var capWrap = document.getElementById('pv-capacity-wrap');
  if (hasVehicle && capWrap) {
    hasVehicle.addEventListener('change', function () {
      capWrap.hidden = !hasVehicle.checked;
    });
  }

  function showFormError(msg) {
    var box = document.getElementById('pride-form-error');
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function checkedValues(name) {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (el) { return el.value; });
  }

  function confetti() {
    if (window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#70D6EC', '#ffffff', '#1a3a52'];
    var layer = document.createElement('div');
    layer.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden;';
    for (var i = 0; i < 60; i++) {
      var p = document.createElement('span');
      p.style.cssText =
        'position:absolute;top:-10vh;width:8px;height:14px;border-radius:2px;' +
        'left:' + Math.random() * 100 + 'vw;' +
        'background:' + colors[i % 3] + ';' +
        'animation:prideConfetti ' + (2.4 + Math.random() * 1.6) +
        's linear ' + (Math.random() * 0.6) + 's forwards;';
      layer.appendChild(p);
    }
    var style = document.createElement('style');
    style.textContent =
      '@keyframes prideConfetti{to{transform:translateY(115vh) rotate(540deg);opacity:0;}}';
    document.head.appendChild(style);
    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 4500);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!requiredOk()) {
      showFormError('Please complete the required fields and check the consent box.');
      return;
    }
    var box = document.getElementById('pride-form-error');
    if (box) box.hidden = true;

    var capRaw = form.vehicle_capacity ? form.vehicle_capacity.value : '';
    var payload = {
      website: document.getElementById('pv-website').value,
      first_name: form.first_name.value.trim(),
      last_name: form.last_name.value.trim(),
      email: form.email.value.trim().toLowerCase(),
      phone: form.phone.value.trim() || null,
      city: form.city.value.trim() || null,
      zip: form.zip.value.trim() || null,
      preferred_region: form.preferred_region.value,
      events_interested: [],
      roles_interested: checkedValues('roles_interested'),
      can_travel: document.getElementById('pv-can-travel').checked,
      has_vehicle: document.getElementById('pv-has-vehicle').checked,
      vehicle_capacity: capRaw ? parseInt(capRaw, 10) : null,
      tshirt_size: form.tshirt_size.value || null,
      accessibility_needs: form.accessibility_needs.value.trim() || null,
      emergency_contact_name: form.emergency_contact_name.value.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.value.trim() || null,
      how_heard: form.how_heard.value.trim() || null,
      notes: form.notes.value.trim() || null,
      consent_communications: document.getElementById('pv-consent').checked
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
          var conf = document.getElementById('pride-confirm');
          if (conf) {
            conf.hidden = false;
            conf.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          confetti();
          return;
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Me Up';
        if (res.status === 409 || (res.body && res.body.error === 'already_signed_up')) {
          showFormError('It looks like this email is already signed up. ' +
            'We will be in touch soon.');
        } else {
          showFormError('Something went wrong. Please try again, or email ' +
            'zach@ohiopride.org.');
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Me Up';
        showFormError('Something went wrong. Please try again, or email ' +
          'zach@ohiopride.org.');
      });
  });

  refreshGate();
})();
