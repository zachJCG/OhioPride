// netlify/functions/zip-county-lookup.mjs
// GET /.netlify/functions/zip-county-lookup?zip=45420
// Returns { zip, county_name, county_fips, usps_city, usps_state } or 404.
//
// Reads from public.ohio_zip_county via Supabase service role.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

const json = (status, body, extraHeaders = {}) => ({
    statusCode: status,
    headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        ...extraHeaders,
    },
    body: JSON.stringify(body),
});

const normaliseZip = (raw) => {
    const digits = String(raw || '').replace(/[^0-9]/g, '');
    if (!digits) return null;
    return digits.slice(0, 5).padStart(5, '0');
};

export default async (req) => {
    const url = new URL(req.url);
    const zip = normaliseZip(url.searchParams.get('zip'));
    if (!zip) {
        return new Response(JSON.stringify({ error: 'missing zip' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { data, error } = await supabase
        .from('ohio_zip_primary_county')
        .select('zip, county_fips, county_name, usps_city, usps_state')
        .eq('zip', zip)
        .maybeSingle();

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!data) {
        return new Response(JSON.stringify({ zip, county_name: null }), {
            status: 404,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300',
            },
        });
    }

    return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
    });
};
