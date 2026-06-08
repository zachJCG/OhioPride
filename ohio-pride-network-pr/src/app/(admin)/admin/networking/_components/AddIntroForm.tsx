'use client';
// src/app/(admin)/admin/networking/_components/AddIntroForm.tsx
// Records a path: pick the CONNECTOR who can reach the current contact (the target),
// or flip it. Defaults to "someone can reach this contact".

import { useState } from 'react';
import { addIntroduction } from '../actions';

type Option = { id: string; label: string };

export function AddIntroForm({
  currentContactId,
  contacts,
}: {
  currentContactId: string;
  contacts: Option[];
}) {
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [msg, setMsg] = useState<string | null>(null);
  const others = contacts.filter((c) => c.id !== currentContactId);

  async function onSubmit(formData: FormData) {
    // inbound: other -> current (other can reach the current contact)
    // outbound: current -> other (current contact can reach other)
    const other = formData.get('other_id')?.toString();
    if (!other) {
      setMsg('Pick a contact.');
      return;
    }
    if (direction === 'inbound') {
      formData.set('connector_id', other);
      formData.set('target_id', currentContactId);
    } else {
      formData.set('connector_id', currentContactId);
      formData.set('target_id', other);
    }
    const res = await addIntroduction(formData);
    setMsg(res.ok ? 'Path saved ✓' : `Error: ${res.error}`);
  }

  return (
    <form action={onSubmit} className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex gap-1 text-sm">
        <button
          type="button"
          onClick={() => setDirection('inbound')}
          className={`rounded-lg px-3 py-1.5 ${direction === 'inbound' ? 'bg-[#0F2233] text-white' : 'bg-gray-100'}`}
        >
          Someone can reach them
        </button>
        <button
          type="button"
          onClick={() => setDirection('outbound')}
          className={`rounded-lg px-3 py-1.5 ${direction === 'outbound' ? 'bg-[#0F2233] text-white' : 'bg-gray-100'}`}
        >
          They can reach someone
        </button>
      </div>

      <select name="other_id" className="w-full rounded-lg border border-gray-300 p-2 text-sm" required>
        <option value="">{direction === 'inbound' ? 'Connector…' : 'Target…'}</option>
        {others.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-2">
        <input name="relationship_label" placeholder="Relationship (e.g. former colleague)" className="rounded-lg border border-gray-300 p-2 text-sm" />
        <select name="strength" defaultValue="3" className="rounded-lg border border-gray-300 p-2 text-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{n}/5 strength</option>
          ))}
        </select>
        <select name="status" defaultValue="potential" className="rounded-lg border border-gray-300 p-2 text-sm">
          {['potential', 'requested', 'made', 'declined', 'blocked'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="confidence" defaultValue="medium" className="rounded-lg border border-gray-300 p-2 text-sm">
          {['low', 'medium', 'high'].map((s) => (
            <option key={s} value={s}>{s} confidence</option>
          ))}
        </select>
      </div>
      <input name="notes" placeholder="Notes" className="w-full rounded-lg border border-gray-300 p-2 text-sm" />

      <button className="rounded-lg bg-[#0F2233] px-3 py-1.5 text-sm font-medium text-white">Save path</button>
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </form>
  );
}
