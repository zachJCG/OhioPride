'use client';
// Admin error boundary. Without one, any client-side throw renders Next's bare
// "Application error: a client-side exception has occurred" on a blank page,
// with no way back — which is exactly what a missing Supabase config did to
// the login screen on 2026-08-06. This keeps the admin recoverable and says
// what to do next.
import { useEffect } from 'react';

export default function AdminError({ error, reset }) {
  useEffect(() => {
    console.error('admin error boundary:', error);
  }, [error]);

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ font: '800 1.25rem var(--op-font-head)', color: 'var(--op-navy)', margin: '0 0 6px' }}>
        Something broke on this screen
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        The page hit an unexpected error. Your session is fine, so try again or
        head back to the dashboard.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
        <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
        <a className="btn" href="/admin/dashboard">Dashboard</a>
        <a className="btn" href="/admin/login">Sign in again</a>
      </div>
      {error?.message && (
        <pre className="small muted" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--op-card)', border: '1px solid var(--op-line)', borderRadius: 10, padding: 10 }}>
          {error.message}
        </pre>
      )}
    </div>
  );
}
