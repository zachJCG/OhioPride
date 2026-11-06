'use client';
/* Old shared links.
 *
 * /endorsements#jeff-givan was a profile's shareable URL until the profile
 * became a real route, and campaign sites and press still carry it. The hash
 * never reaches the server, so the redirect has to happen in the browser.
 *
 * This used to live inside the card grid and only knew the slugs the grid was
 * given. The grid now shows the current cycle only (the 2026 slate moved to
 * /endorsements/2026) and may not render at all, so the page renders this on
 * its own, every time, with every published slug.
 *
 * A hash that names an element on the page (#process-title, #cycles-title) is
 * an ordinary anchor and is left alone. Anything else clears itself, unless
 * the list could not be read: then we cannot tell a slug from a typo, so the
 * hash stays.
 */

import { useEffect } from 'react';

export default function HashRedirect({ slugs }) {
  useEffect(() => {
    let hash = '';
    try {
      hash = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
    } catch {
      return; // a malformed escape is not a slug
    }
    if (!hash) return;
    if (slugs.includes(hash)) {
      window.location.replace(`/endorsements/${encodeURIComponent(hash)}`);
    } else if (slugs.length > 0 && !document.getElementById(hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [slugs]);

  return null;
}
