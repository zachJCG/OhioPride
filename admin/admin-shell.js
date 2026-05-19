/* =========================================================================
   Ohio Pride PAC :: Admin App Shell
   -------------------------------------------------------------------------
   Injects the persistent sidebar + top bar into any /admin/* page.
   Handles auth gating, role resolution, sidebar visibility per role,
   user menu, sidebar collapse, and a generic detail drawer.

   USAGE
   -----
   Add this to the <head> after supabase-js, then in the body:

     <body class="admin-shell">
       <div id="shell-root" data-active-nav="dashboard"
                            data-page-title="Dashboard"
                            data-page-eyebrow="Admin"
                            data-page-sub="Pulse on volunteers, endorsements, and donors."></div>

       <script>
         document.addEventListener('admin-shell-ready', function (ev) {
           // ev.detail.user, ev.detail.permissions, ev.detail.client
           // build your page-specific content into the shell-content div
         });
       </script>
     </body>

   The shell will:
     - block until Supabase confirms the session
     - load the user's roles + permissions
     - render sidebar items the user can see
     - emit `admin-shell-ready` when content can be drawn
   ========================================================================= */

(function () {
  'use strict';

  // -------------------------------------------------------------------
  // Configuration (mirrors admin-auth.js)
  // -------------------------------------------------------------------
  var CONFIG = {
    SUPABASE_URL: 'https://dkdxefzhttkmjhdbkvqn.supabase.co',
    SUPABASE_ANON_KEY:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZHhlZnpodHRrbWpoZGJrdnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTk5NjksImV4cCI6MjA5MjM5NTk2OX0.l6wUMIdUX5Es4Jvh8fRTvnlYrMQKzYy_NEGBFJ1iMj4',
    LOGIN_PATH: '/admin/login',
  };

  // -------------------------------------------------------------------
  // Nav catalog (single source of truth for what shows in the sidebar).
  // Each item's `permission` is the [module, action] pair the user must
  // have. Items the user can't see are filtered out client-side and
  // re-checked server-side via RLS.
  // -------------------------------------------------------------------
  var NAV = [
    {
      group: 'Workspace',
      items: [
        { id: 'dashboard',    href: '/admin/dashboard',    label: 'Dashboard',    icon: 'home',       permission: ['dashboard','read'] },
      ]
    },
    {
      group: 'People',
      items: [
        { id: 'volunteers',   href: '/admin/volunteers',   label: 'Volunteers',   icon: 'users',      permission: ['volunteers','read'] },
        { id: 'internships',  href: '/admin/internships',  label: 'Internships',  icon: 'briefcase',  permission: ['internships','read'] },
        { id: 'donors',       href: '/admin/donors',      label: 'Donors',       icon: 'heart',      permission: ['donors','read'] },
        { id: 'pride',        href: '/admin/pride',        label: 'Pride',        icon: 'flag',       permission: ['pride','read'] },
        { id: 'launch',       href: '/admin/launch-day',   label: 'Launch Day',   icon: 'megaphone',  permission: ['launch','read'] },
        { id: 'users',        href: '/admin/users',        label: 'Admin Users',  icon: 'key',        permission: ['users','read'] },
      ]
    },
    {
      group: 'Program',
      items: [
        { id: 'endorsements', href: '/admin/endorsements', label: 'Endorsements', icon: 'star',       permission: ['endorsements','read'] },
      ]
    },
    {
      group: 'Legislation',
      items: [
        { id: 'bills',        href: '/admin/bills',        label: 'Bills',        icon: 'capitol',    permission: ['bills','read'] },
        { id: 'legislators',  href: '/admin/legislators',  label: 'Scorecard',    icon: 'gavel',      permission: ['legislators','read'] },
      ]
    },
    {
      group: 'Money',
      items: [
        { id: 'finance',      href: '/admin/finance/budget', label: 'Budget',      icon: 'wallet',     permission: ['finance','read'] },
      ]
    }
  ];

  // SVG icon set — small, currentColor, 18×18.
  var ICONS = {
    home:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    users:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 19c.5-3.4 3.4-5.5 6.5-5.5s6 2.1 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 13.5c2.4 0 4.4 1.4 5 3.5"/></svg>',
    heart:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
    shield:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><path d="M12 3 4 6v6c0 4.5 3.2 8.3 8 9 4.8-.7 8-4.5 8-9V6l-8-3z"/></svg>',
    key:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><circle cx="8" cy="14" r="3.5"/><path d="m11 11 9-9"/><path d="m17 5 2 2"/><path d="m14 8 2 2"/></svg>',
    star:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><polygon points="12 3 14.5 9 21 9.7 16 14 17.5 20.5 12 17 6.5 20.5 8 14 3 9.7 9.5 9 12 3"/></svg>',
    gavel:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><path d="m14 4 6 6"/><path d="m11 7 6 6"/><path d="m5 13 6 6"/><path d="m8 10 6 6"/><path d="M14.5 14.5 4 21"/></svg>',
    capitol:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><path d="M3 21h18"/><path d="M5 21V11"/><path d="M19 21V11"/><path d="M9 21V11"/><path d="M15 21V11"/><path d="M3 11h18"/><path d="M12 3 4 8h16l-8-5z"/></svg>',
    megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><path d="M3 11v2c0 .55.45 1 1 1h2l5 4V6L6 10H4c-.55 0-1 .45-1 1z"/><path d="M14 7c1.5 1 2.5 2.7 2.5 5s-1 4-2.5 5"/></svg>',
    flag:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><path d="M4 21V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>',
    briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>',
    wallet:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shell-nav-icon"><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13h.01"/><path d="M3 11h18"/></svg>',
    menu:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="4" y1="7"  x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>',
    chev:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>',
    close:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>',
  };

  // -------------------------------------------------------------------
  // Bootstrap
  // -------------------------------------------------------------------
  if (!window.supabase || !window.supabase.createClient) {
    console.error('admin-shell: supabase-js not loaded');
    window.location.replace(CONFIG.LOGIN_PATH);
    return;
  }
  var client = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY,
    { auth: { detectSessionInUrl: true, persistSession: true } }
  );

  var state = {
    session: null,
    adminUser: null,         // row from public.admin_users (or pseudo-row from admin_emails)
    roles: [],               // [{slug, label}]
    permSet: new Set(),      // "<module>:<action>" lookup
    activeNav: 'dashboard',
    isLegacyAdmin: false,    // true when only in admin_emails, not in admin_users
  };

  window.AdminShell = {
    client: client,
    config: CONFIG,
    state: state,
    can: can,
    setActive: setActive,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    toast: toast,
  };

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();

  // -------------------------------------------------------------------
  // Boot sequence
  // -------------------------------------------------------------------
  function boot() {
    var root = document.getElementById('shell-root');
    if (!root) {
      console.warn('admin-shell: no #shell-root, skipping render');
      return;
    }

    state.activeNav = root.dataset.activeNav || 'dashboard';
    var pageTitle   = root.dataset.pageTitle   || 'Admin';
    var pageEyebrow = root.dataset.pageEyebrow || 'Ohio Pride PAC';
    var pageSub     = root.dataset.pageSub     || '';

    renderSkeleton(root, pageEyebrow, pageTitle, pageSub);

    client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) {
        window.location.replace(CONFIG.LOGIN_PATH);
        return;
      }
      state.session = session;
      return loadUserAndPermissions();
    }).then(function () {
      if (!state.session) return;
      renderSidebar();
      renderUserMenu();
      bindShellEvents();

      // Touch last_seen_at (fire-and-forget)
      client.rpc('touch_admin_last_seen').then(function () {}, function () {});

      document.dispatchEvent(new CustomEvent('admin-shell-ready', {
        detail: {
          client:      client,
          session:     state.session,
          user:        state.adminUser,
          roles:       state.roles,
          permissions: state.permSet,
          can:         can,
        }
      }));
    }).catch(function (err) {
      console.error('admin-shell: bootstrap failed', err);
      window.location.replace(CONFIG.LOGIN_PATH);
    });
  }

  // -------------------------------------------------------------------
  // Load user + roles + permissions
  // -------------------------------------------------------------------
  function loadUserAndPermissions() {
    var email = (state.session.user.email || '').toLowerCase();

    // 1) Try admin_users (post-migration).
    return client
      .from('admin_users')
      .select('id, email, full_name, title, is_active')
      .eq('email', email)
      .maybeSingle()
      .then(function (r) {
        if (r.data) {
          state.adminUser = r.data;
          return loadRolesFor(r.data.id);
        }
        // 2) Fall back to admin_emails (legacy / pre-migration).
        return client
          .from('admin_emails')
          .select('email')
          .eq('email', email)
          .maybeSingle()
          .then(function (r2) {
            if (r2.data) {
              state.isLegacyAdmin = true;
              state.adminUser = {
                id: null,
                email: r2.data.email,
                full_name: humanizeEmail(r2.data.email),
                title: 'Super Admin',
                is_active: true
              };
              state.roles = [{ slug: 'super_admin', label: 'Super Admin' }];
              // Synthesize permissions for the legacy super_admin.
              ['dashboard','volunteers','endorsements','donors','bills','legislators','news','board','launch','pride','finance','users','settings']
                .forEach(function (m) {
                  ['read','write','admin','manage_users'].forEach(function (a) {
                    state.permSet.add(m + ':' + a);
                  });
                });
              return;
            }
            // Not in either table — kick to login.
            return client.auth.signOut().then(function () {
              window.location.replace(CONFIG.LOGIN_PATH);
            });
          });
      });
  }

  function loadRolesFor(userId) {
    return client
      .from('admin_user_roles')
      .select('role_slug, admin_roles!inner(label)')
      .eq('user_id', userId)
      .then(function (r) {
        if (r.error || !r.data) return;
        state.roles = r.data.map(function (row) {
          return {
            slug: row.role_slug,
            label: (row.admin_roles && row.admin_roles.label) || row.role_slug
          };
        });
        var slugs = state.roles.map(function (x) { return x.slug; });
        if (slugs.length === 0) return;
        return client
          .from('role_permissions')
          .select('module, action, role_slug')
          .in('role_slug', slugs)
          .then(function (rp) {
            if (rp.error || !rp.data) return;
            rp.data.forEach(function (p) {
              state.permSet.add(p.module + ':' + p.action);
            });
          });
      });
  }

  function can(module, action) {
    // super_admin shortcut
    if (state.permSet.has(module + ':admin')) return true;
    if (state.roles.some(function (r) { return r.slug === 'super_admin'; })) return true;
    return state.permSet.has(module + ':' + (action || 'read'));
  }

  // -------------------------------------------------------------------
  // Render: skeleton
  // -------------------------------------------------------------------
  function renderSkeleton(root, eyebrow, title, sub) {
    root.innerHTML = [
      '<div class="shell-layout" id="shellLayout">',
        '<aside class="shell-sidebar" id="shellSidebar">',
          '<a class="shell-sidebar-brand" href="/admin/dashboard">',
            '<span class="shell-sidebar-brand-mark">OP</span>',
            '<div>',
              '<span class="shell-sidebar-brand-text">Ohio Pride</span>',
              '<span class="shell-sidebar-brand-sub">Admin Console</span>',
            '</div>',
          '</a>',
          '<nav class="shell-nav" id="shellNav" aria-label="Admin navigation"></nav>',
          '<div class="shell-sidebar-foot">',
            'v1.0 &middot; <a href="https://ohiopride.org" target="_blank" rel="noopener">View site</a>',
          '</div>',
        '</aside>',

        '<div class="shell-main">',
          '<header class="shell-topbar">',
            '<button type="button" class="shell-topbar-toggle" id="shellToggle" aria-label="Toggle sidebar">',
              ICONS.menu,
            '</button>',
            '<div class="shell-crumbs" id="shellCrumbs">',
              '<a href="/admin/dashboard">Admin</a>',
              '<span class="shell-crumb-sep">/</span>',
              '<strong>', escapeHtml(title), '</strong>',
            '</div>',
            '<div class="shell-user-menu">',
              '<button type="button" class="shell-user-trigger" id="shellUserBtn">',
                '<span class="shell-user-avatar" id="shellUserAvatar">?</span>',
                '<span class="shell-user-meta">',
                  '<span class="shell-user-name" id="shellUserName">Loading...</span>',
                  '<span class="shell-user-role" id="shellUserRole"></span>',
                '</span>',
                ICONS.chev,
              '</button>',
              '<div class="shell-user-pop" id="shellUserPop" hidden>',
                '<div class="shell-user-pop-row">',
                  '<strong id="shellUserPopName">Loading</strong>',
                  '<span id="shellUserPopEmail"></span>',
                '</div>',
                '<div class="shell-user-pop-divider"></div>',
                '<a class="shell-user-pop-link" href="/admin/settings">Settings</a>',
                '<a class="shell-user-pop-link" href="https://ohiopride.org" target="_blank" rel="noopener">View public site</a>',
                '<div class="shell-user-pop-divider"></div>',
                '<button type="button" class="shell-user-pop-link" id="shellSignOut">Sign out</button>',
              '</div>',
            '</div>',
          '</header>',

          '<div class="shell-content" id="shellContent">',
            '<div class="shell-page-head">',
              '<div>',
                '<div class="shell-page-eyebrow">', escapeHtml(eyebrow), '</div>',
                '<h1 class="shell-page-title">', escapeHtml(title), '</h1>',
                sub ? '<p class="shell-page-sub">' + escapeHtml(sub) + '</p>' : '',
              '</div>',
              '<div class="shell-page-actions" id="shellPageActions"></div>',
            '</div>',
            '<div id="shellBody"></div>',
          '</div>',
        '</div>',
      '</div>',

      // Drawer
      '<div class="shell-drawer" id="shellDrawer" role="dialog" aria-modal="true" aria-hidden="true">',
        '<div class="shell-drawer-scrim" data-drawer-close></div>',
        '<div class="shell-drawer-panel">',
          '<div class="shell-drawer-head">',
            '<div>',
              '<div class="shell-drawer-sub" id="shellDrawerSub"></div>',
              '<h3 class="shell-drawer-title" id="shellDrawerTitle"></h3>',
            '</div>',
            '<button class="shell-drawer-close" data-drawer-close aria-label="Close">', ICONS.close, '</button>',
          '</div>',
          '<div class="shell-drawer-body" id="shellDrawerBody"></div>',
          '<div class="shell-drawer-foot" id="shellDrawerFoot" hidden></div>',
        '</div>',
      '</div>',

      // Toast
      '<div class="admin-toast" id="shellToast"></div>'
    ].join('');
  }

  // -------------------------------------------------------------------
  // Render: sidebar (role-filtered)
  // -------------------------------------------------------------------
  function renderSidebar() {
    var nav = document.getElementById('shellNav');
    var html = '';

    NAV.forEach(function (group) {
      var visibleItems = group.items.filter(function (item) {
        if (!item.permission) return true;
        return can(item.permission[0], item.permission[1]);
      });
      if (visibleItems.length === 0) return;

      html += '<div class="shell-nav-group">';
      html += '<div class="shell-nav-group-label">' + escapeHtml(group.group) + '</div>';
      visibleItems.forEach(function (item) {
        var isActive = item.id === state.activeNav;
        html +=
          '<a class="shell-nav-item' + (isActive ? ' is-active' : '') + '" ' +
            'href="' + escapeAttr(item.href) + '" data-nav-id="' + escapeAttr(item.id) + '">' +
            (ICONS[item.icon] || ICONS.home) +
            '<span class="shell-nav-label">' + escapeHtml(item.label) + '</span>' +
          '</a>';
      });
      html += '</div>';
    });

    if (!html) {
      html = '<div class="shell-nav-group-label">No modules available</div>' +
             '<p style="padding:0 12px;font-size:12px;color:rgba(255,255,255,0.4)">Ask the Director to assign you a role.</p>';
    }

    nav.innerHTML = html;
  }

  // -------------------------------------------------------------------
  // Render: user menu
  // -------------------------------------------------------------------
  function renderUserMenu() {
    var u = state.adminUser || {};
    var name = u.full_name || humanizeEmail(u.email || state.session.user.email);
    var email = u.email || state.session.user.email || '';
    var initials = initialsFor(name, email);
    var roleLabel = state.roles[0] ? state.roles[0].label : (u.title || 'Member');
    if (state.roles.length > 1) roleLabel = roleLabel + ' +' + (state.roles.length - 1);

    setText('shellUserName',     name);
    setText('shellUserRole',     roleLabel);
    setText('shellUserAvatar',   initials);
    setText('shellUserPopName',  name);
    setText('shellUserPopEmail', email);
  }

  // -------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------
  function bindShellEvents() {
    var layout = document.getElementById('shellLayout');

    // Sidebar toggle: collapse on desktop, drawer on mobile.
    document.getElementById('shellToggle').addEventListener('click', function () {
      if (window.matchMedia('(max-width: 820px)').matches) {
        layout.classList.toggle('is-drawer-open');
      } else {
        layout.classList.toggle('is-collapsed');
        try { localStorage.setItem('opAdminSidebarCollapsed', layout.classList.contains('is-collapsed') ? '1' : '0'); } catch (e) {}
      }
    });
    try {
      if (localStorage.getItem('opAdminSidebarCollapsed') === '1' &&
          !window.matchMedia('(max-width: 820px)').matches) {
        layout.classList.add('is-collapsed');
      }
    } catch (e) {}

    // User menu popover.
    var pop = document.getElementById('shellUserPop');
    document.getElementById('shellUserBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
    });
    document.addEventListener('click', function (e) {
      if (!pop.contains(e.target) && e.target.id !== 'shellUserBtn' &&
          !document.getElementById('shellUserBtn').contains(e.target)) {
        pop.hidden = true;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        pop.hidden = true;
        closeDrawer();
      }
    });

    // Sign out.
    document.getElementById('shellSignOut').addEventListener('click', function () {
      client.auth.signOut().finally(function () {
        window.location.replace(CONFIG.LOGIN_PATH);
      });
    });

    // Drawer close clicks.
    var drawer = document.getElementById('shellDrawer');
    drawer.addEventListener('click', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.drawerClose !== undefined) closeDrawer();
      var btn = t.closest && t.closest('[data-drawer-close]');
      if (btn) closeDrawer();
    });
  }

  // -------------------------------------------------------------------
  // Drawer API
  // -------------------------------------------------------------------
  function openDrawer(opts) {
    var d   = document.getElementById('shellDrawer');
    var sub = document.getElementById('shellDrawerSub');
    var ttl = document.getElementById('shellDrawerTitle');
    var bod = document.getElementById('shellDrawerBody');
    var ft  = document.getElementById('shellDrawerFoot');

    sub.textContent = (opts && opts.eyebrow) || '';
    ttl.textContent = (opts && opts.title)   || '';
    bod.innerHTML   = (opts && opts.bodyHtml) || '';
    if (opts && opts.footHtml) {
      ft.innerHTML = opts.footHtml;
      ft.hidden = false;
    } else {
      ft.innerHTML = '';
      ft.hidden = true;
    }
    d.classList.add('is-open');
    d.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    var d = document.getElementById('shellDrawer');
    if (!d) return;
    d.classList.remove('is-open');
    d.setAttribute('aria-hidden', 'true');
  }

  // -------------------------------------------------------------------
  // Toast API
  // -------------------------------------------------------------------
  function toast(msg, kind) {
    var el = document.getElementById('shellToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'admin-toast visible' + (kind ? ' admin-toast-' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('visible'); }, 3200);
  }

  function setActive(id) {
    state.activeNav = id;
    renderSidebar();
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------
  function setText(id, txt) {
    var el = document.getElementById(id);
    if (el) el.textContent = txt == null ? '' : String(txt);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  function humanizeEmail(email) {
    if (!email) return 'Admin';
    var local = String(email).split('@')[0];
    return local.split(/[._-]/).map(function (p) {
      return p ? p[0].toUpperCase() + p.slice(1) : '';
    }).join(' ');
  }
  function initialsFor(name, email) {
    var src = (name || email || 'Admin').replace(/[^\p{Letter}\s]/gu, ' ').trim();
    var parts = src.split(/\s+/).slice(0, 2);
    var letters = parts.map(function (p) { return p ? p[0].toUpperCase() : ''; }).join('');
    return letters || 'OP';
  }
})();
