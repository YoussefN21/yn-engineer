(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ================================================================
     Network awareness — slow or data-saving connections get posters
     instead of autoplaying background clips, and the showreel starts
     at a quality the connection can actually sustain.
  ================================================================= */
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  function netTier() {
    if (!conn) return "mid";                       // Safari/Firefox don't expose it
    if (conn.saveData) return "slow";
    const et = conn.effectiveType || "";
    if (et === "slow-2g" || et === "2g") return "slow";
    if (et === "3g" || (conn.downlink && conn.downlink < 1.5)) return "low";
    if (conn.downlink && conn.downlink >= 6) return "high";
    return "mid";
  }
  /* "slow" = don't autoplay anything; a downlink under 0.8 Mbps can't
     keep even the background clips moving, whatever the label says */
  const slowNet = () => netTier() === "slow" || (!!conn && !!conn.downlink && conn.downlink < 0.8);

  /* ================================================================
     Showreel — a tiny silent version loops while in view (a moving
     poster); "Watch with sound" plays the full cut at 480p / 720p /
     1080p chosen from the connection, and steps down a level by itself
     (keeping the playback position) if the video keeps stalling.
     The chapter strip under the player doubles as the timeline.
  ================================================================= */
  const player = document.getElementById("reelPlayer");
  const video = document.getElementById("reelVideo");

  if (player && video) {
    const startBtn = document.getElementById("reelStart");
    const toggleBtn = document.getElementById("reelToggle");
    const muteBtn = document.getElementById("reelMute");
    const fullBtn = document.getElementById("reelFull");
    const qualityBtn = document.getElementById("reelQuality");
    const scrub = document.getElementById("reelScrub");
    const scrubFill = document.getElementById("reelScrubFill");
    const timeEl = document.getElementById("reelTime");
    const chapters = [...document.querySelectorAll("#reelChapters .reel-chapter")];
    const PREVIEW_SRC = video.dataset.preview;
    const QUALITIES = [
      { label: "480p", src: video.dataset.src480 },
      { label: "720p", src: video.dataset.src720 },
      { label: "1080p", src: video.dataset.src1080 }
    ];
    let quality = 1;
    let autoQuality = true;
    let inView = false;
    let hideTimer = null;
    let stallTimer = null;
    let stalls = [];

    const isPreview = () => player.classList.contains("is-preview");
    const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

    function pickQuality() {
      const tier = netTier();
      let q = tier === "slow" || tier === "low" ? 0 : tier === "high" ? 2 : 1;
      if (player.clientWidth < 700) q = Math.min(q, 1);   // phones: 720p is plenty
      return q;
    }

    function syncQualityLabel() {
      qualityBtn.textContent = QUALITIES[quality].label;
      qualityBtn.setAttribute("aria-label", `Quality: ${QUALITIES[quality].label}${autoQuality ? " (auto)" : ""}. Change quality`);
      qualityBtn.classList.toggle("is-auto", autoQuality);
    }

    /* swap the file but keep the position and play state */
    function setSource(src, at, play) {
      if (video.getAttribute("src") === src) {
        if (at != null) video.currentTime = at;
        if (play) video.play().catch(() => {});
        return;
      }
      video.src = src;
      video.addEventListener("loadedmetadata", () => {
        if (at) video.currentTime = at;
        if (play) video.play().catch(() => {});
      }, { once: true });
      video.load();
    }

    function switchQuality(q) {
      quality = q;
      stalls = [];
      syncQualityLabel();
      setSource(QUALITIES[q].src, video.currentTime, !video.paused);
    }

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
      if (autoQuality) quality = pickQuality();
      syncQualityLabel();
      video.loop = false;
      video.muted = false;
      stalls = [];
      setSource(QUALITIES[quality].src, at, true);
      wakeControls();
    }

    function backToPreview() {
      player.classList.add("is-preview");
      video.loop = true;
      video.muted = true;
      const play = inView && !reduceMotion && !slowNet();
      setSource(PREVIEW_SRC, 0, play);
      if (!play) video.pause();
      syncState();
      syncProgress();
    }

    /* Stall watchdog: a freeze longer than 2.5 s, or two freezes within
       20 s, drops one quality level (only while on auto). */
    video.addEventListener("waiting", () => {
      if (isPreview() || video.seeking) return;
      clearTimeout(stallTimer);
      const now = Date.now();
      stalls = stalls.filter((t) => now - t < 20000);
      stalls.push(now);
      const downgrade = () => {
        if (autoQuality && quality > 0 && !isPreview()) switchQuality(quality - 1);
      };
      if (stalls.length >= 2) downgrade();
      else stallTimer = setTimeout(() => { if (video.readyState < 3) downgrade(); }, 2500);
    });
    video.addEventListener("playing", () => clearTimeout(stallTimer));

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
    /* Manual quality: 480p -> 720p -> 1080p -> Auto */
    qualityBtn.addEventListener("click", () => {
      if (autoQuality) { autoQuality = false; switchQuality(0); }
      else if (quality < QUALITIES.length - 1) switchQuality(quality + 1);
      else { autoQuality = true; switchQuality(pickQuality()); }
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

    /* The silent preview only starts downloading once the player is on
       screen, and never on slow / data-saver connections. */
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) video.pause();
      else if (isPreview() && !reduceMotion && !slowNet()) video.play().catch(() => {});
    }, { threshold: 0.3 }).observe(player);

    syncQualityLabel();
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
          if (slowNet()) return;              // poster + tap-to-play controls instead
          if (!target.src) target.src = target.dataset.src;
          if (!reduceMotion) target.play().catch(() => {});
        } else {
          target.pause();
        }
      });
    }, { threshold: 0.35 });
    clips.forEach((v) => {
      if (reduceMotion || slowNet()) {
        v.controls = true;
        v.preload = "none";
        if (!v.src) v.src = v.dataset.src;   // nothing downloads until tapped
      }
      io.observe(v);
    });
  }
})();
