/* The candidate-name -> URL-segment rule, on its own so the admin can build a
 * link to /endorsements/<slug> without pulling the editorial copy deck and the
 * Supabase read path into its bundle.
 *
 * An entry in lib/endorsement-content.mjs may set its own `slug`, but it is
 * expected to match this: the admin's "live at" link is built from the name. */
export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
