import Script from 'next/script';
import type { PageContent } from '@/lib/page-content';

/**
 * Renders an extracted HTML page (body + page-specific styles + scripts).
 * The shared header/footer come from the root layout, not from the page body.
 */
export function PageBody({ content }: { content: PageContent }) {
  const { body, meta } = content;

  return (
    <>
      {meta.headStyles.map((css, i) => (
        <style key={`page-style-${i}`} dangerouslySetInnerHTML={{ __html: css }} />
      ))}

      {meta.jsonLd.map((json, i) => (
        <script
          key={`page-jsonld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: json }}
        />
      ))}

      <div dangerouslySetInnerHTML={{ __html: body }} />

      {meta.externalScripts.map((src, i) => (
        <Script key={`page-ext-${i}-${src}`} src={src} strategy="afterInteractive" />
      ))}

      {meta.inlineScripts.map((code, i) => (
        <Script
          key={`page-inline-${i}`}
          id={`page-inline-${i}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: code }}
        />
      ))}
    </>
  );
}
