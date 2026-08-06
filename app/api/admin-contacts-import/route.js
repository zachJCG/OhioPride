/* admin-contacts-import: App Router wrapper around
 * lib/functions/admin-contacts-import.mjs (ActBlue CSV reconciliation).
 * The implementation is a web handler, (Request) => Response, so it is
 * exported directly; it does its own method check.
 */
import handler from '../../../lib/functions/admin-contacts-import.mjs';

export const dynamic = 'force-dynamic';

export const POST = handler;
export const GET = handler;
