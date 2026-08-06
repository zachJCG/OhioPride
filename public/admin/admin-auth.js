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

  // -------------------------------------------------------------------
  // Cookie-backed auth storage, format-compatible with @supabase/ssr.
  // Static admin pages and the ported App Router pages (plus the /admin
  // middleware gate) all read the same sb-<ref>-auth-token[.n] cookies,
  // so one sign-in covers both worlds. Values are "base64-" + base64url
  // of the session JSON, chunked at 3180 chars like @supabase/ssr does.
  // -------------------------------------------------------------------
  function cookieAuthStorage() {
    var MAX = 3180;

    function readCookie(name) {
      var target = name + '=';
      var parts = document.cookie ? document.cookie.split('; ') : [];
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].indexOf(target) === 0) {
          var raw = parts[i].slice(target.length);
          try { return decodeURIComponent(raw); } catch (e) { return raw; }
        }
      }
      return null;
    }
    function writeCookie(name, value) {
      var secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = name + '=' + value + '; Path=/; Max-Age=' + (400 * 24 * 60 * 60) + '; SameSite=Lax' + secure;
    }
    function clearCookie(name) {
      document.cookie = name + '=; Path=/; Max-Age=0; SameSite=Lax';
    }
    function toBase64Url(str) {
      var bytes = new TextEncoder().encode(str);
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function fromBase64Url(b64url) {
      var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }

    return {
      getItem: function (key) {
        var v = readCookie(key);
        if (!v) {
          var parts = [];
          for (var i = 0; ; i++) {
            var c = readCookie(key + '.' + i);
            if (!c) break;
            parts.push(c);
          }
          v = parts.length ? parts.join('') : null;
        }
        if (!v) {
          // One-time migration of a pre-cutover localStorage session.
          try {
            var ls = window.localStorage.getItem(key);
            if (ls) {
              this.setItem(key, ls);
              try { window.localStorage.removeItem(key); } catch (e) {}
              return ls;
            }
          } catch (e) {}
          return null;
        }
        if (v.indexOf('base64-') === 0) {
          try { return fromBase64Url(v.slice(7)); } catch (e) { return null; }
        }
        return v;
      },
      setItem: function (key, value) {
        this.removeItem(key);
        // base64url output is cookie- and URI-safe, so raw slicing lines up
        // with @supabase/ssr's encoded-length chunking.
        var encoded = 'base64-' + toBase64Url(String(value));
        if (encoded.length <= MAX) { writeCookie(key, encoded); return; }
        var n = 0;
        for (var pos = 0; pos < encoded.length; pos += MAX) {
          writeCookie(key + '.' + (n++), encoded.slice(pos, pos + MAX));
        }
      },
      removeItem: function (key) {
        clearCookie(key);
        for (var i = 0; ; i++) {
          if (readCookie(key + '.' + i) == null) break;
          clearCookie(key + '.' + i);
        }
      }
    };
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('admin-auth: supabase-js not loaded');
    window.location.replace(CONFIG.LOGIN_PATH);
    return;
  }

  var client = window.supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY,
    { auth: { detectSessionInUrl: true, persistSession: true, storage: cookieAuthStorage() } }
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
