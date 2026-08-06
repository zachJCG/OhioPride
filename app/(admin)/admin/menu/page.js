'use client';
// "More" tab: the full module list, the signed-in identity, and sign out.
import { useAdmin } from '../../lib/permissions';
import { NAV } from '../../nav.config';

export default function MenuPage() {
  const { loading, me, roles, can, signOut } = useAdmin();
  if (loading) return <div className="card">Loading…</div>;

  if (!me) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>No admin access</h3>
        <p className="muted">Your account is signed in but has no active admin profile. Ask the Director if you should have one.</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  const visible = NAV.map(g => ({ ...g, items: g.items.filter(i => can(...i.permission)) }))
                     .filter(g => g.items.length);

  return (
    <>
      <div className="page-head"><h2>Menu</h2></div>

      <div className="card" style={{ marginBottom: 14 }}>
        <strong>{me.full_name || me.email}</strong>
        <div className="muted small">{me.email}</div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {roles.map(r => <span key={r} className="badge badge-muted">{r.replace(/_/g, ' ')}</span>)}
        </div>
      </div>

      {visible.map(g => (
        <section key={g.group} style={{ marginBottom: 14 }}>
          <div className="muted small" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 6px' }}>{g.group}</div>
          <div className="stack">
            {g.items.map(i => (
              <a key={i.id} className="item" href={i.href}>
                <span style={{ fontWeight: 600 }}>{i.label}</span>
                <span className="muted" aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </section>
      ))}

      <div className="stack" style={{ marginTop: 18 }}>
        <a className="item" href="https://ohiopride.org" target="_blank" rel="noopener noreferrer">
          <span>View public site</span><span className="muted" aria-hidden="true">↗</span>
        </a>
        <button className="item" style={{ border: '1px solid var(--op-line)', font: 'inherit', cursor: 'pointer', color: 'var(--op-bad)', fontWeight: 700 }} onClick={signOut}>
          Sign out
        </button>
      </div>
    </>
  );
}
