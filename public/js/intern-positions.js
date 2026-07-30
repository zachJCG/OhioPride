/* ==========================================================================
   OHIO PRIDE — Intern & Fellowship Positions
   ------------------------------------------
   Renders the position showcase grid on /volunteer and wires the "Apply"
   CTA to switch the form into intern mode and pre-select the position.
   ========================================================================== */

(function () {
  'use strict';

  // Single source of truth for position cards. Mirrors the
  // public.intern_applications.position CHECK constraint.
  var POSITIONS = [
    {
      id: 'chief_of_staff',
      title: 'Chief of Staff',
      tagline: 'Right hand to the Director. Operations and decision flow.',
      location: 'Cincinnati (hybrid)',
      term: 'Summer / Fall 2026',
      hours: '12 to 15 hrs/week',
      reports: 'Director',
      requirements: [
        'Junior, senior, or graduate student with strong writing chops',
        'Highly organized; thrives on owning the details others miss',
        'Discreet with sensitive information',
        'Comfortable managing the Director\'s calendar, inbox triage, and meeting prep',
        'Bonus: prior campaign, advocacy, or executive office experience'
      ]
    },
    {
      id: 'legislative_internship',
      title: 'Legislative Internship',
      tagline: 'Track every LGBTQ+ bill in the Statehouse. Power the scorecard.',
      location: 'Columbus preferred (hybrid OK)',
      term: 'Summer / Fall 2026',
      hours: '10 to 15 hrs/week',
      reports: 'Director',
      requirements: [
        'Polisci, public policy, law, or related background',
        'Reads bills carefully and writes about them clearly',
        'Comfortable monitoring LSC, OLRC, and committee dockets',
        'Discreet, professional, and unflappable in committee rooms',
        'Bonus: Statehouse, lobbying, or legal-research experience'
      ]
    },
    {
      id: 'volunteer_internship',
      title: 'Volunteer Internship',
      tagline: 'Recruit, deploy, and retain volunteers in all 88 counties.',
      location: 'Statewide (hybrid)',
      term: 'Summer / Fall 2026',
      hours: '8 to 15 hrs/week',
      reports: 'Director',
      requirements: [
        'Personable and persistent; comfortable cold-calling new volunteers',
        'Organized in a CRM or spreadsheet without supervision',
        'Willing to run field and canvassing shifts (door knocking, lit drops)',
        'Willing to run phone and text banking from scripts and lists',
        'Willing to staff Pride tabling and voter registration at June events',
        'Bonus: prior campaign field, MOVE, NGP VAN, or organizing experience'
      ]
    },
    {
      id: 'digital_internship',
      title: 'Digital Internship',
      tagline: 'Build the look and voice of Ohio\'s LGBTQ+ political movement.',
      location: 'Remote (Ohio)',
      term: 'Summer / Fall 2026',
      hours: '8 to 12 hrs/week',
      reports: 'Director',
      requirements: [
        'Design portfolio (Figma, Canva, Adobe — any combo)',
        'Comfortable with copywriting in a confident, plainspoken voice',
        'Self-starter who can ship without a heavy approval cycle',
        'Drives social amplification: share, repost, and help our content reach voters',
        'Bonus: short-form video editing, motion design, photography'
      ]
    }
  ];

  // ---------------------------------------------------------------
  // Render cards into #internGrid
  // ---------------------------------------------------------------
  function render() {
    var grid = document.getElementById('internGrid');
    if (!grid) return;

    grid.innerHTML = POSITIONS.map(function (p, i) {
      return [
        '<article class="intern-card" data-position="', escapeAttr(p.id), '">',
          '<div class="intern-card-num">Position ', String(i + 1).padStart(2, '0'), '</div>',
          '<h3>', escapeHtml(p.title), '</h3>',
          '<p class="intern-card-tag">', escapeHtml(p.tagline), '</p>',
          '<dl>',
            '<dt>Location</dt><dd>', escapeHtml(p.location), '</dd>',
            '<dt>Term</dt><dd>', escapeHtml(p.term), '</dd>',
            '<dt>Hours</dt><dd>', escapeHtml(p.hours), '</dd>',
            '<dt>Reports to</dt><dd>', escapeHtml(p.reports), '</dd>',
          '</dl>',
          '<div class="intern-card-more" hidden>',
            '<h4>Requirements</h4>',
            '<ul>', p.requirements.map(function (r) {
              return '<li>' + escapeHtml(r) + '</li>';
            }).join(''), '</ul>',
          '</div>',
          '<div class="intern-card-foot">',
            '<button type="button" class="intern-card-detail" data-action="toggle">Show details</button>',
            '<button type="button" class="btn btn-primary" data-action="apply" data-position="',
              escapeAttr(p.id), '">Apply</button>',
          '</div>',
        '</article>'
      ].join('');
    }).join('');

    grid.addEventListener('click', onClick);
  }

  // ---------------------------------------------------------------
  // Click handler — toggle details OR jump to form in intern mode
  // ---------------------------------------------------------------
  function onClick(ev) {
    var btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var card = btn.closest('.intern-card');
    if (!card) return;

    if (action === 'toggle') {
      var more = card.querySelector('.intern-card-more');
      var nowHidden = !more.hidden;
      more.hidden = nowHidden;
      card.classList.toggle('is-expanded', !nowHidden);
      btn.textContent = nowHidden ? 'Show details' : 'Hide details';
    } else if (action === 'apply') {
      var positionId = btn.dataset.position;
      // Switch the form into intern mode + preselect the position, then scroll.
      if (window.VolunteerForm && typeof window.VolunteerForm.setPath === 'function') {
        window.VolunteerForm.setPath('internship', { position: positionId });
      }
      var formEl = document.getElementById('volunteer-form-container');
      if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  // Expose the catalog for the form module (so the success message can
  // surface the position label without duplicating the list).
  window.OhioPrideInternPositions = POSITIONS;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
