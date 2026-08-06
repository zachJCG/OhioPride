'use client';
// Shared "Export PDF" helper: authenticated fetch of /api/endorsement-pdf,
// downloaded as a file. Returns an error message string, or null on success.
import { supabase } from '../../lib/supabase';

export async function exportPdf(query) {
  try {
    const { data: { session } } = await supabase().auth.getSession();
    if (!session) return 'Not signed in.';
    const resp = await fetch(`/api/endorsement-pdf?${query}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!resp.ok) {
      let detail = `status ${resp.status}`;
      try { detail = (await resp.json()).error || detail; } catch { /* binary or empty */ }
      return `Could not build the PDF (${detail}).`;
    }
    const blob = await resp.blob();
    const name = (resp.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1]
      || 'endorsement-packet.pdf';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    return null;
  } catch (e) {
    return e.message || 'Could not build the PDF.';
  }
}
