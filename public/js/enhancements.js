/* ==========================================================================
   OHIO PRIDE PAC - Site Enhancements
   Scroll animations, animated counters, rainbow glow, smooth transitions
   Drop this into any page: <script src="/js/enhancements.js"></script>
   ========================================================================== */

(function() {
  'use strict';

  // 0. PROGRESS PRIDE BANNER (animated)
  // Injects an animated Progress Pride flag banner immediately below the site
  // header on every page, and upgrades any existing .pride-stripe /
  // .pride-banner elements to the same animated look.
  function initPrideProgressBanner() {
    var style = document.createElement('style');
    style.textContent = `
      :root {
        --progress-pride-gradient: linear-gradient(90deg,
          #000000 0%, #613915 5%, #70D6EC 10%, #ffafc8 15%, #ffffff 20%,
          #e40303 28%, #FFBC00 38%, #ffed00 48%, #008026 60%, #004dff 72%, #750787 85%,
          #e40303 100%);
        --progress-pride-banner-height: 6px;
        --progress-pride-banner-top: var(--nav-height, 72px);
      }
      @keyframes progressPrideShimmer {
        0%   { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }
      .progress-pride-banner {
        position: fixed;
        left: 0;
        right: 0;
        top: var(--progress-pride-banner-top);
        height: var(--progress-pride-banner-height);
        width: 100%;
        background: var(--progress-pride-gradient);
        background-size: 200% 100%;
        display: block;
        z-index: 999;
        pointer-events: none;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
      }
      /* Upgrade any existing stripe/banner element to the animated progress flag */
      .pride-stripe, .pride-banner {
        background: var(--progress-pride-gradient) !important;
        background-size: 200% 100% !important;
        height: var(--progress-pride-banner-height) !important;
      }
      /* One sweep as the page opens, then the flag rests: nothing in the
         chrome moves on its own for more than a moment (WCAG 2.2.2). */
      @media (prefers-reduced-motion: no-preference) {
        .progress-pride-banner,
        .pride-stripe, .pride-banner {
          animation: progressPrideShimmer 2.8s cubic-bezier(0.22, 1, 0.36, 1) 1 !important;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .progress-pride-banner, .pride-stripe, .pride-banner {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    // Drop any legacy top-of-body stripe/banner that page templates may have
    // injected above the nav, so we don't end up with two bars.
    var legacy = document.querySelectorAll(
      'body > .pride-stripe, body > .pride-banner, body > .progress-pride-banner'
    );
    for (var i = 0; i < legacy.length; i++) {
      legacy[i].parentNode.removeChild(legacy[i]);
    }

    if (!document.body) return;
    var banner = document.createElement('div');
    banner.className = 'progress-pride-banner';
    banner.setAttribute('aria-hidden', 'true');
    document.body.appendChild(banner);

    // Position the banner directly below whatever nav/header this page uses
    // (main site uses `.nav`, launch-day uses a bare `<nav>` with its own height).
    function positionUnderHeader() {
      var header = document.querySelector('.nav, nav, header');
      if (!header) return;
      var h = header.offsetHeight;
      if (h > 0) {
        document.documentElement.style.setProperty(
          '--progress-pride-banner-top', h + 'px'
        );
      }
    }

    positionUnderHeader();
    window.addEventListener('resize', positionUnderHeader);
    // Re-measure once layout/fonts settle.
    window.setTimeout(positionUnderHeader, 100);
    window.setTimeout(positionUnderHeader, 500);
  }

  // 1. SCROLL-REVEAL ANIMATIONS
  // Cards and sections still below the fold rise in as they arrive. Only
  // what starts below the fold is ever hidden (nothing the reader can
  // already see blinks out and back), nothing is hidden with reduced
  // motion or without IntersectionObserver, html.ohp-reveal gates the CSS
  // so a page whose script fails shows everything, and print shows
  // everything. threshold must stay 0: a ratio can never be reached by a
  // block taller than the viewport, which would stay hidden for good.
  function initScrollReveal() {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const style = document.createElement('style');
    style.textContent = `
      html.ohp-reveal .reveal { transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1); }
      html.ohp-reveal .reveal:not(.visible) { opacity: 0; transform: translateY(24px); }
      html.ohp-reveal .reveal-delay-1 { transition-delay: 0.08s; }
      html.ohp-reveal .reveal-delay-2 { transition-delay: 0.16s; }
      html.ohp-reveal .reveal-delay-3 { transition-delay: 0.24s; }
      @media print { html.ohp-reveal .reveal { opacity: 1 !important; transform: none !important; } }
    `;
    document.head.appendChild(style);

    // Auto-tag elements
    const selectors = [
      '.card', '.member-card', '.tier-card', '.cta-card',
      '.bill-card', '.meta-card', '.rep-card',
      '.mission', '.board-header', '.join-cta', '.donate-section',
      '.detail-section', '.risk-card', '.cta-inner',
      '.founding-inner', '.disclaimer-box'
    ];

    const fold = window.innerHeight;
    const tagged = [];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (el.classList.contains('reveal') || el.getBoundingClientRect().top < fold) return;
        el.classList.add('reveal');
        if (i % 3 === 1) el.classList.add('reveal-delay-1');
        if (i % 3 === 2) el.classList.add('reveal-delay-2');
        tagged.push(el);
      });
    });
    if (!tagged.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });

    tagged.forEach(el => observer.observe(el));
    document.documentElement.classList.add('ohp-reveal');
    window.addEventListener('beforeprint', () => tagged.forEach(el => el.classList.add('visible')));
  }

  // 2. ANIMATED RAINBOW GRADIENT
  // Slowly shifts the rainbow gradient on hero dividers and borders
  function initRainbowAnimation() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes rainbowShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      /* One pass when the page opens, then the gradient rests (it used to
         loop forever, and on solid buttons it animated nothing visible). */
      .hero-divider, .progress-fill, .progress-bar-fill {
        background-size: 200% 200%;
      }
      @media (prefers-reduced-motion: no-preference) {
        .hero-divider { animation: rainbowShift 3s ease 1; }
        .progress-fill, .progress-bar-fill { animation: rainbowShift 3s ease 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // 3. ANIMATED NUMBER COUNTER
  // Counts up to target number smoothly
  function initCounters() {
    const counterElements = document.querySelectorAll('[data-count-to]');
    if (!counterElements.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.countTo, 10);
          const duration = parseInt(el.dataset.countDuration || '2000', 10);
          animateCounter(el, 0, target, duration);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    counterElements.forEach(el => observer.observe(el));
  }

  function animateCounter(el, start, end, duration) {
    const startTime = performance.now();
    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      el.textContent = current.toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // 4. CARD HOVER GLOW
  // Subtle rainbow glow that follows mouse position on cards
  function initCardGlow() {
    const style = document.createElement('style');
    style.textContent = `
      .card, .member-card, .cta-card, .tier-card, .bill-card {
        position: relative;
      }
      .card-glow {
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
        z-index: -1;
      }
    `;
    document.head.appendChild(style);

    document.querySelectorAll('.card, .member-card, .cta-card, .tier-card').forEach(card => {
      card.addEventListener('mouseenter', function() {
        this.style.boxShadow = '0 0 20px rgba(255, 140, 0, 0.15), 0 0 40px rgba(76, 54, 157, 0.1)';
      });
      card.addEventListener('mouseleave', function() {
        this.style.boxShadow = '';
      });
    });
  }

  // 5. (Retired 2026-11) The whole-page fade-in from opacity 0 held back the
  // first paint on every load and ignored reduced motion; page-to-page view
  // transitions in /css/style.css carry the smoothness now.

  // 5b. ACCESSIBLE NAMES
  // The bill tracker's Read more / Show less buttons carried
  // aria-label="Toggle bill details", which hid their visible label from
  // speech-input users (WCAG 2.5.3). Their own text plus aria-expanded says
  // the same thing. Repaired here because the tracker's markup is
  // fingerprinted by the Last Updated stamp (lib/bill-stamp.mjs).
  function initAccessibleNames() {
    document.querySelectorAll('.bill-expand-btn[aria-label="Toggle bill details"]').forEach(btn => {
      btn.removeAttribute('aria-label');
    });
  }

  // 6. STATS COUNTER ON ISSUES PAGE
  // Animates the stat numbers in the stats bar
  function initStatsAnimation() {
    const statNumbers = document.querySelectorAll('.stat-number');
    if (!statNumbers.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const text = el.textContent.trim();
          const num = parseInt(text, 10);
          if (!isNaN(num) && num > 0) {
            animateCounter(el, 0, num, 1500);
          }
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    statNumbers.forEach(el => observer.observe(el));
  }

  // 7. ACTIVE NAV LINK HIGHLIGHTING
  function initActiveNav() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href');
      if (href === path || (path.startsWith(href) && href !== '/')) {
        link.classList.add('active');
      }
    });
  }

  // 8. PROGRESS BAR ANIMATION ON SCROLL
  function initProgressAnimation() {
    const progressFill = document.getElementById('progressFill') || document.getElementById('progressBarFill');
    if (!progressFill) return;

    // Store the target width and start at 0
    const targetWidth = progressFill.style.width;
    progressFill.style.width = '0%';
    progressFill.style.transition = 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)';

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(() => { progressFill.style.width = targetWidth; }, 200);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    observer.observe(progressFill.parentElement);
  }

  // INIT
  document.addEventListener('DOMContentLoaded', function() {
    initPrideProgressBanner();
    initAccessibleNames();
    initRainbowAnimation();
    initScrollReveal();
    initCounters();
    initCardGlow();
    initStatsAnimation();
    initActiveNav();
    initProgressAnimation();
  });
})();
