'use client';
// Board roster, read from public.board_members. Read only by design: the RLS
// policy on that table allows anon and authenticated SELECT of active rows and
// restricts every write to the service role, so there is nothing to edit here.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import { shortDate } from '../../lib/format';

// Columns the card lays out itself. Anything else that comes back from
// select('*') is rendered generically, so a column added later still shows up.
const HANDLED = new Set([
  'id', 'name', 'role', 'chip', 'img_path', 'bio', 'display_order', 'is_active', 'created_at', 'updated_at',
]);

const CHIP_BADGE = {
  'is-director': 'badge-founding',
  'is-treasurer': 'badge-ok',
  'is-secretary': 'badge-review',
  'is-comms': 'badge-muted',
};

const GRID_STYLE = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  alignItems: 'start',
};

const pretty = (s) => {
  const t = String(s || '').replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

const initials = (name) => String(name || '?')
  .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// bio is a jsonb array of paragraph strings, but tolerate a single string too.
function bioParagraphs(bio) {
  if (Array.isArray(bio)) return bio.map(p => String(p || '').trim()).filter(Boolean);
  if (typeof bio === 'string' && bio.trim()) return [bio.trim()];
  return [];
}

function extraFields(row) {
  return Object.entries(row)
    .filter(([k, v]) => !HANDLED.has(k) && v != null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => ({ key: k, label: pretty(k), value: typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v) }));
}

function Avatar({ src, name }) {
  const [broken, setBroken] = useState(false);
  const box = {
    width: 56, height: 56, borderRadius: '50%', flex: '0 0 auto',
    background: 'var(--op-navy)', color: '#fff', display: 'grid', placeItems: 'center',
    font: '700 1rem var(--op-font-head)', objectFit: 'cover', overflow: 'hidden',
  };
  if (!src || broken) return <div style={box} aria-hidden="true">{initials(name)}</div>;
  return <img src={src} alt="" style={box} onError={() => setBroken(true)} loading="lazy" />;
}

function BoardCard({ member }) {
  const [openBio, setOpenBio] = useState(false);
  const paras = bioParagraphs(member.bio);
  const extras = extraFields(member);
  const badgeClass = CHIP_BADGE[member.chip] || 'badge-muted';

  return (
    <article className="card">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Avatar src={member.img_path} name={member.name} />
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{member.name}</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {member.role && <span className={`badge ${badgeClass}`}>{member.role}</span>}
            {member.is_active === false && <span className="badge badge-bad">Hidden</span>}
          </div>
        </div>
      </div>

      {extras.length > 0 && (
        <div className="detail-grid">
          {extras.map(f => (
            <div key={f.key}>
              <div className="lbl">{f.label}</div>
              <div className="val">{f.value}</div>
            </div>
          ))}
        </div>
      )}

      {paras.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <p className="small" style={{ margin: 0 }}>{paras[0]}</p>
          {openBio && paras.slice(1).map((p, i) => (
            <p key={i} className="small" style={{ margin: '8px 0 0' }}>{p}</p>
          ))}
          {paras.length > 1 && (
            <button className="btn btn-sm" style={{ marginTop: 10 }}
                    aria-expanded={openBio} onClick={() => setOpenBio(o => !o)}>
              {openBio ? 'Hide the rest' : `Read full bio (${paras.length} paragraphs)`}
            </button>
          )}
        </div>
      ) : (
        <p className="muted small" style={{ margin: '10px 0 0' }}>No bio on file yet.</p>
      )}

      {member.updated_at && (
        <div className="muted small" style={{ marginTop: 10 }}>Updated {shortDate(member.updated_at)}</div>
      )}
    </article>
  );
}

export default function BoardPage() {
  const { loading: authLoading, can } = useAdmin();

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase()
      .from('board_members')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });
    if (err) {
      setError(err.message);
      setRows(null);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const withPhotos = useMemo(() => (rows || []).filter(m => m.img_path).length, [rows]);

  if (!authLoading && !can('board', 'read')) {
    return <div className="alert alert-error">The board module is limited by role. Ask the Director if you need it.</div>;
  }

  return (
    <>
      <div className="page-head">
        <h2>Board</h2>
        <p className="sub">The Ohio Pride PAC board roster, exactly as the public site reads it.</p>
      </div>

      {error && (
        <div className="alert alert-error">
          Could not load the board roster: {error}
        </div>
      )}

      <div className="page-actions">
        <button className="btn btn-sm" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        {rows && (
          <span className="muted small" style={{ alignSelf: 'center' }}>
            {rows.length} member{rows.length === 1 ? '' : 's'}
            {rows.length ? `, ${withPhotos} with a photo` : ''}
          </span>
        )}
      </div>

      {loading && !rows ? (
        <div className="card">Loading the roster…</div>
      ) : rows && rows.length ? (
        <div style={GRID_STYLE}>
          {rows.map(m => <BoardCard key={m.id} member={m} />)}
        </div>
      ) : rows && !rows.length ? (
        <div className="card muted">No board members are on the roster yet.</div>
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <p className="small" style={{ margin: 0 }}>
          The public board page on ohiopride.org is served from this same table, so whatever is listed here
          is what visitors see. This screen is read only. Only active members are readable, and the database
          restricts every edit to a server side key, so changes to names, roles, bios, and photos go through
          a migration or a direct update rather than this page.
        </p>
      </div>
    </>
  );
}
