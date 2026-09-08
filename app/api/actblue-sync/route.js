/* actblue-sync: App Router wrapper around lib/functions/actblue-sync.mjs.
 *
 * The implementation is a web handler, (Request) => Response, which is exactly
 * the Route Handler contract, so it is exported directly. It does its own
 * method check and auth (CRON_SECRET for the Vercel cron, or an admin JWT with
 * donors:write for the Members page button).
 *
 * Node runtime on purpose: the ActBlue CSV API is request-then-poll, and a
 * six-month backfill can take a couple of minutes end to end, well past the
 * edge runtime's response budget. maxDuration matches the handler's internal
 * 270s time budget with room to write the run row.
 *
 * force-dynamic keeps Next from trying to evaluate the handler at build time,
 * when no Supabase credentials exist and the response would be cached anyway.
 */
import handler from '../../../lib/functions/actblue-sync.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const GET = handler;
export const POST = handler;
