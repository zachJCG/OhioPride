// src/app/(admin)/admin/networking/capture/page.tsx
import Link from 'next/link';
import { getCardInbox } from '@/lib/data/networking';
import { CaptureForm } from '../_components/CaptureForm';
import { promoteCard } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CapturePage() {
  const inbox = await getCardInbox();

  async function promote(formData: FormData) {
    'use server';
    const id = formData.get('card_id')?.toString();
    if (id) await promoteCard(id);
  }

  return (
    <div className="space-y-8 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F2233]">Capture a card</h1>
          <p className="text-sm text-gray-500">Snap, note, save. Promote to a contact when you have a minute.</p>
        </div>
        <Link href="/admin/networking" className="text-sm text-[#0F2233] hover:underline">
          ← Back to networking
        </Link>
      </header>

      <CaptureForm />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#0F2233]">Capture inbox ({inbox.length})</h2>
        <div className="space-y-2">
          {inbox.length === 0 && <p className="text-sm text-gray-500">Inbox is empty.</p>}
          {inbox.map((card) => {
            const p = card.parsed as Record<string, string>;
            return (
              <div key={card.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
                <div className="text-sm">
                  <div className="font-medium text-[#0F2233]">{p.full_name || p.name || '(unparsed card)'}</div>
                  <div className="text-xs text-gray-500">
                    {[p.organization, card.event_context, card.region].filter(Boolean).join(' · ')}
                  </div>
                  {card.raw_notes && <div className="mt-1 text-xs text-gray-600">{card.raw_notes}</div>}
                </div>
                <form action={promote}>
                  <input type="hidden" name="card_id" value={card.id} />
                  <button className="rounded-lg bg-[#73D7EE]/30 px-3 py-1.5 text-sm font-medium text-[#0F2233]">
                    Promote → contact
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
