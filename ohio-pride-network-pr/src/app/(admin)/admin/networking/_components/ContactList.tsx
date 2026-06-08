// src/app/(admin)/admin/networking/_components/ContactList.tsx
import Link from 'next/link';
import type { NetworkContactDirectoryRow } from '@/types/networking';

const warmthColor: Record<string, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-amber-100 text-amber-700',
  cold: 'bg-gray-100 text-gray-600',
};

export function ContactList({ contacts }: { contacts: NetworkContactDirectoryRow[] }) {
  if (contacts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        No contacts match these filters.
      </p>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {contacts.map((c) => (
        <Link
          key={c.id}
          href={`/admin/networking/${c.id}`}
          className="rounded-xl border border-gray-200 bg-white p-4 hover:border-[#73D7EE]"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium text-[#0F2233]">{c.full_name}</div>
              <div className="text-xs text-gray-500">
                {[c.title, c.organization].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${warmthColor[c.warmth ?? 'cold']}`}>
              {c.warmth ?? 'cold'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
            {c.is_target && <span className="rounded bg-[#0F2233] px-1.5 py-0.5 text-white">TARGET</span>}
            {c.is_connector && <span className="rounded bg-[#73D7EE]/30 px-1.5 py-0.5 text-[#0F2233]">CONNECTOR</span>}
            {c.region && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{c.region}</span>}
            {c.county && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{c.county}</span>}
          </div>
          <div className="mt-3 flex justify-between text-xs text-gray-500">
            <span>{c.inbound_path_count} ways in</span>
            <span>{c.outbound_intro_count} can open</span>
            <span>{c.activity_count} touches</span>
          </div>
          {c.next_action && (
            <div className="mt-2 text-xs text-gray-700">
              <span className="font-medium">Next:</span> {c.next_action}
              {c.next_action_date && <span className="text-gray-400"> ({c.next_action_date})</span>}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
