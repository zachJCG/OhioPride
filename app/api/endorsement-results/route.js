/* endorsement-results: App Router wrapper around lib/functions/endorsement-results.mjs.
 *
 * The implementation is a web handler, (Request) => Response, which is the
 * Route Handler contract, so it is exported directly. GET and HEAD only; the
 * handler answers 405 for anything else.
 *
 * force-dynamic keeps Next from evaluating it at build time. The response's
 * own Cache-Control (five minutes at the CDN) is the cache.
 */
import handler from '../../../lib/functions/endorsement-results.mjs';

export const dynamic = 'force-dynamic';

export const GET = handler;
export const HEAD = handler;
