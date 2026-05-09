/* =========================================================================
   Ohio Pride PAC :: Admin auth gate (shared)
   -------------------------------------------------------------------------
   Drop into any /admin/* page that should require an authenticated session.
   Expects:
     - <span id="adminEmail"> for the signed-in email
     - <button id="signOutBtn"> for the sign-out button
     - <div id="loading"> shown while gating
     - <div id="panel"> the page body, hidden until auth is confirmed
   Loads after the supabase-js CDN script.
   ========================================================================= */
(function () {
  'use strict';

  var CONFIG = {
    SUPABASE_URL: 'https://dkdxefzhttkmjhdbkvqn.supabase.co',
    SUPABASE_ANON_KEY:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZHhlZnpodHRrbWpoZGJrdnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTk5NjksImV4cCI6MjA5MjM5NTk2OX0.l6wUMIdUX5Es4Jvh8fRTvnlYrMQKzYy_NEGBFJ1iMj4',
    LOGIN_PATH: '/admin/login',
  };

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('admin-auth: supabase-js not loaded');
    window.location.replace(CONFIG.LOGIN_PATH);
    return;
  }

  var client = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY,
    { auth: { detectSessionInUrl: true, persistSession: true } }
  );

  window.AdminAuth = { client: client, config: CONFIG };

  function gate() {
    client.auth
      .getSession()
      .then(function (res) {
        var session = res && res.data && res.data.session;
        if (!session) {
          window.location.replace(CONFIG.LOGIN_PATH);
          return;
        }
        var emailEl = document.getElementById('adminEmail');
        if (emailEl) emailEl.textContent = session.user.email || 'Admin';

        var loading = document.getElementById('loading');
        if (loading) loading.hidden = true;
        var panel = document.getElementById('panel');
        if (panel) panel.hidden = false;

        document.dispatchEvent(
          new CustomEvent('admin-auth-ready', { detail: { session: session } })
        );
      })
      .catch(function (err) {
        console.error('admin-auth: session check failed', err);
        window.location.replace(CONFIG.LOGIN_PATH);
      });

    var signOut = document.getElementById('signOutBtn');
    if (signOut) {
      signOut.addEventListener('click', function () {
        client.auth.signOut().finally(function () {
          window.location.replace(CONFIG.LOGIN_PATH);
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gate);
  } else {
    gate();
  }
})();
