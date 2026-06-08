// src/app/(admin)/admin/networking/[id]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getContact,
  getContactPaths,
  getContactActivities,
  getDirectory,
  getCardImageUrl,
} from '@/lib/data/networking';
import { logActivity } from '../actions';
import { AddIntroForm } from '../_components/AddIntroForm';

export const dynamic = 'force-dynamic';

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  const [{ inbound, outbound }, activities, allContacts, cardUrl] = await Promise.all([
    getContactPaths(id),
    getContactActivities(id),
    getDirectory(),
    getCardImageUrl(contact.card_image_path),
  ]);

  async function addActivity(formData: FormData) {
    'use server';
    formData.set('contact_id', id);
    await logActivity(formData);
  }

  return (
    <div className="space-y-8 p-6">
      <Link href="/admin/networking" className="text-sm text-[#0F2233] hover:underline">
        ← Networking
      </Link>

      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F2233]">{contact.full_name}</h1>
          <p className="text-sm text-gray-500">
            {[contact.title, contact.organization].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {[contact.region, contact.county, contact.email, contact.phone].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
            {contact.is_target && <span className="rounded bg-[#0F2233] px-1.5 py-0.5 text-white">TARGET</span>}
            {contact.is_connector && <span className="rounded bg-[#73D7EE]/30 px-1.5 py-0.5 text-[#0F2233]">CONNECTOR</span>}
            {(contact.tags ?? []).map((t) => (
              <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{t}</span>
            ))}
          </div>
        </div>
        {cardUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cardUrl} alt="Business card" className="h-24 rounded-lg border border-gray-200 object-contain" />
        )}
      </header>

      {(contact.how_they_help || contact.ask_context || contact.notes) && (
        <section className="grid gap-3 md:grid-cols-3">
          {contact.how_they_help && <InfoCard label="How they help" value={contact.how_they_help} />}
          {contact.ask_context && <InfoCard label="The ask" value={contact.ask_context} />}
          {contact.notes && <InfoCard label="Notes" value={contact.notes} />}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-[#0F2233]">Ways in ({inbound.length})</h2>
          <p className="mb-2 text-xs text-gray-500">Connectors who can introduce us to {contact.full_name}.</p>
          <PathList rows={inbound} nameKey="connector_name" orgKey="connector_org" regionKey="connector_region" />
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold text-[#0F2233]">They can open ({outbound.length})</h2>
          <p className="mb-2 text-xs text-gray-500">People {contact.full_name} can introduce us to.</p>
          <PathList rows={outbound} nameKey="target_name" orgKey="target_org" regionKey="target_region" />
        </section>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-[#0F2233]">Add an introduction path</h2>
          <AddIntroForm
            currentContactId={id}
            contacts={allContacts.map((c) => ({ id: c.id, label: `${c.full_name}${c.organization ? ` — ${c.organization}` : ''}` }))}
          />
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold text-[#0F2233]">Activity ({activities.length})</h2>
          <form action={addActivity} className="mb-3 space-y-2">
            <div className="flex gap-2">
              <select name="activity_type" className="rounded-lg border border-gray-300 p-2 text-sm">
                {['note', 'call', 'email', 'meeting', 'event', 'intro_made'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input name="subject" placeholder="Subject" className="flex-1 rounded-lg border border-gray-300 p-2 text-sm" />
            </div>
            <textarea name="body" rows={2} placeholder="What happened…" className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
            <button className="rounded-lg bg-[#0F2233] px-3 py-1.5 text-sm font-medium text-white">Log</button>
          </form>
          <ul className="space-y-2">
            {activities.map((a: Record<string, string>) => (
              <li key={a.id} className="rounded-lg border border-gray-200 p-2 text-sm">
                <div className="flex justify-between text-xs text-gray-500">
                  <span className="uppercase">{a.activity_type}</span>
                  <span>{new Date(a.occurred_at).toLocaleDateString()}</span>
                </div>
                {a.subject && <div className="font-medium text-[#0F2233]">{a.subject}</div>}
                {a.body && <div className="text-gray-600">{a.body}</div>}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-sm text-gray-800">{value}</div>
    </div>
  );
}

function PathList({
  rows,
  nameKey,
  orgKey,
  regionKey,
}: {
  rows: Record<string, unknown>[];
  nameKey: string;
  orgKey: string;
  regionKey: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-gray-400">None yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id as string} className="rounded-lg border border-gray-200 p-2 text-sm">
          <div className="flex justify-between">
            <span className="font-medium text-[#0F2233]">{r[nameKey] as string}</span>
            <span className="text-xs">
              {r.strength as number}/5 · {r.status as string}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {[r[orgKey], r[regionKey], r.relationship_label].filter(Boolean).join(' · ')}
          </div>
        </li>
      ))}
    </ul>
  );
}
