'use server';
// src/app/(admin)/admin/networking/actions.ts
// Server Actions for the networking module. All writes go through the authenticated
// server client, so RLS (has_permission('networking','write')) is enforced.

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

function s(v: FormDataEntryValue | null): string | null {
  const t = (v ?? '').toString().trim();
  return t === '' ? null : t;
}
function arr(v: FormDataEntryValue | null): string[] {
  const t = (v ?? '').toString().trim();
  return t === '' ? [] : t.split(',').map((x) => x.trim()).filter(Boolean);
}

export async function createContact(formData: FormData) {
  const supabase = await createClient();
  const full_name = s(formData.get('full_name'));
  if (!full_name) return { ok: false, error: 'Name is required.' };

  const { data, error } = await supabase
    .from('network_contacts')
    .insert({
      full_name,
      title: s(formData.get('title')),
      organization: s(formData.get('organization')),
      sector: s(formData.get('sector')),
      email: s(formData.get('email')),
      phone: s(formData.get('phone')),
      linkedin_url: s(formData.get('linkedin_url')),
      city: s(formData.get('city')),
      county: s(formData.get('county')),
      region: s(formData.get('region')),
      zip: s(formData.get('zip')),
      influence_tier: s(formData.get('influence_tier')) ?? 'contact',
      warmth: s(formData.get('warmth')) ?? 'cold',
      relationship_strength: s(formData.get('relationship_strength'))
        ? Number(formData.get('relationship_strength'))
        : null,
      is_target: formData.get('is_target') === 'on',
      is_connector: formData.get('is_connector') === 'on',
      priority: s(formData.get('priority')) ?? 'medium',
      tags: arr(formData.get('tags')),
      source: s(formData.get('source')),
      how_they_help: s(formData.get('how_they_help')),
      ask_context: s(formData.get('ask_context')),
      card_image_path: s(formData.get('card_image_path')),
      notes: s(formData.get('notes')),
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/networking');
  return { ok: true, id: data.id };
}

// Record that `connector` can introduce us to `target`.
export async function addIntroduction(formData: FormData) {
  const supabase = await createClient();
  const connector_id = s(formData.get('connector_id'));
  const target_id = s(formData.get('target_id'));
  if (!connector_id || !target_id) return { ok: false, error: 'Connector and target are required.' };
  if (connector_id === target_id) return { ok: false, error: 'Connector and target must differ.' };

  const { error } = await supabase.from('network_introductions').insert({
    connector_id,
    target_id,
    relationship_label: s(formData.get('relationship_label')),
    strength: s(formData.get('strength')) ? Number(formData.get('strength')) : 3,
    status: s(formData.get('status')) ?? 'potential',
    confidence: s(formData.get('confidence')) ?? 'medium',
    notes: s(formData.get('notes')),
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/networking');
  return { ok: true };
}

export async function logActivity(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const contact_id = s(formData.get('contact_id'));
  if (!contact_id) return { ok: false, error: 'contact_id required.' };

  const { error } = await supabase.from('network_activities').insert({
    contact_id,
    activity_type: s(formData.get('activity_type')) ?? 'note',
    subject: s(formData.get('subject')),
    body: s(formData.get('body')),
    actor_email: user?.email ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/networking/${contact_id}`);
  return { ok: true };
}

// Business-card quick capture. Photo is uploaded client-side to the 'network-cards'
// bucket; this action records the inbox row with the storage path + notes + any fields
// you parsed on your phone (paste them into the form as JSON or individual fields).
export async function captureCard(formData: FormData) {
  const supabase = await createClient();
  let parsed: Record<string, unknown> = {};
  const parsedRaw = s(formData.get('parsed_json'));
  if (parsedRaw) {
    try {
      parsed = JSON.parse(parsedRaw);
    } catch {
      parsed = {};
    }
  }

  const { data, error } = await supabase
    .from('network_business_cards')
    .insert({
      image_path: s(formData.get('image_path')),
      raw_notes: s(formData.get('raw_notes')),
      parsed,
      event_context: s(formData.get('event_context')),
      location: s(formData.get('location')),
      region: s(formData.get('region')),
      county: s(formData.get('county')),
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/networking/capture');
  return { ok: true, id: data.id };
}

// Promote a captured card into a real contact (and link them).
export async function promoteCard(cardId: string) {
  const supabase = await createClient();
  const { data: card, error: readErr } = await supabase
    .from('network_business_cards')
    .select('*')
    .eq('id', cardId)
    .single();
  if (readErr || !card) return { ok: false, error: readErr?.message ?? 'Card not found.' };

  const p = (card.parsed ?? {}) as Record<string, string>;
  const { data: contact, error: insErr } = await supabase
    .from('network_contacts')
    .insert({
      full_name: p.full_name || p.name || 'Unnamed contact',
      title: p.title ?? null,
      organization: p.organization || p.company || null,
      email: p.email ?? null,
      phone: p.phone ?? null,
      region: card.region,
      county: card.county,
      source: card.event_context ? `Card capture: ${card.event_context}` : 'Card capture',
      card_image_path: card.image_path,
      notes: card.raw_notes,
    })
    .select('id')
    .single();
  if (insErr) return { ok: false, error: insErr.message };

  await supabase
    .from('network_business_cards')
    .update({ status: 'processed', contact_id: contact.id })
    .eq('id', cardId);

  revalidatePath('/admin/networking');
  revalidatePath('/admin/networking/capture');
  return { ok: true, id: contact.id };
}
