/* ============================================================
   Ohio Pride PAC — Main JavaScript
   Navigation, Donations, Forms, Progress Bar
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* --- Mobile Navigation Toggle --- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      // Update aria state
      const isOpen = navLinks.classList.contains('open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });

    // Close nav when clicking a link (mobile)
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* --- Scroll-based Nav Background (homepage only) --- */
  const nav = document.getElementById('nav');
  if (nav && !nav.classList.contains('nav-solid')) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 80) {
        nav.classList.add('nav-solid');
      } else {
        nav.classList.remove('nav-solid');
      }
    }, { passive: true });
  }

  /* --- Smooth Scrolling for Anchor Links --- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = document.querySelector('.nav') ? document.querySelector('.nav').offsetHeight : 0;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }
    });
  });

  /* --- Donate Amount Buttons --- */
  const donateAmounts = document.querySelectorAll('.donate-amount');
  const actblueBtn = document.getElementById('actblueBtn');
  let selectedAmount = 100; // default

  donateAmounts.forEach(function (btn) {
    btn.addEventListener('click', function () {
      donateAmounts.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedAmount = btn.getAttribute('data-amount');

      // Update ActBlue link when available
      if (actblueBtn) {
        if (selectedAmount === 'other') {
          actblueBtn.href = 'https://secure.actblue.com/donate/ohiopridepac';
        } else {
          actblueBtn.href = 'https://secure.actblue.com/donate/ohiopridepac?amount=' + selectedAmount;
        }
      }
    });
  });

  /* --- Contact Form Submission (Netlify) --- */
  const contactForm = document.getElementById('contactForm');
  const formSuccess = document.getElementById('formSuccess');

  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const formData = new FormData(contactForm);

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(formData).toString()
      })
        .then(function (response) {
          if (response.ok) {
            contactForm.style.display = 'none';
            if (formSuccess) formSuccess.style.display = 'block';
          } else {
            alert('Something went wrong. Please try again or email us directly.');
          }
        })
        .catch(function () {
          alert('Something went wrong. Please try again or email us directly.');
        });
    });
  }

  /* --- Founding Member Progress Bar Animation --- */
  const goalFill = document.getElementById('goalFill');
  if (goalFill) {
    // Current amount raised — update this value manually or via API
    const raised = 0;
    const goal = 35000;
    const pct = Math.min((raised / goal) * 100, 100);

    // Animate on scroll into view
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          goalFill.style.width = pct + '%';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    observer.observe(goalFill.parentElement);
  }

});
