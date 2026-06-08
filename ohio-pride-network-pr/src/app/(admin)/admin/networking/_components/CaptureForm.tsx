'use client';
// src/app/(admin)/admin/networking/_components/CaptureForm.tsx
// Quick business-card capture from your phone:
//   1. Snap/upload the card photo -> uploaded to the private 'network-cards' bucket.
//   2. Jot notes (where you met them, what they can unlock).
//   3. Optional: paste the fields you parsed with Claude on your phone into "Parsed JSON".
//   4. Save -> lands in the capture inbox; promote to a full contact later.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { captureCard } from '../actions';
import { REGIONS } from '@/types/networking';

export function CaptureForm() {
  const [uploading, setUploading] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    const supabase = createClient();
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from('network-cards').upload(path, file, { upsert: false });
    setUploading(false);
    if (error) {
      setMsg(`Upload failed: ${error.message}`);
      return;
    }
    setImagePath(path);
    setMsg('Photo uploaded ✓');
  }

  async function onSubmit(formData: FormData) {
    setSaving(true);
    if (imagePath) formData.set('image_path', imagePath);
    const res = await captureCard(formData);
    setSaving(false);
    setMsg(res.ok ? 'Saved to capture inbox ✓' : `Error: ${res.error}`);
  }

  return (
    <form action={onSubmit} className="max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Card photo</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="mt-1 block w-full text-sm"
        />
        {uploading && <p className="text-xs text-gray-500">Uploading…</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes (where you met, what they unlock)</label>
        <textarea name="raw_notes" rows={3} className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input name="event_context" placeholder="Event / context" className="rounded-lg border border-gray-300 p-2 text-sm" />
        <input name="location" placeholder="Location" className="rounded-lg border border-gray-300 p-2 text-sm" />
        <select name="region" className="rounded-lg border border-gray-300 p-2 text-sm">
          <option value="">Region…</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input name="county" placeholder="County" className="rounded-lg border border-gray-300 p-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Parsed fields (optional JSON from Claude on your phone)
        </label>
        <textarea
          name="parsed_json"
          rows={4}
          placeholder='{"full_name":"Jane Doe","title":"Director","organization":"Acme","email":"jane@acme.org","phone":"555-1212"}'
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 font-mono text-xs"
        />
      </div>

      <button
        type="submit"
        disabled={saving || uploading}
        className="rounded-lg bg-[#0F2233] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save to inbox'}
      </button>
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </form>
  );
}
