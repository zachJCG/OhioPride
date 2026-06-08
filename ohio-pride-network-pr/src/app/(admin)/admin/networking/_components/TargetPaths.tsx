// src/app/(admin)/admin/networking/_components/TargetPaths.tsx
import Link from 'next/link';
import type { NetworkTargetPath } from '@/types/networking';

export function TargetPaths({ paths }: { paths: NetworkTargetPath[] }) {
  if (paths.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
        No intro paths yet. Mark a contact as a <strong>target</strong>, then add an introduction
        from a connector who can reach them.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Target</th>
            <th className="px-4 py-2">Region</th>
            <th className="px-4 py-2">Best</th>
            <th className="px-4 py-2">Paths</th>
            <th className="px-4 py-2">Connectors</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {paths.map((p) => (
            <tr key={p.target_id} className="align-top">
              <td className="px-4 py-3">
                <Link href={`/admin/networking/${p.target_id}`} className="font-medium text-[#0F2233] hover:underline">
                  {p.target_name}
                </Link>
                {p.target_org && <div className="text-xs text-gray-500">{p.target_org}</div>}
                {p.target_tier && (
                  <span className="mt-1 inline-block rounded bg-[#73D7EE]/20 px-1.5 py-0.5 text-[10px] uppercase text-[#0F2233]">
                    {p.target_tier}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-600">{p.target_region ?? p.target_county ?? '—'}</td>
              <td className="px-4 py-3">
                <span className="font-semibold">{p.best_strength}</span>
                <span className="text-gray-400">/5</span>
              </td>
              <td className="px-4 py-3">
                {p.path_count}
                {p.paths_made > 0 && <span className="ml-1 text-green-600">({p.paths_made} made)</span>}
              </td>
              <td className="px-4 py-3 text-gray-600">{p.connector_paths}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
