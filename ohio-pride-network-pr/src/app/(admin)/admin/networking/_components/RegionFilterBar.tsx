'use client';
// src/app/(admin)/admin/networking/_components/RegionFilterBar.tsx
import { useRouter, useSearchParams } from 'next/navigation';

export function RegionFilterBar({
  regions,
}: {
  regions: string[];
  active?: { region?: string; view?: string; q?: string };
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value?: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/admin/networking?${next.toString()}`);
  }

  const region = sp.get('region') ?? '';
  const view = sp.get('view') ?? '';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <input
        defaultValue={sp.get('q') ?? ''}
        placeholder="Search name…"
        onKeyDown={(e) => {
          if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value || undefined);
        }}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
      />
      <select
        value={region}
        onChange={(e) => setParam('region', e.target.value || undefined)}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
      >
        <option value="">All regions</option>
        {regions.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <div className="ml-auto flex gap-1">
        {[
          { k: '', label: 'All' },
          { k: 'targets', label: 'Targets' },
          { k: 'connectors', label: 'Connectors' },
        ].map((b) => (
          <button
            key={b.k}
            onClick={() => setParam('view', b.k || undefined)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              view === b.k ? 'bg-[#0F2233] text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
