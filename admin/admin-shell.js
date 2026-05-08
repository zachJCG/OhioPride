/* =====================================================================
   Ohio Pride PAC :: Admin Shell
   Shared auth + chrome for /admin/* foundation pages.

   - Magic-link Supabase Auth (passwordless). Architected so password auth
     can be added later by swapping signInWithOtp -> signInWithPassword.
   - Session detection/restoration via supabase-js, persistSession.
   - Authorization via RLS-protected SELECT on public.admin_emails.
     `is_admin()` (Supabase function) controls the policy on that table.

   Browser anon/publishable key only. No service-role key here.

   Usage in a page:
     window.AdminShell.protect({ active: 'donors' }).then((ctx) => {
       if (!ctx) return;            // not authorized; shell handled UI
       // ctx.session, ctx.user, ctx.client are available
     });

   For the login page, call:
     window.AdminShell.mountLogin();
   ===================================================================== */

(function () {
  'use strict';

  const CONFIG = {
    SUPABASE_URL:      'https://dkdxefzhttkmjhdbkvqn.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZHhlZnpodHRrbWpoZGJrdnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTk5NjksImV4cCI6MjA5MjM5NTk2OX0.l6wUMIdUX5Es4Jvh8fRTvnlYrMQKzYy_NEGBFJ1iMj4',
    HUB_PATH:          '/admin',
    LOGIN_PATH:        '/admin/login',
    REDIRECT_TO:       (typeof window !== 'undefined' && window.location)
                         ? (window.location.origin + '/admin')
                         : 'https://ohiopride.org/admin'
  };

  // Modules visible in the subnav. Keep in sync with module-card grid on /admin.
  const MODULES = [
    { key: 'hub',          label: 'Dashboard',    href: '/admin' },
    { key: 'endorsements', label: 'Endorsements', href: '/admin/endorsements' },
    { key: 'donors',       label: 'Donors',       href: '/admin/donors' },
    { key: 'volunteers',   label: 'Volunteers',   href: '/admin/volunteers' }
  ];

  function $(s, root) { return (root || document).querySelector(s); }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function getClient() {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase JS not loaded. Include https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 before admin-shell.js.');
    }
    if (!window.__adminClient) {
      window.__adminClient = window.supabase.createClient(
        CONFIG.SUPABASE_URL,
        CONFIG.SUPABASE_ANON_KEY,
        { auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } }
      );
    }
    return window.__adminClient;
  }

  /* -------------------------------------------------------------------
     Chrome rendering
     ------------------------------------------------------------------- */
  function renderChrome(opts) {
    opts = opts || {};
    const active = opts.active || 'hub';
    const showNav = opts.showNav !== false;

    const navHtml = showNav ? (
      '<div class="admin-subnav"><div class="admin-subnav-inner">' +
      MODULES.map(function (m) {
        const isActive = m.key === active;
        return '<a class="admin-navlink' + (isActive ? ' active' : '') + '"' +
               ' href="' + m.href + '"' +
               (isActive ? ' aria-current="page"' : '') + '>' +
               escapeHtml(m.label) + '</a>';
      }).join('') +
      '</div></div>'
    ) : '';

    const headerHtml =
      '<div class="pride-stripe-top" aria-hidden="true"></div>' +
      '<header class="admin-header"><div class="admin-header-inner">' +
      '  <a href="/admin" class="wordmark" aria-label="Ohio Pride PAC admin home">' +
      '    <span class="wordmark-ohio">Ohio</span>' +
      '    <span class="wordmark-pride">Pride</span>' +
      '    <span class="wordmark-pac">PAC</span>' +
      '    <span class="admin-tag">Admin</span>' +
      '  </a>' +
      '  <div class="header-right">' +
      '    <span class="header-user" id="adminShellUser"></span>' +
      '    <button class="header-btn" id="adminShellSignOut" type="button" hidden>Sign Out</button>' +
      '  </div>' +
      '</div></header>' +
      navHtml;

    const footerHtml =
      '<footer class="admin-footer">' +
      '  <p class="disclaimer">Paid for by Ohio Pride PAC. Zachary R. Joseph, Director.</p>' +
      '</footer>' +
      '<div class="pride-stripe-bottom" aria-hidden="true"></div>';

    // Insert header at top of body, footer at end. Don't disturb <main>/<script>.
    const body = document.body;
    const headerWrap = document.createElement('div');
    headerWrap.innerHTML = headerHtml;
    while (headerWrap.firstChild) body.insertBefore(headerWrap.firstChild, body.firstChild);

    const footerWrap = document.createElement('div');
    footerWrap.innerHTML = footerHtml;
    while (footerWrap.firstChild) body.appendChild(footerWrap.firstChild);

    // Toast container
    if (!$('#adminShellToast')) {
      const t = document.createElement('div');
      t.className = 'toast';
      t.id = 'adminShellToast';
      body.appendChild(t);
    }
  }

  function toast(msg, type) {
    const el = $('#adminShellToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast visible' + (type ? ' toast-' + type : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('visible'); }, 3500);
  }

  /* -------------------------------------------------------------------
     Auth flow for protected pages
     ------------------------------------------------------------------- */
  function showBlocker(title, msg, action) {
    const main = $('#adminShellContent') || $('main.admin-main') || $('main');
    if (!main) return;
    main.innerHTML =
      '<div class="auth-blocker">' +
      '  <h2>' + escapeHtml(title) + '</h2>' +
      '  <p>' + escapeHtml(msg) + '</p>' +
      (action
        ? '<a class="btn btn-primary" href="' + escapeHtml(action.href) + '">' +
          escapeHtml(action.label) + '</a>'
        : '') +
      '</div>';
  }

  function hideContent() {
    const c = $('#adminShellContent');
    if (c) c.style.display = 'none';
  }
  function revealContent() {
    const c = $('#adminShellContent');
    if (c) c.style.display = '';
  }

  async function protect(opts) {
    opts = opts || {};
    renderChrome(opts);
    hideContent();

    const client = getClient();

    // Wait briefly for the client to process URL tokens (magic link callback).
    await new Promise(function (r) { setTimeout(r, 50); });

    let session = null;
    try {
      const res = await client.auth.getSession();
      session = res && res.data ? res.data.session : null;
    } catch (e) {
      console.error('getSession failed:', e);
    }

    if (!session) {
      // Preserve where the user was trying to go for after login.
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(CONFIG.LOGIN_PATH + '?next=' + next);
      return null;
    }

    // Clean magic-link tokens from URL hash, if any.
    if (window.location.hash && window.location.hash.indexOf('access_token') !== -1) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // Authorization: RLS-protected SELECT. Returns a row only if the
    // signed-in JWT email is allowed (is_admin() = true).
    let allow = null;
    let authError = null;
    try {
      const r = await client
        .from('admin_emails')
        .select('email')
        .eq('email', session.user.email)
        .maybeSingle();
      allow = r.data;
      authError = r.error;
    } catch (e) {
      authError = e;
    }

    if (authError || !allow) {
      console.warn('Admin authorization failed:', authError);
      try { await client.auth.signOut(); } catch (_) { /* no-op */ }
      showBlocker(
        'Access denied',
        'Your email is not authorized for the admin dashboard. If you believe this is a mistake, contact the Director.',
        { label: 'Try a different email', href: CONFIG.LOGIN_PATH }
      );
      return null;
    }

    // Header user chip + sign-out
    const userEl = $('#adminShellUser');
    if (userEl) userEl.textContent = session.user.email;
    const outBtn = $('#adminShellSignOut');
    if (outBtn) {
      outBtn.hidden = false;
      outBtn.addEventListener('click', async function () {
        try { await client.auth.signOut(); } catch (_) { /* no-op */ }
        window.location.replace(CONFIG.LOGIN_PATH);
      });
    }

    revealContent();
    return { session: session, user: session.user, client: client, toast: toast };
  }

  /* -------------------------------------------------------------------
     Login page
     ------------------------------------------------------------------- */
  function getNextPath() {
    try {
      const params = new URLSearchParams(window.location.search);
      const n = params.get('next');
      // Only allow same-origin admin paths.
      if (n && /^\/admin(\/|$)/.test(n) && !/^\/\//.test(n)) return n;
    } catch (_) { /* no-op */ }
    return CONFIG.HUB_PATH;
  }

  async function mountLogin() {
    renderChrome({ active: 'hub', showNav: false });

    const client = getClient();

    // If already signed in, bounce to next/hub.
    try {
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        window.location.replace(getNextPath());
        return;
      }
    } catch (_) { /* no-op */ }

    const form = $('#adminShellLoginForm');
    if (!form) return;
    const btn = $('#adminShellLoginBtn');
    const errEl = $('#adminShellLoginError');
    const okEl = $('#adminShellLoginSuccess');
    const okText = $('#adminShellLoginSuccessText');

    function showError(msg) {
      errEl.textContent = msg;
      errEl.classList.add('visible');
      okEl.classList.remove('visible');
    }
    function showSuccess(email) {
      okText.textContent =
        'A sign in link has been sent to ' + email +
        '. Click it within 60 minutes to access the admin dashboard.';
      okEl.classList.add('visible');
      errEl.classList.remove('visible');
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const emailInput = $('#adminShellLoginEmail');
      const email = (emailInput.value || '').trim().toLowerCase();
      if (!email) { showError('Please enter your email address.'); return; }

      btn.classList.add('loading');
      btn.disabled = true;
      errEl.classList.remove('visible');

      // Preserve "next" through the magic-link redirect.
      const next = getNextPath();
      const redirectTo = window.location.origin + next;

      try {
        const { error } = await client.auth.signInWithOtp({
          email: email,
          options: {
            emailRedirectTo: redirectTo,
            // Keep allowlist as the source of truth; do not auto-create.
            shouldCreateUser: true
          }
        });
        if (error) throw error;
        showSuccess(email);
      } catch (err) {
        console.error('Magic link error:', err);
        showError(err.message || 'Could not send sign in link. Please try again.');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
  }

  /* -------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------- */
  window.AdminShell = {
    protect: protect,
    mountLogin: mountLogin,
    toast: toast,
    config: CONFIG,
    modules: MODULES.slice()
  };
})();
