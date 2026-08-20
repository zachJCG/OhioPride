/* endorsement-notify: App Router wrapper around lib/functions/endorsement-notify.mjs.
 *
 * Same shape as the other wrappers — the implementation is a web handler and
 * does its own method check, so it is exported directly.
 */
import handler from '../../../lib/functions/endorsement-notify.mjs';

export const dynamic = 'force-dynamic';

export const GET = handler;
export const POST = handler;
