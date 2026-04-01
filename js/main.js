/* ============================================================
   Ohio Pride PAC — Main JavaScript
   Navigation, Forms, Progress Bar
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* --- Mobile Navigation Toggle --- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      const isOpen = navLinks.classList.contains('open');
      navToggle.setAttribute('aria-expanded', isOpen);
    });

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

  /* --- Founding Member Progress Bar --- */
  var FOUNDING_MEMBER_COUNT = 0;
  var FOUNDING_MEMBER_GOAL = 1969;

  var goalFill = document.getElementById('goalFill');
  var memberCount = document.getElementById('memberCount');

  if (goalFill) {
    var pct = Math.min((FOUNDING_MEMBER_COUNT / FOUNDING_MEMBER_GOAL) * 100, 100);

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          goalFill.style.width = pct + '%';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    observer.observe(goalFill.parentElement);
  }

  if (memberCount) {
    memberCount.textContent = FOUNDING_MEMBER_COUNT;
  }

  /* --- Contact Form Submission (Netlify) --- */
  var contactForm = document.getElementById('contactForm');
  var formSuccess = document.getElementById('formSuccess');

  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var formData = new FormData(contactForm);

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

});
