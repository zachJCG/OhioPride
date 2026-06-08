// src/app/(admin)/admin/networking/page.tsx
// Networking home: regional rollup + target intro-paths + filterable directory.
// Server Component — data is fetched with the authenticated server client.

import Link from 'next/link';
import { getDirectory, getTargetPaths, getRegionRollup } from '@/lib/data/networking';
import { RegionFilterBar } from './_components/RegionFilterBar';
import { ContactList } from './_components/ContactList';
import { TargetPaths } from './_components/TargetPaths';

export const dynamic = 'force-dynamic';

export default async function NetworkingPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; county?: string; q?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const filters = {
    region: sp.region,
    county: sp.county,
    search: sp.q,
    targetsOnly: sp.view === 'targets',
    connectorsOnly: sp.view === 'connectors',
  };

  const [contacts, targetPaths, regions] = await Promise.all([
    getDirectory(filters),
    getTargetPaths(sp.region),
    getRegionRollup(),
  ]);

  return (
    <div className="space-y-8 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F2233]">Networking</h1>
          <p className="text-sm text-gray-500">
            Who can connect us to whom — tracked by region. {contacts.length} contacts shown.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/networking/capture"
            className="rounded-lg bg-[#0F2233] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + Capture card
          </Link>
        </div>
      </header>

      {/* Regional rollup */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {regions.map((r) => (
          <Link
            key={r.region}
            href={`/admin/networking?region=${encodeURIComponent(r.region)}`}
            className="rounded-xl border border-gray-200 bg-white p-3 hover:border-[#73D7EE]"
          >
            <div className="text-sm font-medium text-[#0F2233]">{r.region}</div>
            <div className="mt-1 text-2xl font-semibold">{r.contact_count}</div>
            <div className="text-xs text-gray-500">
              {r.target_count} targets · {r.connector_count} connectors
              {r.actions_due > 0 && (
                <span className="ml-1 font-semibold text-red-600">· {r.actions_due} due</span>
              )}
            </div>
          </Link>
        ))}
      </section>

      <RegionFilterBar regions={regions.map((r) => r.region)} active={sp} />

      {/* How do we reach our targets */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#0F2233]">Paths to targets</h2>
        <TargetPaths paths={targetPaths} />
      </section>

      {/* Directory */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#0F2233]">Directory</h2>
        <ContactList contacts={contacts} />
      </section>
    </div>
  );
}
