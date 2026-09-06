(() => {
  "use strict";
  const canvas = document.getElementById("heroCanvas");
  const hero = document.getElementById("home");
  if (!canvas || !hero || typeof THREE === "undefined" || !window.YN3D) return;
  const YN3D = window.YN3D;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGSAP = typeof window.gsap !== "undefined";

  /* The canvas element itself is CSS-positioned to only cover the right
     portion of the hero (see .hero-canvas) — so sizing off the canvas's
     own box, not the full hero, is what actually centers the model within
     its own space instead of needing world-space offset hacks. */
  let width = canvas.clientWidth, height = canvas.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

  /* Faint particle field for depth (kept subtle, not distracting lines) */
  const particleCount = 180;
  const particlePos = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const r = 6 + Math.random() * 6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    particlePos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    particlePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    particlePos[i * 3 + 2] = r * Math.cos(phi) * 0.6;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({ color: YN3D.srgb(0x3a4568), size: 0.03, transparent: true, opacity: 0.4 });
  scene.add(new THREE.Points(particleGeo, particleMat));

  const carousel = new THREE.Group();
  rig.add(carousel);

  const boundingRadius = 2.4;

  function fitCamera() {
    YN3D.fitCameraToRadius(camera, boundingRadius, 1.6);
  }
  fitCamera();

  /* ================================================================
     Machine carousel — every rotating model shown at the top of the
     site, heaviest equipment first, small handheld items last. Each
     entry is preloaded once and kept resident (not reloaded on every
     lap) so the floating transition never stalls on a network fetch.
  ================================================================= */
  const MODELS = [
    "assets/models/multifunctional-trainer.glb?v=3",
    "assets/models/home-cable-machine.glb?v=1",
    "assets/models/ultimate-leg-machine.glb?v=1",
    "assets/models/linear-leg-press.glb?v=1",
    "assets/models/pediatric-leg-press.glb?v=1",
    "assets/models/baby-mobility.glb?v=1",
    "assets/models/special-dumbbell.glb?v=1"
  ];
  /* Per-model presentation corrections — each source file was exported
     from CAD facing whatever direction the designer happened to be
     working in, not necessarily "camera-facing". Verified by eye against
     each model individually rather than guessed. */
  const MODEL_FIXUPS = {
    2: { yaw: Math.PI },       // Ultimate Leg Machine — default faced back-first
    4: {                       // Pediatric Rehab Leg Press — the machine's actual foot
                                // plane, found by fitting a plane through ALL FOUR of its
                                // ground-contact feet (front pair AND rear pair, spanning
                                // nearly the full frame length) and rotating that plane
                                // level. An earlier pass only found the feet at one end,
                                // which under-rotated it into standing upright instead of
                                // sitting low — this is a real machine, not a tower.
      /* Hero's canvas is tall and narrow (confined to the right ~58% of a
         full-height section), unlike the Projects slider's roughly square
         stage — a yaw that reads as a clean side profile there can still
         cut this low, elongated machine diagonally across a tall frame.
         Tuned separately for hero's actual camera/aspect via the same
         screen-projection method: the yaw that keeps the front and rear
         feet at the same screen height (a true profile), not just close. */
      yaw: 1.0821041362364845,
      tiltX: -1.6218202415961016,
      /* Now that it rests level on a real 3D plane (not a one-view illusion),
         it reads fine from every angle — no need to restrict it to a rock. */
      /* Red was only the user's own highlight-pen annotation pointing at
         this part in their reference photo, not its real finish — it's
         silver stainless steel like the rest of the linkage. Source file
         also mislabels the telescoping limiter pipe as rubber; both get
         the same satin-steel treatment here. */
      partOverrides: [
        { test: /lever|limiter|telescoping/i, color: 0xc4c8d0, metalness: 0.92, roughness: 0.22 }
      ]
    },
    6: { tiltZ: Math.PI / 2 }  // Special Dumbbell — authored standing on end, not lying flat
  };
  const HOLD_SECONDS = 4.6;
  const EXIT_DURATION = 0.95;
  const ENTER_DURATION = 1.05;
  const ENTER_DELAY = 0.35;

  const loader = new THREE.GLTFLoader();
  const wrappers = new Array(MODELS.length).fill(null);
  let activeIndex = -1;
  let cyclingStarted = false;
  let paused = false;
  let pendingRetry = null;

  function loadModel(index) {
    return new Promise((resolve) => {
      loader.load(
        MODELS[index],
        (gltf) => {
          const fixup = MODEL_FIXUPS[index];
          const content = YN3D.normalizeModel(gltf.scene, boundingRadius, fixup && fixup.partOverrides);
          /* Tilt lives on its own group, separate from the wrapper that gets
             spun for auto-rotation. Setting rotation.x AND a changing rotation.y
             on the very same Object3D doesn't compose as "tilt, then spin about
             world-up" — Euler angles on one object combine as intrinsic/body-axis
             rotations, so spinning would actually rotate around the tilted body's
             own axis and visibly warp the model's height as it turned. Keeping
             the fixed tilt on an inner group and the spin on the outer one keeps
             each a clean, single-axis rotation, so spinning never distorts it. */
          const tiltGroup = new THREE.Group();
          tiltGroup.add(content);
          if (fixup) {
            if (fixup.tiltX) tiltGroup.rotation.x = fixup.tiltX;
            if (fixup.tiltZ) tiltGroup.rotation.z = fixup.tiltZ;
          }
          const wrapper = new THREE.Group();
          wrapper.add(tiltGroup);
          wrapper.userData.tiltGroup = tiltGroup;
          if (fixup) {
            wrapper.userData.yawOffset = fixup.yaw || 0;
            wrapper.userData.oscillate = fixup.oscillate || 0;
          }
          wrapper.visible = false;
          wrapper.userData.restScale = 1;
          wrapper.scale.setScalar(0.001);
          carousel.add(wrapper);

          const worldBox = new THREE.Box3().setFromObject(wrapper);
          wrapper.userData.groundY = worldBox.min.y;

          wrappers[index] = wrapper;
          resolve(wrapper);
        },
        undefined,
        (err) => {
          console.warn("Hero carousel model failed to load:", MODELS[index], err);
          resolve(null);
        }
      );
    });
  }

  async function preloadAll() {
    for (let i = 0; i < MODELS.length; i++) {
      const wrapper = await loadModel(i);
      if (i === 0 && wrapper) showFirst(wrapper);
    }
  }

  function showFirst(wrapper) {
    activeIndex = 0;
    wrapper.visible = true;
    ground.position.y = wrapper.userData.groundY;
    ground.scale.setScalar(boundingRadius * 1.15);
    ground.visible = true;

    if (hasGSAP && !reduceMotion) {
      wrapper.position.y = -1.5;
      gsap.to(wrapper.scale, { x: wrapper.userData.restScale, y: wrapper.userData.restScale, z: wrapper.userData.restScale, duration: ENTER_DURATION, ease: "power2.out" });
      gsap.to(wrapper.position, { y: 0, duration: ENTER_DURATION, ease: "power2.out" });
    } else {
      wrapper.scale.setScalar(wrapper.userData.restScale);
      wrapper.position.y = 0;
      if (reduceMotion) render();
    }

    if (!cyclingStarted) {
      cyclingStarted = true;
      if (!reduceMotion && hasGSAP) scheduleNext();
    }
  }

  /* Accelerating float-away for the outgoing machine, decelerating
     float-in for the one replacing it — a professional "swap", not a
     hard cut. Rotation keeps spinning continuously underneath both
     tweens (driven per-frame in render()), so only position/scale are
     ever handed to GSAP — letting both systems touch rotation would
     make them fight over the same property every frame. */
  function transitionTo(newIndex) {
    const outWrapper = wrappers[activeIndex];
    const inWrapper = wrappers[newIndex];
    if (!inWrapper) return false;

    if (outWrapper) {
      gsap.to(outWrapper.position, { y: "+=1.7", duration: EXIT_DURATION, ease: "power2.in" });
      gsap.to(outWrapper.scale, { x: 0.001, y: 0.001, z: 0.001, duration: EXIT_DURATION, ease: "power2.in", onComplete: () => { outWrapper.visible = false; } });
    }

    inWrapper.visible = true;
    inWrapper.position.y = -1.7;
    inWrapper.scale.setScalar(0.001);
    gsap.to(inWrapper.position, { y: 0, duration: ENTER_DURATION, ease: "power2.out", delay: ENTER_DELAY });
    gsap.to(inWrapper.scale, { x: inWrapper.userData.restScale, y: inWrapper.userData.restScale, z: inWrapper.userData.restScale, duration: ENTER_DURATION, ease: "power2.out", delay: ENTER_DELAY });
    gsap.to(ground.position, { y: inWrapper.userData.groundY, duration: ENTER_DURATION, ease: "power2.out", delay: ENTER_DELAY });

    activeIndex = newIndex;
    return true;
  }

  function scheduleNext() {
    if (pendingRetry) { clearTimeout(pendingRetry); pendingRetry = null; }
    pendingRetry = setTimeout(() => {
      if (paused) { scheduleNext(); return; }
      const nextIndex = (activeIndex + 1) % MODELS.length;
      const ok = transitionTo(nextIndex);
      if (!ok) {
        /* next model still loading — check back shortly instead of
           skipping it or breaking the cycle order */
        pendingRetry = setTimeout(scheduleNext, 400);
        return;
      }
      scheduleNext();
    }, HOLD_SECONDS * 1000);
  }

  preloadAll();

  /* Pointer parallax */
  let targetRotY = 0, targetRotX = 0.05;
  let curRotY = 0, curRotX = 0.05;
  window.addEventListener("pointermove", (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    targetRotY = nx * 0.25;
    targetRotX = 0.05 + ny * 0.1;
  }, { passive: true });

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

  /* Retry until the canvas reports a real size — see the matching comment
     in projects3d.js for why a single deferred check isn't enough. Also
     re-check on visibility change: a backgrounded/bfcache-restored tab can
     report a 0×0 layout the whole time it's hidden. */
  (function ensureRealSize(attemptsLeft) {
    if (canvas.clientWidth > 50 && canvas.clientHeight > 50) { resize(); return; }
    if (attemptsLeft <= 0) return;
    requestAnimationFrame(() => ensureRealSize(attemptsLeft - 1));
  })(90);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) resize(); });

  const clock = new THREE.Clock();

  function render() {
    const t = clock.getElapsedTime();

    for (let i = 0; i < wrappers.length; i++) {
      const w = wrappers[i];
      if (!w) continue;
      const base = Math.PI * 0.15 + (w.userData.yawOffset || 0) + (w.userData.debugYaw || 0);
      w.rotation.y = w.userData.oscillate
        ? base + Math.sin(t * 0.4) * w.userData.oscillate
        : base + t * 0.09;
    }

    curRotY += (targetRotY - curRotY) * 0.04;
    curRotX += (targetRotX - curRotX) * 0.04;
    rig.rotation.y = curRotY;
    rig.rotation.x = curRotX;

    renderer.render(scene, camera);
  }

  if (window.location.search.includes("debug3d")) {
    window.__heroDebug = {
      renderer, scene, camera, render, wrappers, MODELS, clock, transitionTo, getActive: () => activeIndex,
      freeze() {
        if (pendingRetry) { clearTimeout(pendingRetry); pendingRetry = null; }
        scheduleNext = () => {};
      },
      showInstant(index) {
        wrappers.forEach((w, i) => {
          if (!w) return;
          gsap.killTweensOf(w.position);
          gsap.killTweensOf(w.scale);
          w.visible = i === index;
        });
        const w = wrappers[index];
        if (!w) return;
        w.position.set(0, 0, 0);
        w.scale.setScalar(w.userData.restScale);
        ground.position.y = w.userData.groundY;
        ground.scale.setScalar(boundingRadius * 1.15);
        ground.visible = true;
        activeIndex = index;
      },
      setTilt(index, x, z) {
        const w = wrappers[index];
        if (!w) return;
        w.userData.tiltGroup.rotation.x = x;
        w.userData.tiltGroup.rotation.z = z;
      },
      setYaw(index, yaw) {
        const w = wrappers[index];
        if (!w) return;
        w.userData.debugYaw = yaw;
      },
      boxOf(index) {
        const w = wrappers[index];
        if (!w) return null;
        return new THREE.Box3().setFromObject(w);
      }
    };
  }

  if (reduceMotion) {
    render();
  } else {
    renderer.setAnimationLoop(render);
  }

  if ("IntersectionObserver" in window && !reduceMotion) {
    new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        paused = !entry.isIntersecting;
        renderer.setAnimationLoop(entry.isIntersecting ? render : null);
      });
    }, { threshold: 0 }).observe(hero);
  }
})();
