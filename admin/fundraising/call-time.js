/* =========================================================================
   Ohio Pride :: Call Time engine (mobile-first donor call module)
   -------------------------------------------------------------------------
   ONE person rips through a prioritized donor list: tap to call/text, tap to
   log the outcome, the backend auto-schedules the follow-up. Optimized for
   the fewest possible taps on a phone.

   Backend is ALREADY built + verified (Supabase project dkdxefzhttkmjhdbkvqn).
   This file only WIRES to it — it never recomputes follow-up dates, stages,
   or committed totals. The DB does all side effects via log_call_activity().

   Reads (RLS-safe security_invoker views):
     call_time_queue              — prioritized list (follow-ups due first)
     call_time_followups_due      — overdue callbacks (+ days_overdue)
     call_time_today_stats        — today's tallies for the current user
     call_time_prospect_timeline  — recent activity per prospect
     call_dispositions            — drives the one-tap outcome buttons
   Writes (RPC):
     log_call_activity(...)       — logs + does every side effect
     snooze_prospect(id, days)    — pushes next_action/snooze_until out

   Gated on the pac_prospects module (PAC side of the legal wall). It never
   touches c4 tables.
   Frontend only — schema, RLS, RPCs, and views are already wired + verified.
   ========================================================================= */
(function () {
  'use strict';

  // ---- localStorage keys (resume-where-I-left-off + prefs) ----
  var LS = {
    filters:   'ct.filters.v1',
    sms:       'ct.sms.v1',
    goal:      'ct.goal.v1',
    lastId:    'ct.lastProspect.v1'
  };

  var DEFAULT_SMS =
    "Hi {first_name}, it's Zach with Ohio Pride PAC — do you have 2 min this week?";

  var DISP_COLORVAR = {
    win: 'var(--ct-win)', progress: 'var(--ct-progress)', attempt: 'var(--ct-attempt)',
    touch: 'var(--ct-touch)', closed: 'var(--ct-closed)', remove: 'var(--ct-remove)'
  };
  var CAT_LABEL = {
    win: 'Win', progress: 'Progress', attempt: 'Attempt',
    touch: 'Touch', closed: 'Closed', remove: 'Remove'
  };
  var CAT_ORDER = ['win', 'progress', 'attempt', 'touch', 'closed', 'remove'];

  var ICON = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7A2 2 0 0 1 22 16.9z"/></svg>',
    text:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg>',
    mail:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    play:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
  };

  // ---- tiny utils ----
  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  function money(cents) {
    if (cents == null || cents === '') return '$0';
    var n = Number(cents);
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: n % 100 ? 2 : 0
    }).format(n / 100);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function relTime(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d.getTime())) return '';
    var days = Math.round((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return days + 'd ago';
    return fmtDate(iso);
  }
  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  // =======================================================================
  // State
  // =======================================================================
  var state = {
    client: null,
    email: '',
    canWrite: false,
    mode: 'queue',                 // 'queue' | 'followups'
    dispositions: [],
    queue: [],                     // working list (filtered view source)
    stats: null,
    filters: { priority: '', bucket: '', region: '', tags: [] },
    goal: 25,
    sms: DEFAULT_SMS,
    // active call card
    card: null,                    // current prospect row
    cardIndex: -1,                 // index within filtered list
    presel: null,                  // disposition code pre-selected by tapping Call
    selDisp: null,                 // chosen disposition object awaiting confirm (amount)
    selAmount: null,               // cents
    // undo
    undoTimer: null,
    pending: 0
  };

  // =======================================================================
  // Init / boot
  // =======================================================================
  function init(cfg) {
    state.mode = (cfg && cfg.mode) === 'followups' ? 'followups' : 'queue';
    state.filters = lsGet(LS.filters, state.filters) || state.filters;
    state.goal = lsGet(LS.goal, 25) || 25;
    state.sms = lsGet(LS.sms, DEFAULT_SMS) || DEFAULT_SMS;

    document.addEventListener('admin-shell-ready', function (ev) {
      var d = ev.detail || {};
      state.client = d.client;
      state.email = (d.session && d.session.user && d.session.user.email) || '';
      if (!state.client) return;

      state.client.rpc('has_permission', { p_module: 'pac_prospects', p_action: 'read' })
        .then(function (r) {
          if (!(r && r.data === true)) { renderDenied(); return; }
          return state.client.rpc('has_permission', { p_module: 'pac_prospects', p_action: 'write' });
        })
        .then(function (r) {
          if (r === undefined) return;          // denied path already handled
          state.canWrite = !!(r && r.data === true);
          scaffold();
          boot();
        })
        .catch(function (e) { console.error('call-time gate failed', e); renderDenied(); });
    });
  }

  function renderDenied() {
    $('shellBody').innerHTML =
      '<div class="admin-panel"><div class="admin-panel-empty">' +
        '<div class="admin-panel-empty-eyebrow">Restricted</div>' +
        '<h2>You don’t have access to PAC call time</h2>' +
        '<p>The <code>pac_prospects</code> module is limited by role. Ask the Director if you need it.</p>' +
      '</div></div>';
  }

  // Static DOM scaffold (filled by render*). Keeps layout stable = no shift.
  function scaffold() {
    var settingsBtn =
      '<button type="button" class="ct-chip" id="ctSettingsBtn" aria-label="Call time settings">⚙️ Settings</button>';
    $('shellBody').innerHTML =
      '<div class="ct-root" id="ctRoot">' +
        '<div id="ctStatbar"></div>' +
        (state.mode === 'queue' ? '<div class="ct-filters" id="ctFilters"></div>' : '') +
        (state.mode === 'queue'
          ? '<button type="button" class="ct-start" id="ctStart">' + ICON.play + ' Start calling</button>'
          : '') +
        '<div class="ct-queue" id="ctQueue">' +
          '<div class="ct-skel"></div><div class="ct-skel"></div><div class="ct-skel"></div>' +
        '</div>' +
      '</div>' +
      // Call card overlay
      '<div class="ct-card-scrim" id="ctCardScrim" role="dialog" aria-modal="true" aria-label="Call card">' +
        '<div class="ct-card" id="ctCard"></div>' +
      '</div>' +
      // sticky confirm bar
      '<div class="ct-actionbar" id="ctActionbar"></div>' +
      // undo toast
      '<div class="ct-undo" id="ctUndo">' +
        '<span class="ct-undo-msg" id="ctUndoMsg"></span>' +
        '<button type="button" class="ct-undo-btn" id="ctUndoBtn">Undo</button>' +
      '</div>';

    // settings entry lives in the page-actions slot when on queue home
    var actions = $('shellPageActions');
    if (actions) actions.innerHTML = settingsBtn;

    bindStaticEvents();
  }

  function bindStaticEvents() {
    var start = $('ctStart');
    if (start) start.addEventListener('click', startCalling);
    var sb = $('ctSettingsBtn');
    if (sb) sb.addEventListener('click', openSettings);
    $('ctUndoBtn').addEventListener('click', doUndo);
    // close card on scrim background tap only via explicit close button (avoid mis-taps)
  }

  function boot() {
    refreshAll().then(function () {
      // resume where I left off
      var lastId = lsGet(LS.lastId, null);
      if (lastId) {
        var list = filteredList();
        var idx = list.findIndex(function (p) { return p.id === lastId; });
        if (idx >= 0) { /* don't auto-open; just leave it scrolled */ }
      }
    });
  }

  // =======================================================================
  // Data loading
  // =======================================================================
  function refreshAll() {
    return Promise.all([loadDispositions(), loadQueue(), loadStats()])
      .then(function () { renderStatbar(); renderFilters(); renderQueue(); })
      .catch(function (e) {
        console.error('call-time load failed', e);
        $('ctQueue').innerHTML = '<div class="admin-panel admin-error">Could not load the call queue. Check your connection.</div>';
      });
  }

  function loadDispositions() {
    if (state.dispositions.length) return Promise.resolve();
    return state.client.from('call_dispositions').select('*').order('sort_order', { ascending: true })
      .then(function (r) { if (r.error) throw r.error; state.dispositions = r.data || []; });
  }

  function loadQueue() {
    if (state.mode === 'followups') {
      // followups list has days_overdue; the call card hydrates full fields from the queue view by id
      return state.client.from('call_time_followups_due').select('*').order('days_overdue', { ascending: false })
        .then(function (r) { if (r.error) throw r.error; state.queue = r.data || []; });
    }
    return state.client.from('call_time_queue').select('*')
      .then(function (r) { if (r.error) throw r.error; state.queue = r.data || []; });
  }

  function loadStats() {
    return state.client.from('call_time_today_stats').select('*').eq('actor_email', state.email).maybeSingle()
      .then(function (r) {
        // no row yet today = all zeros
        state.stats = (r && r.data) || {
          actor_email: state.email, touches: 0, calls: 0, conversations: 0,
          wins: 0, pledged_cents_today: 0, followups_scheduled: 0
        };
      });
  }

  // Hydrate a full call-card row (followups view is sparse) from call_time_queue by id.
  function hydrate(prospect) {
    if (prospect && prospect.tel_href !== undefined) return Promise.resolve(prospect); // already full
    return state.client.from('call_time_queue').select('*').eq('id', prospect.id).maybeSingle()
      .then(function (r) {
        if (r.data) return r.data;
        // prospect may not currently be in the prioritized queue (e.g. snoozed-then-due edge) —
        // fall back to a direct read of the base table for the contact hrefs.
        return state.client.from('pac_prospects')
          .select('id,full_name,first_name,last_name,city,county,employer,occupation,priority,capacity_estimate_cents,ask_target_cents,committed_amount_cents,tags,evidence,phone,phone_mobile,email,last_outcome,attempts_count,next_action_date,best_time_to_call')
          .eq('id', prospect.id).maybeSingle()
          .then(function (b) {
            var p = b.data || prospect;
            var tel = p.phone_mobile || p.phone;
            p.has_phone = !!tel;
            p.tel_href = tel ? 'tel:+1' + String(tel).replace(/\D/g, '').replace(/^1/, '') : '';
            p.sms_href = tel ? 'sms:' + String(tel).replace(/\D/g, '') : '';
            p.mailto_href = p.email ? 'mailto:' + p.email : '';
            return p;
          });
      });
  }

  // =======================================================================
  // Filtering (client-side over the pre-ordered queue)
  // =======================================================================
  function filteredList() {
    if (state.mode === 'followups') return state.queue; // already the right set, server-ordered
    var f = state.filters;
    return state.queue.filter(function (p) {
      if (f.priority && p.priority !== f.priority) return false;
      if (f.bucket && p.queue_bucket !== f.bucket) return false;
      if (f.region) {
        var hay = ((p.county || '') + ' ' + (p.city || '')).toLowerCase();
        if (hay.indexOf(f.region.toLowerCase()) === -1) return false;
      }
      if (f.tags && f.tags.length) {
        var tags = p.tags || [];
        for (var i = 0; i < f.tags.length; i++) { if (tags.indexOf(f.tags[i]) === -1) return false; }
      }
      return true;
    });
  }

  function allTags() {
    var set = {};
    state.queue.forEach(function (p) { (p.tags || []).forEach(function (t) { set[t] = (set[t] || 0) + 1; }); });
    return Object.keys(set).sort(function (a, b) { return set[b] - set[a]; });
  }

  // =======================================================================
  // Render: today stat bar (+ session goal ring)
  // =======================================================================
  function renderStatbar() {
    var s = state.stats || {};
    var bar = $('ctStatbar');
    var dueActive = state.filters.bucket === 'follow_up_due';
    function stat(num, label, cls, active, key) {
      return '<button type="button" class="ct-stat' + (active ? ' is-active' : '') + '" data-statkey="' + key + '">' +
        '<span class="ct-stat-num ' + (cls || '') + '">' + num + '</span>' +
        '<span class="ct-stat-label">' + label + '</span>' +
      '</button>';
    }
    var pct = state.goal > 0 ? Math.min(1, (s.touches || 0) / state.goal) : 0;
    var R = 18, C = 2 * Math.PI * R;
    var ring =
      '<button type="button" class="ct-ring" id="ctRing" aria-label="Session goal" title="Tap to set a session goal">' +
        '<svg width="46" height="46" viewBox="0 0 46 46">' +
          '<circle class="ct-ring-track" cx="23" cy="23" r="' + R + '" fill="none" stroke-width="5"/>' +
          '<circle class="ct-ring-fill" cx="23" cy="23" r="' + R + '" fill="none" stroke-width="5" stroke-linecap="round" ' +
            'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '"/>' +
          '<text class="ct-ring-text" x="23" y="23">' + (s.touches || 0) + '/' + state.goal + '</text>' +
        '</svg>' +
      '</button>';

    bar.className = 'ct-statbar';
    bar.innerHTML =
      stat(s.calls || 0, 'Dials', '', false, 'calls') +
      stat(s.conversations || 0, 'Convos', '', false, 'conversations') +
      stat(money(s.pledged_cents_today || 0), 'Pledged', 'is-money', false, 'pledged') +
      stat(s.followups_scheduled || 0, 'Follow-ups', '', dueActive, 'followups') +
      ring;

    bar.querySelectorAll('.ct-stat').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.statkey === 'followups') toggleDueFilter();
      });
    });
    $('ctRing').addEventListener('click', setGoalPrompt);
  }

  function toggleDueFilter() {
    if (state.mode !== 'queue') return;
    state.filters.bucket = state.filters.bucket === 'follow_up_due' ? '' : 'follow_up_due';
    persistFilters();
    renderStatbar(); renderFilters(); renderQueue();
  }

  function setGoalPrompt() {
    var v = window.prompt('Session dial goal for today:', String(state.goal));
    if (v == null) return;
    var n = parseInt(v, 10);
    if (!isNaN(n) && n > 0) { state.goal = n; lsSet(LS.goal, n); renderStatbar(); }
  }

  // =======================================================================
  // Render: filter chips
  // =======================================================================
  function renderFilters() {
    var box = $('ctFilters');
    if (!box) return;
    var f = state.filters;
    var html = '';
    function chip(label, on, attrs) { return '<button type="button" class="ct-chip' + (on ? ' is-on' : '') + '" ' + attrs + '>' + escapeHtml(label) + '</button>'; }

    ['high','medium','low'].forEach(function (p) {
      html += chip(p === 'high' ? 'High' : p === 'medium' ? 'Med' : 'Low', f.priority === p, 'data-fk="priority" data-fv="' + p + '"');
    });
    [['follow_up_due','Due'],['new','New'],['in_progress','In-progress']].forEach(function (b) {
      html += chip(b[1], f.bucket === b[0], 'data-fk="bucket" data-fv="' + b[0] + '"');
    });
    allTags().slice(0, 12).forEach(function (t) {
      html += chip('#' + t, f.tags.indexOf(t) !== -1, 'data-fk="tag" data-fv="' + escapeAttr(t) + '"');
    });
    html += '<button type="button" class="ct-chip" id="ctRegionChip" data-fk="region">' +
      (f.region ? '📍 ' + escapeHtml(f.region) : '📍 Region') + '</button>';
    if (f.priority || f.bucket || f.region || f.tags.length) {
      html += '<button type="button" class="ct-chip ct-chip-clear" id="ctClear">Clear</button>';
    }
    box.innerHTML = html;

    box.querySelectorAll('.ct-chip[data-fk]').forEach(function (c) {
      c.addEventListener('click', function () { onFilterChip(c.dataset.fk, c.dataset.fv); });
    });
    var clr = $('ctClear');
    if (clr) clr.addEventListener('click', clearFilters);
  }

  function onFilterChip(kind, val) {
    var f = state.filters;
    if (kind === 'priority') f.priority = f.priority === val ? '' : val;
    else if (kind === 'bucket') f.bucket = f.bucket === val ? '' : val;
    else if (kind === 'tag') {
      var i = f.tags.indexOf(val);
      if (i === -1) f.tags.push(val); else f.tags.splice(i, 1);
    } else if (kind === 'region') {
      var v = window.prompt('Filter by county or city (blank to clear):', f.region || '');
      if (v == null) return;
      f.region = v.trim();
    }
    persistFilters();
    renderStatbar(); renderFilters(); renderQueue();
  }

  function clearFilters() {
    state.filters = { priority: '', bucket: '', region: '', tags: [] };
    persistFilters();
    renderStatbar(); renderFilters(); renderQueue();
  }
  function persistFilters() { lsSet(LS.filters, state.filters); }

  // =======================================================================
  // Render: queue list
  // =======================================================================
  function renderQueue() {
    var box = $('ctQueue');
    var list = filteredList();
    var start = $('ctStart');
    if (start) start.disabled = list.length === 0;

    if (!list.length) {
      box.innerHTML =
        '<div class="ct-empty"><div class="ct-empty-emoji">✅</div>' +
        '<p>' + (state.mode === 'followups'
          ? 'No callbacks due. Nicely done.'
          : 'Queue is clear for these filters.') + '</p></div>';
      return;
    }

    box.innerHTML = list.map(function (p, i) { return rowHtml(p, i); }).join('');
    box.querySelectorAll('.ct-row').forEach(function (row) {
      var idx = parseInt(row.dataset.idx, 10);
      row.addEventListener('click', function () { openCard(idx); });
      attachSwipe(row, list[idx]);
    });
  }

  function rowHtml(p, i) {
    var sub = [p.occupation, p.employer].filter(Boolean).join(' @ ');
    var loc = [p.city, p.county].filter(Boolean)[0] || '';
    var bucketLabel = { follow_up_due: 'Due', new: 'New', in_progress: 'In progress' }[p.queue_bucket] || '';
    var meta = '';
    if (p.queue_bucket) meta += '<span class="ct-bucket ct-bucket-' + p.queue_bucket + '">' + bucketLabel +
      (state.mode === 'followups' && p.days_overdue > 0 ? ' · ' + p.days_overdue + 'd' : '') + '</span>';
    if (p.last_outcome) meta += '<span class="ct-tinytag">' + escapeHtml(dispLabel(p.last_outcome)) + (p.attempts_count ? ' · ' + p.attempts_count + ' tries' : '') + '</span>';
    if (loc) meta += '<span class="ct-tinytag">' + escapeHtml(loc) + '</span>';
    if (p.has_phone === false) meta += '<span class="ct-nophone">📵 no phone</span>';

    return '<div class="ct-row-wrap">' +
      '<div class="ct-row-actionhint"><span class="snooze">⏰ Snooze</span><span class="skip">Skip →</span></div>' +
      '<div class="ct-row" data-idx="' + i + '" role="button" tabindex="0">' +
        '<span class="ct-dot ' + escapeAttr(p.priority || 'low') + '" aria-hidden="true"></span>' +
        '<div class="ct-row-main">' +
          '<div class="ct-row-name"><span>' + escapeHtml(p.full_name || 'Unknown') + '</span>' +
            (p.capacity_estimate_cents ? '<span class="ct-row-cap">' + money(p.capacity_estimate_cents) + '</span>' : '') +
          '</div>' +
          (sub ? '<div class="ct-row-sub">' + escapeHtml(sub) + '</div>' : '') +
          (meta ? '<div class="ct-row-meta">' + meta + '</div>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function dispLabel(code) {
    var d = state.dispositions.find(function (x) { return x.code === code; });
    return d ? d.label : code;
  }

  // ---- swipe: left = snooze 1 week, right = skip ----
  function attachSwipe(row, prospect) {
    var x0 = null, y0 = null, dx = 0, locked = false;
    row.addEventListener('touchstart', function (e) {
      var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; dx = 0; locked = false;
    }, { passive: true });
    row.addEventListener('touchmove', function (e) {
      if (x0 == null) return;
      var t = e.touches[0]; dx = t.clientX - x0;
      var dy = t.clientY - y0;
      if (!locked && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) locked = true;
      if (locked) { row.style.transform = 'translateX(' + dx + 'px)'; }
    }, { passive: true });
    row.addEventListener('touchend', function () {
      row.style.transform = '';
      if (locked && dx < -70) snoozeProspect(prospect, 7);
      else if (locked && dx > 70) skipProspect(prospect);
      x0 = null;
    }, { passive: true });
  }

  function skipProspect(prospect) {
    // visually drop from this session's list without touching the DB
    state.queue = state.queue.filter(function (p) { return p.id !== prospect.id; });
    renderQueue();
    shellToast('Skipped for now');
  }

  function snoozeProspect(prospect, days) {
    state.queue = state.queue.filter(function (p) { return p.id !== prospect.id; });
    renderQueue();
    state.client.rpc('snooze_prospect', { p_prospect_id: prospect.id, p_days: days })
      .then(function (r) {
        if (r.error) throw r.error;
        shellToast('Snoozed ' + days + ' day' + (days === 1 ? '' : 's'));
      })
      .catch(function (e) { console.error('snooze failed', e); shellToast('Snooze failed — restoring', 'error'); refreshAll(); });
  }

  // =======================================================================
  // Start calling (focus mode)
  // =======================================================================
  function startCalling() {
    var list = filteredList();
    if (!list.length) return;
    openCard(0, true);
  }

  // =======================================================================
  // Call Card
  // =======================================================================
  function openCard(idx, focus) {
    var list = filteredList();
    if (idx < 0 || idx >= list.length) { closeCard(); return; }
    state.cardIndex = idx;
    state.presel = null; state.selDisp = null; state.selAmount = null;
    hideActionbar();
    var base = list[idx];
    lsSet(LS.lastId, base.id);

    var scrim = $('ctCardScrim');
    scrim.classList.add('is-open');
    $('ctCard').innerHTML = '<div class="ct-skel" style="height:200px"></div>';

    hydrate(base).then(function (p) {
      state.card = p;
      renderCard(p, idx, list.length, focus);
      prefetchNext(idx);
    });
  }

  function prefetchNext(idx) {
    var list = filteredList();
    [idx + 1, idx + 2].forEach(function (n) {
      if (n < list.length) hydrate(list[n]).then(function (full) {
        // write hydrated fields back so the next openCard is instant
        var t = list[n];
        if (full && full !== t) { Object.assign(t, full); }
      });
    });
  }

  function renderCard(p, idx, total, focus) {
    var loc = [p.city, p.county].filter(Boolean).join(', ');
    var sub = [p.occupation, p.employer].filter(Boolean).join(' @ ');
    var smsBody = encodeURIComponent(fillTemplate(state.sms, p));
    var smsHref = p.sms_href ? (p.sms_href + (p.sms_href.indexOf('?') === -1 ? '?' : '&') + 'body=' + smsBody) : '';

    var contact = p.has_phone
      ? '<a class="call" href="' + escapeAttr(p.tel_href) + '" id="ctCall" aria-label="Call ' + escapeAttr(p.full_name) + '">' + ICON.phone + 'Call</a>' +
        '<a class="text" href="' + escapeAttr(smsHref) + '" id="ctText" aria-label="Text ' + escapeAttr(p.full_name) + '">' + ICON.text + 'Text</a>'
      : '<span class="ct-contact-dead" aria-disabled="true">' + ICON.phone + 'No phone</span>' +
        '<span class="ct-contact-dead" aria-disabled="true">' + ICON.text + 'No phone</span>';
    var emailBtn = p.mailto_href
      ? '<a class="email" href="' + escapeAttr(p.mailto_href) + '" aria-label="Email">' + ICON.mail + 'Email</a>'
      : '<span class="ct-contact-dead" aria-disabled="true">' + ICON.mail + 'No email</span>';

    $('ctCard').innerHTML =
      '<div class="ct-card-top">' +
        '<button type="button" class="ct-card-close" id="ctClose" aria-label="Close call card">✕</button>' +
        '<span class="ct-card-progress">' + (idx + 1) + ' / ' + total + '</span>' +
      '</div>' +
      '<div class="ct-card-header">' +
        '<div class="ct-card-name">' + escapeHtml(p.full_name || 'Unknown') + '</div>' +
        '<div class="ct-card-meta">' +
          '<span class="ct-dot ' + escapeAttr(p.priority || 'low') + '"></span>' +
          '<span>' + escapeHtml((p.priority || 'low')) + ' priority</span>' +
          (p.capacity_estimate_cents ? '<span class="ct-card-cap">· cap ' + money(p.capacity_estimate_cents) + '</span>' : '') +
          (loc ? '<span>· ' + escapeHtml(loc) + '</span>' : '') +
        '</div>' +
        (sub ? '<div class="ct-card-meta">' + escapeHtml(sub) + '</div>' : '') +
        (p.best_time_to_call ? '<div class="ct-card-meta">⏰ Best time: ' + escapeHtml(p.best_time_to_call) + '</div>' : '') +
        '<a class="ct-card-fullrec" href="/admin/fundraising/individuals/#' + escapeAttr(p.id) + '">View full record →</a>' +
      '</div>' +
      '<div class="ct-contact">' + contact + emailBtn + '</div>' +
      ctxHtml(p) +
      '<div id="ctTimeline"></div>' +
      dispPadHtml() +
      '<div id="ctAmount"></div>' +
      '<button type="button" class="ct-notes-toggle" id="ctNotesToggle">+ Add a note</button>' +
      '<textarea class="ct-notes" id="ctNotes" placeholder="One-line note (optional)" hidden></textarea>' +
      snoozeHtml();

    // wire
    $('ctClose').addEventListener('click', closeCard);
    var call = $('ctCall');
    if (call) call.addEventListener('click', onTapCall);
    var text = $('ctText');
    if (text) text.addEventListener('click', function () { onTouchDisposition('texted'); });
    var nt = $('ctNotesToggle');
    nt.addEventListener('click', function () { var ta = $('ctNotes'); ta.hidden = !ta.hidden; if (!ta.hidden) ta.focus(); });
    $('ctCard').querySelectorAll('.ct-disp').forEach(function (b) {
      b.addEventListener('click', function () { onTapDisposition(b.dataset.code); });
    });
    $('ctCard').querySelectorAll('.ct-snooze-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        snoozeFromCard(parseInt(b.dataset.days, 10));
      });
    });

    loadTimeline(p.id);
  }

  function ctxHtml(p) {
    var html = '<div class="ct-ctx">';
    if (p.ask_target_cents) {
      html += '<div class="ct-ctx-label">Suggested ask</div><div class="ct-ctx-ask">' + money(p.ask_target_cents) + '</div>';
    }
    if (p.evidence) {
      html += '<div class="ct-ctx-label" style="margin-top:8px">Why a prospect</div><div class="ct-ctx-evidence">' + escapeHtml(p.evidence) + '</div>';
    }
    if (p.tags && p.tags.length) {
      html += '<div class="ct-tags">' + p.tags.map(function (t) { return '<span class="ct-tag">#' + escapeHtml(t) + '</span>'; }).join('') + '</div>';
    }
    html += '</div>';
    return html;
  }

  function loadTimeline(prospectId) {
    state.client.from('call_time_prospect_timeline').select('*')
      .eq('prospect_id', prospectId).order('occurred_at', { ascending: false }).limit(3)
      .then(function (r) {
        var box = $('ctTimeline');
        if (!box) return;
        var rows = (r && r.data) || [];
        if (!rows.length) { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="ct-timeline">' +
          '<div class="ct-ctx-label">Recent activity</div>' +
          rows.map(function (a) {
            var amt = a.amount_cents ? ' · ' + money(a.amount_cents) : '';
            return '<div class="ct-tl-item"><b>' + escapeHtml(relTime(a.occurred_at)) + '</b>' +
              escapeHtml((a.activity_type || '') + (a.outcome ? ' — ' + dispLabel(a.outcome) : '')) + amt + '</div>';
          }).join('') +
        '</div>';
      });
  }

  function dispPadHtml() {
    var byCat = {};
    state.dispositions.forEach(function (d) { (byCat[d.category] = byCat[d.category] || []).push(d); });
    var html = '<div id="ctDispPad">';
    CAT_ORDER.forEach(function (cat) {
      var items = byCat[cat];
      if (!items || !items.length) return;
      html += '<div class="ct-disp-group"><div class="ct-disp-group-label">' + (CAT_LABEL[cat] || cat) + '</div><div class="ct-disp-grid">';
      items.forEach(function (d) {
        html += '<button type="button" class="ct-disp" data-code="' + escapeAttr(d.code) + '" ' +
          'style="--ct-c:' + (DISP_COLORVAR[cat] || 'var(--border-medium)') + '">' + escapeHtml(d.label) + '</button>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function snoozeHtml() {
    return '<div class="ct-snooze"><div class="ct-ctx-label">Snooze instead</div><div class="ct-snooze-chips">' +
      '<button type="button" class="ct-snooze-chip" data-days="1">Tomorrow</button>' +
      '<button type="button" class="ct-snooze-chip" data-days="3">3 days</button>' +
      '<button type="button" class="ct-snooze-chip" data-days="7">1 week</button>' +
      '<button type="button" class="ct-snooze-chip" data-days="30">1 month</button>' +
    '</div></div>';
  }

  function closeCard() {
    $('ctCardScrim').classList.remove('is-open');
    hideActionbar();
    state.card = null; state.cardIndex = -1; state.presel = null; state.selDisp = null; state.selAmount = null;
  }

  // ---- dial-and-stage: tapping Call pre-selects no_answer for a 1-tap confirm ----
  function onTapCall() {
    // the <a href="tel:"> still fires natively; we just pre-arm the log
    var hasNoAnswer = state.dispositions.some(function (d) { return d.code === 'no_answer'; });
    if (!hasNoAnswer) return;
    state.presel = 'no_answer';
    // highlight the no_answer button + show a quick confirm bar
    var pad = $('ctDispPad');
    if (pad) {
      pad.querySelectorAll('.ct-disp').forEach(function (b) { b.classList.toggle('is-presel', b.dataset.code === 'no_answer'); });
    }
    showActionbar('Didn’t pick up? Log No answer', function () { confirmDisposition('no_answer'); }, 'Log No answer');
  }

  // ---- disposition tap ----
  function onTapDisposition(code) {
    var d = state.dispositions.find(function (x) { return x.code === code; });
    if (!d) return;
    state.presel = null;
    // visual select
    var pad = $('ctDispPad');
    pad.querySelectorAll('.ct-disp').forEach(function (b) {
      b.classList.toggle('is-sel', b.dataset.code === code);
      b.classList.remove('is-presel');
    });

    if (d.captures_amount) {
      state.selDisp = d; state.selAmount = null;
      renderAmount(d);
      // confirm happens via amount's Log button
    } else {
      // immediate one-tap log
      confirmDisposition(code);
    }
  }

  // texted/emailed quick path from contact buttons
  function onTouchDisposition(code) {
    // let the native sms:/mailto: fire; arm a quick confirm so logging the touch is one tap
    if (!state.dispositions.some(function (d) { return d.code === code; })) return;
    showActionbar('Sent? Log "' + dispLabel(code) + '"', function () { confirmDisposition(code); }, 'Log ' + dispLabel(code));
  }

  function renderAmount(d) {
    var box = $('ctAmount');
    var chips = [2500, 5000, 10000, 25000];
    box.innerHTML = '<div class="ct-amount">' +
      '<div class="ct-ctx-label">' + escapeHtml(d.label) + ' amount</div>' +
      '<div class="ct-amount-chips">' +
        chips.map(function (c) { return '<button type="button" class="ct-amt-chip" data-cents="' + c + '">' + money(c) + '</button>'; }).join('') +
        '<button type="button" class="ct-amt-chip" data-custom="1">Custom</button>' +
      '</div>' +
      '<input class="ct-amt-input" id="ctAmtInput" type="number" inputmode="decimal" min="0" step="1" placeholder="$ amount" hidden />' +
    '</div>';
    box.querySelectorAll('.ct-amt-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        box.querySelectorAll('.ct-amt-chip').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        if (b.dataset.custom) {
          var inp = $('ctAmtInput'); inp.hidden = false; inp.focus();
          state.selAmount = null;
          inp.oninput = function () { state.selAmount = Math.round(parseFloat(inp.value || '0') * 100) || null; updateAmountBar(d); };
        } else {
          $('ctAmtInput').hidden = true;
          state.selAmount = parseInt(b.dataset.cents, 10);
        }
        updateAmountBar(d);
      });
    });
    updateAmountBar(d);
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function updateAmountBar(d) {
    var label = state.selAmount ? 'Log ' + d.label + ' · ' + money(state.selAmount) : 'Pick an amount';
    showActionbar('', function () {
      if (!state.selAmount) { shellToast('Pick an amount first'); return; }
      confirmDisposition(d.code, state.selAmount);
    }, label, !state.selAmount);
  }

  // ---- the sticky confirm bar ----
  function showActionbar(_msg, onConfirm, confirmLabel, disabled) {
    var bar = $('ctActionbar');
    bar.classList.add('is-on');
    bar.innerHTML =
      '<button type="button" class="ct-cancel" id="ctCancelBar">Cancel</button>' +
      '<button type="button" class="ct-confirm" id="ctConfirmBar"' + (disabled ? ' disabled style="opacity:.5"' : '') + '>' + escapeHtml(confirmLabel) + '</button>';
    $('ctCancelBar').addEventListener('click', function () { hideActionbar(); clearSelections(); });
    var cb = $('ctConfirmBar');
    if (!disabled) cb.addEventListener('click', onConfirm);
  }
  function hideActionbar() { var b = $('ctActionbar'); if (b) b.classList.remove('is-on'); }
  function clearSelections() {
    state.presel = null; state.selDisp = null; state.selAmount = null;
    var pad = $('ctDispPad');
    if (pad) pad.querySelectorAll('.ct-disp').forEach(function (b) { b.classList.remove('is-sel', 'is-presel'); });
    var amt = $('ctAmount'); if (amt) amt.innerHTML = '';
  }

  // =======================================================================
  // Log + optimistic advance + undo
  // =======================================================================
  function confirmDisposition(code, amountCents) {
    if (!state.canWrite) { shellToast('You have read-only access', 'error'); return; }
    var d = state.dispositions.find(function (x) { return x.code === code; });
    if (!d) return;
    var prospect = state.card;
    if (!prospect) return;

    var notesEl = $('ctNotes');
    var notes = notesEl && !notesEl.hidden ? (notesEl.value || '').trim() : '';
    var activityType = code === 'texted' ? 'text' : code === 'emailed' ? 'email' : 'call';

    hideActionbar();

    // Snapshot restorable fields BEFORE the RPC mutates them (for a true Undo).
    var snapPromise = state.client.from('pac_prospects')
      .select('stage,status,committed_amount_cents,attempts_count,last_outcome,last_contacted_at,next_action,next_action_date,snooze_until,do_not_contact')
      .eq('id', prospect.id).maybeSingle();

    // Optimistic: drop from list + advance immediately.
    var removedId = prospect.id;
    var fromIndex = state.cardIndex;
    state.queue = state.queue.filter(function (p) { return p.id !== removedId; });

    snapPromise.then(function (snap) {
      var before = (snap && snap.data) || null;
      return state.client.rpc('log_call_activity', {
        p_prospect_id: removedId,
        p_disposition: code,
        p_activity_type: activityType,
        p_notes: notes || null,
        p_amount_cents: amountCents != null ? amountCents : null,
        p_duration_seconds: null,
        p_follow_up_at: null,
        p_actor_id: null,
        p_actor_email: state.email
      }).then(function (r) {
        if (r.error) throw r.error;
        var act = r.data || {};
        var followIso = act.follow_up_at;
        // optimistic stat bump
        bumpStats(d, amountCents, !!followIso);
        renderStatbar();
        showUndo(d, removedId, act.id, before, prospect, followIso);
        // background reconcile so the bar shows true server numbers
        loadStats().then(renderStatbar);
      });
    }).catch(function (e) {
      console.error('log_call_activity failed', e);
      shellToast('Log failed — restoring prospect', 'error');
      refreshAll();
    });

    // advance UI now (don't wait on network)
    advanceAfterLog(fromIndex);
  }

  function advanceAfterLog(fromIndex) {
    renderQueue();
    var list = filteredList();
    if ($('ctCardScrim').classList.contains('is-open')) {
      if (list.length === 0) { closeCard(); shellToast('Queue complete 🎉'); return; }
      var nextIdx = fromIndex < list.length ? fromIndex : list.length - 1;
      openCard(nextIdx, true);
    }
  }

  function bumpStats(d, amountCents, scheduledFollow) {
    var s = state.stats;
    s.touches = (s.touches || 0) + 1;
    if (d.category !== 'touch') s.calls = (s.calls || 0) + 1; // texted/emailed are touches, not dials
    if (d.is_positive || d.category === 'win' || d.category === 'progress') s.conversations = (s.conversations || 0) + 1;
    if (d.category === 'win') s.wins = (s.wins || 0) + 1;
    if (amountCents) s.pledged_cents_today = (s.pledged_cents_today || 0) + amountCents;
    if (scheduledFollow) s.followups_scheduled = (s.followups_scheduled || 0) + 1;
  }

  function showUndo(d, prospectId, activityId, beforeSnapshot, prospectRow, followIso) {
    var msg = 'Logged — ' + d.label;
    if (followIso) msg += ' · follow-up ' + fmtDate(followIso);
    $('ctUndoMsg').textContent = msg;
    var undo = $('ctUndo');
    undo.classList.add('is-on');
    clearTimeout(state.undoTimer);
    state.undoTimer = setTimeout(function () { undo.classList.remove('is-on'); }, 5200);

    // stash what Undo needs
    undo._payload = { activityId: activityId, prospectId: prospectId, before: beforeSnapshot, row: prospectRow };
  }

  function doUndo() {
    var undo = $('ctUndo');
    var pl = undo._payload;
    undo.classList.remove('is-on');
    clearTimeout(state.undoTimer);
    if (!pl) return;

    var jobs = [];
    if (pl.activityId) jobs.push(state.client.from('pac_prospect_activities').delete().eq('id', pl.activityId));
    if (pl.before) jobs.push(state.client.from('pac_prospects').update(pl.before).eq('id', pl.prospectId));

    Promise.all(jobs)
      .then(function () { shellToast('Undone'); })
      .catch(function (e) { console.error('undo failed', e); shellToast('Undo failed', 'error'); })
      .then(function () { return Promise.all([loadQueue(), loadStats()]); })
      .then(function () { renderStatbar(); renderQueue(); });
  }

  // =======================================================================
  // Snooze from card
  // =======================================================================
  function snoozeFromCard(days) {
    var prospect = state.card;
    if (!prospect) return;
    var fromIndex = state.cardIndex;
    state.queue = state.queue.filter(function (p) { return p.id !== prospect.id; });
    state.client.rpc('snooze_prospect', { p_prospect_id: prospect.id, p_days: days })
      .then(function (r) { if (r.error) throw r.error; shellToast('Snoozed ' + days + 'd'); })
      .catch(function (e) { console.error('snooze failed', e); shellToast('Snooze failed', 'error'); refreshAll(); });
    advanceAfterLog(fromIndex);
  }

  // =======================================================================
  // SMS template settings (localStorage)
  // =======================================================================
  function fillTemplate(tpl, p) {
    return String(tpl || '')
      .replace(/\{first_name\}/g, p.first_name || (p.full_name || '').split(' ')[0] || 'there')
      .replace(/\{full_name\}/g, p.full_name || '')
      .replace(/\{city\}/g, p.city || '');
  }

  function openSettings() {
    if (!window.AdminShell || !window.AdminShell.openDrawer) {
      var v = window.prompt('SMS template ({first_name}, {city} supported):', state.sms);
      if (v != null) { state.sms = v; lsSet(LS.sms, v); }
      return;
    }
    window.AdminShell.openDrawer({
      eyebrow: 'Call Time',
      title: 'Settings',
      bodyHtml:
        '<div class="ct-settings-field">' +
          '<label for="ctSmsTpl">Pre-filled text message</label>' +
          '<textarea id="ctSmsTpl" rows="4">' + escapeHtml(state.sms) + '</textarea>' +
          '<p class="ct-settings-hint">Placeholders: {first_name}, {full_name}, {city}. Injected into the Text button.</p>' +
        '</div>' +
        '<div class="ct-settings-field">' +
          '<label for="ctGoalInput">Session dial goal</label>' +
          '<input id="ctGoalInput" type="number" min="1" value="' + escapeAttr(state.goal) + '" />' +
        '</div>',
      footHtml: '<button type="button" class="ct-confirm" id="ctSaveSettings" style="width:100%;min-height:48px;border:none;border-radius:12px;background:var(--text-accent);color:#0D1726;font-weight:800;cursor:pointer">Save</button>'
    });
    setTimeout(function () {
      var save = $('ctSaveSettings');
      if (!save) return;
      save.addEventListener('click', function () {
        var t = $('ctSmsTpl'); if (t) { state.sms = t.value || DEFAULT_SMS; lsSet(LS.sms, state.sms); }
        var g = $('ctGoalInput'); if (g) { var n = parseInt(g.value, 10); if (n > 0) { state.goal = n; lsSet(LS.goal, n); } }
        renderStatbar();
        if (window.AdminShell.closeDrawer) window.AdminShell.closeDrawer();
        shellToast('Settings saved');
      });
    }, 0);
  }

  // =======================================================================
  // shell toast helper (fallback if shell missing)
  // =======================================================================
  function shellToast(msg, kind) {
    if (window.AdminShell && window.AdminShell.toast) window.AdminShell.toast(msg, kind);
  }

  // expose
  window.CALL_TIME = { init: init };
})();
