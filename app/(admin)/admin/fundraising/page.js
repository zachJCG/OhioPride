'use client';
// Fundraising dashboard: the PAC raised row plus the prospect funnel.
// Reads public.fundraising_dashboard (one row of rollups) and
// public.pac_pipeline_by_stage (one row per stage with prospect_count),
// the same two sources the static console used.
//
// PAC money stands on its own and is never combined with any other entity.
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAdmin } from '../../lib/permissions';
import { money } from '../../lib/format';

const STAGES = [
  'identified', 'qualified', 'cultivating', 'ask_made', 'committed',
  'secured', 'stewardship', 'lapsed', 'declined',
];

const STAGE_LABEL = {
  identified: 'Identified', qualified: 'Qualified', cultivating: 'Cultivating',
  ask_made: 'Ask Made', committed: 'Committed', secured: 'Secured',
  stewardship: 'Stewardship', lapsed: 'Lapsed', declined: 'Declined',
};

const num = (v) => Number(v || 0);

export default function FundraisingPage() {
  const { loading: authLoading, can } = useAdmin();
  const canRead = can('fundraising', 'read');
  const canPac = can('pac_prospects', 'read');

  const [data, setData] = useState(null);
  const [byStage, setByStage] = useState([]);
  const [error, setError] = useState(null);
  const [warn, setWarn] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !canRead) return;
    let cancelled = false;
    (async () => {
      const sb = supabase();
      const [dash, stages] = await Promise.all([
        sb.from('fundraising_dashboard').select('*').maybeSingle(),
        canPac ? sb.from('pac_pipeline_by_stage').select('*') : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      if (dash.error) setError('Could not load the fundraising dashboard. ' + dash.error.message);
      else setData(dash.data || {});
      if (stages.error) setWarn('The pipeline funnel did not load. ' + stages.error.message);
      else setByStage(stages.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, canRead, canPac]);

  if (!authLoading && !canRead) {
    return (
      <div className="alert alert-error">
        The fundraising module is limited by role. Ask the Director if you need it.
      </div>
    );
  }

  const d = data || {};
  const foundingCount = num(d.founding_members_count);
  const target = num(d.founding_members_target) || 1969;
  const pct = target > 0 ? Math.min(100, Math.round((foundingCount / target) * 1000) / 10) : 0;
  const toGo = Math.max(0, target - foundingCount);

  const stageMap = {};
  byStage.forEach((r) => { stageMap[r.stage] = r; });
  const maxCount = STAGES.reduce((m, s) => Math.max(m, num(stageMap[s]?.prospect_count)), 0);
  const funnelTotal = STAGES.reduce((t, s) => t + num(stageMap[s]?.prospect_count), 0);

  return (
    <>
      <div className="page-head">
        <h2>Fundraising</h2>
        <p className="sub">PAC money: founding members, secured gifts, and the individual pipeline.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {warn && <div className="alert alert-warn">{warn}</div>}

      <div className="card" role="note" style={{ marginBottom: 12 }}>
        <span className="badge badge-founding">Scope</span>
        <p style={{ margin: '6px 0 0', fontWeight: 700 }}>
          This dashboard tracks Ohio Pride PAC money only.
        </p>
        <p className="muted small" style={{ margin: '2px 0 0' }}>
          Political committee funds. Figures here are never combined with any other entity.
        </p>
      </div>

      {loading && !error ? <div className="card">Loading the numbers…</div> : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="num">{money(num(d.secured_pac_cents))}</div>
              <div className="lbl">Total raised (PAC)</div>
              <div className="sub">Founding members plus other PAC gifts</div>
            </div>
            <div className="kpi">
              <div className="num">{num(d.other_pac_donors_count).toLocaleString()}</div>
              <div className="lbl">Other PAC donors</div>
              <div className="sub">Gifts outside the founding member drive</div>
            </div>
            <div className="kpi">
              <div className="num">
                {foundingCount.toLocaleString()}
                <span className="muted" style={{ fontSize: '.85rem' }}> / {target.toLocaleString()}</span>
              </div>
              <div className="lbl">Founding members</div>
              <div className="meter" style={{ marginTop: 6 }}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="sub">{pct}% to goal, {toGo.toLocaleString()} to go</div>
            </div>
          </div>

          {canPac ? (
            <>
              <div className="page-head" style={{ marginTop: 18 }}>
                <h2 style={{ fontSize: '1.05rem' }}>Individual pipeline</h2>
                <p className="sub">Where Ohio Pride PAC prospects stand right now.</p>
              </div>

              <div className="kpi-grid">
                <div className="kpi">
                  <div className="num">{num(d.pac_pipeline_count).toLocaleString()}</div>
                  <div className="lbl">In pipeline</div>
                </div>
                <div className="kpi">
                  <div className="num">{money(num(d.pac_committed_cents))}</div>
                  <div className="lbl">Committed</div>
                </div>
                <div className="kpi">
                  <div className="num">{money(num(d.pac_capacity_cents))}</div>
                  <div className="lbl">Capacity</div>
                </div>
              </div>
              <p className="muted small" style={{ margin: '-4px 0 10px' }}>
                Capacity is demonstrated capacity from the public record, not pledged.
              </p>

              <div className="card">
                <strong style={{ font: '700 .95rem var(--op-font-head)' }}>Pipeline by stage</strong>
                {funnelTotal === 0 ? (
                  <p className="muted small" style={{ margin: '8px 0 0' }}>
                    No prospects are sitting in a stage yet. Add the first one from the pipeline.
                  </p>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    {STAGES.map((s) => {
                      const count = num(stageMap[s]?.prospect_count);
                      const width = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                      return (
                        <div className="bar-row" key={s}>
                          <span className="muted">{STAGE_LABEL[s]}</span>
                          <span className="meter"><span style={{ width: `${width}%` }} /></span>
                          <strong>{count.toLocaleString()}</strong>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="page-actions" style={{ marginBottom: 0 }}>
                  <a className="btn btn-primary" href="/admin/prospects">Open the pipeline</a>
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <strong>Pipeline detail is limited by role</strong>
              <p className="muted small" style={{ marginBottom: 0 }}>
                You have fundraising access, but the prospect pipeline holds researched capacity on named
                people and needs its own permission. Ask the Director if you need it.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
