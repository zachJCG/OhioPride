// src/app/(admin)/admin/members/[id]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMember } from '@/lib/data/members';

export const dynamic = 'force-dynamic';

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getMember(id);
  if (!m) notFound();

  return (
    <div className="space-y-6 p-6">
      <Link href="/admin/members" className="text-sm text-[#0F2233] hover:underline">
        ← Members
      </Link>

      <header>
        <div className="flex items-center gap-3">
          <span className="font-mono text-gray-400">#{m.founding_number ?? '—'}</span>
          <h1 className="text-2xl font-semibold text-[#0F2233]">{m.display_name}</h1>
          {m.is_vetted ? (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">Vetted</span>
          ) : (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Pending vetting</span>
          )}
        </div>
        <p className="text-sm text-gray-500">{m.tier} · joined {m.contributed_at ? new Date(m.contributed_at).toLocaleDateString() : '—'}</p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Full name" value={m.full_name} />
        <Field label="Email" value={m.email} />
        <Field label="Location" value={[m.city, m.county, m.state].filter(Boolean).join(', ')} />
        <Field label="Amount" value={m.amount_cents != null ? `$${(m.amount_cents / 100).toFixed(2)}${m.recurrence === 'monthly' ? '/mo' : ''}` : null} />
        <Field label="Elected office" value={[m.elected_office, m.jurisdiction].filter(Boolean).join(', ') || null} />
        <Field label="Public quote" value={m.public_quote} />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Donor record</div>
          {m.donor_id ? (
            <p className="mt-1 text-sm text-green-700">Linked donor ✓ (source: {m.donor_source})</p>
          ) : (
            <p className="mt-1 text-sm text-gray-400">No donor record yet — created automatically on next sync.</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase text-gray-500">Prospect</div>
          {m.prospect_id ? (
            <Link href={`/admin/prospects/${m.prospect_id}`} className="mt-1 block text-sm text-[#0F2233] hover:underline">
              In pipeline — stage: {m.prospect_stage ?? 'n/a'}
            </Link>
          ) : (
            <p className="mt-1 text-sm text-gray-400">Not in the prospecting pipeline.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-sm text-gray-800">{value || '—'}</div>
    </div>
  );
}
