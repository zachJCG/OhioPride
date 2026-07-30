/* volunteer-submit: App Router wrapper around lib/functions/volunteer-submit.mjs.
 *
 * The implementation is a web handler, (Request, context) => Response, which
 * is exactly the Route Handler contract, so it is exported directly. It does
 * its own method check and returns 405 for anything it does not serve.
 *
 * force-dynamic keeps Next from trying to evaluate the handler at build time,
 * when no Supabase credentials exist and the response would be cached anyway.
 */
import handler from '../../../lib/functions/volunteer-submit.mjs';

export const dynamic = 'force-dynamic';

export const GET = handler;
export const POST = handler;
