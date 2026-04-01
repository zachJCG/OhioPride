/* ============================================================
   Ohio Pride PAC — Main JavaScript
   Navigation, Forms, Progress Bar
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  /* --- Mobile Navigation Toggle --- */
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      navLinks.classList.toggle("open");
      const isOpen = navLinks.classList.contains("open");
      navToggle.setAttribute("aria-expanded", isOpen);
    });

    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* --- Scroll-based Nav Background (homepage only) --- */
  const nav = document.getElementById("nav");
  if (nav && !nav.classList.contains("nav-solid")) {
    window.addEventListener(
      "scroll",
      function () {
        if (window.scrollY > 80) {
          nav.classList.add("nav-solid");
        } else {
          nav.classList.remove("nav-solid");
        }
      },
      { passive: true },
    );
  }

  /* --- Smooth Scrolling for Anchor Links --- */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (e) {
      const targetId = this.getAttribute("href");
      if (targetId === "#") return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = document.querySelector(".nav")
          ? document.querySelector(".nav").offsetHeight
          : 0;
        const targetPosition =
          target.getBoundingClientRect().top +
          window.pageYOffset -
          navHeight -
          20;
        window.scrollTo({ top: targetPosition, behavior: "smooth" });
      }
    });
  });

  /* --- Founding Member Progress Bar --- */
  var FOUNDING_MEMBER_COUNT = 0;
  var FOUNDING_MEMBER_GOAL = 1969;

  var goalFill = document.getElementById("goalFill");
  var memberCount = document.getElementById("memberCount");

  if (goalFill) {
    var pct = Math.min(
      (FOUNDING_MEMBER_COUNT / FOUNDING_MEMBER_GOAL) * 100,
      100,
    );

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            goalFill.style.width = pct + "%";
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 },
    );

    observer.observe(goalFill.parentElement);
  }

  if (memberCount) {
    memberCount.textContent = FOUNDING_MEMBER_COUNT;
  }

  /* --- Scroll Reveal Animations --- */
  var revealEls = document.querySelectorAll(
    ".reveal, .reveal-left, .reveal-stagger",
  );
  if (revealEls.length) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* --- Animated Number Counter --- */
  function animateCounter(el, target, duration) {
    var start = 0;
    var startTime = null;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      var current = Math.floor(eased * target);
      el.textContent = current.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target.toLocaleString();
      }
    }
    requestAnimationFrame(step);
  }

  var statNums = document.querySelectorAll(".stat-num[data-count]");
  if (statNums.length) {
    var counterObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var target = parseInt(entry.target.dataset.count, 10);
            animateCounter(entry.target, target, 1200);
            entry.target.classList.add("animate");
            counterObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    statNums.forEach(function (el) {
      counterObserver.observe(el);
    });
  }

  /* --- Floating Mobile Donate Button --- */
  var fab = document.querySelector(".mobile-donate-fab");
  if (fab) {
    var fabThreshold = 400;
    var lastScrollY = 0;
    var fabVisible = false;

    window.addEventListener(
      "scroll",
      function () {
        var scrollY = window.scrollY;
        if (scrollY > fabThreshold && !fabVisible) {
          fab.classList.add("show");
          fabVisible = true;
        } else if (scrollY <= fabThreshold && fabVisible) {
          fab.classList.remove("show");
          fabVisible = false;
        }
        lastScrollY = scrollY;
      },
      { passive: true },
    );
  }

  /* --- Contact Form Submission (Netlify) --- */
  var contactForm = document.getElementById("contactForm");
  var formSuccess = document.getElementById("formSuccess");

  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var formData = new FormData(contactForm);

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(formData).toString(),
      })
        .then(function (response) {
          if (response.ok) {
            contactForm.style.display = "none";
            if (formSuccess) formSuccess.style.display = "block";
          } else {
            alert(
              "Something went wrong. Please try again or email us directly.",
            );
          }
        })
        .catch(function () {
          alert("Something went wrong. Please try again or email us directly.");
        });
    });
  }
});
