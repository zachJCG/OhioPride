// GET /api/endorsement-pdf?id=<application uuid>   -> one candidate packet PDF
// GET /api/endorsement-pdf?all=open                -> combined packet of all open applications
//
// Auth: Authorization: Bearer <supabase access token>; RLS + has_permission('endorsements','read') gate the data.
// Requires: npm i @react-pdf/renderer   Runtime: nodejs (not edge).
import React from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../lib/supabase-public.mjs';
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export const runtime = 'nodejs';

const NAVY = '#0F2233', BLUE = '#73D7EE', LINE = '#D8E2EA', MUTED = '#5B6B77';

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, fontSize: 9.5, color: '#10202E', fontFamily: 'Helvetica' },
  cover: { backgroundColor: NAVY, color: '#FFFFFF', margin: -44, marginTop: -40, padding: 44, paddingBottom: 22, marginBottom: 18 },
  kicker: { fontSize: 8, letterSpacing: 2, color: BLUE, marginBottom: 6, textTransform: 'uppercase' },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 10, marginTop: 4, color: '#D9E6EE' },
  h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 14, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1.5, borderBottomColor: BLUE },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', marginBottom: 5 },
  lbl: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  val: { fontSize: 9.5 },
  q: { fontFamily: 'Helvetica-Bold', marginTop: 7 },
  a: { marginTop: 2, lineHeight: 1.45 },
  ans: { fontFamily: 'Helvetica-Bold' },
  tallyRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  tallyBox: { flexGrow: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8, textAlign: 'center' },
  review: { borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 4, flexDirection: 'row', justifyContent: 'space-between' },
  foot: { position: 'absolute', bottom: 20, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
});

const label = (k) => ({ endorse: 'Endorse', lean_endorse: 'Lean endorse', neutral: 'Neutral', lean_decline: 'Lean decline', decline: 'Decline', abstain: 'Abstain', recuse: 'Recuse' }[k] || k);
const yn = (v) => v === true ? 'Yes' : v === false ? 'No' : '—';
const dt = (v) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const LEGACY_QS = [
  ['q1_nondiscrimination', 'q1_explanation', 'Supports comprehensive nondiscrimination protections'],
  ['q2_anti_lgbtq_legislation', 'q2_explanation', 'Will oppose anti-LGBTQ+ legislation'],
  ['q3_conversion_therapy', 'q3_explanation', 'Supports banning conversion therapy'],
  ['q4_inclusive_education', 'q4_explanation', 'Supports inclusive education'],
  ['q5_vote_against_rollbacks', 'q5_explanation', 'Will vote against rollbacks of existing protections'],
];
const LEGACY_TEXT = [
  ['q6_priorities', 'Top priorities'], ['q7_legislation', 'Legislation they would champion'],
  ['q8_safety', 'Community safety'], ['q9_intersection', 'Intersectional equity'], ['q10_why_endorsement', 'Why they seek this endorsement'],
];

