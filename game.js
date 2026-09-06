/**
 * Most Armii (HAOS Runner) — original hyper-casual crowd-runner
 * Portrait canvas PWA. Procedural art only.
 * v13: manual fire + move pad, HP, monster classes, walk cycles
 */
(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("hud");
  const unitCountEl = document.getElementById("unit-count");
  const hintEl = document.getElementById("hint");
  const controlsEl = document.getElementById("controls");
  const btnFire = document.getElementById("btn-fire");
  const movePad = document.getElementById("move-pad");
  const moveStick = document.getElementById("move-stick");
  const hpFill = document.getElementById("hp-fill");
  const hpCur = document.getElementById("hp-cur");
  const hpMax = document.getElementById("hp-max");

  // Logical design size — adapts to portrait or landscape
  let W = 360;
  let H = 640;
  let isLandscape = false;

  let dpr = 1;
  let lastTs = 0;
  let state = "title"; // title | playing | fight | boss | win | lose
  let hintTimer = 0;

  // Player
  let unitCount = 1;
  let playerX = 0;
  let worldZ = 0;
  let playerHp = 100;
  let playerMaxHp = 100;
  let playerHitFlash = 0;
  let muzzleFlash = 0;
  let facing = 1; // 1 right-ish (toward +x when moving), keep rifle side
  let fireCooldown = 0;
  let moveInput = 0; // -1..1 from stick / keys
  let fireHeld = false;
  let keys = { left: false, right: false, fire: false };

  // Speed scale: 1 (wolno) .. 20 (szybko)
  const SPEED_LEVEL = 6;
  const SPEED_SCALE_MAX = 20;
  const RUN_SPEED_MAX = 10;
  const RUN_SPEED = RUN_SPEED_MAX * (SPEED_LEVEL / SPEED_SCALE_MAX);
  const LANE_HALF = 5.2;
  const FIGHT_SPEED = Math.max(1.2, RUN_SPEED * 0.55);
  const MOVE_SPEED = 7.5;
  const FIRE_COOLDOWN = 0.22;
  const PLAYER_BASE_HP = 80;
  const PLAYER_HP_PER_UNIT = 4;

  // Visual crowd particles (for rendering, capped)
  const MAX_VIS = 80;
  let crowd = [];

  // Level entities
  let gates = [];
  let enemies = []; // individual monsters
  let boss = null;
  let fightTarget = null; // group id or boss flag
  let projectiles = [];
  let enemyShots = [];
  let particles = [];
  let cameraShake = 0;
  let winTimer = 0;
  let titlePulse = 0;
  let animTime = 0;

  // ---- Monster classes (~10) ----
  const MONSTER_DEFS = {
    ZombieGrunt: {
      label: "Zombie",
      hp: 18,
      speed: 1.1,
      size: 0.9,
      damage: 6,
      color: "#5a7a42",
      skin: "#8fa86a",
      eye: "#ff2222",
      showBar: false,
      score: 1,
    },
    Runner: {
      label: "Biegacz",
      hp: 12,
      speed: 2.4,
      size: 0.85,
      damage: 5,
      color: "#6a5030",
      skin: "#c4a060",
      eye: "#ffaa00",
      showBar: false,
      score: 1,
    },
    Spitter: {
      label: "Plujka",
      hp: 22,
      speed: 1.0,
      size: 0.95,
      damage: 4,
      ranged: true,
      rangeCd: 1.6,
      color: "#4a6a38",
      skin: "#7cb050",
      eye: "#a0ff40",
      showBar: false,
      score: 2,
    },
    Brute: {
      label: "Brutale",
      hp: 55,
      speed: 0.85,
      size: 1.35,
      damage: 12,
      color: "#4a3030",
      skin: "#8a6060",
      eye: "#ff4444",
      showBar: true,
      score: 3,
    },
    Tank: {
      label: "Czołg",
      hp: 110,
      speed: 0.55,
      size: 1.7,
      damage: 16,
      color: "#3a3a48",
      skin: "#707088",
      eye: "#88aaff",
      showBar: true,
      armored: true,
      score: 5,
    },
    Screamer: {
      label: "Wrzeszcz",
      hp: 28,
      speed: 1.5,
      size: 1.05,
      damage: 8,
      color: "#5a2050",
      skin: "#c070a0",
      eye: "#ff66ff",
      showBar: false,
      score: 2,
    },
    Skeleton: {
      label: "Szkielet",
      hp: 20,
      speed: 1.6,
      size: 0.95,
      damage: 7,
      color: "#d8d0c0",
      skin: "#eee8dc",
      eye: "#40e0ff",
      showBar: false,
      bony: true,
      score: 2,
    },
    PlagueRat: {
      label: "Szczur",
      hp: 8,
      speed: 2.8,
      size: 0.55,
      damage: 3,
      color: "#4a3828",
      skin: "#8a6848",
      eye: "#ffcc00",
      showBar: false,
      rat: true,
      score: 1,
    },
    ArmoredZombie: {
      label: "Pancerny",
      hp: 70,
      speed: 0.75,
      size: 1.25,
      damage: 10,
      color: "#3a4a3a",
      skin: "#6a8060",
      eye: "#ff3333",
      showBar: true,
      armored: true,
      score: 4,
    },
    BossNecromancer: {
      label: "Nekromanta",
      hp: 420,
      speed: 0.4,
      size: 2.4,
      damage: 18,
      color: "#2a1840",
      skin: "#6a5088",
      eye: "#ffee44",
      showBar: true,
      boss: true,
      score: 50,
    },
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    isLandscape = vw > vh;
    if (isLandscape) {
      W = 640;
      H = 360;
    } else {
      W = 360;
      H = 640;
    }
  }

  function worldToScreen(x, z) {
    const camZ = worldZ - 2.5;
    const rel = z - camZ;
    const near = 1.2;
    const far = isLandscape ? 48 : 55;
    if (rel < near * 0.4) return null;
    const t = (rel - near) / (far - near);
    const scale = 1 / ((isLandscape ? 0.32 : 0.35) + rel * (isLandscape ? 0.075 : 0.085));
    const xMul = isLandscape ? 42 : 28;
    const yMul = isLandscape ? 95 : 145;
    const baseS = isLandscape ? 12 : 14;
    const sx = W / 2 + x * xMul * scale;
    const sy = H * (isLandscape ? 0.82 : 0.78) - Math.log(1 + rel * 0.55) * yMul;
    const s = Math.max(2, baseS * scale);
    return { sx, sy, s, scale, alpha: 1 - Math.max(0, t) * 0.15 };
  }

  function recalcPlayerHp(preserveRatio) {
    const prevMax = Math.max(1, playerMaxHp);
    const ratio = preserveRatio ? playerHp / prevMax : 1;
    playerMaxHp = PLAYER_BASE_HP + unitCount * PLAYER_HP_PER_UNIT;
    if (preserveRatio) {
      playerHp = Math.max(1, Math.round(playerMaxHp * ratio));
    } else {
      playerHp = playerMaxHp;
    }
    updateHud();
  }

  function spawnMonster(type, x, z, groupId) {
    const def = MONSTER_DEFS[type] || MONSTER_DEFS.ZombieGrunt;
    enemies.push({
      type,
      x,
      z,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed,
      size: def.size,
      damage: def.damage,
      def,
      groupId: groupId || 0,
      hitFlash: 0,
      death: 0, // 0 alive, >0 fading
      alive: true,
      bob: Math.random() * Math.PI * 2,
      walk: Math.random() * Math.PI * 2,
      contactCd: 0,
      rangeCd: def.ranged ? 0.4 + Math.random() : 0,
      facing: -1,
    });
  }

  function spawnWave(z, groupId, list) {
    list.forEach((item, i) => {
      const [type, count] = item;
      for (let n = 0; n < count; n++) {
        const col = n % 5;
        const row = Math.floor(n / 5);
        const ox = (col - 2) * 0.85 + (Math.random() - 0.5) * 0.2;
        const oz = row * 0.7 + i * 0.15;
        spawnMonster(type, ox, z + oz, groupId);
      }
    });
  }

  function resetLevel() {
    unitCount = 3;
    playerX = 0;
    worldZ = 0;
    gates = [];
    enemies = [];
    projectiles = [];
    enemyShots = [];
    particles = [];
    fightTarget = null;
    cameraShake = 0;
    fireCooldown = 0;
    muzzleFlash = 0;
    playerHitFlash = 0;
    winTimer = 0;
    moveInput = 0;
    fireHeld = false;
    crowd = [];
    for (let i = 0; i < 8; i++) spawnCrowdDot();
    recalcPlayerHp(false);

    // Gates
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

    // Wave 1 — grunts + rats
    spawnWave(34, 1, [
      ["ZombieGrunt", 6],
      ["PlagueRat", 4],
      ["Runner", 2],
    ]);

    addGateRow(44, [
      { x: -2.5, op: "mul", v: 2, color: "#5cf" },
      { x: 2.5, op: "add", v: 4, color: "#2a7fff" },
    ]);

    // Wave 2 — mix
    spawnWave(54, 2, [
      ["Skeleton", 4],
      ["Spitter", 2],
      ["Brute", 1],
      ["ZombieGrunt", 4],
    ]);

    addGateRow(64, [
      { x: -3.2, op: "add", v: 8, color: "#2a7fff" },
      { x: 0, op: "mul", v: 2, color: "#a6f" },
      { x: 3.2, op: "sub", v: 5, color: "#e55" },
    ]);

    // Wave 3 — armored
    spawnWave(74, 3, [
      ["ArmoredZombie", 2],
      ["Tank", 1],
      ["Screamer", 2],
      ["Runner", 3],
      ["PlagueRat", 3],
    ]);

    addGateRow(84, [
      { x: -3, op: "add", v: 12, color: "#2a7fff" },
      { x: 0, op: "mul", v: 2, color: "#a6f" },
      { x: 3, op: "add", v: 10, color: "#2a7fff" },
    ]);

    // Boss
    boss = {
      z: 98,
      x: 0,
      type: "BossNecromancer",
      hp: MONSTER_DEFS.BossNecromancer.hp,
      maxHp: MONSTER_DEFS.BossNecromancer.hp,
      hit: false,
      fighting: false,
      phase: 0,
      hitFlash: 0,
      death: 0,
      walk: 0,
      bob: 0,
      contactCd: 0,
      rangeCd: 1,
      alive: true,
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
      walk: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
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
    if (g.op === "add") unitCount += g.v;
    else if (g.op === "sub") unitCount = Math.max(0, unitCount - g.v);
    else if (g.op === "mul") unitCount = Math.max(0, Math.floor(unitCount * g.v));
    unitCount = Math.min(9999, unitCount);
    syncCrowdVis();
    recalcPlayerHp(true);
    burst(playerX, worldZ + 1.5, g.color, 12);
    if (unitCount <= 0) {
      unitCount = 0;
      loseGame();
    }
    cameraShake = 0.25;
    updateHud();
  }

  function updateHud() {
    unitCountEl.textContent = String(unitCount);
    hpCur.textContent = String(Math.max(0, Math.ceil(playerHp)));
    hpMax.textContent = String(Math.ceil(playerMaxHp));
    const pct = Math.max(0, Math.min(100, (playerHp / Math.max(1, playerMaxHp)) * 100));
    hpFill.style.width = pct + "%";
    if (pct < 30) hpFill.style.background = "linear-gradient(90deg, #800, #e33)";
    else if (pct < 60) hpFill.style.background = "linear-gradient(90deg, #a50, #fa6)";
    else hpFill.style.background = "linear-gradient(90deg, #c22, #f55 40%, #fa6)";
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

  function showControls(on) {
    if (on) {
      controlsEl.classList.remove("hidden");
      hud.classList.remove("hidden");
    } else {
      controlsEl.classList.add("hidden");
      hud.classList.add("hidden");
      hintEl.classList.add("hidden");
    }
  }

  function startGame() {
    resetLevel();
    state = "playing";
    showControls(true);
    hintEl.classList.remove("hidden");
    hintTimer = 4;
    updateHud();
    syncCrowdVis();
  }

  function loseGame() {
    state = "lose";
    showControls(false);
  }

  function winGame() {
    state = "win";
    winTimer = 0;
    showControls(false);
    burst(boss.x, boss.z, "#ff0", 40);
    cameraShake = 0.6;
  }

  function gateLabel(g) {
    if (g.op === "add") return "+" + g.v;
    if (g.op === "sub") return "-" + g.v;
    return "x" + g.v;
  }

  function hurtPlayer(amount) {
    if (state === "win" || state === "lose") return;
    playerHp = Math.max(0, playerHp - amount);
    playerHitFlash = 0.25;
    cameraShake = Math.max(cameraShake, 0.2);
    updateHud();
    if (playerHp <= 0) {
      playerHp = 0;
      loseGame();
    }
  }

  function damagePerShot() {
    return Math.max(6, Math.ceil(5 + unitCount * 0.45));
  }

  function tryFire() {
    if (state !== "playing" && state !== "fight" && state !== "boss") return;
    if (unitCount <= 0) return;
    if (fireCooldown > 0) return;
    fireCooldown = Math.max(0.1, FIRE_COOLDOWN - Math.min(0.1, unitCount * 0.0008));
    muzzleFlash = 0.08;
    const n = Math.min(5, 1 + Math.floor(unitCount / 35));
    const dmg = damagePerShot();
    for (let i = 0; i < n; i++) {
      projectiles.push({
        x: playerX + (Math.random() - 0.5) * 1.2,
        z: worldZ + 0.9,
        vz: 32 + Math.random() * 6,
        life: 0.9,
        dmg: dmg,
      });
    }
  }

  // ---- Input: on-screen controls + keyboard ----
  function setStickVisual(nx) {
    const padW = movePad.clientWidth || 150;
    const maxOff = (padW / 2) - 28;
    const px = 50 + (nx * maxOff) / (padW / 2) * 50;
    // use left % relative to pad
    const leftPct = 50 + nx * ((maxOff / padW) * 100);
    moveStick.style.left = leftPct + "%";
  }

  function padPointer(clientX) {
    const rect = movePad.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    moveInput = Math.max(-1, Math.min(1, nx));
    setStickVisual(moveInput);
  }

  function bindHold(el, on, off) {
    const start = (e) => {
      e.preventDefault();
      e.stopPropagation();
      on(e);
    };
    const end = (e) => {
      e.preventDefault();
      e.stopPropagation();
      off(e);
    };
    el.addEventListener("mousedown", start);
    el.addEventListener("touchstart", start, { passive: false });
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end, { passive: false });
    window.addEventListener("touchcancel", end, { passive: false });
  }

  bindHold(
    btnFire,
    () => {
      fireHeld = true;
      btnFire.classList.add("pressed");
      if (state === "title") startGame();
      else if (state === "win" || state === "lose") {
        state = "title";
        showControls(false);
      } else tryFire();
    },
    () => {
      fireHeld = false;
      btnFire.classList.remove("pressed");
    }
  );

  movePad.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    padPointer(e.clientX);
    if (state === "title") startGame();
  });
  movePad.addEventListener("mousemove", (e) => {
    if (e.buttons) padPointer(e.clientX);
  });
  movePad.addEventListener("mouseup", () => {
    moveInput = keys.left || keys.right ? moveInput : 0;
    if (!keys.left && !keys.right) setStickVisual(0);
  });
  movePad.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      padPointer(e.touches[0].clientX);
      if (state === "title") startGame();
    },
    { passive: false }
  );
  movePad.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      padPointer(e.touches[0].clientX);
    },
    { passive: false }
  );
  movePad.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      if (!keys.left && !keys.right) {
        moveInput = 0;
        setStickVisual(0);
      }
    },
    { passive: false }
  );

  function onCanvasDown(e) {
    e.preventDefault();
    if (state === "title") startGame();
    else if (state === "win" || state === "lose") {
      state = "title";
      showControls(false);
    }
  }
  canvas.addEventListener("mousedown", onCanvasDown);
  canvas.addEventListener("touchstart", onCanvasDown, { passive: false });
  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      keys.left = true;
      moveInput = -1;
      setStickVisual(-1);
    }
    if (e.code === "ArrowRight" || e.code === "KeyD") {
      keys.right = true;
      moveInput = 1;
      setStickVisual(1);
    }
    if (e.code === "Space" || e.code === "KeyZ") {
      e.preventDefault();
      if (!keys.fire) {
        keys.fire = true;
        fireHeld = true;
        if (state === "title") startGame();
        else tryFire();
      }
    }
    if (e.code === "Enter" && (state === "title" || state === "win" || state === "lose")) {
      if (state === "title") startGame();
      else {
        state = "title";
        showControls(false);
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      keys.left = false;
      moveInput = keys.right ? 1 : 0;
      setStickVisual(moveInput);
    }
    if (e.code === "ArrowRight" || e.code === "KeyD") {
      keys.right = false;
      moveInput = keys.left ? -1 : 0;
      setStickVisual(moveInput);
    }
    if (e.code === "Space" || e.code === "KeyZ") {
      keys.fire = false;
      fireHeld = false;
    }
  });

  // ---- Combat helpers ----
  function groupAlive(groupId) {
    return enemies.some((en) => en.alive && en.groupId === groupId);
  }

  function nearestEnemyAhead() {
    let best = null;
    let bestD = 1e9;
    for (const en of enemies) {
      if (!en.alive) continue;
      const dz = en.z - worldZ;
      if (dz < -0.5 || dz > 28) continue;
      const d = dz + Math.abs(en.x - playerX) * 0.3;
      if (d < bestD) {
        bestD = d;
        best = en;
      }
    }
    return best;
  }

  function hitEnemy(en, dmg) {
    if (!en.alive) return;
    const mult = en.def && en.def.armored ? 0.75 : 1;
    en.hp -= dmg * mult;
    en.hitFlash = 0.15;
    burst(en.x, en.z, "#ff6", 3);
    if (en.hp <= 0) {
      en.hp = 0;
      en.alive = false;
      en.death = 0.01;
      burst(en.x, en.z, "#fa0", 10);
    }
  }

  function hitBoss(dmg) {
    if (!boss || !boss.alive || boss.hp <= 0) return;
    boss.hp = Math.max(0, boss.hp - dmg);
    boss.hitFlash = 0.15;
    boss.phase = 1 - boss.hp / boss.maxHp;
    burst(boss.x + (Math.random() - 0.5), boss.z, "#fa0", 4);
    if (boss.hp <= 0) {
      boss.hp = 0;
      boss.alive = false;
      boss.fighting = false;
      winGame();
    }
  }

  // ---- Update ----
  function update(dt) {
    titlePulse += dt;
    animTime += dt;
    if (cameraShake > 0) cameraShake = Math.max(0, cameraShake - dt);
    if (muzzleFlash > 0) muzzleFlash = Math.max(0, muzzleFlash - dt);
    if (playerHitFlash > 0) playerHitFlash = Math.max(0, playerHitFlash - dt);
    if (fireCooldown > 0) fireCooldown = Math.max(0, fireCooldown - dt);

    // Auto-repeat fire while held (still manual — no passive auto-shoot)
    if (fireHeld && fireCooldown <= 0) tryFire();

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (state === "playing" || state === "fight" || state === "boss") {
      // Lateral move from stick / keys (not drag-to-position)
      if (Math.abs(moveInput) > 0.05) {
        playerX += moveInput * MOVE_SPEED * dt;
        facing = moveInput >= 0 ? 1 : -1;
      }
      playerX = Math.max(-LANE_HALF, Math.min(LANE_HALF, playerX));

      if (hintTimer > 0) {
        hintTimer -= dt;
        if (hintTimer <= 0) hintEl.classList.add("hidden");
      }

      crowd.forEach((c) => {
        c.bob += dt * 8;
        c.walk += dt * 10;
      });

      const inCombat = state === "fight" || state === "boss";
      const speed = inCombat ? FIGHT_SPEED : RUN_SPEED;

      if (!inCombat) {
        worldZ += speed * dt;
        gates.forEach((g) => {
          if (g.hit) return;
          if (g.z - worldZ < 0.85 && g.z - worldZ > -0.35 && Math.abs(g.x - playerX) < g.w * 0.6) {
            applyGate(g);
          }
        });

        // Approach enemy groups → fight state (hold near, manual shoot)
        const groups = {};
        enemies.forEach((en) => {
          if (!en.alive) return;
          if (!groups[en.groupId]) groups[en.groupId] = { minZ: en.z, id: en.groupId };
          groups[en.groupId].minZ = Math.min(groups[en.groupId].minZ, en.z);
        });
        for (const gid of Object.keys(groups)) {
          const g = groups[gid];
          if (worldZ >= g.minZ - 1.4) {
            fightTarget = g.id;
            state = "fight";
            hintEl.classList.add("hidden");
            break;
          }
        }

        if (boss && boss.alive && !boss.hit && worldZ >= boss.z - 2.2) {
          boss.hit = true;
          boss.fighting = true;
          state = "boss";
          fightTarget = "boss";
        }
      } else if (state === "fight") {
        updateFightZone(dt);
      } else if (state === "boss") {
        updateBossZone(dt);
      }

      updateEnemies(dt);
      updateProjectiles(dt);
      updateEnemyShots(dt);
    }

    // Death fades
    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (!en.alive) {
        en.death += dt;
        if (en.death > 0.7) enemies.splice(i, 1);
      }
    }

    if (state === "win") winTimer += dt;
  }

  function updateFightZone(dt) {
    // Hold near the closest living enemy in the group
    let holdZ = worldZ;
    let any = false;
    let minZ = 1e9;
    for (const en of enemies) {
      if (!en.alive || en.groupId !== fightTarget) continue;
      any = true;
      minZ = Math.min(minZ, en.z);
    }
    if (!any) {
      fightTarget = null;
      state = "playing";
      cameraShake = 0.35;
      return;
    }
    holdZ = minZ - 1.0;
    if (worldZ < holdZ) worldZ += FIGHT_SPEED * dt;
    else worldZ = Math.min(worldZ, holdZ + 0.15);
  }

  function updateBossZone(dt) {
    if (!boss || !boss.alive) return;
    const holdZ = boss.z - 2.4;
    if (worldZ < holdZ) worldZ += FIGHT_SPEED * dt;
    else worldZ = holdZ;
  }

  function updateEnemies(dt) {
    for (const en of enemies) {
      if (!en.alive) continue;
      en.bob += dt * 6;
      en.walk += dt * (6 + en.speed * 3);
      if (en.hitFlash > 0) en.hitFlash -= dt;
      if (en.contactCd > 0) en.contactCd -= dt;

      const dz = en.z - worldZ;
      // Advance toward player during combat / when close
      if (dz < 18 && dz > -1) {
        const dx = playerX - en.x;
        en.x += Math.sign(dx) * Math.min(Math.abs(dx), en.speed * 0.9 * dt);
        en.facing = dx >= 0 ? 1 : -1;
        // creep forward a bit
        if (dz > 1.2) en.z -= en.speed * 0.35 * dt;
      }

      // Contact damage
      if (Math.abs(en.x - playerX) < 0.85 * en.size && Math.abs(en.z - worldZ) < 1.1) {
        if (en.contactCd <= 0) {
          en.contactCd = 0.55;
          hurtPlayer(en.damage);
          burst(playerX, worldZ, "#f66", 5);
        }
      }

      // Spitter ranged
      if (en.def.ranged) {
        en.rangeCd -= dt;
        if (en.rangeCd <= 0 && dz > 2 && dz < 16) {
          en.rangeCd = en.def.rangeCd || 1.6;
          enemyShots.push({
            x: en.x,
            z: en.z,
            vx: (playerX - en.x) * 1.2,
            vz: -10,
            life: 1.2,
            dmg: Math.max(4, Math.floor(en.damage * 0.7)),
          });
        }
      }
    }

    if (boss && boss.alive) {
      boss.bob += dt * 4;
      boss.walk += dt * 5;
      if (boss.hitFlash > 0) boss.hitFlash -= dt;
      if (boss.contactCd > 0) boss.contactCd -= dt;
      boss.rangeCd -= dt;
      if (boss.fighting) {
        boss.x += Math.sin(animTime * 1.2) * 0.4 * dt;
        if (Math.abs(boss.x - playerX) < 1.6 && Math.abs(boss.z - worldZ) < 2.5) {
          if (boss.contactCd <= 0) {
            boss.contactCd = 0.7;
            hurtPlayer(MONSTER_DEFS.BossNecromancer.damage);
            burst(playerX, worldZ, "#f4a", 6);
          }
        }
        if (boss.rangeCd <= 0) {
          boss.rangeCd = 1.1 - boss.phase * 0.3;
          enemyShots.push({
            x: boss.x,
            z: boss.z - 0.5,
            vx: (playerX - boss.x) * 2,
            vz: -12,
            life: 1.4,
            dmg: 10 + Math.floor(boss.phase * 8),
          });
        }
      }
    }
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.z += pr.vz * dt;
      pr.life -= dt;
      let hit = false;
      for (const en of enemies) {
        if (!en.alive) continue;
        if (Math.abs(pr.x - en.x) < 0.7 * en.size && Math.abs(pr.z - en.z) < 0.8) {
          hitEnemy(en, pr.dmg);
          hit = true;
          break;
        }
      }
      if (!hit && boss && boss.alive && boss.fighting) {
        if (Math.abs(pr.x - boss.x) < 1.8 && Math.abs(pr.z - boss.z) < 1.5) {
          hitBoss(pr.dmg);
          hit = true;
        }
      }
      if (hit || pr.life <= 0) projectiles.splice(i, 1);
    }
  }

  function updateEnemyShots(dt) {
    for (let i = enemyShots.length - 1; i >= 0; i--) {
      const s = enemyShots[i];
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      if (Math.abs(s.x - playerX) < 0.7 && Math.abs(s.z - worldZ) < 0.8) {
        hurtPlayer(s.dmg);
        burst(playerX, worldZ, "#8f4", 4);
        enemyShots.splice(i, 1);
        continue;
      }
      if (s.life <= 0 || s.z < worldZ - 2) enemyShots.splice(i, 1);
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
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 8; i++) {
      const y = ((i * 80 + titlePulse * 20) % (H + 40)) - 20;
      ctx.fillStyle = "#8cf";
      ctx.fillRect(0, y, W, 6);
    }
    ctx.globalAlpha = 1;
  }

  function drawBridge() {
    const startZ = Math.floor(worldZ) - 2;
    const endZ = startZ + 50;
    for (let z = endZ; z >= startZ; z--) {
      const left = worldToScreen(-LANE_HALF - 0.4, z);
      const right = worldToScreen(LANE_HALF + 0.4, z);
      const leftN = worldToScreen(-LANE_HALF - 0.4, z + 1);
      const rightN = worldToScreen(LANE_HALF + 0.4, z + 1);
      if (!left || !right || !leftN || !rightN) continue;
      const shade = z % 2 === 0 ? "#c8c2b4" : "#b8b2a4";
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(left.sx, left.sy);
      ctx.lineTo(right.sx, right.sy);
      ctx.lineTo(rightN.sx, rightN.sy);
      ctx.lineTo(leftN.sx, leftN.sy);
      ctx.closePath();
      ctx.fill();
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
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g.color;
    roundRect(p.sx - hw, p.sy - hh, hw * 2, hh * 1.6, 6);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
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

  function drawHpBar(sx, sy, w, h, ratio, label) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(sx - w / 2, sy, w, h, 3);
    ctx.fill();
    ctx.fillStyle = ratio > 0.4 ? "#4c4" : "#e44";
    roundRect(sx - w / 2 + 1, sy + 1, Math.max(0, (w - 2) * ratio), h - 2, 2);
    ctx.fill();
    if (label) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, sx, sy + h / 2);
    }
  }

  /** Animated military soldier with walk cycle + muzzle flash */
  function drawSoldier(sx, sy, s, opts) {
    opts = opts || {};
    const walk = opts.walk || 0;
    const face = opts.facing == null ? 1 : opts.facing;
    const flash = opts.muzzle || 0;
    const hit = opts.hit || 0;
    const bobY = Math.sin(walk * 2) * s * 0.04;
    const legSwing = Math.sin(walk) * s * 0.28;
    const armSwing = Math.sin(walk + Math.PI) * s * 0.12;
    const h = s * 1.25;
    sy = sy + bobY;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(face, 1);
    if (hit > 0) ctx.globalAlpha = 0.55 + Math.sin(hit * 40) * 0.35;

    ctx.lineCap = "round";
    // legs
    ctx.strokeStyle = "#2a3a28";
    ctx.lineWidth = Math.max(1.4, s * 0.22);
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, h * 0.42);
    ctx.lineTo(-s * 0.18 - legSwing * 0.35, h * 0.98);
    ctx.moveTo(s * 0.12, h * 0.42);
    ctx.lineTo(s * 0.18 + legSwing * 0.35, h * 0.98);
    ctx.stroke();
    // boots
    ctx.strokeStyle = "#1a2018";
    ctx.lineWidth = Math.max(1.2, s * 0.16);
    ctx.beginPath();
    ctx.moveTo(-s * 0.18 - legSwing * 0.35, h * 0.98);
    ctx.lineTo(-s * 0.28 - legSwing * 0.35, h * 0.98);
    ctx.moveTo(s * 0.18 + legSwing * 0.35, h * 0.98);
    ctx.lineTo(s * 0.32 + legSwing * 0.35, h * 0.98);
    ctx.stroke();
    // torso / vest
    ctx.fillStyle = "#3d5c3a";
    ctx.fillRect(-s * 0.32, -h * 0.1, s * 0.64, h * 0.55);
    ctx.fillStyle = "#2f4a2c";
    ctx.fillRect(-s * 0.3, h * 0.02, s * 0.6, h * 0.12);
    // pouch
    ctx.fillStyle = "#253820";
    ctx.fillRect(s * 0.05, h * 0.18, s * 0.18, s * 0.14);
    // rifle
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = Math.max(1.8, s * 0.2);
    const rx0 = s * 0.1;
    const ry0 = h * 0.02 + armSwing * 0.3;
    const rx1 = s * 1.15;
    const ry1 = -h * 0.3;
    ctx.beginPath();
    ctx.moveTo(rx0, ry0);
    ctx.lineTo(rx1, ry1);
    ctx.stroke();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.beginPath();
    ctx.moveTo(s * 0.55, -h * 0.08);
    ctx.lineTo(s * 0.55, h * 0.1);
    ctx.stroke();
    // arm
    ctx.strokeStyle = "#c4a882";
    ctx.lineWidth = Math.max(1.2, s * 0.15);
    ctx.beginPath();
    ctx.moveTo(s * 0.22, h * 0.05);
    ctx.lineTo(s * 0.72, -h * 0.14 + armSwing * 0.2);
    ctx.stroke();
    // head
    ctx.fillStyle = "#c4a882";
    ctx.beginPath();
    ctx.arc(0, -h * 0.3, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
    // helmet
    ctx.fillStyle = "#2f4a2c";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.4, s * 0.34, s * 0.2, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-s * 0.34, -h * 0.4, s * 0.68, s * 0.12);
    ctx.fillStyle = "#111";
    ctx.fillRect(-s * 0.22, -h * 0.32, s * 0.44, s * 0.08);
    // muzzle flash
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,220,80," + Math.min(1, flash * 12) + ")";
      ctx.beginPath();
      ctx.moveTo(rx1, ry1);
      ctx.lineTo(rx1 + s * 0.45, ry1 - s * 0.2);
      ctx.lineTo(rx1 + s * 0.35, ry1 + s * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,220,0.9)";
      ctx.beginPath();
      ctx.arc(rx1 + s * 0.1, ry1, s * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** Distinct procedural monster by class */
  function drawMonster(sx, sy, s, en) {
    const def = en.def || MONSTER_DEFS.ZombieGrunt;
    const walk = en.walk || 0;
    const face = en.facing || -1;
    const hit = en.hitFlash || 0;
    const deathA = en.alive ? 1 : Math.max(0, 1 - en.death * 1.4);
    const bobY = Math.sin(en.bob || 0) * s * 0.05;
    const leg = Math.sin(walk) * s * 0.3;
    const h = s * 1.2 * def.size;
    const sc = s * def.size;
    sy = sy + bobY;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(face, 1);
    ctx.globalAlpha = deathA * (hit > 0 ? 0.5 + Math.sin(hit * 50) * 0.4 : 1);

    if (def.rat) {
      // PlagueRat silhouette
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.ellipse(0, h * 0.35, sc * 0.7, sc * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = def.skin;
      ctx.beginPath();
      ctx.arc(sc * 0.55, h * 0.2, sc * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-sc * 0.6, h * 0.35);
      ctx.quadraticCurveTo(-sc * 1.2, h * 0.1, -sc * 1.1, -h * 0.1);
      ctx.stroke();
      ctx.fillStyle = def.eye;
      ctx.beginPath();
      ctx.arc(sc * 0.65, h * 0.12, sc * 0.07, 0, Math.PI * 2);
      ctx.fill();
      // scurrying legs
      ctx.strokeStyle = def.skin;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const lx = -sc * 0.3 + i * sc * 0.25;
        ctx.beginPath();
        ctx.moveTo(lx, h * 0.45);
        ctx.lineTo(lx + Math.sin(walk + i) * sc * 0.2, h * 0.75);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    ctx.lineCap = "round";
    // legs
    ctx.strokeStyle = def.bony ? "#ddd8cc" : def.color;
    ctx.lineWidth = Math.max(1.3, sc * (def.bony ? 0.12 : 0.2));
    ctx.beginPath();
    ctx.moveTo(-sc * 0.15, h * 0.4);
    ctx.lineTo(-sc * 0.25 - leg * 0.4, h * 0.95);
    ctx.moveTo(sc * 0.12, h * 0.4);
    ctx.lineTo(sc * 0.28 + leg * 0.4, h * 0.92);
    ctx.stroke();

    // torso
    if (def.armored) {
      ctx.fillStyle = "#555868";
      ctx.fillRect(-sc * 0.38, -h * 0.12, sc * 0.76, h * 0.55);
      ctx.strokeStyle = "#889";
      ctx.lineWidth = 2;
      ctx.strokeRect(-sc * 0.38, -h * 0.12, sc * 0.76, h * 0.55);
    } else if (def.bony) {
      ctx.strokeStyle = "#eee";
      ctx.lineWidth = Math.max(1.2, sc * 0.1);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-sc * 0.28, -h * 0.05 + i * h * 0.12);
        ctx.lineTo(sc * 0.28, -h * 0.05 + i * h * 0.12);
        ctx.stroke();
      }
      ctx.strokeStyle = "#ddd";
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.12);
      ctx.lineTo(0, h * 0.42);
      ctx.stroke();
    } else {
      ctx.fillStyle = def.color;
      ctx.fillRect(-sc * 0.32, -h * 0.1, sc * 0.64, h * 0.52);
      if (def.label === "Wrzeszcz") {
        ctx.fillStyle = "rgba(255,100,255,0.35)";
        ctx.beginPath();
        ctx.arc(0, h * 0.1, sc * 0.5 + Math.sin(animTime * 8) * sc * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // arms
    ctx.strokeStyle = def.bony ? "#e8e0d0" : def.skin;
    ctx.lineWidth = Math.max(1.2, sc * 0.15);
    const reach = def.boss ? 1.2 : 0.95;
    ctx.beginPath();
    ctx.moveTo(-sc * 0.3, h * 0.02);
    ctx.lineTo(-sc * reach, -h * 0.2 + Math.sin(walk) * sc * 0.1);
    ctx.moveTo(sc * 0.3, h * 0.05);
    ctx.lineTo(sc * reach * 0.9, -h * 0.05 + Math.cos(walk) * sc * 0.1);
    ctx.stroke();

    // head
    ctx.fillStyle = def.skin;
    const headR = sc * (def.boss ? 0.4 : 0.28);
    ctx.beginPath();
    ctx.arc(0, -h * 0.32, headR, 0, Math.PI * 2);
    ctx.fill();

    if (def.boss) {
      // hood / crown
      ctx.fillStyle = "#1a1028";
      ctx.beginPath();
      ctx.moveTo(-headR * 1.2, -h * 0.3);
      ctx.lineTo(0, -h * 0.85);
      ctx.lineTo(headR * 1.2, -h * 0.3);
      ctx.closePath();
      ctx.fill();
      // staff
      ctx.strokeStyle = "#8866aa";
      ctx.lineWidth = Math.max(2, sc * 0.12);
      ctx.beginPath();
      ctx.moveTo(sc * 0.8, h * 0.5);
      ctx.lineTo(sc * 1.1, -h * 0.9);
      ctx.stroke();
      ctx.fillStyle = "#ffee44";
      ctx.beginPath();
      ctx.arc(sc * 1.1, -h * 0.95, sc * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    // eyes
    ctx.fillStyle = def.eye;
    const eyeY = -h * 0.34;
    ctx.beginPath();
    ctx.arc(-sc * 0.1, eyeY, sc * 0.07, 0, Math.PI * 2);
    ctx.arc(sc * 0.12, eyeY, sc * 0.07, 0, Math.PI * 2);
    ctx.fill();

    // mouth / jaw
    if (!def.bony) {
      ctx.fillStyle = "#1a2010";
      ctx.beginPath();
      ctx.arc(0, -h * 0.22, sc * 0.1, 0.2, Math.PI - 0.2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-sc * 0.12, -h * 0.22);
      ctx.lineTo(sc * 0.12, -h * 0.22);
      ctx.stroke();
    }

    // Spitter goo drip
    if (def.ranged) {
      ctx.fillStyle = "#8f4";
      ctx.beginPath();
      ctx.arc(sc * 0.05, -h * 0.15, sc * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawEnemy(en) {
    if (!en.alive && en.death > 0.7) return;
    const p = worldToScreen(en.x, en.z);
    if (!p) return;
    drawMonster(p.sx, p.sy, p.s, en);
    if (en.alive && (en.def.showBar || en.hp < en.maxHp)) {
      const ratio = en.hp / en.maxHp;
      drawHpBar(p.sx, p.sy - p.s * en.size * 1.7, 36 * Math.max(0.8, en.size), 7, ratio, null);
    }
  }

  function drawBoss() {
    if (!boss || (!boss.alive && boss.hp <= 0 && !boss.fighting)) {
      if (!boss || boss.hp > 0) {
        /* still approaching */
      } else return;
    }
    if (boss.hp <= 0 && !boss.alive) return;
    const p = worldToScreen(boss.x, boss.z);
    if (!p) return;
    const fake = {
      def: MONSTER_DEFS.BossNecromancer,
      walk: boss.walk,
      bob: boss.bob,
      facing: playerX >= boss.x ? 1 : -1,
      hitFlash: boss.hitFlash,
      alive: boss.alive,
      death: 0,
    };
    drawMonster(p.sx, p.sy, p.s * 1.1, fake);
    const ratio = boss.hp / boss.maxHp;
    drawHpBar(p.sx, p.sy - p.s * 4.2, 100, 14, ratio, Math.ceil(boss.hp) + " HP");
    ctx.fillStyle = "#ffee88";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("NEKROMANTA", p.sx, p.sy - p.s * 4.2 - 10);
  }

  function drawCrowd() {
    const sorted = crowd.slice().sort((a, b) => b.oz - a.oz);
    const moving = Math.abs(moveInput) > 0.05 || state === "playing";
    sorted.forEach((c, idx) => {
      const bob = Math.sin(c.bob) * 0.06;
      const p = worldToScreen(playerX + c.ox, worldZ + c.oz + bob);
      if (!p) return;
      drawSoldier(p.sx, p.sy, p.s, {
        walk: c.walk + c.phase,
        facing: facing,
        muzzle: idx < 3 && muzzleFlash > 0 ? muzzleFlash : 0,
        hit: playerHitFlash,
      });
    });
    const gp = worldToScreen(playerX, worldZ);
    if (gp) {
      ctx.fillStyle = playerHitFlash > 0 ? "rgba(255,80,80,0.35)" : "rgba(80,180,255,0.25)";
      ctx.beginPath();
      ctx.ellipse(gp.sx, gp.sy + 8, 28 * gp.scale, 10 * gp.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawProjectiles() {
    projectiles.forEach((pr) => {
      const p = worldToScreen(pr.x, pr.z);
      if (!p) return;
      ctx.strokeStyle = "#ffcc44";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.sx, p.sy + 8 * p.scale);
      ctx.lineTo(p.sx, p.sy - 4 * p.scale);
      ctx.stroke();
      ctx.fillStyle = "#fff3a0";
      ctx.beginPath();
      ctx.arc(p.sx, p.sy - 4 * p.scale, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    enemyShots.forEach((s) => {
      const p = worldToScreen(s.x, s.z);
      if (!p) return;
      ctx.fillStyle = "#a0ff40";
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 4 * p.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(160,255,60,0.35)";
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 8 * p.scale, 0, Math.PI * 2);
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
    worldZ = 0;
    drawWater();
    ctx.fillStyle = "rgba(10,25,50,0.35)";
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "900 42px system-ui,sans-serif";
    ctx.strokeStyle = "#1a4aff";
    ctx.lineWidth = 6;
    ctx.strokeText("MOST ARMII", W / 2, H * 0.22);
    ctx.fillText("MOST ARMII", W / 2, H * 0.22);

    ctx.font = "700 16px system-ui";
    ctx.fillStyle = "#8cf";
    ctx.fillText("HAOS Runner", W / 2, H * 0.22 + 28);

    // Animated preview
    for (let i = 0; i < 8; i++) {
      const a = titlePulse * 2 + i * 0.55;
      const x = W / 2 - 40 + Math.cos(a) * 30;
      const y = H * 0.42 + Math.sin(a * 0.7) * 10;
      drawSoldier(x, y, 11, { walk: titlePulse * 8 + i, facing: 1, muzzle: 0 });
    }
    const types = ["ZombieGrunt", "Runner", "Brute", "Skeleton", "PlagueRat"];
    types.forEach((t, i) => {
      const en = {
        def: MONSTER_DEFS[t],
        walk: titlePulse * 6 + i,
        bob: titlePulse * 3 + i,
        facing: -1,
        hitFlash: 0,
        alive: true,
        death: 0,
      };
      drawMonster(W / 2 + 55 + i * 8, H * 0.44 + (i % 2) * 8, 10 + i, en);
    });

    const pulse = 1 + Math.sin(titlePulse * 3) * 0.04;
    ctx.save();
    ctx.translate(W / 2, H * 0.62);
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

    ctx.font = "13px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("Lewy przycisk: OGIEŃ  ·  Prawy: RUCH", W / 2, H * 0.75);
    ctx.fillText("Buduj armię • Bramy + / × • Pokonaj Nekromantę", W / 2, H * 0.75 + 20);
    ctx.fillText("Klawiatura: A/D ruch, Spacja/Z strzał", W / 2, H * 0.75 + 40);
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
      ctx.fillText(
        playerHp <= 0 ? "Twoje HP spadło do zera" : "Twoja armia została rozbita",
        W / 2,
        H * 0.38 + 40
      );
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
    const t = state === "boss" ? "BOSS — STRZELAJ!" : "WRÓG — STRZELAJ!";
    ctx.strokeText(t, W / 2, 56);
    ctx.fillText(t, W / 2, 56);
  }

  function render() {
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

    const drawables = [];
    gates.forEach((g) => drawables.push({ z: g.z, draw: () => drawGate(g) }));
    enemies.forEach((en) => drawables.push({ z: en.z, draw: () => drawEnemy(en) }));
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

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  resize();
  resetLevel();
  requestAnimationFrame(loop);
})();
