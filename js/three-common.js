/* Shared Three.js scene-building helpers used by both the hero 3D machine
   and the projects 3D slider, so every rotating model on the site is lit,
   shaded and colored the same way. Exposed as window.YN3D since these are
   plain scripts, not ES modules. */
(() => {
  "use strict";
  if (typeof THREE === "undefined") return;

  /* With outputEncoding = sRGBEncoding, lighting math happens in linear
     space and gets gamma-encoded on output. Any hex color meant to look
     right on screen must be converted sRGB→linear first, or it renders
     muddy/too dark. */
  function srgb(hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  }

  /* Studio environment — a 2D-canvas equirect panorama run through
     PMREMGenerator.fromEquirectangular (the texture-based PMREM path).
     NOTE: do not switch this to pmrem.fromScene(shaderMaterial) — that path
     is what previously produced corrupted red/yellow texels on chrome.

     A polished metal's entire visual "shine" comes from what it reflects —
     not from its roughness number alone. The previous version filled this
     panorama with heavily-blurred, low-contrast blobs, so even a mirror-flat
     material only ever reflected a smooth gray gradient: physically
     "reflective" but with nothing sharp-edged to reflect, which reads to
     the eye as a flat, unfinished block rather than metal. Real product-shot
     studios rig several crisp-edged, high-contrast softbox panels around the
     subject specifically so polished surfaces catch a distinct bright streak
     against a dark field. This panorama does the same: a dark base (so
     panels actually pop) plus sharp-edged panels — left as-is here, since
     PMREMGenerator applies its own physically-correct roughness-based blur
     per mip level; pre-blurring the source just throws that detail away
     before it can be used. */
  function buildEnvironment(renderer) {
    const w = 1024, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#7a8298");
    grad.addColorStop(0.28, "#454b5c");
    grad.addColorStop(0.55, "#20232b");
    grad.addColorStop(0.8, "#0e1013");
    grad.addColorStop(1, "#050506");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    function panel(x, y, pw, ph, alpha, blur) {
      ctx.save();
      ctx.filter = blur ? `blur(${blur}px)` : "none";
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(x - pw / 2, y - ph / 2, pw, ph);
      ctx.restore();
    }
    /* Large key softbox, crisp edge — the main reflected highlight. */
    panel(w * 0.20, h * 0.24, w * 0.17, h * 0.40, 1.0, 1);
    /* Overhead strip light. */
    panel(w * 0.50, h * 0.10, w * 0.30, h * 0.07, 1.0, 1);
    /* Secondary side panel, slightly softer. */
    panel(w * 0.76, h * 0.30, w * 0.14, h * 0.34, 0.95, 2);
    /* Thin rim-light accent strips — these are what draw a sharp bright
       line along an edge/fillet on a curved polished part. */
    panel(w * 0.94, h * 0.5, w * 0.035, h * 0.5, 1.0, 0);
    panel(w * 0.065, h * 0.62, w * 0.03, h * 0.3, 0.9, 0);
    panel(w * 0.60, h * 0.72, w * 0.22, h * 0.05, 0.6, 3);

    const rawTex = new THREE.CanvasTexture(c);
    rawTex.mapping = THREE.EquirectangularReflectionMapping;
    rawTex.encoding = THREE.sRGBEncoding;
    rawTex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromEquirectangular(rawTex);
    pmrem.dispose();
    rawTex.dispose();
    return rt.texture;
  }

  /* Clean product-photography rig: moderate key light (with shadow) for
     real form, two soft rim lights, gentle fill. Deliberately conservative
     — too much light energy blows ACES tone mapping into a flat white
     wash with no contrast, which reads worse than too dark. */
  function addStudioLights(scene) {
    scene.add(new THREE.AmbientLight(srgb(0x5b6172), 0.85));

    const key = new THREE.DirectionalLight(srgb(0xffffff), 1.9);
    key.position.set(4, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -4.5;
    key.shadow.camera.right = 4.5;
    key.shadow.camera.top = 4.5;
    key.shadow.camera.bottom = -4.5;
    key.shadow.bias = -0.0018;
    key.shadow.normalBias = 0.02;
    key.target.position.set(0, 0, 0);
    scene.add(key);
    scene.add(key.target);

    const rimA = new THREE.PointLight(srgb(0x9db2ff), 1.4, 30);
    rimA.position.set(-5, 2, -4);
    scene.add(rimA);

    const rimB = new THREE.PointLight(srgb(0xffffff), 1.1, 30);
    rimB.position.set(5, 1, -5);
    scene.add(rimB);

    const fill = new THREE.PointLight(srgb(0xffffff), 0.6, 26);
    fill.position.set(-3, 3, 5);
    scene.add(fill);

    return { key, rimA, rimB, fill };
  }

  /* Soft circular contact-shadow texture so a model reads as standing on a
     floor instead of floating. Used as an alphaMap on a plane. */
  function buildGroundTexture() {
    const size = 512;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.55, "rgba(0,0,0,0.28)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function buildGround() {
    const groundMat = new THREE.MeshStandardMaterial({
      color: srgb(0x0c0d10),
      alphaMap: buildGroundTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 1,
      metalness: 0
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.visible = false;
    return ground;
  }

  /* The GLB files carry real material NAMES from SolidWorks/KeyShot but not
     usable numeric PBR factors — those come back as glTF spec defaults.
     Re-map by name to match the actual product finish: black powder-coated
     frame with bright silver/chrome guide rods and hardware. */
  const FINISHES = [
    { test: /chrom/, color: 0xf0f2f5, metalness: 1.0, roughness: 0.04 },
    { test: /platinum/, color: 0xe8e9ec, metalness: 0.95, roughness: 0.06 },
    /* "Polished" here means polished stainless/aluminum as it actually looks
       on gym-equipment hardware — a bright, reflective satin finish, not a
       mirror. Roughness sits well above chrome/platinum's near-0 values so
       reflections stay soft-edged and believable instead of looking like a
       chrome-plated part. */
    { test: /polish.*alumin|alumin.*polish/, color: 0xdfe2e7, metalness: 0.92, roughness: 0.18 },
    { test: /polish.*steel|steel.*polish/, color: 0xd4d7dd, metalness: 0.92, roughness: 0.18 },
    { test: /nickel/, color: 0xc9cdd3, metalness: 0.9, roughness: 0.22 },
    { test: /bronze/, color: 0xad7a41, metalness: 0.9, roughness: 0.18 },
    { test: /satin.*steel|stainless/, color: 0xc8ccd2, metalness: 0.9, roughness: 0.24 },
    { test: /matte.*steel|steel.*matte/, color: 0x494c52, metalness: 0.7, roughness: 0.38 },
    { test: /sandblast/, color: 0x3a3d43, metalness: 0.55, roughness: 0.5 },
    { test: /matte.*iron|iron.*matte/, color: 0x2c2e33, metalness: 0.7, roughness: 0.42 },
    { test: /iron/, color: 0x33353b, metalness: 0.75, roughness: 0.3 },
    { test: /led/, color: 0xff3b30, metalness: 0.1, roughness: 0.25, emissive: 0xff2a1e, emissiveIntensity: 1.4 },
    { test: /gloss.*rubber|rubber.*gloss/, color: 0x1c1d20, metalness: 0.0, roughness: 0.35 },
    { test: /rubber/, color: 0x1c1d20, metalness: 0.0, roughness: 0.6 },
    { test: /plastic/, color: 0x212226, metalness: 0.2, roughness: 0.4 }
  ];
  const DEFAULT_FINISH = { color: 0x33353b, metalness: 0.75, roughness: 0.3 };

  /* `partOverrides` lets a specific model recolor named parts (e.g. a
     red lever arm) without touching the shared material palette above —
     glTF materials are reused across meshes, so a matched part gets its
     material cloned first; otherwise the override would leak onto every
     other mesh sharing that same material. */
  /* A mesh's own name is often an auto-generated "mesh_N" — the
     meaningful part name (e.g. "Lever-Arm-1") frequently lives on a
     parent Group instead, when that source part had multiple primitives.
     Walk up the chain so part-name overrides still match. */
  function namedAncestorMatches(node, test) {
    let n = node;
    while (n) {
      if (test.test(n.name || "")) return true;
      n = n.parent;
    }
    return false;
  }

  function applyFinishes(model, partOverrides) {
    model.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      child.castShadow = true;
      child.receiveShadow = true;
      /* Most overrides target a named part (node/ancestor name). Some source
         files instead give every instance of a shell/plastic component the
         same material NAME (e.g. "polishedbronze") with no meaningful node
         name to match — for those, `byMaterial` matches the material name
         directly instead of walking the node's ancestors. */
      const partOverride = partOverrides && partOverrides.find(p => !p.byMaterial && namedAncestorMatches(child, p.test));
      if (partOverride) {
        child.material = Array.isArray(child.material) ? child.material.map(m => m.clone()) : child.material.clone();
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m) => {
        const name = (m.name || "").toLowerCase();
        const materialOverride = !partOverride && partOverrides && partOverrides.find(p => p.byMaterial && p.test.test(name));
        const finish = partOverride || materialOverride || FINISHES.find(f => f.test.test(name)) || DEFAULT_FINISH;
        m.color = srgb(finish.color);
        m.metalness = finish.metalness;
        m.roughness = finish.roughness;
        m.envMapIntensity = 1.9;
        if (finish.emissive !== undefined) {
          m.emissive = srgb(finish.emissive);
          m.emissiveIntensity = finish.emissiveIntensity || 1;
        } else if (m.emissive) {
          m.emissive.setRGB(0, 0, 0);
        }
        /* Force fully opaque — some source materials come in with glTF
           alphaMode BLEND, which renders them see-through and makes the
           whole model look hazy/faded. */
        m.transparent = false;
        m.opacity = 1;
        m.depthWrite = true;
        m.needsUpdate = true;
      });
    });
  }

  /* Centers+scales a loaded gltf.scene into a wrapper group sized to
     `targetRadius`, and returns bounding info useful for camera fit and
     ground placement. */
  function normalizeModel(model, targetRadius, partOverrides) {
    applyFinishes(model, partOverrides);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    const scale = targetRadius / (radius || 1);

    model.position.sub(center);
    const wrapper = new THREE.Group();
    wrapper.add(model);
    wrapper.scale.setScalar(scale);
    wrapper.rotation.y = Math.PI * 0.15;
    return wrapper;
  }

  function fitCameraToRadius(camera, radius, padding) {
    const fovV = camera.fov * (Math.PI / 180);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    const tightestFov = Math.min(fovV, fovH);
    const distance = (radius / Math.sin(tightestFov / 2)) * (padding || 1.6);
    camera.position.set(0, radius * 0.12, distance);
    camera.lookAt(0, 0, 0);
  }

  window.YN3D = {
    srgb,
    buildEnvironment,
    addStudioLights,
    buildGround,
    applyFinishes,
    normalizeModel,
    fitCameraToRadius
  };
})();
