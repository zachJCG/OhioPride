'use client';

/* The archive banner for App Router pages.
 *
 * Pages archived in place after the 2026 cycle keep their URL and their copy
 * and get this strip under the nav. The static pages render the identical
 * markup from public/js/site-template.js, keyed on a <meta name="ohp-archived">
 * marker that `npm run seo:build` writes from the same list; this component
 * reads the list directly because a ported page has no generated head block.
 *
 * Today every archived page is still static, so this renders nothing. It is
 * here so that porting one of them never silently drops the banner.
 */

import { usePathname } from 'next/navigation';
import {
  ARCHIVE_BANNER_LINK_TEXT,
  ARCHIVE_BANNER_TEXT,
  ARCHIVE_URL,
  isArchived,
} from '../../../lib/archived-paths.mjs';

export default function ArchiveBanner() {
  const pathname = usePathname();
  if (!isArchived(pathname)) return null;
  return (
    <div className="ohp-banner ohp-banner--archive" role="note">
      <div className="ohp-banner-inner">
        <span className="ohp-banner-text">{ARCHIVE_BANNER_TEXT}</span>
        <a className="ohp-banner-link" href={ARCHIVE_URL}>
          {ARCHIVE_BANNER_LINK_TEXT}
        </a>
      </div>
    </div>
  );
}
