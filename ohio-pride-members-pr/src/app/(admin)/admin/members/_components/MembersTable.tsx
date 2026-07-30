// src/app/(admin)/admin/members/_components/MembersTable.tsx
import Link from 'next/link';
import type { MemberCrmRow } from '@/types/members';

function dollars(cents: number | null) {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}
function date(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : '—';
}

export function MembersTable({ members }: { members: MemberCrmRow[] }) {
  if (members.length === 0) {
    return <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">No members match.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Member</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2">Amount</th>
            <th className="px-3 py-2">Joined</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Donor / Prospect</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-gray-500">{m.founding_number ?? '—'}</td>
              <td className="px-3 py-2">
                <Link href={`/admin/members/${m.id}`} className="font-medium text-[#0F2233] hover:underline">
                  {m.display_name}
                </Link>
                {m.full_name && m.full_name !== m.display_name && (
                  <div className="text-xs text-gray-400">{m.full_name}</div>
                )}
                {m.email && <div className="text-xs text-gray-500">{m.email}</div>}
              </td>
              <td className="px-3 py-2 text-gray-600">
                {[m.city, m.county, m.state].filter(Boolean).join(', ') || '—'}
              </td>
              <td className="px-3 py-2 text-gray-600">{m.tier ?? '—'}</td>
              <td className="px-3 py-2">
                {dollars(m.amount_cents)}
                {m.recurrence === 'monthly' && <span className="text-xs text-gray-400">/mo</span>}
              </td>
              <td className="px-3 py-2 text-gray-600">{date(m.contributed_at)}</td>
              <td className="px-3 py-2">
                {m.is_vetted ? (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">VETTED</span>
                ) : (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">PENDING</span>
                )}
                {!m.is_public && <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">PRIVATE</span>}
              </td>
              <td className="px-3 py-2 text-xs">
                <span className={m.donor_id ? 'text-green-600' : 'text-gray-400'}>
                  {m.donor_id ? 'donor ✓' : 'no donor'}
                </span>
                {' · '}
                <span className={m.prospect_id ? 'text-[#0F2233]' : 'text-gray-400'}>
                  {m.prospect_stage ?? (m.prospect_id ? 'prospect' : '—')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