function Packet({ app, questions, reviews, activity }) {
  const qa = [];
  const responses = app.responses || {};
  const pathQs = (questions || []).filter(q => q.path === app.endorsement_path && q.active !== false)
                                  .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  if (pathQs.length && Object.keys(responses).length) {
    for (const q of pathQs) {
      const r = responses[q.question_key];
      if (r === undefined || r === null || r === '') continue;
      const ans = typeof r === 'object' ? r : { value: r };
      qa.push({ prompt: q.prompt, value: typeof ans.value === 'boolean' ? yn(ans.value) : String(ans.value ?? ''), explanation: ans.explanation || '' });
    }
  } else {
    for (const [k, ek, prompt] of LEGACY_QS) if (app[k] !== null && app[k] !== undefined) qa.push({ prompt, value: yn(app[k]), explanation: app[ek] || '' });
    for (const [k, prompt] of LEGACY_TEXT) if (app[k]) qa.push({ prompt, value: '', explanation: app[k] });
  }

  const buckets = { for: 0, against: 0, other: 0 };
  for (const r of reviews) {
    if (['endorse', 'lean_endorse'].includes(r.vote)) buckets.for++;
    else if (['decline', 'lean_decline'].includes(r.vote)) buckets.against++;
    else buckets.other++;
  }

  return (
    <Page size="LETTER" style={s.page} wrap>
      <View style={s.cover}>
        <Text style={s.kicker}>Ohio Pride PAC · Endorsement File</Text>
        <Text style={s.h1}>{app.candidate_name || [app.first_name, app.last_name].filter(Boolean).join(' ')}</Text>
        <Text style={s.sub}>
          {[app.office_sought, app.district && `District ${app.district}`, app.party, app.election_year].filter(Boolean).join('  ·  ')}
        </Text>
        <Text style={{ ...s.sub, marginTop: 6 }}>Status: {(app.status || 'submitted').replace(/_/g, ' ')}   ·   Submitted {dt(app.created_at)}</Text>
      </View>

      <Text style={s.h2}>Candidate</Text>
      <View style={s.grid}>
        {[['Pronouns', app.pronouns], ['Out', app.is_out], ['Incumbent', yn(app.is_incumbent)], ['Current office', app.current_office],
          ['Committee', app.committee_name], ['Treasurer', app.treasurer_name], ['Email', app.email], ['Phone', app.phone],
          ['Website', app.website], ['Path', app.endorsement_path], ['Office category', app.office_category],
          ['Special election', yn(app.is_special_election)]]
          .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== '—')
          .map(([l, v]) => (
            <View key={l} style={s.cell}><Text style={s.lbl}>{l}</Text><Text style={s.val}>{String(v)}</Text></View>
          ))}
      </View>
      {app.bio ? (<><Text style={s.h2}>Bio</Text><Text style={s.a}>{app.bio}</Text></>) : null}

      <Text style={s.h2}>Questionnaire</Text>
      {qa.length ? qa.map((x, i) => (
        <View key={i} wrap={false}>
          <Text style={s.q}>{x.prompt}</Text>
          {x.value ? <Text style={s.a}><Text style={s.ans}>{x.value}</Text>{x.explanation ? ` — ${x.explanation}` : ''}</Text>
                   : <Text style={s.a}>{x.explanation}</Text>}
        </View>
      )) : <Text style={s.a}>No questionnaire responses on file.</Text>}
      {app.conflicts_disclosure ? (<><Text style={s.h2}>Disclosures</Text><Text style={s.a}>{app.conflicts_disclosure}</Text></>) : null}

      <Text style={s.h2}>Board review</Text>
      <View style={s.tallyRow}>
        <View style={s.tallyBox}><Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>{buckets.for}</Text><Text style={s.lbl}>For</Text></View>
        <View style={s.tallyBox}><Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>{buckets.against}</Text><Text style={s.lbl}>Against</Text></View>
        <View style={s.tallyBox}><Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>{buckets.other}</Text><Text style={s.lbl}>Other</Text></View>
      </View>
      {reviews.map(r => (
        <View key={r.id} style={s.review}>
          <Text>{r.reviewer_name || r.reviewer_email}</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{label(r.vote)}{r.recommendation ? `  ·  ${r.recommendation}` : ''}</Text>
        </View>
      ))}
      {!reviews.length && <Text style={s.a}>No votes recorded yet.</Text>}

      {activity.length ? (<>
        <Text style={s.h2}>Activity</Text>
        {activity.slice(0, 14).map(a => (
          <Text key={a.id} style={{ marginBottom: 2 }}>{dt(a.created_at)} — {a.summary || a.event_type}</Text>
        ))}
      </>) : null}

      <View style={s.foot} fixed>
        <Text>Internal — Ohio Pride PAC endorsement file. Not for distribution.</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

export async function GET(req) {
  const auth = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/i);
  if (!auth) return new Response(JSON.stringify({ ok: false, error: 'missing_bearer' }), { status: 401 });

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${auth[1]}` } },
  });
  const { data: allowed } = await sb.rpc('has_permission', { p_module: 'endorsements', p_action: 'read' });
  if (!allowed) return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const all = url.searchParams.get('all');

  let apps = [];
  if (id) {
    const { data, error } = await sb.from('endorsement_applications').select('*').eq('id', id).limit(1);
    if (error || !data?.length) return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404 });
    apps = data;
  } else if (all === 'open') {
    const { data } = await sb.from('endorsement_applications').select('*')
      .in('status', ['submitted', 'under_review']).order('created_at');
    apps = data || [];
  } else {
    return new Response(JSON.stringify({ ok: false, error: 'pass ?id=<uuid> or ?all=open' }), { status: 400 });
  }

  const ids = apps.map(a => a.id);
  const [qRes, rRes, aRes] = await Promise.all([
    sb.from('endorsement_questions').select('*'),
    sb.from('endorsement_reviews').select('*').in('application_id', ids),
    sb.from('endorsement_activity').select('*').in('application_id', ids).order('created_at', { ascending: false }),
  ]);
  const failed = [qRes, rRes, aRes].find(r => r.error);
  if (failed) {
    // A packet that silently claims zero votes is worse than no packet.
    return new Response(JSON.stringify({ ok: false, error: 'packet_query_failed', detail: failed.error.message }), { status: 500 });
  }
  const questions = qRes.data, reviews = rRes.data, activity = aRes.data;

  const doc = (
    <Document title="Ohio Pride PAC — Endorsement Packet" author="Ohio Pride PAC">
      {apps.map(app => (
        <Packet key={app.id} app={app} questions={questions || []}
          reviews={(reviews || []).filter(r => r.application_id === app.id)}
          activity={(activity || []).filter(a => a.application_id === app.id)} />
      ))}
    </Document>
  );
  const buf = await renderToBuffer(doc);
  const name = apps.length === 1
    ? `endorsement-${(apps[0].candidate_name || 'candidate').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`
    : `endorsement-packet-open-applications.pdf`;

  return new Response(buf, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  });
}
