/**
 * Most Armii (HAOS Runner) — original hyper-casual crowd-runner
 * Portrait canvas PWA. Procedural art only.
 */
(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("hud");
  const unitCountEl = document.getElementById("unit-count");
  const hintEl = document.getElementById("hint");

  // Logical design size (portrait)
  const W = 360;
  const H = 640;

  let dpr = 1;
  let lastTs = 0;
  let state = "title"; // title | playing | fight | boss | win | lose
  let pointerX = W / 2;
  let pointerActive = false;
  let hintTimer = 0;

  // Player
  let unitCount = 1;
  let playerX = 0;
  let worldZ = 0; // forward progress (meters along track)
  const RUN_SPEED = 18; // units/sec
  const LANE_HALF = 5.2;
  const FIGHT_SPEED = 6;

  // Visual crowd particles (for rendering, capped)
  const MAX_VIS = 80;
  let crowd = [];

  // Level entities (z increasing ahead)
  let gates = [];
  let enemyBlocks = [];
  let boss = null;
  let fightTarget = null;
  let projectiles = [];
  let particles = [];
  let cameraShake = 0;
  let fightAcc = 0;
  let shootTimer = 0;
  let winTimer = 0;
  let titlePulse = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
  }

  function worldToScreen(x, z) {
    // Perspective: z ahead maps up the screen; x is left-right
    const camZ = worldZ - 2.5;
    const rel = z - camZ;
    const near = 1.2;
    const far = 55;
    if (rel < near * 0.4) return null;
    const t = (rel - near) / (far - near);
    const scale = 1 / (0.35 + rel * 0.085);
    const sx = W / 2 + x * 28 * scale;
    const sy = H * 0.78 - Math.log(1 + rel * 0.55) * 145;
    const s = Math.max(2, 14 * scale);
    return { sx, sy, s, scale, alpha: 1 - Math.max(0, t) * 0.15 };
  }

  function resetLevel() {
    unitCount = 3;
    playerX = 0;
    worldZ = 0;
    gates = [];
    enemyBlocks = [];
    projectiles = [];
    particles = [];
    fightTarget = null;
    cameraShake = 0;
    fightAcc = 0;
    shootTimer = 0;
    winTimer = 0;
    crowd = [];
    for (let i = 0; i < 8; i++) spawnCrowdDot();

    // Build a short completable level (z in world meters)
    // Gate rows at various z — left/mid/right choices
    addGateRow(12, [
      { x: -3.2, op: "add", v: 2, color: "#2a7fff" },
      { x: 0, op: "add", v: 1, color: "#2a7fff" },
      { x: 3.2, op: "mul", v: 2, color: "#5cf" },
    ]);
    addGateRow(22, [
      { x: -3.2, op: "add", v: 3, color: "#2a7fff" },
      { x: 0, op: "sub", v: 2, color: "#e55" },
      { x: 3.2, op: "add", v: 5, color: "#2a7fff" },
    ]);
    addGateRow(32, [
      { x: -2.5, op: "mul", v: 2, color: "#5cf" },
      { x: 2.5, op: "add", v: 4, color: "#2a7fff" },
    ]);
    // Enemy block (fight)
    enemyBlocks.push({
      z: 42,
      x: 0,
      w: 8,
      count: 22,
      max: 22,
      hit: false,
      fighting: false,
    });
    addGateRow(52, [
      { x: -3.2, op: "add", v: 8, color: "#2a7fff" },
      { x: 0, op: "mul", v: 3, color: "#a6f" },
      { x: 3.2, op: "sub", v: 5, color: "#e55" },
    ]);
    addGateRow(62, [
      { x: -2.8, op: "add", v: 10, color: "#2a7fff" },
      { x: 2.8, op: "mul", v: 2, color: "#5cf" },
    ]);
    // Second fight
    enemyBlocks.push({
      z: 72,
      x: 0,
      w: 9,
      count: 40,
      max: 40,
      hit: false,
      fighting: false,
    });
    addGateRow(82, [
      { x: -3, op: "add", v: 15, color: "#2a7fff" },
      { x: 0, op: "mul", v: 2, color: "#a6f" },
      { x: 3, op: "add", v: 12, color: "#2a7fff" },
    ]);
    // Boss
    boss = {
      z: 95,
      x: 0,
      hp: 90,
      maxHp: 90,
      hit: false,
      fighting: false,
      phase: 0,
    };
  }

  function addGateRow(z, defs) {
    defs.forEach((d) => {
      gates.push({
        z,
        x: d.x,
        op: d.op,
        v: d.v,
        color: d.color,
        w: 2.4,
        hit: false,
      });
    });
  }

  function spawnCrowdDot() {
    crowd.push({
      ox: (Math.random() - 0.5) * 2.2,
      oz: (Math.random() - 0.5) * 1.4 - 0.3,
      bob: Math.random() * Math.PI * 2,
    });
  }

  function syncCrowdVis() {
    const want = Math.min(MAX_VIS, Math.max(1, Math.ceil(Math.sqrt(unitCount) * 3.2)));
    while (crowd.length < want) spawnCrowdDot();
    while (crowd.length > want) crowd.pop();
  }

  function applyGate(g) {
    if (g.hit) return;
    g.hit = true;
    const before = unitCount;
    if (g.op === "add") unitCount += g.v;
    else if (g.op === "sub") unitCount = Math.max(0, unitCount - g.v);
    else if (g.op === "mul") unitCount = Math.max(0, Math.floor(unitCount * g.v));
    unitCount = Math.min(9999, unitCount);
    syncCrowdVis();
    burst(playerX, worldZ + 1.5, g.color, 12);
    if (unitCount <= 0) {
      unitCount = 0;
      state = "lose";
      hud.classList.add("hidden");
      hintEl.classList.add("hidden");
    }
    cameraShake = 0.25;
    updateHud();
  }

  function updateHud() {
    unitCountEl.textContent = String(unitCount);
  }

  function burst(x, z, color, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x: x + (Math.random() - 0.5),
        z: z + (Math.random() - 0.5),
        vx: (Math.random() - 0.5) * 4,
        vz: (Math.random() - 0.5) * 4,
        life: 0.4 + Math.random() * 0.4,
        color,
        r: 2 + Math.random() * 3,
      });
    }
  }

  function startGame() {
    resetLevel();
    state = "playing";
    hud.classList.remove("hidden");
    hintEl.classList.remove("hidden");
    hintTimer = 3.5;
    updateHud();
    syncCrowdVis();
  }

  function gateLabel(g) {
    if (g.op === "add") return "+" + g.v;
    if (g.op === "sub") return "-" + g.v;
    return "x" + g.v;
  }

  // ---- Input ----
  function clientToLogicalX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  function onPointerDown(e) {
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    pointerActive = true;
    pointerX = clientToLogicalX(t.clientX);
    if (state === "title") startGame();
    else if (state === "win" || state === "lose") {
      state = "title";
      hud.classList.add("hidden");
      hintEl.classList.add("hidden");
    }
  }
  function onPointerMove(e) {
    e.preventDefault();
    if (!pointerActive) return;
    const t = e.touches ? e.touches[0] : e;
    pointerX = clientToLogicalX(t.clientX);
  }
  function onPointerUp(e) {
    e.preventDefault();
    pointerActive = false;
  }

  canvas.addEventListener("mousedown", onPointerDown);
  canvas.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  canvas.addEventListener("touchmove", onPointerMove, { passive: false });
  canvas.addEventListener("touchend", onPointerUp, { passive: false });
  window.addEventListener("resize", resize);

  // ---- Update ----
  function update(dt) {
    titlePulse += dt;
    if (cameraShake > 0) cameraShake = Math.max(0, cameraShake - dt);

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (state === "playing" || state === "fight" || state === "boss") {
      // Steer
      const targetX = ((pointerX / W) - 0.5) * LANE_HALF * 2;
      playerX += (Math.max(-LANE_HALF, Math.min(LANE_HALF, targetX)) - playerX) * Math.min(1, dt * 10);

      if (hintTimer > 0) {
        hintTimer -= dt;
        if (hintTimer <= 0) hintEl.classList.add("hidden");
      }

      // Crowd bob
      crowd.forEach((c) => { c.bob += dt * 6; });

      const inCombat = state === "fight" || state === "boss";
      const speed = inCombat ? FIGHT_SPEED : RUN_SPEED;

      if (!inCombat) {
        worldZ += speed * dt;
        // Gate collisions
        gates.forEach((g) => {
          if (g.hit) return;
          if (g.z - worldZ < 0.85 && g.z - worldZ > -0.35 && Math.abs(g.x - playerX) < g.w * 0.6) {
            applyGate(g);
          }
        });
        // Start fight with enemy block
        for (const e of enemyBlocks) {
          if (!e.hit && e.count > 0 && worldZ >= e.z - 1.2) {
            e.hit = true;
            e.fighting = true;
            fightTarget = e;
            state = "fight";
            fightAcc = 0;
            shootTimer = 0;
            hintEl.classList.add("hidden");
            break;
          }
        }
        // Boss approach
        if (boss && !boss.hit && worldZ >= boss.z - 2) {
          boss.hit = true;
          boss.fighting = true;
          state = "boss";
          fightAcc = 0;
          shootTimer = 0;
        }
      } else if (state === "fight" && fightTarget) {
        updateFight(dt, fightTarget);
      } else if (state === "boss" && boss) {
        updateBoss(dt);
      }

      // Shoot visuals while fighting
      if (inCombat) {
        shootTimer -= dt;
        if (shootTimer <= 0 && unitCount > 0) {
          shootTimer = Math.max(0.05, 0.18 - Math.min(0.12, unitCount * 0.001));
          const n = Math.min(4, 1 + Math.floor(unitCount / 40));
          for (let i = 0; i < n; i++) {
            projectiles.push({
              x: playerX + (Math.random() - 0.5) * 1.5,
              z: worldZ + 0.8,
              vz: 28 + Math.random() * 8,
              life: 0.8,
            });
          }
        }
      }

      for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.z += pr.vz * dt;
        pr.life -= dt;
        if (pr.life <= 0) projectiles.splice(i, 1);
      }
    }

    if (state === "win") {
      winTimer += dt;
    }
  }

  function updateFight(dt, e) {
    // Hold near enemy
    const holdZ = e.z - 0.8;
    if (worldZ < holdZ) worldZ += FIGHT_SPEED * dt;
    else worldZ = holdZ;

    // Damage exchange proportional to army sizes
    fightAcc += dt;
    const tick = 0.08;
    while (fightAcc >= tick) {
      fightAcc -= tick;
      if (unitCount <= 0) break;
      if (e.count <= 0) break;
      // Player deals damage equal to a fraction of count
      const dmgOut = Math.max(1, Math.ceil(unitCount * 0.08));
      const dmgIn = Math.max(1, Math.ceil(e.count * 0.035));
      e.count = Math.max(0, e.count - dmgOut);
      unitCount = Math.max(0, unitCount - dmgIn);
      syncCrowdVis();
      updateHud();
      cameraShake = 0.15;
      if (Math.random() < 0.4) burst(e.x + (Math.random() - 0.5) * 3, e.z, "#f66", 4);
      if (Math.random() < 0.3) burst(playerX, worldZ, "#6af", 3);
    }

    if (unitCount <= 0) {
      unitCount = 0;
      e.fighting = false;
      state = "lose";
      hud.classList.add("hidden");
    } else if (e.count <= 0) {
      e.fighting = false;
      e.count = 0;
      fightTarget = null;
      state = "playing";
      burst(e.x, e.z, "#ff6", 24);
      cameraShake = 0.4;
    }
  }

  function updateBoss(dt) {
    const holdZ = boss.z - 2.2;
    if (worldZ < holdZ) worldZ += FIGHT_SPEED * dt;
    else worldZ = holdZ;

    fightAcc += dt;
    const tick = 0.07;
    while (fightAcc >= tick) {
      fightAcc -= tick;
      if (unitCount <= 0) break;
      if (boss.hp <= 0) break;
      const dmgOut = Math.max(1, Math.ceil(unitCount * 0.06));
      const dmgIn = Math.max(1, Math.ceil(2 + boss.phase));
      boss.hp = Math.max(0, boss.hp - dmgOut);
      unitCount = Math.max(0, unitCount - dmgIn);
      syncCrowdVis();
      updateHud();
      cameraShake = 0.2;
      boss.phase = 1 - boss.hp / boss.maxHp;
      if (Math.random() < 0.5) burst(boss.x + (Math.random() - 0.5) * 2, boss.z, "#fa0", 5);
    }

    if (unitCount <= 0) {
      unitCount = 0;
      boss.fighting = false;
      state = "lose";
      hud.classList.add("hidden");
    } else if (boss.hp <= 0) {
      boss.fighting = false;
      boss.hp = 0;
      state = "win";
      winTimer = 0;
      hud.classList.add("hidden");
      burst(boss.x, boss.z, "#ff0", 40);
      cameraShake = 0.6;
    }
  }

  // ---- Draw ----
  function clear() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#4a8fd4");
    g.addColorStop(0.45, "#2a5a9e");
    g.addColorStop(1, "#0d2848");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawWater() {
    ctx.fillStyle = "#1a6ab0";
    ctx.fillRect(0, 0, W, H);
    // shimmer
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 8; i++) {
      const y = ((i * 80 + titlePulse * 20) % (H + 40)) - 20;
      ctx.fillStyle = "#8cf";
      ctx.fillRect(0, y, W, 6);
    }
    ctx.globalAlpha = 1;
  }

  function drawBridge() {
    // Draw bridge tiles from far to near based on worldZ
    const startZ = Math.floor(worldZ) - 2;
    const endZ = startZ + 50;
    for (let z = endZ; z >= startZ; z--) {
      const left = worldToScreen(-LANE_HALF - 0.4, z);
      const right = worldToScreen(LANE_HALF + 0.4, z);
      const leftN = worldToScreen(-LANE_HALF - 0.4, z + 1);
      const rightN = worldToScreen(LANE_HALF + 0.4, z + 1);
      if (!left || !right || !leftN || !rightN) continue;
      const shade = (z % 2 === 0) ? "#c8c2b4" : "#b8b2a4";
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(left.sx, left.sy);
      ctx.lineTo(right.sx, right.sy);
      ctx.lineTo(rightN.sx, rightN.sy);
      ctx.lineTo(leftN.sx, leftN.sy);
      ctx.closePath();
      ctx.fill();
      // edge rails
      ctx.fillStyle = "#9a9588";
      const railL = worldToScreen(-LANE_HALF - 0.8, z);
      const railLN = worldToScreen(-LANE_HALF - 0.8, z + 1);
      if (railL && railLN) {
        ctx.fillRect(railL.sx - 3, Math.min(railL.sy, railLN.sy), 6, Math.abs(railLN.sy - railL.sy) + 2);
      }
      const railR = worldToScreen(LANE_HALF + 0.8, z);
      const railRN = worldToScreen(LANE_HALF + 0.8, z + 1);
      if (railR && railRN) {
        ctx.fillRect(railR.sx - 3, Math.min(railR.sy, railRN.sy), 6, Math.abs(railRN.sy - railR.sy) + 2);
      }
    }
  }

  function drawGate(g) {
    if (g.hit) return;
    const p = worldToScreen(g.x, g.z);
    if (!p) return;
    const hw = 32 * p.scale;
    const hh = 40 * p.scale;
    ctx.globalAlpha = Math.min(1, p.alpha);
    // panel
    ctx.fillStyle = g.color;
    ctx.globalAlpha = 0.55;
    roundRect(p.sx - hw, p.sy - hh, hw * 2, hh * 1.6, 6);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    // label
    ctx.fillStyle = "#fff";
    ctx.font = "bold " + Math.max(12, 22 * p.scale) + "px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,40,0.5)";
    const label = gateLabel(g);
    ctx.strokeText(label, p.sx, p.sy - hh * 0.25);
    ctx.fillText(label, p.sx, p.sy - hh * 0.25);
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawEnemyBlock(e) {
    if (e.count <= 0) return;
    const cols = Math.min(10, Math.ceil(Math.sqrt(e.count)));
    const rows = Math.ceil(Math.min(60, e.count) / cols);
    let drawn = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (drawn >= Math.min(60, e.count)) break;
        const ox = (c - (cols - 1) / 2) * 0.55;
        const oz = r * 0.45;
        const p = worldToScreen(e.x + ox, e.z + oz);
        if (!p) continue;
        drawUnit(p.sx, p.sy, p.s * 0.9, "#e33", "#a11");
        drawn++;
      }
    }
    // count badge
    const bp = worldToScreen(e.x, e.z);
    if (bp) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      roundRect(bp.sx - 28, bp.sy - 55 * bp.scale, 56, 22, 8);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(e.count), bp.sx, bp.sy - 44 * bp.scale);
    }
  }

  function drawBoss() {
    if (!boss || boss.hp <= 0) return;
    const p = worldToScreen(boss.x, boss.z);
    if (!p) return;
    const s = p.s * 3.5;
    // body
    ctx.fillStyle = "#c43";
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy - s * 0.3, s * 0.7, s * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.fillStyle = "#e85";
    ctx.beginPath();
    ctx.arc(p.sx, p.sy - s * 1.3, s * 0.45, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#ff0";
    ctx.beginPath();
    ctx.arc(p.sx - s * 0.15, p.sy - s * 1.35, s * 0.1, 0, Math.PI * 2);
    ctx.arc(p.sx + s * 0.15, p.sy - s * 1.35, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // HP bar
    const bw = 80;
    const ratio = boss.hp / boss.maxHp;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(p.sx - bw / 2, p.sy - s * 2.1, bw, 12, 4);
    ctx.fill();
    ctx.fillStyle = "#f44";
    roundRect(p.sx - bw / 2 + 1, p.sy - s * 2.1 + 1, (bw - 2) * ratio, 10, 3);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(boss.hp + " HP", p.sx, p.sy - s * 2.05 + 6);
  }

  function drawUnit(sx, sy, s, fill, stroke) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(sx, sy - s * 0.15, s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    // body capsule
    ctx.beginPath();
    ctx.ellipse(sx, sy + s * 0.35, s * 0.4, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    // helmet shine
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(sx - s * 0.15, sy - s * 0.3, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCrowd() {
    // sort by oz for painter
    const sorted = crowd.slice().sort((a, b) => b.oz - a.oz);
    sorted.forEach((c) => {
      const bob = Math.sin(c.bob) * 0.08;
      const p = worldToScreen(playerX + c.ox, worldZ + c.oz + bob);
      if (!p) return;
      drawUnit(p.sx, p.sy, p.s, "#3af", "#148");
    });
    // glow under crowd
    const gp = worldToScreen(playerX, worldZ);
    if (gp) {
      ctx.fillStyle = "rgba(80,180,255,0.25)";
      ctx.beginPath();
      ctx.ellipse(gp.sx, gp.sy + 8, 28 * gp.scale, 10 * gp.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawProjectiles() {
    projectiles.forEach((pr) => {
      const p = worldToScreen(pr.x, pr.z);
      if (!p) return;
      ctx.strokeStyle = "#8ef";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.sx, p.sy);
      ctx.lineTo(p.sx, p.sy + 10 * p.scale);
      ctx.stroke();
      ctx.fillStyle = "#ff0";
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawParticles() {
    particles.forEach((p) => {
      const s = worldToScreen(p.x, p.z);
      if (!s) return;
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function drawTitle() {
    clear();
    // decorative fake bridge background
    worldZ = 0;
    drawWater();
    // soft vignette bridge preview
    ctx.fillStyle = "rgba(10,25,50,0.35)";
    ctx.fillRect(0, 0, W, H);

    // Logo
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "900 42px system-ui,sans-serif";
    ctx.strokeStyle = "#1a4aff";
    ctx.lineWidth = 6;
    ctx.strokeText("MOST ARMII", W / 2, H * 0.28);
    ctx.fillText("MOST ARMII", W / 2, H * 0.28);

    ctx.font = "700 16px system-ui";
    ctx.fillStyle = "#8cf";
    ctx.fillText("HAOS Runner", W / 2, H * 0.28 + 28);

    // Mini preview army
    for (let i = 0; i < 12; i++) {
      const a = titlePulse * 2 + i * 0.5;
      const x = W / 2 + Math.cos(a) * 40;
      const y = H * 0.48 + Math.sin(a * 0.7) * 12;
      drawUnit(x, y, 10, "#3af", "#148");
    }
    drawUnit(W / 2 + 70, H * 0.48, 14, "#e33", "#a11");
    drawUnit(W / 2 + 90, H * 0.5, 12, "#e33", "#a11");

    // CTA
    const pulse = 1 + Math.sin(titlePulse * 3) * 0.04;
    ctx.save();
    ctx.translate(W / 2, H * 0.68);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#2a7fff";
    roundRect(-110, -28, 220, 56, 16);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "900 20px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DOTKNIJ ABY GRAĆ", 0, 2);
    ctx.restore();

    ctx.font = "14px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Buduj armię • Bramy + / × • Pokonaj bossa", W / 2, H * 0.8);
    ctx.fillText("Przeciągnij w lewo / prawo", W / 2, H * 0.8 + 22);
  }

  function drawEnd(win) {
    ctx.fillStyle = "rgba(5,15,35,0.72)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 40px system-ui";
    ctx.strokeStyle = win ? "#1a8" : "#a22";
    ctx.lineWidth = 6;
    const msg = win ? "ZWYCIĘSTWO!" : "PORAŻKA";
    ctx.strokeText(msg, W / 2, H * 0.38);
    ctx.fillStyle = "#fff";
    ctx.fillText(msg, W / 2, H * 0.38);

    ctx.font = "16px system-ui";
    ctx.fillStyle = "#cdf";
    if (win) {
      ctx.fillText("Most zdobyty. Armia: " + unitCount, W / 2, H * 0.38 + 40);
    } else {
      ctx.fillText("Twoja armia została rozbita", W / 2, H * 0.38 + 40);
    }

    ctx.fillStyle = "#2a7fff";
    roundRect(W / 2 - 100, H * 0.55, 200, 50, 14);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "900 18px system-ui";
    ctx.fillText("JESZCZE RAZ", W / 2, H * 0.55 + 26);
  }

  function drawFightBanner() {
    if (state !== "fight" && state !== "boss") return;
    ctx.font = "900 18px system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#1a4aff";
    ctx.lineWidth = 4;
    const t = state === "boss" ? "BOSS!" : "TRZYMAJ LINIĘ!";
    ctx.strokeText(t, W / 2, 56);
    ctx.fillText(t, W / 2, 56);
  }

  function render() {
    // Map logical coords
    ctx.setTransform(dpr * (canvas.width / dpr / W), 0, 0, dpr * (canvas.height / dpr / H), 0, 0);
    // Actually fit cover-style
    const vw = canvas.width / dpr;
    const vh = canvas.height / dpr;
    const scale = Math.max(vw / W, vh / H);
    const ox = (vw - W * scale) / 2;
    const oy = (vh - H * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);

    const shakeX = cameraShake > 0 ? (Math.random() - 0.5) * 8 * cameraShake : 0;
    const shakeY = cameraShake > 0 ? (Math.random() - 0.5) * 8 * cameraShake : 0;
    ctx.translate(shakeX, shakeY);

    if (state === "title") {
      drawTitle();
      return;
    }

    drawWater();
    drawBridge();

    // Draw far entities first
    const drawables = [];
    gates.forEach((g) => drawables.push({ z: g.z, draw: () => drawGate(g) }));
    enemyBlocks.forEach((e) => drawables.push({ z: e.z, draw: () => drawEnemyBlock(e) }));
    if (boss) drawables.push({ z: boss.z, draw: () => drawBoss() });
    drawables.sort((a, b) => b.z - a.z);
    drawables.forEach((d) => d.draw());

    drawProjectiles();
    drawCrowd();
    drawParticles();
    drawFightBanner();

    if (state === "win") drawEnd(true);
    if (state === "lose") drawEnd(false);
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // PWA
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  resize();
  resetLevel();
  requestAnimationFrame(loop);
})();
