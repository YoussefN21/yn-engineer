(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fmt(t) {
    if (!isFinite(t)) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /* ================================================================
     Showreel — the hero badge plays a tiny muted loop of the reel;
     clicking it grows a circle out of the badge (clip-path) until the
     whole screen becomes the hero's own studio-grey stage, with the
     full video (sound on) framed in the same viewfinder corners the
     reel itself uses. Closes on Esc, the X, or when the video ends.
  ================================================================= */
  const badge = document.getElementById("reelBadge");
  const reel = document.getElementById("reel");
  const video = document.getElementById("reelVideo");
  const toggle = document.getElementById("reelToggle");
  const closeBtn = document.getElementById("reelClose");
  const time = document.getElementById("reelTime");
  const progress = document.getElementById("reelProgress");
  const fill = document.getElementById("reelProgressFill");
  const preview = badge?.querySelector("video");

  if (reduceMotion && preview) {
    preview.removeAttribute("autoplay");
    preview.pause();
  }

  if (badge && reel && video) {
    let lastFocus = null;

    function setOrigin() {
      const r = badge.getBoundingClientRect();
      reel.style.setProperty("--cx", `${r.left + r.width / 2}px`);
      reel.style.setProperty("--cy", `${r.top + r.height / 2}px`);
    }

    function syncToggle() {
      const paused = video.paused;
      reel.classList.toggle("is-paused", paused);
      toggle.setAttribute("aria-label", paused ? "Play" : "Pause");
    }

    function open() {
      lastFocus = document.activeElement;
      if (!video.src) video.src = video.dataset.src;
      setOrigin();
      reel.setAttribute("aria-hidden", "false");
      reel.classList.add("open");
      document.documentElement.classList.add("reel-lock");
      preview?.pause();
      video.currentTime = 0;
      video.play().catch(() => {});
      syncToggle();
      closeBtn.focus({ preventScroll: true });
    }

    function close() {
      if (!reel.classList.contains("open")) return;
      setOrigin();
      video.pause();
      reel.classList.remove("open");
      reel.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("reel-lock");
      if (!reduceMotion) preview?.play().catch(() => {});
      (lastFocus || badge).focus({ preventScroll: true });
    }

    function togglePlay() {
      if (video.paused) video.play().catch(() => {}); else video.pause();
    }

    badge.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    toggle.addEventListener("click", togglePlay);
    video.addEventListener("click", togglePlay);
    video.addEventListener("play", syncToggle);
    video.addEventListener("pause", syncToggle);
    video.addEventListener("ended", close);
    video.addEventListener("timeupdate", () => {
      const d = video.duration || 50;
      fill.style.transform = `scaleX(${video.currentTime / d})`;
      time.textContent = `${fmt(video.currentTime)} / ${fmt(d)}`;
    });

    progress.addEventListener("click", (e) => {
      const r = progress.getBoundingClientRect();
      if (video.duration) video.currentTime = ((e.clientX - r.left) / r.width) * video.duration;
    });

    document.addEventListener("keydown", (e) => {
      if (!reel.classList.contains("open")) return;
      if (e.key === "Escape") close();
      if (e.key === " " && document.activeElement !== toggle) { e.preventDefault(); togglePlay(); }
      /* keep keyboard focus inside the dialog */
      if (e.key === "Tab") {
        const items = [toggle, closeBtn];
        const i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      }
    });
  }

  /* ================================================================
     Built — CAD render vs. manufactured comparison. A full-size,
     invisible range input drives the wipe, so mouse drag, touch and
     arrow keys all work without custom pointer code.
  ================================================================= */
  const compare = document.getElementById("buildCompare");
  const range = document.getElementById("buildCompareRange");
  if (compare && range) {
    const update = () => compare.style.setProperty("--pos", `${range.value}%`);
    range.addEventListener("input", update);
    update();
  }

  /* "Rotate it in 3D" — jump to the Projects slider and select this
     machine's model (data-project = its index in projects3d.js). */
  const view3d = document.getElementById("buildView3d");
  if (view3d) {
    view3d.addEventListener("click", () => {
      const dot = document.querySelector(`#slideDots .slide-dot[data-i="${view3d.dataset.project}"]`);
      dot?.click();
    });
  }

  /* Process clips — load and play only while on screen. */
  const clips = document.querySelectorAll(".build-video");
  if (clips.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) {
          if (!target.src) target.src = target.dataset.src;
          if (!reduceMotion) target.play().catch(() => {});
        } else {
          target.pause();
        }
      });
    }, { threshold: 0.35 });
    clips.forEach((v) => {
      if (reduceMotion) v.controls = true;
      io.observe(v);
    });
  }
})();
