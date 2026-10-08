/* candidate-apply: App Router wrapper around lib/functions/candidate-apply.mjs.
 * The implementation is a web handler that does its own method check. */
import handler from '../../../lib/functions/candidate-apply.mjs';

export const dynamic = 'force-dynamic';

export const GET = handler;
export const POST = handler;
