/* ==========================================================================
   pride-signup.js
   Powers /pride/signup: builds the event checkbox grid from
   /.netlify/functions/pride-events (every public event grouped by month;
   attendance is not confirmed so the list is not gated by pac_attending),
   validates the form client-side, and POSTs to
   /.netlify/functions/pride-volunteer-submit.
   ========================================================================== */

(function () {
  'use strict';

  var EVENTS_ENDPOINT = '/.netlify/functions/pride-events';
  var SUBMIT_ENDPOINT = '/.netlify/functions/pride-volunteer-submit';

  var form = document.getElementById('pride-volunteer-form');
  if (!form) return;

  var MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var TYPE_LABEL = {
    parade: 'Parade', march: 'March', festival: 'Festival',
    parade_and_festival: 'Parade + Festival', rally: 'Rally', mixer: 'Mixer',
    kickoff: 'Kickoff', fundraiser: 'Fundraiser', '5k': '5K',
    interfaith: 'Interfaith', community: 'Community', other: 'Event'
  };

  var EVENTS = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function showCity(ev) {
    var name = (ev.name || '').toLowerCase();
    var city = (ev.city || '').toLowerCase();
    return city && name.indexOf(city) === -1;
  }
  function parseDate(iso) {
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function fmtDate(iso) {
    return parseDate(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  }

  // ---- build event checkbox grid ----
  function renderEvents() {
    var wrap = document.getElementById('pv-events');
    if (!wrap) return;
    if (!EVENTS.length) {
      wrap.innerHTML = '<p class="pride-count">Event list is loading. ' +
        'You can still finish the rest of the form.</p>';
      return;
    }
    var byMonth = {};
    EVENTS.forEach(function (ev) {
      var m = parseDate(ev.event_date).getMonth();
      (byMonth[m] = byMonth[m] || []).push(ev);
    });
    var html = [];
    Object.keys(byMonth).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (m) {
        html.push('<div class="pride-event-month-head">' + MONTH_LABELS[m] + '</div>');
        html.push('<div class="pride-check-grid">');
        byMonth[m].forEach(function (ev) {
          html.push(
            '<label class="pride-check pride-check--event" data-region="' +
              esc(ev.region) + '">' +
            '<input type="checkbox" name="events_interested" value="' +
              esc(ev.slug) + '" />' +
            '<span class="pride-check-body">' +
              '<span class="pride-check-date">' + esc(fmtDate(ev.event_date)) +
              '</span> ' +
              (showCity(ev) ? '<strong>' + esc(ev.city) + '</strong> ' : '') +
              esc(ev.name) +
              ' <span class="pride-type-label">' +
              esc(TYPE_LABEL[ev.event_type] || 'Event') + '</span>' +
            '</span>' +
            '</label>'
          );
        });
        html.push('</div>');
      });
    wrap.innerHTML = html.join('');
  }

  // "Select all in my region" helper
  function wireRegionSelect() {
    var btn = document.getElementById('pv-select-region');
    var regionSel = document.getElementById('pv-region');
    if (!btn || !regionSel) return;

    function refresh() {
      var r = regionSel.value;
      btn.hidden = !(r && r !== 'Anywhere');
    }
    regionSel.addEventListener('change', refresh);
    refresh();

    btn.addEventListener('click', function () {
      var r = regionSel.value;
      if (!r) return;
      document.querySelectorAll('#pv-events .pride-check').forEach(function (lab) {
        if (lab.getAttribute('data-region') === r) {
          var cb = lab.querySelector('input');
          if (cb) cb.checked = true;
        }
      });
    });
  }

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
    var colors = ['#73d7ee', '#ffffff', '#1a3a52'];
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
      events_interested: checkedValues('events_interested'),
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

  // ---- load events ----
  fetch(EVENTS_ENDPOINT, { headers: { accept: 'application/json' } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok) {
        EVENTS = data.events || [];
      }
      renderEvents();
      wireRegionSelect();
    })
    .catch(function () {
      renderEvents();
      wireRegionSelect();
    });

  refreshGate();
})();
