// api/zip-county-lookup.mjs
// GET /api/zip-county-lookup?zip=45420
// Returns { zip, county_name, county_fips, usps_city, usps_state } or 404.
//
// Reads from public.ohio_zip_primary_county via Supabase service role.

import { createClient } from '@supabase/supabase-js';

const normaliseZip = (raw) => {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    if (!digits) return null;
    return digits.slice(0, 5).padStart(5, '0');
};

export default async function handler(req, res) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'missing_supabase_env' });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });

    const zip = normaliseZip(req.query.zip);
    if (!zip) {
        return res.status(400).json({ error: 'missing zip' });
    }

    const { data, error } = await supabase
        .from('ohio_zip_primary_county')
        .select('zip, county_fips, county_name, usps_city, usps_state')
        .eq('zip', zip)
        .maybeSingle();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    if (!data) {
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(404).json({ zip, county_name: null });
    }

    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).json(data);
}
