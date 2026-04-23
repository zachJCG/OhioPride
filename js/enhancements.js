/* ==========================================================================
   OHIO PRIDE PAC, Site Enhancements
   Scroll animations, animated counters, rainbow glow, smooth transitions
   Drop this into any page: <script src="/js/enhancements.js"></script>
   ========================================================================== */

(function() {
  'use strict';

  // 0. PROGRESS PRIDE BANNER (animated)
  // Injects an animated Progress Pride flag banner at the top of every page,
  // and upgrades any existing .pride-stripe / .pride-banner to the same look.
  function initPrideProgressBanner() {
    var style = document.createElement('style');
    style.textContent = `
      :root {
        --progress-pride-gradient: linear-gradient(90deg,
          #000000 0%, #613915 5%, #73d7ee 10%, #ffafc8 15%, #ffffff 20%,
          #e40303 28%, #ff8c00 38%, #ffed00 48%, #008026 60%, #004dff 72%, #750787 85%,
          #e40303 100%);
      }
      @keyframes progressPrideShimmer {
        0%   { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }
      .progress-pride-banner {
        height: 6px;
        width: 100%;
        background: var(--progress-pride-gradient);
        background-size: 200% 100%;
        animation: progressPrideShimmer 10s linear infinite;
        display: block;
        position: relative;
        z-index: 2;
      }
      /* Upgrade any existing stripe/banner element to the animated progress flag */
      .pride-stripe, .pride-banner {
        background: var(--progress-pride-gradient) !important;
        background-size: 200% 100% !important;
        animation: progressPrideShimmer 10s linear infinite !important;
        height: 6px !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .progress-pride-banner, .pride-stripe, .pride-banner {
          animation: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    // If a page already has a top-level pride stripe/banner, leave it in place
    // (the CSS above will restyle it). Otherwise, insert one as the first body child.
    var existing = document.querySelector('body > .pride-stripe, body > .pride-banner, body > .progress-pride-banner');
    if (!existing && document.body) {
      var banner = document.createElement('div');
      banner.className = 'progress-pride-banner';
      banner.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(banner, document.body.firstChild);
    }
  }

  // 1. SCROLL-REVEAL ANIMATIONS
  // Fade in + slide up elements as they enter the viewport
  function initScrollReveal() {
    const style = document.createElement('style');
    style.textContent = `
      .reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.6s ease, transform 0.6s ease; }
      .reveal.visible { opacity: 1; transform: translateY(0); }
      .reveal-delay-1 { transition-delay: 0.1s; }
      .reveal-delay-2 { transition-delay: 0.2s; }
      .reveal-delay-3 { transition-delay: 0.3s; }
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

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach((el, i) => {
        el.classList.add('reveal');
        if (i % 3 === 1) el.classList.add('reveal-delay-1');
        if (i % 3 === 2) el.classList.add('reveal-delay-2');
      });
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
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
      .hero-divider, .btn-primary, .nav-logo {
        background-size: 200% 200%;
        animation: rainbowShift 4s ease infinite;
      }
      .progress-fill, .progress-bar-fill {
        background-size: 200% 200%;
        animation: rainbowShift 3s ease infinite;
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

  // 5. SMOOTH PAGE LOAD
  function initSmoothLoad() {
    const style = document.createElement('style');
    style.textContent = `
      body { animation: fadeIn 0.4s ease; }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);
  }

  // 6. STATS COUNTER ON ISSUES PAGE
  // Animates the stat numbers in the stats bar.
  // IMPORTANT: skip any element that already has its own animator
  // (signaled by [data-count] or [data-count-to]). Otherwise we will
  // race the page's own counter and read a stale 0 from textContent,
  // freezing the headline numbers at zero. The scorecard stats bar
  // owns its own animation in scorecard.html, so it opts out here.
  function initStatsAnimation() {
    const statNumbers = document.querySelectorAll('.stat-number:not([data-count]):not([data-count-to])');
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
    initSmoothLoad();
    initRainbowAnimation();
    initScrollReveal();
    initCounters();
    initCardGlow();
    initStatsAnimation();
    initActiveNav();
    initProgressAnimation();
  });
})();
