/**
 * ANLGRAM — 3D Interactive Water Drop ("Aether Shard") Background Engine
 * Features:
 * 1. Broad, soft, volumetric fan beams ("Pestañas en abanico", Image 1) spanning the entire page.
 * 2. Floating glowing orbs with soft concentric halos drifting across the fan rays (Image 1).
 * 3. Short, subtle, compact fluid spikes right around the crystal (Image 2 made small and soft).
 * 4. Central 3D crystalline water drop preserved at its exact original size.
 * 5. Persistent presence in the viewport when scrolling down through all dashboard sections.
 * 6. 100% TON Blue (#0088CC) & Electric Cyan (#00F0FF) palette matching the site.
 */
(function() {
  'use strict';

  function initWaterDropCanvas() {
    const canvas = document.getElementById('staking-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pageContent = document.getElementById('page-content') || document.querySelector('.page-content');

    let width = 0;
    let height = 0;
    let dpr = 1;

    // Center coordinates (viewport relative)
    let centerX = window.innerWidth * 0.5;
    let centerY = 240;

    // Mouse and interaction state
    const mouse = {
      x: window.innerWidth * 0.5,
      y: 240,
      targetX: window.innerWidth * 0.5,
      targetY: 240,
      isHovered: false,
    };

    // 3D Rotation State (smooth spring physics with ambient drift)
    let rotX = -0.18;
    let rotY = 0.05;
    let targetRotX = -0.18;
    let targetRotY = 0.05;
    let spinAngle = 0;

    // Interactive Shockwaves (from clicks/taps)
    const shockwaves = [];

    // Floating orbs with concentric halos (Image 1)
    const orbs = [];
    const ORB_COUNT = 45;

    // ─────────────────────────────────────────────────────────────
    // 3D Polyhedral Shard Geometry (Crystalline Water Drop)
    // Preserves the EXACT size of the central crystal drop figure
    // ─────────────────────────────────────────────────────────────
    const vertices = [
      // Top apex [0]
      { x: 0, y: -1.75, z: 0 },
      // Upper ring (6 vertices) [1 .. 6]
      { x: 0.85 * Math.cos(0),               y: -0.65, z: 0.85 * Math.sin(0) },
      { x: 0.85 * Math.cos(Math.PI / 3),     y: -0.65, z: 0.85 * Math.sin(Math.PI / 3) },
      { x: 0.85 * Math.cos(2 * Math.PI / 3), y: -0.65, z: 0.85 * Math.sin(2 * Math.PI / 3) },
      { x: 0.85 * Math.cos(Math.PI),         y: -0.65, z: 0.85 * Math.sin(Math.PI) },
      { x: 0.85 * Math.cos(4 * Math.PI / 3), y: -0.65, z: 0.85 * Math.sin(4 * Math.PI / 3) },
      { x: 0.85 * Math.cos(5 * Math.PI / 3), y: -0.65, z: 0.85 * Math.sin(5 * Math.PI / 3) },
      // Mid ring (6 vertices, offset by 30 deg for faceted diamonds) [7 .. 12]
      { x: 1.15 * Math.cos(Math.PI / 6),     y: 0.15, z: 1.15 * Math.sin(Math.PI / 6) },
      { x: 1.15 * Math.cos(Math.PI / 2),     y: 0.15, z: 1.15 * Math.sin(Math.PI / 2) },
      { x: 1.15 * Math.cos(5 * Math.PI / 6), y: 0.15, z: 1.15 * Math.sin(5 * Math.PI / 6) },
      { x: 1.15 * Math.cos(7 * Math.PI / 6), y: 0.15, z: 1.15 * Math.sin(7 * Math.PI / 6) },
      { x: 1.15 * Math.cos(3 * Math.PI / 2), y: 0.15, z: 1.15 * Math.sin(3 * Math.PI / 2) },
      { x: 1.15 * Math.cos(11 * Math.PI / 6),y: 0.15, z: 1.15 * Math.sin(11 * Math.PI / 6) },
      // Lower ring (6 vertices) [13 .. 18]
      { x: 0.75 * Math.cos(0),               y: 0.95, z: 0.75 * Math.sin(0) },
      { x: 0.75 * Math.cos(Math.PI / 3),     y: 0.95, z: 0.75 * Math.sin(Math.PI / 3) },
      { x: 0.75 * Math.cos(2 * Math.PI / 3), y: 0.95, z: 0.75 * Math.sin(2 * Math.PI / 3) },
      { x: 0.75 * Math.cos(Math.PI),         y: 0.95, z: 0.75 * Math.sin(Math.PI) },
      { x: 0.75 * Math.cos(4 * Math.PI / 3), y: 0.95, z: 0.75 * Math.sin(4 * Math.PI / 3) },
      { x: 0.75 * Math.cos(5 * Math.PI / 3), y: 0.95, z: 0.75 * Math.sin(5 * Math.PI / 3) },
      // Bottom tip [19]
      { x: 0, y: 1.65, z: 0 }
    ];

    // Build triangular faces (indices)
    const faces = [];

    // Top cap (6 triangles)
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      faces.push([0, 1 + i, 1 + next]);
    }

    // Upper to Mid bands (12 triangles)
    for (let i = 0; i < 6; i++) {
      const u1 = 1 + i;
      const u2 = 1 + ((i + 1) % 6);
      const m1 = 7 + i;
      const m2 = 7 + ((i + 1) % 6);
      faces.push([u1, m1, u2]);
      faces.push([m1, m2, u2]);
    }

    // Mid to Lower bands (12 triangles)
    for (let i = 0; i < 6; i++) {
      const m1 = 7 + i;
      const m2 = 7 + ((i + 1) % 6);
      const l1 = 13 + i;
      const l2 = 13 + ((i + 1) % 6);
      faces.push([m1, l1, m2]);
      faces.push([m2, l1, l2]);
    }

    // Bottom cap (6 triangles)
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6;
      faces.push([19, 13 + next, 13 + i]);
    }

    // Initialize floating orbs with concentric halos (matching Image 1)
    function initOrbs() {
      orbs.length = 0;
      const maxDist = Math.max(width, height) * 0.75;
      for (let i = 0; i < ORB_COUNT; i++) {
        const radius = 120 + Math.random() * (maxDist - 120);
        const angle = Math.random() * Math.PI * 2;
        orbs.push({
          radius,
          baseRadius: radius,
          angle,
          angularSpeed: (Math.random() * 0.0018 + 0.0006) * (Math.random() > 0.5 ? 1 : -1),
          radialDrift: (Math.random() - 0.5) * 0.3,
          coreSize: Math.random() * 2.2 + 2.0, // central bright dot
          haloSize: Math.random() * 12 + 10,   // soft circular halo
          pulseOffset: Math.random() * Math.PI * 2,
          pulseSpeed: Math.random() * 0.02 + 0.01,
          alpha: Math.random() * 0.5 + 0.4
        });
      }
    }

    // Dynamic Position Updater:
    // Ensures the design remains ALWAYS VISIBLE when scrolling down through all sections!
    function updatePosition() {
      const pRect = pageContent
        ? pageContent.getBoundingClientRect()
        : { left: 0, width: width, top: 0, height: height };

      // Center horizontally on the active content section
      centerX = pRect.left + pRect.width * 0.5;

      // Vertical position behavior:
      // When at the very top (scrollTop = 0), sits behind the Overview header.
      // As the user scrolls down, it stays smoothly visible in the viewport,
      // floating persistently at ~42% of the viewport height.
      const scrollTop = (pageContent ? pageContent.scrollTop : 0) || window.pageYOffset || 0;
      const initialY = Math.min(height * 0.35, 240);
      const persistentY = Math.min(height * 0.44, 380);

      const scrollFactor = Math.min(1.0, scrollTop / 280);
      centerY = initialY + (persistentY - initialY) * scrollFactor;
    }

    // Resize handler
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.scale(dpr, dpr);

      updatePosition();
      initOrbs();

      if (!mouse.isHovered) {
        mouse.x = centerX;
        mouse.y = centerY;
        mouse.targetX = centerX;
        mouse.targetY = centerY;
      }
    }

    window.addEventListener('resize', resize, { passive: true });
    if (pageContent) {
      pageContent.addEventListener('scroll', updatePosition, { passive: true });
    }
    window.addEventListener('scroll', updatePosition, { passive: true });
    resize();

    // Mouse & Touch events across the entire screen
    window.addEventListener('mousemove', (e) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.isHovered = true;

      const ndcX = (e.clientX - centerX) / (width * 0.45 || 1);
      const ndcY = (e.clientY - centerY) / (height * 0.45 || 1);

      targetRotY = ndcX * 0.55;
      targetRotX = -ndcY * 0.42 - 0.18;
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
      mouse.isHovered = false;
      targetRotX = -0.18;
      targetRotY = 0.05;
    }, { passive: true });

    // Touch support for mobile devices
    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        const t = e.touches[0];
        mouse.targetX = t.clientX;
        mouse.targetY = t.clientY;
        const ndcX = (t.clientX - centerX) / (width * 0.45 || 1);
        const ndcY = (t.clientY - centerY) / (height * 0.45 || 1);
        targetRotY = ndcX * 0.55;
        targetRotX = -ndcY * 0.42 - 0.18;
      }
    }, { passive: true });

    // Click / Tap produces a liquid shockwave
    window.addEventListener('pointerdown', (e) => {
      const targetTag = e.target?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'select' || targetTag === 'textarea' || targetTag === 'button') return;

      shockwaves.push({
        x: centerX,
        y: centerY,
        radius: 35,
        maxRadius: Math.max(width, height) * 0.9,
        speed: 8.5,
        strength: 1.0,
        alpha: 0.9
      });
    });

    // 3D Math Utilities
    function rotate3D(v, rx, ry, rz) {
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const x1 = v.x * cosY + v.z * sinY;
      const z1 = -v.x * sinY + v.z * cosY;

      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const y2 = v.y * cosX - z1 * sinX;
      const z2 = v.y * sinX + z1 * cosX;

      const cosZ = Math.cos(rz);
      const sinZ = Math.sin(rz);
      const x3 = x1 * cosZ - y2 * sinZ;
      const y3 = x1 * sinZ + y2 * cosZ;

      return { x: x3, y: y3, z: z2 };
    }

    function project(v, scale, fovDist, cx, cy) {
      const z = v.z + fovDist;
      const p = scale / (z > 0.1 ? z : 0.1);
      return {
        x: cx + v.x * p,
        y: cy + v.y * p,
        z: v.z,
        scale: p
      };
    }

    // Animation Loop
    let time = 0;
    let animId = null;

    function render() {
      time += 0.018;
      spinAngle += 0.005;

      // Continuously keep position synchronized with scroll
      updatePosition();

      // Spring damping for mouse position and 3D rotation
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;
      rotX += (targetRotX - rotX) * 0.06;
      rotY += (targetRotY - rotY) * 0.06;

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      // BASE SCALE MAINTAINS THE EXACT SAME SIZE OF THE SPHERE / CRYSTAL DROP
      const baseScale = Math.min(width, height) < 600 ? 68 : 105;

      // MAX DIMENSION FOR BROAD EXPANSIVE FAN BEAMS (Image 1)
      const maxPageSpan = Math.max(width, height) * 1.15;

      // ─────────────────────────────────────────────────────────────
      // LAYER 1: BROAD FAN BEAMS ("PESTAÑAS EN ABANICO", IMAGE 1)
      // Spans across the ENTIRE screen with soft atmospheric depth
      // ─────────────────────────────────────────────────────────────
      ctx.save();

      // Deep central ambient glow
      const glowMaxRadius = Math.min(maxPageSpan * 0.65, 850);
      const glowGrad = ctx.createRadialGradient(
        centerX, centerY, 20,
        centerX, centerY, glowMaxRadius
      );
      glowGrad.addColorStop(0, 'rgba(0, 136, 204, 0.22)');
      glowGrad.addColorStop(0.25, 'rgba(0, 200, 240, 0.10)');
      glowGrad.addColorStop(0.55, 'rgba(0, 70, 160, 0.035)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, glowMaxRadius, 0, Math.PI * 2);
      ctx.fill();

      // 20 Broad Volumetric Fan Sectors (Image 1 "Pestañas")
      const FAN_COUNT = 20;
      const fanAngleStep = (Math.PI * 2) / FAN_COUNT;
      const fanRotation = time * 0.035; // Gentle majestic ambient rotation

      for (let i = 0; i < FAN_COUNT; i++) {
        const startAngle = i * fanAngleStep + fanRotation;
        const endAngle = startAngle + fanAngleStep;
        const midAngle = (startAngle + endAngle) * 0.5;

        // Wave breathing on individual fan beams
        const breathe = Math.sin(midAngle * 3 + time * 1.5) * 0.12;

        // Alternating contrast between adjacent sectors (as seen in Image 1)
        const isOdd = (i % 2 === 1);
        const sectorReach = maxPageSpan;

        const fanGrad = ctx.createRadialGradient(
          centerX, centerY, baseScale * 0.8,
          centerX, centerY, sectorReach
        );

        if (isOdd) {
          // Lighter, luminous cyan-blue fan beam (softened glow)
          fanGrad.addColorStop(0, 'rgba(0, 220, 255, 0.12)');
          fanGrad.addColorStop(0.22, `rgba(0, 170, 230, ${0.07 + breathe * 0.02})`);
          fanGrad.addColorStop(0.55, `rgba(0, 120, 190, ${0.035 + breathe * 0.015})`);
          fanGrad.addColorStop(0.85, 'rgba(0, 60, 140, 0.01)');
          fanGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          // Deeper contrast navy-blue sector
          fanGrad.addColorStop(0, 'rgba(0, 140, 210, 0.05)');
          fanGrad.addColorStop(0.35, `rgba(0, 90, 160, ${0.025 + breathe * 0.01})`);
          fanGrad.addColorStop(0.70, 'rgba(0, 50, 110, 0.008)');
          fanGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }

        ctx.fillStyle = fanGrad;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, sectorReach, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // ─────────────────────────────────────────────────────────────
      // LAYER 2: FLOATING ORBS WITH HALOS (IMAGE 1)
      // Concentric circles: central bright cyan dot + soft halo
      // ─────────────────────────────────────────────────────────────
      ctx.save();
      for (const orb of orbs) {
        orb.angle += orb.angularSpeed;
        orb.radius += orb.radialDrift;
        if (orb.radius > maxPageSpan * 0.72) orb.radius = 120;
        if (orb.radius < 110) orb.radius = maxPageSpan * 0.70;

        const ox = centerX + Math.cos(orb.angle) * orb.radius;
        const oy = centerY + Math.sin(orb.angle) * orb.radius;

        // Skip if outside viewport boundaries
        if (ox < -60 || ox > width + 60 || oy < -60 || oy > height + 60) continue;

        const pulse = Math.sin(time * 2.5 + orb.pulseOffset) * 0.5 + 0.5;
        const currentAlpha = orb.alpha * (0.65 + 0.35 * pulse);

        // 1. Soft Outermost Concentric Halo (matching Image 1)
        const haloGrad = ctx.createRadialGradient(ox, oy, orb.coreSize, ox, oy, orb.haloSize);
        haloGrad.addColorStop(0, `rgba(0, 240, 255, ${currentAlpha * 0.30})`);
        haloGrad.addColorStop(0.55, `rgba(0, 160, 220, ${currentAlpha * 0.12})`);
        haloGrad.addColorStop(1, 'rgba(0, 120, 200, 0)');

        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(ox, oy, orb.haloSize, 0, Math.PI * 2);
        ctx.fill();

        // 2. Middle Concentric Ring
        ctx.strokeStyle = `rgba(0, 240, 255, ${currentAlpha * 0.25})`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(ox, oy, orb.haloSize * 0.55, 0, Math.PI * 2);
        ctx.stroke();

        // 3. Bright Cyan Core Dot
        ctx.fillStyle = `rgba(0, 240, 255, ${currentAlpha * 0.75})`;
        ctx.beginPath();
        ctx.arc(ox, oy, orb.coreSize, 0, Math.PI * 2);
        ctx.fill();

        // 4. White Specular Glint
        ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha * 0.70})`;
        ctx.beginPath();
        ctx.arc(ox, oy, orb.coreSize * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ─────────────────────────────────────────────────────────────
      // LAYER 3: TIGHT, COMPACT CORONA SPIKES (IMAGE 2 MADE SMALL & SOFT)
      // Confined right around the crystal drop, subtle and not large
      // ─────────────────────────────────────────────────────────────
      ctx.save();
      const SPIKE_COUNT = 72;
      const innerBaseR = baseScale * 0.88;
      // Made SMALL: extends only slightly beyond the central crystal drop
      const outerBaseR = baseScale * 1.55; // ~160px total, compact!

      // Mouse proximity vector
      const dxMouse = mouse.x - centerX;
      const dyMouse = mouse.y - centerY;
      const mouseAngle = Math.atan2(dyMouse, dxMouse);
      const mouseDist = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);

      // Evaluate active shockwave ripple amplitude
      for (let s = shockwaves.length - 1; s >= 0; s--) {
        const sw = shockwaves[s];
        sw.radius += sw.speed;
        sw.alpha -= 0.010;
        if (sw.alpha <= 0 || sw.radius > sw.maxRadius) {
          shockwaves.splice(s, 1);
        }
      }

      for (let i = 0; i < SPIKE_COUNT; i++) {
        const baseAngle = (i / SPIKE_COUNT) * Math.PI * 2;
        const currentAngle = baseAngle + spinAngle * 0.12;

        // Subtle gentle harmonic ripples
        const wave1 = Math.sin(currentAngle * 4 - time * 2.0) * 12;
        const wave2 = Math.cos(currentAngle * 8 + time * 3.0) * 7;
        let dynamicLen = outerBaseR + wave1 + wave2;

        // Mouse hover proximity attraction (modest, stays compact)
        let angleDiff = Math.abs(currentAngle - mouseAngle);
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        angleDiff = Math.abs(angleDiff);

        if (angleDiff < 0.95 && mouseDist < outerBaseR * 2.0) {
          const prox = (1 - angleDiff / 0.95) * Math.max(0, 1 - mouseDist / (outerBaseR * 2.0));
          dynamicLen += prox * 28;
        }

        // Add shockwave pulse if passing this spike
        for (const sw of shockwaves) {
          const distToWave = Math.abs(dynamicLen - sw.radius);
          if (distToWave < 60) {
            dynamicLen += (1 - distToWave / 60) * 35 * sw.alpha;
          }
        }

        // 3D coordinates for the spike to tilt with the crystal drop
        const halfWidthAngle = (Math.PI / SPIKE_COUNT) * 0.55;
        const zTiltAmp = 0.20;

        const b1_3d = rotate3D({
          x: Math.cos(currentAngle - halfWidthAngle) * (innerBaseR / baseScale),
          y: Math.sin(currentAngle - halfWidthAngle) * (innerBaseR / baseScale),
          z: Math.sin(currentAngle * 2 + time) * zTiltAmp
        }, rotX, rotY + spinAngle * 0.1, 0);

        const b2_3d = rotate3D({
          x: Math.cos(currentAngle + halfWidthAngle) * (innerBaseR / baseScale),
          y: Math.sin(currentAngle + halfWidthAngle) * (innerBaseR / baseScale),
          z: Math.sin(currentAngle * 2 + time) * zTiltAmp
        }, rotX, rotY + spinAngle * 0.1, 0);

        const tip_3d = rotate3D({
          x: Math.cos(currentAngle) * (dynamicLen / baseScale),
          y: Math.sin(currentAngle) * (dynamicLen / baseScale),
          z: Math.sin(currentAngle * 3 + time * 1.1) * (zTiltAmp * 1.5)
        }, rotX, rotY + spinAngle * 0.1, 0);

        // Project to 2D screen
        const fov = 4.5;
        const pBase1 = project(b1_3d, baseScale, fov, centerX, centerY);
        const pBase2 = project(b2_3d, baseScale, fov, centerX, centerY);
        const pTip   = project(tip_3d,   baseScale, fov, centerX, centerY);

        // Soft, subtle shading (less visible, not harsh stripes)
        const spikeGrad = ctx.createLinearGradient(
          (pBase1.x + pBase2.x) * 0.5,
          (pBase1.y + pBase2.y) * 0.5,
          pTip.x, pTip.y
        );

        const depthBright = Math.max(0.35, Math.min(1.0, (tip_3d.z + 1.2) / 2.4));

        spikeGrad.addColorStop(0, `rgba(0, 136, 204, ${0.45 * depthBright})`);
        spikeGrad.addColorStop(0.35, `rgba(0, 240, 255, ${0.40 * depthBright})`);
        spikeGrad.addColorStop(0.70, `rgba(56, 189, 248, ${0.20 * depthBright})`);
        spikeGrad.addColorStop(1, 'rgba(0, 136, 204, 0)');

        ctx.fillStyle = spikeGrad;
        ctx.beginPath();
        ctx.moveTo(pBase1.x, pBase1.y);
        ctx.lineTo(pTip.x, pTip.y);
        ctx.lineTo(pBase2.x, pBase2.y);
        ctx.closePath();
        ctx.fill();

        // Very faint, thin spine line (soft and small, not prominent)
        ctx.strokeStyle = `rgba(224, 242, 254, ${0.30 * depthBright})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo((pBase1.x + pBase2.x) * 0.5, (pBase1.y + pBase2.y) * 0.5);
        ctx.lineTo(pTip.x * 0.85 + (pBase1.x + pBase2.x) * 0.08, pTip.y * 0.85 + (pBase1.y + pBase2.y) * 0.08);
        ctx.stroke();
      }
      ctx.restore();

      // ─────────────────────────────────────────────────────────────
      // LAYER 4: Dark Contrast Ring (Separating Shard from Spikes)
      // ─────────────────────────────────────────────────────────────
      ctx.save();
      const ringGrad = ctx.createRadialGradient(
        centerX, centerY, baseScale * 0.5,
        centerX, centerY, innerBaseR
      );
      ringGrad.addColorStop(0, 'rgba(6, 11, 20, 0)');
      ringGrad.addColorStop(0.5, 'rgba(6, 11, 20, 0.70)');
      ringGrad.addColorStop(1, 'rgba(6, 11, 20, 0)');

      ctx.fillStyle = ringGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerBaseR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ─────────────────────────────────────────────────────────────
      // LAYER 5: Interactive Liquid Ripple Shockwaves
      // ─────────────────────────────────────────────────────────────
      if (shockwaves.length > 0) {
        ctx.save();
        for (const sw of shockwaves) {
          ctx.strokeStyle = `rgba(0, 240, 255, ${sw.alpha * 0.65})`;
          ctx.lineWidth = 2.0 * sw.alpha;
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
          ctx.stroke();

          if (sw.radius > 35) {
            ctx.strokeStyle = `rgba(0, 136, 204, ${sw.alpha * 0.35})`;
            ctx.lineWidth = 1.2 * sw.alpha;
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.radius * 0.82, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // ─────────────────────────────────────────────────────────────
      // LAYER 6: 3D Central Crystalline Water Drop ("Aether Shard")
      // Maintains the exact same shape and size!
      // ─────────────────────────────────────────────────────────────
      ctx.save();
      const fov = 4.2;

      const transformedVerts = vertices.map(v => {
        const rotated = rotate3D(v, rotX, rotY + spinAngle, 0);
        return {
          rotated,
          projected: project(rotated, baseScale, fov, centerX, centerY)
        };
      });

      const lightX = (mouse.x - centerX) / (width * 0.5 || 1);
      const lightY = -(mouse.y - centerY) / (height * 0.5 || 1);
      const lightZ = 1.5;
      const lightLen = Math.sqrt(lightX * lightX + lightY * lightY + lightZ * lightZ);
      const lx = lightX / lightLen;
      const ly = lightY / lightLen;
      const lz = lightZ / lightLen;

      const sortedFaces = [];
      for (let f = 0; f < faces.length; f++) {
        const [i1, i2, i3] = faces[f];
        const v1 = transformedVerts[i1].rotated;
        const v2 = transformedVerts[i2].rotated;
        const v3 = transformedVerts[i3].rotated;

        const ax = v2.x - v1.x, ay = v2.y - v1.y, az = v2.z - v1.z;
        const bx = v3.x - v1.x, by = v3.y - v1.y, bz = v3.z - v1.z;
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;

        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const normX = nx / nLen;
        const normY = ny / nLen;
        const normZ = nz / nLen;

        const avgZ = (v1.z + v2.z + v3.z) / 3;

        sortedFaces.push({
          indices: [i1, i2, i3],
          normZ,
          normX,
          normY,
          avgZ
        });
      }

      sortedFaces.sort((a, b) => a.avgZ - b.avgZ);

      // Render Facets
      for (const face of sortedFaces) {
        const [i1, i2, i3] = face.indices;
        const p1 = transformedVerts[i1].projected;
        const p2 = transformedVerts[i2].projected;
        const p3 = transformedVerts[i3].projected;

        const diffuse = Math.max(0.14, face.normX * lx + face.normY * ly + face.normZ * lz);

        const hx = lx, hy = ly, hz = lz + 1.0;
        const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
        const spec = Math.pow(Math.max(0, face.normX * (hx / hLen) + face.normY * (hy / hLen) + face.normZ * (hz / hLen)), 16);

        const rVal = Math.floor(0 + spec * 130);
        const gVal = Math.floor(75 + diffuse * 105 + spec * 90);
        const bVal = Math.floor(155 + diffuse * 65 + spec * 65);
        const alpha = Math.min(0.88, Math.max(0.40, 0.58 + diffuse * 0.22));

        ctx.fillStyle = `rgba(${Math.min(255, rVal)}, ${Math.min(255, gVal)}, ${Math.min(255, bVal)}, ${alpha})`;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = `rgba(0, 240, 255, ${0.30 + spec * 0.35})`;
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }

      // Glowing Center Core (softened ambient nucleus)
      const coreGrad = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, baseScale * 0.65
      );
      coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.60)');
      coreGrad.addColorStop(0.2, 'rgba(0, 240, 255, 0.45)');
      coreGrad.addColorStop(0.6, 'rgba(0, 136, 204, 0.20)');
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseScale * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Continue Loop
      animId = requestAnimationFrame(render);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (animId) cancelAnimationFrame(animId);
      } else {
        animId = requestAnimationFrame(render);
      }
    });

    animId = requestAnimationFrame(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWaterDropCanvas);
  } else {
    initWaterDropCanvas();
  }
})();
