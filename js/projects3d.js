(() => {
  "use strict";
  const canvas = document.getElementById("projectCanvas");
  const stage = document.getElementById("projectSlider");
  if (!canvas || !stage || typeof THREE === "undefined" || !window.YN3D) return;
  const YN3D = window.YN3D;

  /* This section's WebGL renderer + environment map are as heavyweight to
     spin up as the hero's, but the slider lives below the fold — booting
     it eagerly means two full Three.js scenes compete for GPU/shader-
     compile resources at the exact moment of page load, which is a known
     trigger for mobile Safari silently dropping a WebGL context under
     memory pressure (desktop and iPad have enough headroom to hide it).
     Deferring to idle time lets the hero's already-visible scene finish
     settling first, with no visible effect since this stage isn't on
     screen yet anyway. */
  function boot() {

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const placeholder = document.getElementById("projectPlaceholder");
  const elTitle = document.getElementById("slideTitle");
  const elTag = document.getElementById("slideTag");
  const elDesc = document.getElementById("slideDesc");
  const elCurrent = document.getElementById("slideCurrent");
  const elTotal = document.getElementById("slideTotal");
  const dotsWrap = document.getElementById("slideDots");
  const btnPrev = document.getElementById("slidePrev");
  const btnNext = document.getElementById("slideNext");
  const btnZoomIn = document.getElementById("zoomIn");
  const btnZoomOut = document.getElementById("zoomOut");

  /* ================================================================
     Project data — add a `model` path once a GLB is ready for that
     project; leave it null to show the "coming soon" placeholder.
  ================================================================= */
  const projects = [
    { title: "Multifunctional Trainer", tag: "Gym Equipment · FEA · DFM", desc: "Full cable-machine engineering with technical drawing set, delivered production-ready.", model: "assets/models/multifunctional-trainer.glb?v=3" },
    { title: "Home Cable Machine", tag: "Gym Equipment · Home Fitness", desc: "Compact home-use cable machine engineered for full-body resistance training in a space-saving footprint.", model: "assets/models/home-cable-machine.glb?v=1" },
    { title: "Ultimate Leg Machine", tag: "Gym Equipment · Multi-Station", desc: "Full leg-day station combining leg press, hack squat and calf raise into one heavy-duty commercial frame.", model: "assets/models/ultimate-leg-machine.glb?v=1", yaw: Math.PI },
    { title: "Linear Leg Press", tag: "Gym Equipment · FEA", desc: "Linear-rail leg press engineered for smooth, guided resistance with a reinforced load-bearing frame.", model: "assets/models/linear-leg-press.glb?v=1" },
    { title: "Pediatric Rehabilitation Leg Press", tag: "Medical Devices · Rehabilitation", desc: "Rehabilitation-grade leg press scaled and engineered for pediatric physical therapy programs.", model: "assets/models/pediatric-leg-press.glb?v=1",
      /* Actual foot plane, found by fitting a plane through ALL FOUR ground-contact
         feet — front pair AND rear pair, spanning nearly the full frame length —
         not a one-camera-angle guess, so it now reads correctly from every orbit
         angle. An earlier pass only found the feet at one end and under-rotated
         it into standing upright; this is a low, reclined machine, not a tower. */
      yaw: -Math.PI / 2,
      tiltX: -1.6218202415961016,
      partOverrides: [
        { test: /lever|limiter|telescoping/i, color: 0xc4c8d0, metalness: 0.92, roughness: 0.22 }
      ] },
    { title: "3-in-1 Luxury Baby Mobility", tag: "Baby Mobility · Consumer Products", desc: "Stroller, tricycle and car-seat platform unified into one convertible mobility system.", model: "assets/models/baby-mobility.glb?v=1" },
    { title: "Special Dumbbell", tag: "Gym Equipment · Product Design", desc: "Custom-engineered dumbbell with an ergonomic knurled grip and balanced load distribution.", model: "assets/models/special-dumbbell.glb?v=1", tiltZ: Math.PI / 2 },
    { title: "Preacher Curl Machine", tag: "Gym Equipment · Product Design", desc: "Isolated bicep-curl station with a pivoting arm and adjustable seat, engineered for a controlled, strict range of motion.",
      model: "assets/models/preacher-curl-machine.glb?v=1",
      /* Matches the reference render's finish: safety-yellow powder coat on
         the pivoting arm assembly, charcoal iron frame/seat elsewhere (the
         default "wroughtiron" finish already covers that). */
      partOverrides: [
        { test: /arm_big|arm_small|linker/i, color: 0xf5c332, metalness: 0.15, roughness: 0.42 }
      ] }
  ];

  elTotal.textContent = String(projects.length).padStart(2, "0");
  dotsWrap.innerHTML = projects.map((_, i) => `<button class="slide-dot${i === 0 ? " active" : ""}" data-i="${i}" aria-label="Go to project ${i + 1}"></button>`).join("");

  /* ================================================================
     One shared renderer/scene for the whole slider — only the active
     slide's model is ever loaded, previous one is disposed on change.
  ================================================================= */
  let width = canvas.clientWidth, height = canvas.clientHeight;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth <= 620 ? 1 : 2));
  renderer.setSize(width, height, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.environment = YN3D.buildEnvironment(renderer);
  YN3D.addStudioLights(scene);
  const ground = YN3D.buildGround();
  scene.add(ground);

  const rig = new THREE.Group();
  scene.add(rig);
  const slot = new THREE.Group();
  rig.add(slot);

  let boundingRadius = 2.2;
  /* "Padding" is inverse zoom — smaller pulls the camera closer. Default
     tightened from the original 1.7 (models read too small/distant in
     the stage); wheel/button zoom then adjusts within these bounds. */
  const ZOOM_MIN = 0.85, ZOOM_MAX = 2.0;
  let zoomPadding = 1.3;
  function fitCamera() {
    YN3D.fitCameraToRadius(camera, boundingRadius, zoomPadding);
  }
  fitCamera();

  function zoomBy(factor) {
    zoomPadding = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomPadding * factor));
    fitCamera();
  }
  btnZoomIn?.addEventListener("click", () => zoomBy(1 / 1.15));
  btnZoomOut?.addEventListener("click", () => zoomBy(1.15));
  document.querySelector(".project-stage")?.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? 1.08 : 1 / 1.08);
  }, { passive: false });

  const loader = new THREE.GLTFLoader();
  let currentWrapper = null;
  let currentOscillate = 0;
  let loadToken = 0;

  function disposeWrapper(wrapper) {
    if (!wrapper) return;
    wrapper.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => m && m.dispose());
      }
    });
  }

  function loadSlide(index) {
    const token = ++loadToken;
    const project = projects[index];

    if (currentWrapper) {
      slot.remove(currentWrapper);
      disposeWrapper(currentWrapper);
      currentWrapper = null;
    }
    currentOscillate = 0;

    if (!project.model) {
      ground.visible = false;
      placeholder.style.display = "flex";
      canvas.style.opacity = "0";
      return;
    }

    placeholder.style.display = "none";

    loader.load(
      project.model,
      (gltf) => {
        if (token !== loadToken) return; // a newer slide was requested meanwhile
        const content = YN3D.normalizeModel(gltf.scene, boundingRadius, project.partOverrides);
        /* Tilt lives on its own group, separate from `slot` (which the visitor
           orbits). Setting rotation.x here AND a changing rotation.y on `slot`
           already composes safely since they're different objects — but tilt
           must NOT be set directly on this same object as a yaw, or spinning
           would rotate around the tilted body's own axis instead of world-up
           and visibly warp the model as it turned. Default facing is applied
           via `slot`'s initial angle in goTo() instead, for the same reason. */
        const tiltGroup = new THREE.Group();
        tiltGroup.add(content);
        if (project.tiltX) tiltGroup.rotation.x = project.tiltX;
        if (project.tiltZ) tiltGroup.rotation.z = project.tiltZ;
        slot.add(tiltGroup);
        currentWrapper = tiltGroup;
        currentOscillate = project.oscillate || 0;

        const worldBox = new THREE.Box3().setFromObject(tiltGroup);
        ground.position.set(0, worldBox.min.y, 0);
        ground.scale.setScalar(boundingRadius * 1.15);
        ground.visible = true;

        canvas.style.opacity = "1";
      },
      undefined,
      (err) => {
        console.warn("Project model failed to load:", project.model, err);
        if (token !== loadToken) return;
        placeholder.style.display = "flex";
        canvas.style.opacity = "0";
      }
    );
  }

  /* ================================================================
     Slide switching
  ================================================================= */
  let active = 0;
  function goTo(index) {
    active = (index + projects.length) % projects.length;
    const p = projects[active];
    elTitle.textContent = p.title;
    elTag.textContent = p.tag;
    elDesc.textContent = p.desc;
    elCurrent.textContent = String(active + 1).padStart(2, "0");
    dotsWrap.querySelectorAll(".slide-dot").forEach((d, i) => d.classList.toggle("active", i === active));
    modelAngle = p.yaw || 0;
    modelPitch = 0;
    oscDir = 1;
    loadSlide(active);
  }

  btnPrev.addEventListener("click", () => goTo(active - 1));
  btnNext.addEventListener("click", () => goTo(active + 1));
  dotsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".slide-dot");
    if (btn) goTo(parseInt(btn.dataset.i, 10));
  });

  /* ================================================================
     Visitor-driven orbit — drag the model to look at any side. Idle
     rotation is a slow auto-orbit (or a narrow rock, for models that
     only read correctly within a limited angle) that resumes smoothly
     from wherever the visitor left it, since it's a plain accumulated
     angle rather than a function of absolute time.
  ================================================================= */
  let modelAngle = 0;
  let modelPitch = 0;
  let oscDir = 1;
  const AUTO_SPEED = 0.035; // rad/sec — deliberately slow
  const DRAG_SENSITIVITY = 0.012; // rad per px dragged
  const PITCH_LIMIT = 1.2; // ~69° up/down — enough to look over the top or under, short of a full flip

  function stepAutoRotation(dt) {
    if (currentOscillate) {
      modelAngle += AUTO_SPEED * oscDir * dt;
      if (modelAngle > currentOscillate) { modelAngle = currentOscillate; oscDir = -1; }
      else if (modelAngle < -currentOscillate) { modelAngle = -currentOscillate; oscDir = 1; }
    } else {
      modelAngle += AUTO_SPEED * dt;
    }
  }

  let isDragging = false;
  let dragPointerId = null;
  let lastDragX = 0;
  let lastDragY = 0;
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (e) => {
    if (!currentWrapper) return;
    isDragging = true;
    dragPointerId = e.pointerId;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone — ignore */ }
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!isDragging || e.pointerId !== dragPointerId) return;
    modelAngle += (e.clientX - lastDragX) * DRAG_SENSITIVITY;
    modelPitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, modelPitch + (e.clientY - lastDragY) * DRAG_SENSITIVITY));
    lastDragX = e.clientX;
    lastDragY = e.clientY;
  });
  function endDrag(e) {
    if (e.pointerId !== dragPointerId) return;
    isDragging = false;
    dragPointerId = null;
    canvas.style.cursor = "grab";
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  /* Pointer parallax, scoped to the stage element — suppressed while
     the visitor is actively dragging so the two motions don't compound. */
  let targetRotY = 0, targetRotX = 0.05;
  let curRotY = 0, curRotX = 0.05;
  const stageEl = document.querySelector(".project-stage");
  stageEl.addEventListener("pointermove", (e) => {
    if (isDragging) return;
    const r = stageEl.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    targetRotY = nx * 0.3;
    targetRotX = 0.05 + ny * 0.12;
  }, { passive: true });
  stageEl.addEventListener("pointerleave", () => { targetRotY = 0; targetRotX = 0.05; }, { passive: true });

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    fitCamera();
  }
  window.addEventListener("resize", resize, { passive: true });

  const clock = new THREE.Clock();
  let lastFrameTime = null;
  function render() {
    const t = clock.getElapsedTime();
    const dt = lastFrameTime === null ? 0 : Math.min(t - lastFrameTime, 0.1);
    lastFrameTime = t;
    if (currentWrapper && !isDragging) {
      stepAutoRotation(dt);
    }
    slot.rotation.y = modelAngle;
    slot.rotation.x = modelPitch;
    curRotY += (targetRotY - curRotY) * 0.05;
    curRotX += (targetRotX - curRotX) * 0.05;
    rig.rotation.y = curRotY;
    rig.rotation.x = curRotX;
    renderer.render(scene, camera);
  }

  /* The canvas can measure a near-zero size at the moment this script runs
     (its .project-stage parent lives inside a CSS grid + aspect-ratio box
     whose track width isn't guaranteed resolved on the very first paint),
     and resize() only re-fires on a real window 'resize' event — so a bad
     first reading would otherwise stick forever. Keep retrying on animation
     frames until a real size shows up (bounded, so it can't loop forever). */
  (function ensureRealSize(attemptsLeft) {
    if (canvas.clientWidth > 50 && canvas.clientHeight > 50) { resize(); return; }
    if (attemptsLeft <= 0) return;
    requestAnimationFrame(() => ensureRealSize(attemptsLeft - 1));
  })(90);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) resize(); });

  if (window.location.search.includes("debug3d")) {
    window.__projectsDebug = { render, goTo, getWrapper: () => currentWrapper, slot };
  }

  if (reduceMotion) {
    goTo(0);
    render();
  } else {
    goTo(0);
    new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        renderer.setAnimationLoop(entry.isIntersecting ? render : null);
      });
    }, { threshold: 0 }).observe(stage);
  }
  } // end boot()

  if ("requestIdleCallback" in window) {
    requestIdleCallback(boot, { timeout: 2000 });
  } else {
    setTimeout(boot, 300);
  }
})();
