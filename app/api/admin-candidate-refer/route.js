/* admin-candidate-refer: App Router wrapper around
 * lib/functions/admin-candidate-refer.mjs. */
import handler from '../../../lib/functions/admin-candidate-refer.mjs';

export const dynamic = 'force-dynamic';

export const GET = handler;
export const POST = handler;
