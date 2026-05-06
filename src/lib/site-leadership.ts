import { getSupabase } from '@/lib/supabase';

export interface Officer {
  title: string;
  full_name: string;
  required_on_disclaimer: boolean;
}

export interface Leadership {
  entity: string;
  entity_legal_name: string;
  officers: Officer[];
  disclaimer: string;
}

const ENTITY_LEGAL_NAMES: Record<string, string> = {
  pac: 'Ohio Pride PAC',
  c4:  'Ohio Pride Action',
  c3:  'Ohio Pride Foundation',
};

function buildDisclaimer(entity: string, officers: Officer[]): string {
  const entityName = ENTITY_LEGAL_NAMES[entity] || 'Ohio Pride PAC';
  const required = officers.filter(o => o.required_on_disclaimer);
  if (required.length === 0) return `Paid for by ${entityName}.`;
  const officerParts = required.map(o => `${o.full_name}, ${o.title}.`).join(' ');
  return `Paid for by ${entityName}. ${officerParts}`;
}

const FALLBACK: Leadership = {
  entity: 'pac',
  entity_legal_name: 'Ohio Pride PAC',
  officers: [
    { title: 'Director',  full_name: 'Zachary R. Joseph', required_on_disclaimer: true },
    { title: 'Treasurer', full_name: 'David Donofrio',    required_on_disclaimer: true },
  ],
  disclaimer: 'Paid for by Ohio Pride PAC. Not authorized by any candidate or candidate\'s committee.',
};

/**
 * Server-side leadership loader for the layout's footer.
 * Falls back to the seeded officer block if Supabase is unavailable so the
 * disclaimer never disappears (legal requirement for PAC-paid communications).
 */
export async function loadLeadership(entity: string = 'pac'): Promise<Leadership> {
  const supabase = getSupabase();
  if (!supabase) return FALLBACK;

  const { data, error } = await supabase
    .from('site_leadership')
    .select('title, full_name, is_required_on_disclaimer, display_order')
    .eq('entity', entity)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error || !data) return FALLBACK;

  const officers: Officer[] = data.map(row => ({
    title:                  row.title,
    full_name:              row.full_name,
    required_on_disclaimer: row.is_required_on_disclaimer,
  }));

  return {
    entity,
    entity_legal_name: ENTITY_LEGAL_NAMES[entity] || 'Ohio Pride PAC',
    officers,
    disclaimer: buildDisclaimer(entity, officers),
  };
}
