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
      responsibilities: [
        'Manage Director\'s calendar, inbox triage, and meeting prep',
        'Take minutes, track action items, and follow up across the board',
        'Build and maintain operating procedures for the PAC',
        'Coordinate cross-functional projects (events, launches, endorsements)',
        'Draft internal memos, briefing docs, and after-action reports'
      ],
      qualifications: [
        'Junior, senior, or graduate student with strong writing chops',
        'Highly organized; thrives on owning the details others miss',
        'Discreet with sensitive information',
        'Bonus: prior campaign, advocacy, or executive office experience'
      ]
    },
    {
      id: 'graphics_social_media',
      title: 'Graphics and Social Media',
      tagline: 'Build the look and voice of Ohio\'s LGBTQ+ political movement.',
      location: 'Remote (Ohio)',
      term: 'Summer / Fall 2026',
      hours: '8 to 12 hrs/week',
      reports: 'Director',
      responsibilities: [
        'Design social graphics, web assets, and event collateral on brand',
        'Run a content calendar across Instagram, TikTok, X, LinkedIn',
        'Produce reels, carousels, and quote cards from PAC news and bills',
        'Track engagement and report what is working',
        'Maintain the brand kit and template library'
      ],
      qualifications: [
        'Design portfolio (Figma, Canva, Adobe — any combo)',
        'Comfortable with copywriting in a confident, plainspoken voice',
        'Self-starter who can ship without a heavy approval cycle',
        'Bonus: short-form video editing, motion design, photography'
      ]
    },
    {
      id: 'volunteer_coordinator',
      title: 'Volunteer Coordinator',
      tagline: 'Recruit, deploy, and retain volunteers in all 88 counties.',
      location: 'Statewide (hybrid)',
      term: 'Summer / Fall 2026',
      hours: '10 to 15 hrs/week',
      reports: 'Director',
      responsibilities: [
        'Triage incoming volunteer signups and route to county captains',
        'Build phone-banking, canvassing, and tabling shifts in our tools',
        'Run weekly volunteer office hours and onboarding calls',
        'Maintain the volunteer roster, retention follow-ups, and thanks',
        'Help stand up county captains in priority districts'
      ],
      qualifications: [
        'Personable and persistent; comfortable cold-calling new volunteers',
        'Organized in a CRM or spreadsheet without supervision',
        'Bonus: prior campaign field, MOVE, NGP VAN, or organizing experience'
      ]
    },
    {
      id: 'legislative_director',
      title: 'Legislative Director',
      tagline: 'Own the scorecard. Track every LGBTQ+ bill in the Statehouse.',
      location: 'Columbus preferred (hybrid OK)',
      term: 'Summer / Fall 2026',
      hours: '12 to 15 hrs/week',
      reports: 'Director',
      responsibilities: [
        'Monitor LSC, OLRC, and committee dockets for relevant legislation',
        'Maintain the public legislative scorecard and bill tracker',
        'Draft 1-pagers, floor talking points, and bill summaries',
        'Build and maintain relationships with friendly Statehouse staff',
        'Brief the board on key votes and emerging threats'
      ],
      qualifications: [
        'Polisci, public policy, law, or related background',
        'Reads bills carefully and writes about them clearly',
        'Discreet, professional, and unflappable in committee rooms',
        'Bonus: Statehouse, lobbying, or legal-research experience'
      ]
    },
    {
      id: 'policy_aide',
      title: 'Policy Aide',
      tagline: 'Research, write, and turn policy into a campaign asset.',
      location: 'Cincinnati (in person)',
      term: 'Summer / Fall 2026',
      hours: '10 to 12 hrs/week',
      reports: 'Legislative Director',
      responsibilities: [
        'Research LGBTQ+ policy questions; produce sourced briefs',
        'Compare Ohio bills to model legislation in peer states',
        'Help maintain bill detail pages on ohiopride.org',
        'Support the Legislative Director with hearings and testimony prep',
        'Draft op-eds and letters to the editor with the comms team'
      ],
      qualifications: [
        'Strong research and writing; cites sources without being told',
        'Curious about Ohio politics; willing to read long PDFs',
        'Bonus: prior policy research, journalism, or debate experience'
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
            '<h4>What you would do</h4>',
            '<ul>', p.responsibilities.map(function (r) {
              return '<li>' + escapeHtml(r) + '</li>';
            }).join(''), '</ul>',
            '<h4>What we look for</h4>',
            '<ul>', p.qualifications.map(function (q) {
              return '<li>' + escapeHtml(q) + '</li>';
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
