(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ================================================================
     Showreel — plays muted on loop while in view (a moving poster);
     "Play with sound" restarts the full cut with custom controls.
     The chapter strip under the player is the timeline: each segment
     fills as its chapter plays, and clicking one jumps to it.
  ================================================================= */
  const player = document.getElementById("reelPlayer");
  const video = document.getElementById("reelVideo");

  if (player && video) {
    const startBtn = document.getElementById("reelStart");
    const toggleBtn = document.getElementById("reelToggle");
    const muteBtn = document.getElementById("reelMute");
    const fullBtn = document.getElementById("reelFull");
    const scrub = document.getElementById("reelScrub");
    const scrubFill = document.getElementById("reelScrubFill");
    const timeEl = document.getElementById("reelTime");
    const chapters = [...document.querySelectorAll("#reelChapters .reel-chapter")];
    let inView = false;
    let hideTimer = null;

    const isPreview = () => player.classList.contains("is-preview");
    const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

    function syncState() {
      player.classList.toggle("is-paused", video.paused);
      player.classList.toggle("is-playing", !video.paused);
      player.classList.toggle("is-muted", video.muted);
      toggleBtn.setAttribute("aria-label", video.paused ? "Play" : "Pause");
      muteBtn.setAttribute("aria-label", video.muted ? "Unmute" : "Mute");
    }

    function syncProgress() {
      const t = video.currentTime;
      const d = video.duration || 50;
      scrubFill.style.transform = `scaleX(${t / d})`;
      timeEl.textContent = `${fmt(t)} / ${fmt(d)}`;
      scrub.setAttribute("aria-valuenow", Math.round(t));
      chapters.forEach((c) => {
        const s = +c.dataset.start, e = +c.dataset.end;
        const p = Math.min(Math.max((t - s) / (e - s), 0), 1);
        c.style.setProperty("--p", p.toFixed(3));
        const active = t >= s && t < e;
        if (active && !c.classList.contains("is-active")) {
          /* on phones the strip scrolls sideways: keep the current chapter
             in view (scrollLeft only, so the page itself never jumps) */
          const strip = c.closest(".reel-chapters");
          const li = c.parentElement;
          if (strip.scrollWidth > strip.clientWidth) {
            strip.scrollTo({ left: li.offsetLeft - strip.offsetLeft - 20, behavior: "smooth" });
          }
        }
        c.classList.toggle("is-active", active);
      });
    }

    function enterFull(at = 0) {
      player.classList.remove("is-preview");
      video.loop = false;
      video.muted = false;
      video.currentTime = at;
      video.play().catch(() => {});
      wakeControls();
    }

    function backToPreview() {
      player.classList.add("is-preview");
      video.loop = true;
      video.muted = true;
      video.currentTime = 0;
      if (inView && !reduceMotion) video.play().catch(() => {}); else video.pause();
      syncState();
      syncProgress();
    }

    let overControls = false;
    function wakeControls() {
      player.classList.add("show-controls");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!video.paused && !overControls) player.classList.remove("show-controls");
      }, 2400);
    }
    const controlsBar = document.getElementById("reelControls");
    controlsBar.addEventListener("pointerenter", () => { overControls = true; });
    controlsBar.addEventListener("pointerleave", () => { overControls = false; wakeControls(); });

    function seekFromEvent(e) {
      const r = scrub.getBoundingClientRect();
      const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
      video.currentTime = x * (video.duration || 50);
    }

    startBtn.addEventListener("click", () => enterFull(0));
    toggleBtn.addEventListener("click", () => (video.paused ? video.play() : video.pause()));
    video.addEventListener("click", () => {
      if (isPreview()) return enterFull(0);
      video.paused ? video.play() : video.pause();
    });
    muteBtn.addEventListener("click", () => { video.muted = !video.muted; });
    fullBtn.addEventListener("click", () => {
      if (document.fullscreenElement) return document.exitFullscreen();
      if (player.requestFullscreen) player.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
    });

    let dragging = false;
    scrub.addEventListener("pointerdown", (e) => { dragging = true; scrub.setPointerCapture(e.pointerId); seekFromEvent(e); });
    scrub.addEventListener("pointermove", (e) => { if (dragging) seekFromEvent(e); });
    scrub.addEventListener("pointerup", () => { dragging = false; });
    scrub.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { video.currentTime += 5; e.preventDefault(); }
      if (e.key === "ArrowLeft") { video.currentTime -= 5; e.preventDefault(); }
    });

    chapters.forEach((c) => c.addEventListener("click", () => {
      const at = +c.dataset.start + 0.05;
      if (isPreview()) enterFull(at); else { video.currentTime = at; video.play().catch(() => {}); }
    }));

    player.addEventListener("pointermove", () => { if (!isPreview()) wakeControls(); });
    player.addEventListener("pointerdown", () => { if (!isPreview()) wakeControls(); }, true);
    video.addEventListener("play", syncState);
    video.addEventListener("pause", syncState);
    video.addEventListener("volumechange", syncState);
    video.addEventListener("timeupdate", syncProgress);
    video.addEventListener("loadedmetadata", syncProgress);
    video.addEventListener("ended", backToPreview);

    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) video.pause();
      else if (isPreview() && !reduceMotion) video.play().catch(() => {});
    }, { threshold: 0.3 }).observe(player);

    syncState();
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
