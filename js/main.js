(() => {
  "use strict";

  document.getElementById("year").textContent = new Date().getFullYear();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGSAP = typeof gsap !== "undefined";
  const pointerFine = window.matchMedia("(pointer:fine)").matches;
  if (hasGSAP && typeof ScrollTrigger !== "undefined") gsap.registerPlugin(ScrollTrigger);

  /* ================================================================
     Split text into animatable <span class="word"> — <br> aware
  ================================================================= */
  function splitWords(el) {
    const lines = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = lines
      .map(line =>
        line.trim().split(/\s+/).filter(Boolean)
          .map(w => `<span class="word">${w}</span>`)
          .join(" ")
      )
      .join("<br>");
    return Array.from(el.querySelectorAll(".word"));
  }

  /* ================================================================
     Nav: scroll state, mobile toggle, active-section highlight
  ================================================================= */
  const nav = document.getElementById("nav");
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");

  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 12);
  }, { passive: true });

  navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
  navLinks.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => navLinks.classList.remove("open"));
  });

  const sections = ["home", "about", "services", "projects", "contact"]
    .map(id => document.getElementById(id)).filter(Boolean);
  const navLinkEls = document.querySelectorAll(".nav-link");
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinkEls.forEach(l => l.classList.toggle("active", l.getAttribute("href") === "#" + entry.target.id));
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach(s => sectionObserver.observe(s));

  /* ================================================================
     Stat counters
  ================================================================= */
  document.querySelectorAll("[data-count]").forEach(el => {
    new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const target = parseInt(el.dataset.count, 10);
        const duration = 1200;
        const start = performance.now();
        function tick(now) {
          const p = Math.min((now - start) / duration, 1);
          el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        obs.unobserve(el);
      });
    }, { threshold: 0.5 }).observe(el);
  });

  /* ================================================================
     Tilt on cards (GSAP-only enhancement)
  ================================================================= */
  function applyTilt(el, max = 8) {
    const rx = gsap.quickTo(el, "rotationX", { duration: .5, ease: "power3" });
    const ry = gsap.quickTo(el, "rotationY", { duration: .5, ease: "power3" });
    gsap.set(el, { transformPerspective: 700, transformStyle: "preserve-3d" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5;
      const py = (e.clientY - r.top) / r.height - .5;
      rx(-py * max);
      ry(px * max);
    });
    el.addEventListener("pointerleave", () => { rx(0); ry(0); });
  }
  function initTilts(root) {
    if (!hasGSAP || !pointerFine) return;
    root.querySelectorAll(".service-card").forEach(el => applyTilt(el));
  }

  /* ================================================================
     Fallback path — no GSAP or reduced motion: reveal, no fancy motion
  ================================================================= */
  if (!hasGSAP || reduceMotion) {
    document.getElementById("preloader")?.remove();
    document.getElementById("cursorRing")?.remove();
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("in-view"));
    document.querySelectorAll(".hero-title, .section-title").forEach(splitWords);
    document.querySelectorAll(".word").forEach(w => { w.style.opacity = 1; w.style.transform = "none"; });
    return;
  }

  /* ================================================================
     Preloader → Hero entrance
  ================================================================= */
  const preloader = document.getElementById("preloader");
  const preloaderLogo = document.getElementById("preloaderLogo");
  const heroWords = splitWords(document.querySelector(".hero-title"));

  gsap.set(heroWords, { yPercent: 120, opacity: 0 });
  gsap.set(".eyebrow, .hero-lead, .hero-tags .pill, .hero-actions .btn", { opacity: 0, y: 16 });
  gsap.set(".hero-avatar", { opacity: 0, scale: .8 });
  gsap.set(".hero-canvas", { opacity: 0 });

  function heroTimeline() {
    const tl = gsap.timeline();
    tl.to(".hero-canvas", { opacity: window.innerWidth <= 860 ? 0.16 : 1, duration: 1.4, ease: "power2.out" })
      .to(".hero-avatar", { opacity: 1, scale: 1, duration: .6, ease: "back.out(1.6)" }, "-=1.15")
      .to(".eyebrow", { opacity: 1, y: 0, duration: .5 }, "-=.4")
      .to(heroWords, { yPercent: 0, opacity: 1, duration: .9, stagger: .05 }, "-=.25")
      .to(".hero-lead", { opacity: 1, y: 0, duration: .6 }, "-=.5")
      .to(".hero-tags .pill", { opacity: 1, y: 0, duration: .5, stagger: .07 }, "-=.35")
      .to(".hero-actions .btn", { opacity: 1, y: 0, duration: .5, stagger: .08 }, "-=.3");
    return tl;
  }

  const introTl = gsap.timeline({
    defaults: { ease: "expo.out" },
    onComplete: () => {
      preloader.remove();
      initTilts(document);
    }
  });

  introTl
    .to(preloaderLogo, { opacity: 1, scale: 1, duration: .6, ease: "back.out(1.7)" })
    .to(preloaderLogo, { opacity: 0, scale: .8, duration: .4, ease: "power1.in" }, "+=.35")
    .to(preloader, { yPercent: -100, duration: .7, ease: "expo.inOut" }, "<-.05")
    .add(heroTimeline(), "<+.15");

  /* ================================================================
     Generic .reveal → ScrollTrigger
  ================================================================= */
  gsap.utils.toArray(".reveal").forEach(el => {
    gsap.fromTo(el, { opacity: 0, y: 28 }, {
      opacity: 1, y: 0, duration: .8, ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none none" }
    });
  });
  window.addEventListener("load", () => window.ScrollTrigger && ScrollTrigger.refresh());

  /* ================================================================
     Section title word reveal
  ================================================================= */
  document.querySelectorAll(".section-title").forEach(title => {
    const words = splitWords(title);
    gsap.from(words, {
      yPercent: 100, opacity: 0, duration: .7, stagger: .04, ease: "power3.out",
      scrollTrigger: { trigger: title, start: "top 88%" }
    });
  });

  /* ================================================================
     Stagger children reveals
  ================================================================= */
  function staggerReveal(selector, childSelector, vars = {}) {
    document.querySelectorAll(selector).forEach(parent => {
      const children = parent.querySelectorAll(childSelector);
      if (!children.length) return;
      gsap.from(children, {
        opacity: 0, y: 24, duration: .55, stagger: .08, ease: "power2.out",
        scrollTrigger: { trigger: parent, start: "top 85%" },
        ...vars
      });
    });
  }
  staggerReveal(".tag-cloud", ".tag");
  staggerReveal(".cert-row", ".cert-badge");
  staggerReveal(".timeline", ".timeline-item");
  /* Not staggered here: the parent .service-group already carries its own
     .reveal fade-in, so an additional per-card stagger just meant each
     card settled into its final aligned position a beat apart — reading
     as a layout bug (cards "misaligned") to anyone who glanced at it
     mid-animation, when really every card's CSS position was correct. */
  /* Contact cards: no entrance fade/pop — always fully visible. The
     earlier reveal animation kept getting caught mid-flight and read as
     broken, so the cards just render in their final state from the start.
     The ambient pulsing ring (pure CSS, no JS) is the only motion here. */

  /* ================================================================
     Manufacturing-file examples — DXF's selected work is pinned under
     the buttons from the moment the page loads (no click needed); pick
     a different button and its examples swap in instead. Drop real
     photos into assets/images/manufacturing/ and list their filenames
     below; until then each service shows placeholder tiles instead of
     a broken image or a stock photo standing in for real work.
  ================================================================= */
  const MFG_EXAMPLES = {
    dxf: { title: "DXF — Sheet-Metal CNC Laser Cut: selected work", images: [
      "assets/images/mfg/dxf/dxf-02.jpg",
      "assets/images/mfg/dxf/dxf-03.jpg",
      "assets/images/mfg/dxf/dxf-04.jpg",
      "assets/images/mfg/dxf/dxf-05.jpg",
      "assets/images/mfg/dxf/dxf-06.jpg"
    ] },
    iges: { title: "IGES — Pipe Rotary Laser CNC Cut: selected work", images: [
      "assets/images/mfg/iges/iges-01.jpg",
      "assets/images/mfg/iges/iges-02.jpg",
      "assets/images/mfg/iges/iges-03.jpg",
      "assets/images/mfg/iges/iges-04.jpg",
      "assets/images/mfg/iges/iges-05.jpg",
      "assets/images/mfg/iges/iges-06.jpg",
      "assets/images/mfg/iges/iges-07.jpg"
    ] },
    fabrication: { title: "Fabrication Drawings (PDF): selected work", images: [
      "assets/images/mfg/fabrication/fab-01.jpg",
      "assets/images/mfg/fabrication/fab-02.jpg",
      "assets/images/mfg/fabrication/fab-03.jpg",
      "assets/images/mfg/fabrication/fab-04.jpg",
      "assets/images/mfg/fabrication/fab-05.jpg"
    ] }
  };
  const mfgCards = document.getElementById("mfgCards");
  const mfgGallery = document.getElementById("mfgGallery");
  const mfgGalleryTitle = document.getElementById("mfgGalleryTitle");
  const mfgGalleryGrid = document.getElementById("mfgGalleryGrid");

  function renderMfgGallery(key) {
    const data = MFG_EXAMPLES[key];
    mfgGalleryTitle.textContent = data.title;
    if (data.images.length) {
      mfgGalleryGrid.innerHTML = data.images
        .map(src => `<div class="mfg-gallery-item"><img src="${src}" alt="${data.title}" loading="lazy"></div>`)
        .join("");
    } else {
      mfgGalleryGrid.innerHTML = Array.from({ length: 3 }).map(() => `
        <div class="mfg-gallery-item">
          <div class="mfg-gallery-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 16l5-5 4 4 5-6 4 5"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/></svg>
            <span>Example coming soon</span>
          </div>
        </div>`).join("");
    }
  }

  if (mfgCards && mfgGallery) {
    mfgCards.querySelectorAll(".mfg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.getAttribute("aria-pressed") === "true") return;
        mfgCards.querySelectorAll(".mfg-btn").forEach(b => b.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");
        renderMfgGallery(btn.dataset.service);
      });
    });
    renderMfgGallery("dxf");
  }

  /* ================================================================
     Lightbox — click any gallery photo (currently just the manufacturing
     files gallery) to view it full-size.
  ================================================================= */
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxClose = document.getElementById("lightboxClose");

  function openLightbox(src, alt) {
    lightboxImg.src = src;
    lightboxImg.alt = alt || "";
    lightbox.classList.add("active");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.classList.remove("active");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  if (lightbox && mfgGalleryGrid) {
    mfgGalleryGrid.addEventListener("click", (e) => {
      const img = e.target.closest("img");
      if (img) openLightbox(img.src, img.alt);
    });
    lightboxClose.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && lightbox.classList.contains("active")) closeLightbox();
    });
  }

  /* ================================================================
     Video showcase — only load/play the clip once it's actually about
     to be seen, and pause it once scrolled away, so it isn't burning
     bandwidth or GPU decode time on a background element off-screen.
  ================================================================= */
  const showcaseVideo = document.getElementById("showcaseVideo");
  if (showcaseVideo) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (!showcaseVideo.src && showcaseVideo.dataset.src) showcaseVideo.src = showcaseVideo.dataset.src;
          showcaseVideo.play().catch(() => {});
        } else {
          showcaseVideo.pause();
        }
      });
    }, { threshold: 0.15 }).observe(showcaseVideo);
  }

  /* Shop floor video: lazy-load the source once scrolled into view, but
     never autoplay it (it's a manually-navigated slide with real audio,
     not a background loop) — just pause if the visitor scrolls away
     mid-playback. */
  const shopfloorVideo = document.getElementById("shopfloorVideo");
  if (shopfloorVideo) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (!shopfloorVideo.src && shopfloorVideo.dataset.src) shopfloorVideo.src = shopfloorVideo.dataset.src;
        } else {
          shopfloorVideo.pause();
        }
      });
    }, { threshold: 0.15 }).observe(shopfloorVideo);
  }

  /* ================================================================
     Sliding galleries — 3D Rendering & Visualization, Featured Shop
     Floor. Shared helper so the width-measurement fix below only has
     to exist (and be correct) in one place.
  ================================================================= */
  function initSlider(sliderId, trackSelector, slideSelector, prevId, nextId) {
    const slider = document.getElementById(sliderId);
    if (!slider) return;
    const track = slider.querySelector(trackSelector);
    const slides = slider.querySelectorAll(slideSelector);
    const prevBtn = document.getElementById(prevId);
    const nextBtn = document.getElementById(nextId);
    let index = 0;

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      /* Measure the track itself, not the outer slider box — that box's
         1px border made each step ~2px too wide, an error that accumulated
         slide-over-slide until later slides sat visibly off-center. The
         track has no border and no transform of its own, so its width
         always matches each flex slide's real layout size. */
      const slideWidth = track.getBoundingClientRect().width;
      track.style.transform = `translateX(-${index * slideWidth}px)`;
    }

    prevBtn.addEventListener("click", () => goTo(index - 1));
    nextBtn.addEventListener("click", () => goTo(index + 1));
    window.addEventListener("resize", () => goTo(index));
  }

  initSlider("renderSlider", ".render-slider-track", ".render-slide", "renderPrev", "renderNext");
  initSlider("shopfloorSlider", ".shopfloor-slider-track", ".shopfloor-slide", "shopfloorPrev", "shopfloorNext");

  /* ================================================================
     Magnetic buttons (1-2 focal CTAs per viewport)
  ================================================================= */
  function applyMagnetic(el, strength = .35) {
    const xTo = gsap.quickTo(el, "x", { duration: .4, ease: "power3" });
    const yTo = gsap.quickTo(el, "y", { duration: .4, ease: "power3" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * strength);
      yTo((e.clientY - r.top - r.height / 2) * strength);
    });
    el.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
  }
  if (pointerFine) {
    document.querySelectorAll(".btn-primary, .btn-outline, .btn-outline-light").forEach(el => applyMagnetic(el));
  }

  /* ================================================================
     Custom cursor ring
  ================================================================= */
  const ring = document.getElementById("cursorRing");
  if (ring && pointerFine) {
    const ringX = gsap.quickTo(ring, "x", { duration: .25, ease: "power3" });
    const ringY = gsap.quickTo(ring, "y", { duration: .25, ease: "power3" });
    window.addEventListener("pointermove", (e) => {
      ring.classList.add("is-active");
      ringX(e.clientX);
      ringY(e.clientY);
    });
    document.addEventListener("pointerover", (e) => {
      ring.classList.toggle("is-hover", !!e.target.closest("a, button, .service-card, .project-stage, .contact-card, .slider-arrow, .slide-dot"));
    });
    document.documentElement.addEventListener("mouseleave", () => ring.classList.remove("is-active"));
  } else if (ring) {
    ring.remove();
  }

})();
