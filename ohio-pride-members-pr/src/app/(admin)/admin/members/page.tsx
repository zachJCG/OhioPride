// src/app/(admin)/admin/members/page.tsx
// Members CRM — ALL members (no public/vetted filter), sorted NEWEST first.
import { getMembers, getMemberStats } from '@/lib/data/members';
import { MembersTable } from './_components/MembersTable';

export const dynamic = 'force-dynamic';

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; county?: string }>;
}) {
  const sp = await searchParams;
  const [members, stats] = await Promise.all([
    getMembers({ search: sp.q, county: sp.county }),
    getMemberStats(),
  ]);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-[#0F2233]">Members</h1>
        <p className="text-sm text-gray-500">
          Founding Member roster — all members, newest first. Vetting controls public display only,
          not membership.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total members" value={`${stats.total}`} sub={`of ${stats.target} goal`} />
        <Stat label="Vetted (public)" value={`${stats.vetted}`} sub={`${stats.total - stats.vetted} pending`} />
        <Stat label="Ohio" value={`${stats.ohio}`} sub={`${stats.total - stats.ohio} out of state`} />
        <Stat label="Progress" value={`${Math.round((stats.total / stats.target) * 100)}%`} sub="to 1,969" />
      </section>

      <form className="flex flex-wrap gap-2" action="/admin/members" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Search name or email…"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <input
          name="county"
          defaultValue={sp.county ?? ''}
          placeholder="County"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button className="rounded-lg bg-[#0F2233] px-4 py-1.5 text-sm font-medium text-white">Search</button>
      </form>

      <MembersTable members={members} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[#0F2233]">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
