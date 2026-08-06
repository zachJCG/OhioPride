'use client';
// Admin sign-in. Sessions are cookie-based (@supabase/ssr), so the /admin
// middleware gate and the not-yet-ported static admin pages all see the same
// sign-in. Also handles the set-password flows: Supabase reset links land
// here with type=recovery in the URL hash, and invite links with type=invite.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  // Capture email-link arrivals synchronously, before the auth client strips
  // them: implicit-flow links put type=recovery/invite in the hash, and the
  // PKCE flow (what @supabase/ssr uses) lands with ?code=. Either one means
  // "finish by setting a password", never a bounce to the dashboard.
  const [cameFromEmailLink] = useState(() =>
    typeof window !== 'undefined' && (
      window.location.hash.indexOf('type=recovery') !== -1 ||
      window.location.hash.indexOf('type=invite') !== -1 ||
      new URLSearchParams(window.location.search).has('code')
    ));
  const [view, setView] = useState(() => (cameFromEmailLink ? 'reset' : 'signin'));
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState(null); // { kind: 'error'|'ok', msg }

  useEffect(() => {
    const { data: sub } = supabase().auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setView('reset');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // The middleware deliberately never bounces /admin/login (it would strip
  // the PKCE ?code=). Forward already-signed-in visitors from here instead,
  // but never while they are mid set-password.
  useEffect(() => {
    if (cameFromEmailLink) return;
    supabase().auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.replace(nextPath());
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nextPath = () => {
    const next = new URLSearchParams(window.location.search).get('next');
    return next && next.startsWith('/admin') ? next : '/admin/dashboard';
  };

  async function signIn(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const email = String(form.get('email') || '').trim().toLowerCase();
    const password = String(form.get('password') || '');
    if (!email || !password) { setAlert({ kind: 'error', msg: 'Please enter your email and password.' }); return; }
    setBusy(true); setAlert(null);
    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      const msg = error?.message || '';
      setAlert({ kind: 'error', msg: /invalid login credentials/i.test(msg)
        ? 'Incorrect email or password.'
        : /email not confirmed/i.test(msg)
          ? 'Email not confirmed. Check your inbox for the confirmation link.'
          : (msg || 'Could not sign in. Please try again.') });
      setBusy(false);
      return;
    }
    window.location.assign(nextPath());
  }

  async function forgot() {
    const email = String(document.getElementById('email')?.value || '').trim().toLowerCase();
    if (!email) { setAlert({ kind: 'error', msg: 'Enter your email address above first, then use the reset link.' }); return; }
    const { error } = await supabase().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/admin/login',
    });
    setAlert(error
      ? { kind: 'error', msg: error.message || 'Could not send reset link.' }
      : { kind: 'ok', msg: 'Password reset link sent to ' + email + '. Follow it to set a new password.' });
  }

  async function setNewPassword(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    const pw = String(form.get('password') || '');
    const pw2 = String(form.get('confirm') || '');
    if (pw.length < 8) { setAlert({ kind: 'error', msg: 'Password must be at least 8 characters.' }); return; }
    if (pw !== pw2) { setAlert({ kind: 'error', msg: 'The two passwords do not match.' }); return; }
    setBusy(true); setAlert(null);
    const { error } = await supabase().auth.updateUser({ password: pw });
    if (error) {
      const msg = error.message || '';
      setAlert({ kind: 'error', msg: /session|jwt|token|expired/i.test(msg)
        ? 'Your reset link has expired. Go back to sign in and request a new one.'
        : /different from the old|should be different/i.test(msg)
          ? 'Choose a password different from your current one.'
          : (msg || 'Could not update password. Please try again.') });
      setBusy(false);
      return;
    }
    setAlert({ kind: 'ok', msg: 'Password updated. Signing you in…' });
    setTimeout(() => window.location.assign('/admin/dashboard'), 700);
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/assets/logo/wordmark-primary-on-white.svg" alt="Ohio Pride PAC" height="30" style={{ marginBottom: 14 }} />
        {view === 'signin' ? (
          <>
            <h1>Admin sign in</h1>
            <p className="muted small" style={{ margin: '0 0 12px' }}>Board and staff access only.</p>
            {alert && <div className={`alert alert-${alert.kind === 'ok' ? 'ok' : 'error'}`} role="alert">{alert.msg}</div>}
            <form onSubmit={signIn}>
              <label className="field"><span>Email</span>
                <input className="input" id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
              </label>
              <label className="field"><span>Password</span>
                <input className="input" name="password" type="password" autoComplete="current-password" required />
              </label>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p className="small" style={{ marginTop: 12 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); forgot(); }}>Forgot your password?</a>
            </p>
          </>
        ) : (
          <>
            <h1>Set your password</h1>
            <p className="muted small" style={{ margin: '0 0 12px' }}>You followed a reset or invite link. Choose a password to finish.</p>
            {alert && <div className={`alert alert-${alert.kind === 'ok' ? 'ok' : 'error'}`} role="alert">{alert.msg}</div>}
            <form onSubmit={setNewPassword}>
              <label className="field"><span>New password</span>
                <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <label className="field"><span>Confirm password</span>
                <input className="input" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
                {busy ? 'Saving…' : 'Set password and sign in'}
              </button>
            </form>
            <p className="small" style={{ marginTop: 12 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); setView('signin'); setAlert(null); }}>← Back to sign in</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
