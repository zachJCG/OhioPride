/* ==========================================================================
   OHIO PRIDE PAC — Vercel Web Analytics + Speed Insights loader
   -------------------------------------------------------------
   Single source of truth for the analytics tags on the static pages under
   public/. Both products are cookieless and collect no personally
   identifying information, so no consent banner is required.

   Why a file instead of a snippet in each page:

     Until now the same six lines were hand copied into site-template.js,
     into admin-shell.js, and inline into the two pages that load neither.
     Four copies meant a page could silently miss analytics simply by not
     loading the right shell — which is exactly what happened to
     /PRTraining and five of the admin pages. One file, loaded everywhere,
     removes that failure mode.

   How pages get it:

     - Pages with the public shell load it via /js/site-template.js.
     - Admin pages load it via /js/admin-shell.js.
     - Pages that use neither shell carry their own
       <script defer src="/js/vercel-insights.js"></script>.
     - Pages ported to the App Router do NOT use this file. They get the
       <Analytics /> component from @vercel/analytics in app/layout.js,
       which additionally reports the matched route pattern (/issues/[id])
       rather than one row per resolved path.

   Loading /_vercel/* only works on a Vercel deployment. Locally, and until
   Web Analytics is enabled in the Vercel project settings, the requests
   404 quietly; nothing else on the page changes.
   ========================================================================== */

(function () {
  'use strict';

  // Guard the whole module, not just the individual tags. A page that both
  // carries the <script> tag and loads a shell would otherwise run the
  // append loop twice on the same tick, before either script element is
  // queryable in the DOM.
  if (window.__ohpInsightsLoaded) return;
  window.__ohpInsightsLoaded = true;

  ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']
    .forEach(function (src) {
      if (document.querySelector('script[src="' + src + '"]')) return;
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      (document.body || document.head).appendChild(s);
    });
})();
