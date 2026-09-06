/**
 * Most Armii (HAOS Runner) — original hyper-casual bridge crowd-runner
 * Portrait/landscape adaptive PWA. Procedural art only.
 * v14: bridge combat feel — dense armies, stacked gates, barrels, pillars,
 * boss ring, VFX, light between-run upgrades
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

  let W = 360;
  let H = 640;
  let isLandscape = false;
  let dpr = 1;
  let lastTs = 0;
  let state = "title";
  let hintTimer = 0;
  let bannerText = "";
  let bannerTimer = 0;

  const UPG_KEY = "most-armii-upg-v14";
  let upgrades = loadUpgrades();
  function loadUpgrades() {
    try {
      const raw = localStorage.getItem(UPG_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        return {
          dmg: Math.min(5, o.dmg | 0),
          rate: Math.min(5, o.rate | 0),
          hp: Math.min(5, o.hp | 0),
        };
      }
    } catch (e) {}
    return { dmg: 0, rate: 0, hp: 0 };
  }
  function saveUpgrades() {
    try { localStorage.setItem(UPG_KEY, JSON.stringify(upgrades)); } catch (e) {}
  }

  let unitCount = 1;
  let playerX = 0;
  let worldZ = 0;
  let playerHp = 100;
  let playerMaxHp = 100;
  let playerHitFlash = 0;
  let muzzleFlash = 0;
  let facing = 1;
  let fireCooldown = 0;
  let moveInput = 0;
  let fireHeld = false;
  let keys = { left: false, right: false, fire: false };

  const SPEED_LEVEL = 6;
  const SPEED_SCALE_MAX = 20;
  const RUN_SPEED_MAX = 10;
  const RUN_SPEED = RUN_SPEED_MAX * (SPEED_LEVEL / SPEED_SCALE_MAX);
  const LANE_HALF = 5.2;
  const FIGHT_SPEED = Math.max(1.2, RUN_SPEED * 0.55);
  const MOVE_SPEED = 7.5;
  const FIRE_COOLDOWN_BASE = 0.22;
  const PLAYER_BASE_HP = 80;
  const PLAYER_HP_PER_UNIT = 4;
  const MAX_VIS = 100;
  let crowd = [];

  let gates = [];
  let barrels = [];
  let pillars = [];
  let enemies = [];
  let formations = [];
  let boss = null;
  let fightTarget = null;
  let projectiles = [];
  let enemyShots = [];
  let particles = [];
  let floatTexts = [];
  let cameraShake = 0;
  let winTimer = 0;
  let titlePulse = 0;
  let animTime = 0;
  let upgradeChoices = [];
  let pendingEnd = null;

  const MONSTER_DEFS = {
    ZombieGrunt: { label:"Zombie", hp:18, speed:1.1, size:0.9, damage:6, color:"#8a2020", skin:"#c06050", eye:"#ff2222", showBar:false, score:1 },
    Runner: { label:"Biegacz", hp:12, speed:2.4, size:0.85, damage:5, color:"#a03020", skin:"#d08060", eye:"#ffaa00", showBar:false, score:1 },
    Spitter: { label:"Plujka", hp:22, speed:1.0, size:0.95, damage:4, ranged:true, rangeCd:1.6, color:"#6a3028", skin:"#a05040", eye:"#a0ff40", showBar:false, score:2 },
    Brute: { label:"Brutale", hp:55, speed:0.85, size:1.35, damage:12, color:"#5a1818", skin:"#a05048", eye:"#ff4444", showBar:true, score:3 },
    Tank: { label:"Czołg", hp:110, speed:0.55, size:1.7, damage:16, color:"#3a3a48", skin:"#707088", eye:"#88aaff", showBar:true, armored:true, score:5 },
    Screamer: { label:"Wrzeszcz", hp:28, speed:1.5, size:1.05, damage:8, color:"#5a2050", skin:"#c070a0", eye:"#ff66ff", showBar:false, score:2 },
    Skeleton: { label:"Szkielet", hp:20, speed:1.6, size:0.95, damage:7, color:"#d8d0c0", skin:"#eee8dc", eye:"#40e0ff", showBar:false, bony:true, score:2 },
    PlagueRat: { label:"Szczur", hp:8, speed:2.8, size:0.55, damage:3, color:"#4a3828", skin:"#8a6848", eye:"#ffcc00", showBar:false, rat:true, score:1 },
    ArmoredZombie: { label:"Pancerny", hp:70, speed:0.75, size:1.25, damage:10, color:"#3a2a2a", skin:"#8a6060", eye:"#ff3333", showBar:true, armored:true, score:4 },
    BossNecromancer: { label:"Władca Mostu", hp:520, speed:0.4, size:2.6, damage:18, color:"#2a1018", skin:"#6a4050", eye:"#ffee44", showBar:true, boss:true, score:50 },
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vw = window.innerWidth, vh = window.innerHeight;
    canvas.width = Math.floor(vw * dpr);
    canvas.height = Math.floor(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    isLandscape = vw > vh;
    if (isLandscape) { W = 640; H = 360; } else { W = 360; H = 640; }
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

  function fireCooldownMax() {
    return Math.max(0.09, FIRE_COOLDOWN_BASE - upgrades.rate * 0.018);
  }
  function damagePerShot() {
    return Math.max(6, Math.ceil(5 + unitCount * 0.45 + upgrades.dmg * 4));
  }
  function recalcPlayerHp(preserveRatio) {
    const prevMax = Math.max(1, playerMaxHp);
    const ratio = preserveRatio ? playerHp / prevMax : 1;
    playerMaxHp = PLAYER_BASE_HP + unitCount * PLAYER_HP_PER_UNIT + upgrades.hp * 25;
    playerHp = preserveRatio ? Math.max(1, Math.round(playerMaxHp * ratio)) : playerMaxHp;
    updateHud();
  }

  function spawnMonster(type, x, z, groupId) {
    const def = MONSTER_DEFS[type] || MONSTER_DEFS.ZombieGrunt;
    enemies.push({
      type, x, z, hp: def.hp, maxHp: def.hp, speed: def.speed, size: def.size, damage: def.damage,
      def, groupId: groupId || 0, hitFlash: 0, death: 0, alive: true,
      bob: Math.random() * Math.PI * 2, walk: Math.random() * Math.PI * 2,
      contactCd: 0, rangeCd: def.ranged ? 0.4 + Math.random() : 0, facing: -1,
    });
  }
  function spawnWave(z, groupId, list) {
    list.forEach((item, i) => {
      const [type, count] = item;
      for (let n = 0; n < count; n++) {
        const col = n % 5, row = Math.floor(n / 5);
        spawnMonster(type, (col - 2) * 0.85 + (Math.random() - 0.5) * 0.2, z + row * 0.7 + i * 0.15, groupId);
      }
    });
  }
  function spawnFormation(z, groupId, count, opts) {
    opts = opts || {};
    const cols = opts.cols || 10;
    const rows = Math.ceil(count / cols);
    const cx = opts.x || 0;
    formations.push({ x: cx, z, cols, rows, count, maxCount: count, groupId, alive: true, spacing: opts.spacing || 0.42 });
    if (opts.elites) opts.elites.forEach((e, i) => spawnMonster(e, cx + (i - 1) * 1.2, z + 0.5 + i * 0.3, groupId));
  }
  function formationAliveCount(f) { return Math.max(0, Math.floor(f.count)); }

  function addGateRow(z, defs) {
    defs.forEach((d) => {
      gates.push({ z, x: d.x, op: d.op, v: d.v, color: d.color, w: d.w || 2.2, hit: false, stacked: d.stacked || 0 });
    });
  }
  function addBarrel(z, x, amount) { barrels.push({ z, x, amount, hit: false, w: 1.4 }); }
  function addPillar(z, x, hp) { pillars.push({ z, x, hp, maxHp: hp, alive: true, hitFlash: 0, w: 1.6 }); }
  function showBanner(text, sec) { bannerText = text; bannerTimer = sec == null ? 2.2 : sec; }

  function resetLevel() {
    unitCount = 4; playerX = 0; worldZ = 0;
    gates = []; barrels = []; pillars = []; enemies = []; formations = [];
    projectiles = []; enemyShots = []; particles = []; floatTexts = [];
    fightTarget = null; cameraShake = 0; fireCooldown = 0; muzzleFlash = 0;
    playerHitFlash = 0; winTimer = 0; moveInput = 0; fireHeld = false;
    bannerText = ""; bannerTimer = 0; crowd = [];
    for (let i = 0; i < 12; i++) spawnCrowdDot();
    recalcPlayerHp(false);

    // Segment 1 — grow
    addGateRow(10, [
      { x: -2.8, op: "add", v: 1, color: "#2a7fff", stacked: 4 },
      { x: 2.8, op: "add", v: 3, color: "#2a7fff", stacked: 2 },
    ]);
    addBarrel(16, -2.2, 20);
    addBarrel(16, 2.2, 30);
    addGateRow(20, [
      { x: -3.0, op: "mul", v: 2, color: "#5cf" },
      { x: 0, op: "add", v: 5, color: "#2a7fff", stacked: 3 },
      { x: 3.0, op: "sub", v: 8, color: "#e33" },
    ]);
    spawnFormation(30, 1, 180, { cols: 12, elites: ["ZombieGrunt", "Runner", "PlagueRat"] });
    spawnWave(31, 1, [["ZombieGrunt", 4], ["PlagueRat", 3]]);

    // Segment 2
    addGateRow(42, [
      { x: -3.0, op: "add", v: 1, color: "#2a7fff", stacked: 6 },
      { x: 0, op: "sub", v: 15, color: "#e33" },
      { x: 3.0, op: "add", v: 8, color: "#2a7fff", stacked: 2 },
    ]);
    addBarrel(48, 0, 50);
    addPillar(52, 2.5, 220);
    addGateRow(56, [
      { x: -2.6, op: "mul", v: 2, color: "#a6f" },
      { x: 2.6, op: "add", v: 12, color: "#2a7fff" },
    ]);
    spawnFormation(64, 2, 420, { cols: 14, elites: ["Skeleton", "Spitter", "Brute"] });
    spawnWave(65, 2, [["Skeleton", 3], ["Spitter", 2], ["Brute", 1]]);

    // Segment 3
    addGateRow(76, [
      { x: -3.0, op: "add", v: 15, color: "#2a7fff" },
      { x: 0, op: "mul", v: 2, color: "#5cf" },
      { x: 3.0, op: "sub", v: 25, color: "#e33" },
    ]);
    addBarrel(80, -2.5, 40);
    addBarrel(80, 2.5, 40);
    addPillar(84, -2.8, 280);
    addPillar(86, 2.8, 320);
    spawnFormation(92, 3, 700, { cols: 16, elites: ["ArmoredZombie", "Tank", "Screamer", "Runner"] });
    spawnWave(93, 3, [["ArmoredZombie", 2], ["Tank", 1], ["Screamer", 2], ["Runner", 2]]);

    const bhp = MONSTER_DEFS.BossNecromancer.hp;
    boss = {
      z: 108, x: 0, type: "BossNecromancer", hp: bhp, maxHp: bhp,
      hit: false, fighting: false, phase: 0, hitFlash: 0, death: 0,
      walk: 0, bob: 0, contactCd: 0, rangeCd: 1, alive: true,
    };
    spawnFormation(110, 4, 900, { cols: 18, x: 0 });
  }

  function spawnCrowdDot() {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 1.35;
    crowd.push({
      ox: Math.cos(a) * r, oz: Math.sin(a) * r * 0.7 - 0.2,
      bob: Math.random() * Math.PI * 2, walk: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2, isHero: false,
    });
  }
  function syncCrowdVis() {
    const want = Math.min(MAX_VIS, Math.max(3, Math.ceil(Math.sqrt(unitCount) * 4.2)));
    while (crowd.length < want) spawnCrowdDot();
    while (crowd.length > want) crowd.pop();
    let best = 0, bestD = 1e9;
    crowd.forEach((c, i) => {
      c.isHero = false;
      const d = c.ox * c.ox + c.oz * c.oz;
      if (d < bestD) { bestD = d; best = i; }
    });
    if (crowd[best]) { crowd[best].isHero = true; crowd[best].ox = 0; crowd[best].oz = 0.05; }
  }
  function gateLabel(g) {
    if (g.op === "add") return "+" + g.v;
    if (g.op === "sub") return "-" + g.v;
    return "x" + g.v;
  }
  function spawnFloat(x, z, text, color) {
    floatTexts.push({ x, z, text, color: color || "#fff", life: 0.9, vy: 1.8 });
  }
  function applyGate(g) {
    if (g.hit) return;
    g.hit = true;
    const before = unitCount;
    if (g.op === "add") unitCount += g.v;
    else if (g.op === "sub") unitCount = Math.max(0, unitCount - g.v);
    else if (g.op === "mul") unitCount = Math.max(0, Math.floor(unitCount * g.v));
    unitCount = Math.min(9999, unitCount);
    syncCrowdVis(); recalcPlayerHp(true);
    burst(playerX, worldZ + 1.5, g.color, 14);
    spawnFloat(g.x, g.z, gateLabel(g), g.op === "sub" ? "#ff6666" : "#66ffaa");
    if (g.op === "add" || g.op === "mul") {
      for (let i = 0; i < Math.min(8, Math.abs(unitCount - before)); i++) {
        spawnFloat(playerX + (Math.random() - 0.5) * 1.5, worldZ + 0.5 + Math.random(), "+1", "#ffe066");
      }
    }
    if (unitCount <= 0) { unitCount = 0; loseGame(); }
    cameraShake = 0.25; updateHud();
  }
  function applyBarrel(b) {
    if (b.hit) return;
    b.hit = true;
    unitCount = Math.min(9999, unitCount + b.amount);
    syncCrowdVis(); recalcPlayerHp(true);
    burst(b.x, b.z, "#da8", 16);
    spawnFloat(b.x, b.z, "+" + b.amount, "#66ffaa");
    cameraShake = 0.2; updateHud();
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
        x: x + (Math.random() - 0.5), z: z + (Math.random() - 0.5),
        vx: (Math.random() - 0.5) * 5, vz: (Math.random() - 0.5) * 5,
        life: 0.35 + Math.random() * 0.45, color, r: 2 + Math.random() * 4,
        spark: Math.random() > 0.55,
      });
    }
  }
  function showControls(on) {
    if (on) { controlsEl.classList.remove("hidden"); hud.classList.remove("hidden"); }
    else { controlsEl.classList.add("hidden"); hud.classList.add("hidden"); hintEl.classList.add("hidden"); }
  }
  function startGame() {
    resetLevel(); state = "playing"; showControls(true);
    hintEl.classList.remove("hidden"); hintTimer = 3.5;
    showBanner("ROZWIŃ ARMIĘ", 2.4); updateHud(); syncCrowdVis();
  }
  function loseGame() { pendingEnd = "lose"; showUpgradeOrEnd(); }
  function winGame() {
    pendingEnd = "win"; winTimer = 0;
    burst(boss.x, boss.z, "#ff0", 50); cameraShake = 0.7; showUpgradeOrEnd();
  }
  function showUpgradeOrEnd() {
    showControls(false);
    upgradeChoices = shufflePick([
      { id: "dmg", title: "Siła strzału", desc: "+4 dmg / poziom", icon: "⚔" },
      { id: "rate", title: "Szybkostrzelność", desc: "Krótszy cooldown", icon: "⚡" },
      { id: "hp", title: "Maks. HP", desc: "+25 HP / poziom", icon: "❤" },
    ], 3);
    state = "upgrade";
  }
  function shufflePick(arr, n) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a.slice(0, n);
  }
  function pickUpgrade(id) {
    if (id === "dmg") upgrades.dmg = Math.min(5, upgrades.dmg + 1);
    if (id === "rate") upgrades.rate = Math.min(5, upgrades.rate + 1);
    if (id === "hp") upgrades.hp = Math.min(5, upgrades.hp + 1);
    saveUpgrades();
    state = pendingEnd === "win" ? "win" : "lose";
  }
  function hurtPlayer(amount) {
    if (state === "win" || state === "lose" || state === "upgrade") return;
    playerHp = Math.max(0, playerHp - amount);
    playerHitFlash = 0.25; cameraShake = Math.max(cameraShake, 0.2); updateHud();
    if (amount >= 8 && unitCount > 1) {
      const lose = Math.min(unitCount - 1, Math.floor(amount / 10));
      if (lose > 0) { unitCount -= lose; syncCrowdVis(); spawnFloat(playerX, worldZ, "-" + lose, "#ff8888"); updateHud(); }
    }
    if (playerHp <= 0) { playerHp = 0; loseGame(); }
  }
  function tryFire() {
    if (state !== "playing" && state !== "fight" && state !== "boss") return;
    if (unitCount <= 0 || fireCooldown > 0) return;
    fireCooldown = Math.max(0.08, fireCooldownMax() - Math.min(0.08, unitCount * 0.0006));
    muzzleFlash = 0.08;
    const n = Math.min(10, 2 + Math.floor(unitCount / 28));
    const dmg = damagePerShot();
    for (let i = 0; i < n; i++) {
      projectiles.push({
        x: playerX + (Math.random() - 0.5) * 1.6, z: worldZ + 0.9,
        vz: 34 + Math.random() * 8, vx: (Math.random() - 0.5) * 1.2,
        life: 1.0, dmg, trail: [],
      });
    }
  }

  function setStickVisual(nx) {
    const padW = movePad.clientWidth || 150;
    const maxOff = padW / 2 - 28;
    moveStick.style.left = (50 + nx * ((maxOff / padW) * 100)) + "%";
  }
  function padPointer(clientX) {
    const rect = movePad.getBoundingClientRect();
    moveInput = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
    setStickVisual(moveInput);
  }
  function bindHold(el, on, off) {
    const start = (e) => { e.preventDefault(); e.stopPropagation(); on(e); };
    const end = (e) => { e.preventDefault(); e.stopPropagation(); off(e); };
    el.addEventListener("mousedown", start);
    el.addEventListener("touchstart", start, { passive: false });
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end, { passive: false });
    window.addEventListener("touchcancel", end, { passive: false });
  }
  bindHold(btnFire,
    () => {
      fireHeld = true; btnFire.classList.add("pressed");
      if (state === "title") startGame();
      else if (state === "win" || state === "lose") { state = "title"; showControls(false); }
      else tryFire();
    },
    () => { fireHeld = false; btnFire.classList.remove("pressed"); }
  );
  movePad.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); padPointer(e.clientX); if (state === "title") startGame(); });
  movePad.addEventListener("mousemove", (e) => { if (e.buttons) padPointer(e.clientX); });
  movePad.addEventListener("mouseup", () => { moveInput = keys.left || keys.right ? moveInput : 0; if (!keys.left && !keys.right) setStickVisual(0); });
  movePad.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); padPointer(e.touches[0].clientX); if (state === "title") startGame(); }, { passive: false });
  movePad.addEventListener("touchmove", (e) => { e.preventDefault(); e.stopPropagation(); padPointer(e.touches[0].clientX); }, { passive: false });
  movePad.addEventListener("touchend", (e) => { e.preventDefault(); if (!keys.left && !keys.right) { moveInput = 0; setStickVisual(0); } }, { passive: false });

  function hitTestUpgrade(clientX, clientY) {
    if (state !== "upgrade") return;
    const rect = canvas.getBoundingClientRect();
    const vw = rect.width, vh = rect.height;
    const scale = Math.max(vw / W, vh / H);
    const ox = (vw - W * scale) / 2, oy = (vh - H * scale) / 2;
    const lx = (clientX - rect.left - ox) / scale;
    const ly = (clientY - rect.top - oy) / scale;
    const cardW = Math.min(100, W * 0.28), gap = 12, cardH = 120;
    const total = upgradeChoices.length * cardW + (upgradeChoices.length - 1) * gap;
    let x0 = W / 2 - total / 2;
    const y0 = H * 0.42;
    for (let i = 0; i < upgradeChoices.length; i++) {
      if (lx >= x0 && lx <= x0 + cardW && ly >= y0 && ly <= y0 + cardH) { pickUpgrade(upgradeChoices[i].id); return; }
      x0 += cardW + gap;
    }
  }
  function onCanvasDown(e) {
    e.preventDefault();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    if (state === "title") startGame();
    else if (state === "upgrade") hitTestUpgrade(cx, cy);
    else if (state === "win" || state === "lose") { state = "title"; showControls(false); }
  }
  canvas.addEventListener("mousedown", onCanvasDown);
  canvas.addEventListener("touchstart", onCanvasDown, { passive: false });
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") { keys.left = true; moveInput = -1; setStickVisual(-1); }
    if (e.code === "ArrowRight" || e.code === "KeyD") { keys.right = true; moveInput = 1; setStickVisual(1); }
    if (e.code === "Space" || e.code === "KeyZ") {
      e.preventDefault();
      if (!keys.fire) { keys.fire = true; fireHeld = true; if (state === "title") startGame(); else tryFire(); }
    }
    if (e.code === "Digit1" && state === "upgrade" && upgradeChoices[0]) pickUpgrade(upgradeChoices[0].id);
    if (e.code === "Digit2" && state === "upgrade" && upgradeChoices[1]) pickUpgrade(upgradeChoices[1].id);
    if (e.code === "Digit3" && state === "upgrade" && upgradeChoices[2]) pickUpgrade(upgradeChoices[2].id);
    if (e.code === "Enter" && (state === "title" || state === "win" || state === "lose")) {
      if (state === "title") startGame(); else { state = "title"; showControls(false); }
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") { keys.left = false; moveInput = keys.right ? 1 : 0; setStickVisual(moveInput); }
    if (e.code === "ArrowRight" || e.code === "KeyD") { keys.right = false; moveInput = keys.left ? -1 : 0; setStickVisual(moveInput); }
    if (e.code === "Space" || e.code === "KeyZ") { keys.fire = false; fireHeld = false; }
  });

  function hitEnemy(en, dmg) {
    if (!en.alive) return;
    const mult = en.def && en.def.armored ? 0.75 : 1;
    const dealt = Math.ceil(dmg * mult);
    en.hp -= dealt; en.hitFlash = 0.15;
    burst(en.x, en.z, "#ffcc66", 4);
    spawnFloat(en.x, en.z, "-" + dealt, "#ffe080");
    if (en.hp <= 0) { en.hp = 0; en.alive = false; en.death = 0.01; burst(en.x, en.z, "#fa0", 12); }
  }
  function hitFormation(f, dmg, hx, hz) {
    if (!f.alive || f.count <= 0) return;
    const killed = Math.max(1, Math.floor(dmg * 0.35 + unitCount * 0.02));
    f.count = Math.max(0, f.count - killed);
    burst(hx, hz, "#ff6644", 6);
    spawnFloat(hx, hz, "-" + killed, "#ffaa88");
    if (f.count <= 0) { f.count = 0; f.alive = false; burst(f.x, f.z, "#f44", 20); cameraShake = Math.max(cameraShake, 0.3); }
  }
  function hitPillar(p, dmg) {
    if (!p.alive) return;
    p.hp -= dmg; p.hitFlash = 0.15;
    burst(p.x, p.z, "#8cf", 5);
    spawnFloat(p.x, p.z, "-" + Math.ceil(dmg), "#aaf");
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false; burst(p.x, p.z, "#ccc", 24); cameraShake = 0.4;
      unitCount = Math.min(9999, unitCount + 15); syncCrowdVis(); recalcPlayerHp(true);
      spawnFloat(p.x, p.z, "+15", "#66ffaa"); updateHud();
    }
  }
  function hitBoss(dmg) {
    if (!boss || !boss.alive || boss.hp <= 0) return;
    boss.hp = Math.max(0, boss.hp - dmg); boss.hitFlash = 0.15;
    boss.phase = 1 - boss.hp / boss.maxHp;
    burst(boss.x + (Math.random() - 0.5), boss.z, "#fa0", 6);
    spawnFloat(boss.x, boss.z - 0.5, "-" + Math.ceil(dmg), "#ffe066");
    if (boss.hp <= 0) {
      boss.hp = 0; boss.alive = false; boss.fighting = false;
      formations.forEach((f) => { if (f.groupId === 4) { f.count = 0; f.alive = false; } });
      winGame();
    }
  }

  function update(dt) {
    titlePulse += dt; animTime += dt;
    if (cameraShake > 0) cameraShake = Math.max(0, cameraShake - dt);
    if (muzzleFlash > 0) muzzleFlash = Math.max(0, muzzleFlash - dt);
    if (playerHitFlash > 0) playerHitFlash = Math.max(0, playerHitFlash - dt);
    if (fireCooldown > 0) fireCooldown = Math.max(0, fireCooldown - dt);
    if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);
    if (fireHeld && fireCooldown <= 0) tryFire();

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const f = floatTexts[i]; f.life -= dt; f.z += f.vy * dt * 0.35;
      if (f.life <= 0) floatTexts.splice(i, 1);
    }

    if (state === "playing" || state === "fight" || state === "boss") {
      if (Math.abs(moveInput) > 0.05) { playerX += moveInput * MOVE_SPEED * dt; facing = moveInput >= 0 ? 1 : -1; }
      playerX = Math.max(-LANE_HALF, Math.min(LANE_HALF, playerX));
      if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) hintEl.classList.add("hidden"); }
      crowd.forEach((c) => { c.bob += dt * 8; c.walk += dt * 10; });

      const inCombat = state === "fight" || state === "boss";
      const speed = inCombat ? FIGHT_SPEED : RUN_SPEED;

      if (!inCombat) {
        worldZ += speed * dt;
        gates.forEach((g) => {
          if (!g.hit && g.z - worldZ < 0.85 && g.z - worldZ > -0.35 && Math.abs(g.x - playerX) < g.w * 0.6) applyGate(g);
        });
        barrels.forEach((b) => {
          if (!b.hit && b.z - worldZ < 0.9 && b.z - worldZ > -0.4 && Math.abs(b.x - playerX) < b.w) applyBarrel(b);
        });

        let nearestZ = 1e9, nearestId = null;
        formations.forEach((f) => {
          if (!f.alive || f.count <= 0 || f.groupId === 4) return;
          if (f.z < nearestZ) { nearestZ = f.z; nearestId = f.groupId; }
        });
        enemies.forEach((en) => {
          if (!en.alive) return;
          if (en.z < nearestZ) { nearestZ = en.z; nearestId = en.groupId; }
        });
        if (nearestId != null && worldZ >= nearestZ - 1.5) {
          fightTarget = nearestId; state = "fight"; hintEl.classList.add("hidden");
          if (nearestId === 1) showBanner("UTRZYMAJ LINIĘ", 2);
          else if (nearestId === 2) showBanner("SZARŻUJ!", 2);
          else showBanner("TRZYMAJ OGIEŃ", 2);
        }
        if (boss && boss.alive && !boss.hit && worldZ >= boss.z - 2.4) {
          boss.hit = true; boss.fighting = true; state = "boss"; fightTarget = "boss";
          showBanner("STAW CZOŁA BOSSOWI", 2.5);
        }
      } else if (state === "fight") updateFightZone(dt);
      else if (state === "boss") updateBossZone(dt);

      updateEnemies(dt); updateFormations(dt); updatePillars(dt);
      updateProjectiles(dt); updateEnemyShots(dt);
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (!en.alive) { en.death += dt; if (en.death > 0.7) enemies.splice(i, 1); }
    }
    if (state === "win") winTimer += dt;
  }

  function updateFightZone(dt) {
    let any = false, minZ = 1e9;
    for (const en of enemies) {
      if (!en.alive || en.groupId !== fightTarget) continue;
      any = true; minZ = Math.min(minZ, en.z);
    }
    for (const f of formations) {
      if (!f.alive || f.count <= 0 || f.groupId !== fightTarget) continue;
      any = true; minZ = Math.min(minZ, f.z);
    }
    if (!any) { fightTarget = null; state = "playing"; cameraShake = 0.35; showBanner("ARMIA ROŚNIE!", 1.4); return; }
    const holdZ = minZ - 1.05;
    if (worldZ < holdZ) worldZ += FIGHT_SPEED * dt;
    else worldZ = Math.min(worldZ, holdZ + 0.15);
  }
  function updateBossZone(dt) {
    if (!boss || !boss.alive) return;
    const holdZ = boss.z - 2.5;
    if (worldZ < holdZ) worldZ += FIGHT_SPEED * dt; else worldZ = holdZ;
  }
  function updateFormations(dt) {
    for (const f of formations) {
      if (!f.alive || f.count <= 0) continue;
      const dz = f.z - worldZ;
      if (dz < 16 && dz > 0.8) f.z -= 0.55 * dt;
      if (Math.abs(f.x - playerX) < f.cols * f.spacing * 0.45 && Math.abs(f.z - worldZ) < 1.3) {
        hurtPlayer(4 + Math.min(12, f.count * 0.01));
        burst(playerX, worldZ, "#f66", 4);
        f.count = Math.max(0, f.count - Math.max(2, Math.floor(unitCount * 0.08)));
        if (f.count <= 0) { f.alive = false; burst(f.x, f.z, "#f44", 18); }
      }
    }
  }
  function updatePillars(dt) {
    for (const p of pillars) if (p.hitFlash > 0) p.hitFlash -= dt;
  }
  function updateEnemies(dt) {
    for (const en of enemies) {
      if (!en.alive) continue;
      en.bob += dt * 6; en.walk += dt * (6 + en.speed * 3);
      if (en.hitFlash > 0) en.hitFlash -= dt;
      if (en.contactCd > 0) en.contactCd -= dt;
      const dz = en.z - worldZ;
      if (dz < 18 && dz > -1) {
        const dx = playerX - en.x;
        en.x += Math.sign(dx) * Math.min(Math.abs(dx), en.speed * 0.9 * dt);
        en.facing = dx >= 0 ? 1 : -1;
        if (dz > 1.2) en.z -= en.speed * 0.35 * dt;
      }
      if (Math.abs(en.x - playerX) < 0.85 * en.size && Math.abs(en.z - worldZ) < 1.1) {
        if (en.contactCd <= 0) { en.contactCd = 0.55; hurtPlayer(en.damage); burst(playerX, worldZ, "#f66", 5); }
      }
      if (en.def.ranged) {
        en.rangeCd -= dt;
        if (en.rangeCd <= 0 && dz > 2 && dz < 16) {
          en.rangeCd = en.def.rangeCd || 1.6;
          enemyShots.push({ x: en.x, z: en.z, vx: (playerX - en.x) * 1.2, vz: -10, life: 1.2, dmg: Math.max(4, Math.floor(en.damage * 0.7)) });
        }
      }
    }
    if (boss && boss.alive) {
      boss.bob += dt * 4; boss.walk += dt * 5;
      if (boss.hitFlash > 0) boss.hitFlash -= dt;
      if (boss.contactCd > 0) boss.contactCd -= dt;
      boss.rangeCd -= dt;
      if (boss.fighting) {
        boss.x += Math.sin(animTime * 1.2) * 0.55 * dt;
        boss.x = Math.max(-2.5, Math.min(2.5, boss.x));
        if (Math.abs(boss.x - playerX) < 1.8 && Math.abs(boss.z - worldZ) < 2.6) {
          if (boss.contactCd <= 0) {
            boss.contactCd = 0.7;
            hurtPlayer(MONSTER_DEFS.BossNecromancer.damage);
            burst(playerX, worldZ, "#f4a", 8);
          }
        }
        if (boss.rangeCd <= 0) {
          boss.rangeCd = 1.05 - boss.phase * 0.28;
          for (let k = 0; k < 2; k++) {
            enemyShots.push({
              x: boss.x + (k - 0.5) * 0.8, z: boss.z - 0.5,
              vx: (playerX - boss.x) * 2 + (k - 0.5) * 2, vz: -12, life: 1.4,
              dmg: 10 + Math.floor(boss.phase * 8),
            });
          }
        }
      }
    }
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.trail.push({ x: pr.x, z: pr.z });
      if (pr.trail.length > 6) pr.trail.shift();
      pr.x += (pr.vx || 0) * dt; pr.z += pr.vz * dt; pr.life -= dt;
      let hit = false;
      for (const p of pillars) {
        if (!p.alive) continue;
        if (Math.abs(pr.x - p.x) < 0.9 && Math.abs(pr.z - p.z) < 0.9) { hitPillar(p, pr.dmg); hit = true; break; }
      }
      if (!hit) {
        for (const en of enemies) {
          if (!en.alive) continue;
          if (Math.abs(pr.x - en.x) < 0.7 * en.size && Math.abs(pr.z - en.z) < 0.8) { hitEnemy(en, pr.dmg); hit = true; break; }
        }
      }
      if (!hit) {
        for (const f of formations) {
          if (!f.alive || f.count <= 0) continue;
          const halfW = (f.cols * f.spacing) * 0.5;
          const halfD = (f.rows * f.spacing) * 0.5;
          if (Math.abs(pr.x - f.x) < halfW + 0.3 && pr.z > f.z - 0.4 && pr.z < f.z + halfD + 0.8) {
            hitFormation(f, pr.dmg, pr.x, pr.z); hit = true; break;
          }
        }
      }
      if (!hit && boss && boss.alive && boss.fighting) {
        if (Math.abs(pr.x - boss.x) < 2.0 && Math.abs(pr.z - boss.z) < 1.6) { hitBoss(pr.dmg); hit = true; }
      }
      if (hit || pr.life <= 0) projectiles.splice(i, 1);
    }
  }
  function updateEnemyShots(dt) {
    for (let i = enemyShots.length - 1; i >= 0; i--) {
      const s = enemyShots[i];
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
      if (Math.abs(s.x - playerX) < 0.7 && Math.abs(s.z - worldZ) < 0.8) {
        hurtPlayer(s.dmg); burst(playerX, worldZ, "#8f4", 4); enemyShots.splice(i, 1); continue;
      }
      if (s.life <= 0 || s.z < worldZ - 2) enemyShots.splice(i, 1);
    }
  }

  function clearSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#6ab0e8"); g.addColorStop(0.4, "#3a7ec0"); g.addColorStop(1, "#1a4068");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawWater() {
    ctx.fillStyle = "#1560a8"; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 10; i++) {
      const y = ((i * 70 + titlePulse * 25) % (H + 40)) - 20;
      ctx.fillStyle = i % 2 ? "#7cf" : "#4af"; ctx.fillRect(0, y, W, 5);
    }
    ctx.globalAlpha = 1;
  }
  function drawBridge() {
    const startZ = Math.floor(worldZ) - 2, endZ = startZ + 52;
    for (let z = endZ; z >= startZ; z--) {
      const left = worldToScreen(-LANE_HALF - 0.4, z);
      const right = worldToScreen(LANE_HALF + 0.4, z);
      const leftN = worldToScreen(-LANE_HALF - 0.4, z + 1);
      const rightN = worldToScreen(LANE_HALF + 0.4, z + 1);
      if (!left || !right || !leftN || !rightN) continue;
      ctx.fillStyle = z % 2 === 0 ? "#c5c0b4" : "#b4afa4";
      ctx.beginPath();
      ctx.moveTo(left.sx, left.sy); ctx.lineTo(right.sx, right.sy);
      ctx.lineTo(rightN.sx, rightN.sy); ctx.lineTo(leftN.sx, leftN.sy);
      ctx.closePath(); ctx.fill();
      if (z % 3 === 0) {
        ctx.strokeStyle = "rgba(90,85,75,0.25)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left.sx, left.sy); ctx.lineTo(right.sx, right.sy); ctx.stroke();
      }
      ctx.fillStyle = "#9a9588";
      const railL = worldToScreen(-LANE_HALF - 0.85, z);
      const railLN = worldToScreen(-LANE_HALF - 0.85, z + 1);
      if (railL && railLN) {
        const hRail = 10 * railL.scale;
        ctx.fillRect(railL.sx - 4, Math.min(railL.sy, railLN.sy) - hRail, 8, Math.abs(railLN.sy - railL.sy) + hRail);
        if (z % 2 === 0) { ctx.fillStyle = "#aaa59a"; ctx.fillRect(railL.sx - 5, Math.min(railL.sy, railLN.sy) - hRail - 4, 10, 6); }
      }
      ctx.fillStyle = "#9a9588";
      const railR = worldToScreen(LANE_HALF + 0.85, z);
      const railRN = worldToScreen(LANE_HALF + 0.85, z + 1);
      if (railR && railRN) {
        const hRail = 10 * railR.scale;
        ctx.fillRect(railR.sx - 4, Math.min(railR.sy, railRN.sy) - hRail, 8, Math.abs(railRN.sy - railR.sy) + hRail);
        if (z % 2 === 0) { ctx.fillStyle = "#aaa59a"; ctx.fillRect(railR.sx - 5, Math.min(railR.sy, railRN.sy) - hRail - 4, 10, 6); }
      }
    }
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
  function drawGate(g) {
    if (g.hit) return;
    const p = worldToScreen(g.x, g.z); if (!p) return;
    const hw = 30 * p.scale, panelH = 18 * p.scale, stacks = 1 + (g.stacked || 0);
    ctx.fillStyle = "#6a4a28";
    roundRect(p.sx - hw * 1.05, p.sy - 4, hw * 2.1, 14 * p.scale, 3); ctx.fill();
    for (let i = 0; i < stacks; i++) {
      const yy = p.sy - 8 - (i + 1) * panelH;
      ctx.globalAlpha = 0.75; ctx.fillStyle = g.color;
      roundRect(p.sx - hw, yy, hw * 2, panelH - 2, 4); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.globalAlpha = 0.95; ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold " + Math.max(11, 18 * p.scale) + "px system-ui,sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const label = i === 0 ? gateLabel(g) : (g.op === "add" ? "+1" : gateLabel(g));
      ctx.strokeStyle = "rgba(0,0,40,0.45)"; ctx.lineWidth = 3;
      ctx.strokeText(label, p.sx, yy + panelH * 0.45); ctx.fillText(label, p.sx, yy + panelH * 0.45);
    }
    ctx.globalAlpha = 1;
  }
  function drawBarrel(b) {
    if (b.hit) return;
    const p = worldToScreen(b.x, b.z); if (!p) return;
    const s = p.s;
    ctx.fillStyle = "#8a5a28"; roundRect(p.sx - s * 0.7, p.sy - s * 1.1, s * 1.4, s * 1.3, 4); ctx.fill();
    ctx.strokeStyle = "#5a3818"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#c4a060"; ctx.fillRect(p.sx - s * 0.7, p.sy - s * 0.55, s * 1.4, 3);
    ctx.fillStyle = "#2a7fff";
    ctx.beginPath(); ctx.arc(p.sx - s * 0.25, p.sy - s * 0.75, s * 0.22, 0, Math.PI * 2);
    ctx.arc(p.sx + s * 0.2, p.sy - s * 0.7, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold " + Math.max(12, 16 * p.scale) + "px system-ui";
    ctx.textAlign = "center"; ctx.fillText("+" + b.amount, p.sx, p.sy + s * 0.15);
  }
  function drawPillar(p) {
    if (!p.alive && p.hp <= 0) return;
    const s = worldToScreen(p.x, p.z); if (!s) return;
    ctx.fillStyle = p.hitFlash > 0 ? "#dde" : "#8a8680";
    const w = 22 * s.scale, h = 70 * s.scale;
    roundRect(s.sx - w / 2, s.sy - h, w, h, 4); ctx.fill();
    ctx.strokeStyle = "#555"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(40,40,40,0.5)";
    ctx.beginPath(); ctx.moveTo(s.sx - w * 0.2, s.sy - h * 0.7);
    ctx.lineTo(s.sx + w * 0.15, s.sy - h * 0.4); ctx.lineTo(s.sx - w * 0.1, s.sy - h * 0.15); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold " + Math.max(14, 20 * s.scale) + "px system-ui";
    ctx.textAlign = "center"; ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
    const hpTxt = String(Math.ceil(p.hp));
    ctx.strokeText(hpTxt, s.sx, s.sy - h * 0.5); ctx.fillText(hpTxt, s.sx, s.sy - h * 0.5);
  }
  function drawHpBar(sx, sy, w, h, ratio, label) {
    ctx.fillStyle = "rgba(0,0,0,0.65)"; roundRect(sx - w / 2, sy, w, h, 3); ctx.fill();
    ctx.fillStyle = "#e33";
    roundRect(sx - w / 2 + 1, sy + 1, Math.max(0, (w - 2) * ratio), h - 2, 2); ctx.fill();
    if (label) {
      ctx.fillStyle = "#fff"; ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, sx, sy + h / 2);
    }
  }

  function drawSoldier(sx, sy, s, opts) {
    opts = opts || {};
    const walk = opts.walk || 0, face = opts.facing == null ? 1 : opts.facing;
    const flash = opts.muzzle || 0, hit = opts.hit || 0, hero = opts.hero || false;
    const bobY = Math.sin(walk * 2) * s * 0.04;
    const legSwing = Math.sin(walk) * s * 0.28;
    const h = s * (hero ? 1.45 : 1.25);
    sy = sy + bobY;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(face, 1);
    if (hit > 0) ctx.globalAlpha = 0.55 + Math.sin(hit * 40) * 0.35;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a2a58"; ctx.lineWidth = Math.max(1.4, s * 0.22);
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, h * 0.42); ctx.lineTo(-s * 0.18 - legSwing * 0.35, h * 0.98);
    ctx.moveTo(s * 0.12, h * 0.42); ctx.lineTo(s * 0.18 + legSwing * 0.35, h * 0.98);
    ctx.stroke();
    if (hero) {
      ctx.fillStyle = "#0a4ad0";
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -h * 0.05);
      ctx.quadraticCurveTo(-s * 0.9, h * 0.3, -s * 0.4, h * 0.55);
      ctx.lineTo(s * 0.35, h * 0.5);
      ctx.quadraticCurveTo(s * 0.85, h * 0.25, s * 0.35, -h * 0.05);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = hero ? "#1a6aff" : "#2a7fff";
    ctx.fillRect(-s * 0.32, -h * 0.1, s * 0.64, h * 0.55);
    ctx.strokeStyle = "#222"; ctx.lineWidth = Math.max(1.6, s * 0.16);
    ctx.beginPath(); ctx.moveTo(s * 0.1, h * 0.05); ctx.lineTo(s * 1.05, -h * 0.28); ctx.stroke();
    ctx.strokeStyle = "#c4a882"; ctx.lineWidth = Math.max(1.2, s * 0.14);
    ctx.beginPath(); ctx.moveTo(s * 0.22, h * 0.05); ctx.lineTo(s * 0.7, -h * 0.12); ctx.stroke();
    ctx.fillStyle = "#c4a882";
    ctx.beginPath(); ctx.arc(0, -h * 0.3, s * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a4aaa";
    ctx.beginPath(); ctx.ellipse(0, -h * 0.4, s * 0.34, s * 0.2, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-s * 0.34, -h * 0.4, s * 0.68, s * 0.12);
    if (hero) {
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, -h * 0.48); ctx.lineTo(-s * 0.18, -h * 0.68);
      ctx.lineTo(-s * 0.05, -h * 0.52); ctx.lineTo(0, -h * 0.72);
      ctx.lineTo(s * 0.05, -h * 0.52); ctx.lineTo(s * 0.18, -h * 0.68);
      ctx.lineTo(s * 0.28, -h * 0.48); ctx.closePath(); ctx.fill();
    }
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,220,80," + Math.min(1, flash * 12) + ")";
      ctx.beginPath(); ctx.arc(s * 1.05, -h * 0.28, s * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawRedTroop(sx, sy, s, walk) {
    sy += Math.sin(walk) * s * 0.03;
    ctx.fillStyle = "#c02020"; ctx.fillRect(sx - s * 0.28, sy - s * 0.15, s * 0.56, s * 0.7);
    ctx.fillStyle = "#e8b090"; ctx.beginPath(); ctx.arc(sx, sy - s * 0.35, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8a1010";
    ctx.beginPath(); ctx.ellipse(sx, sy - s * 0.45, s * 0.28, s * 0.14, 0, Math.PI, Math.PI * 2); ctx.fill();
  }
  function drawMonster(sx, sy, s, en) {
    const def = en.def || MONSTER_DEFS.ZombieGrunt;
    const walk = en.walk || 0, face = en.facing || -1, hit = en.hitFlash || 0;
    const deathA = en.alive ? 1 : Math.max(0, 1 - en.death * 1.4);
    const bobY = Math.sin(en.bob || 0) * s * 0.05;
    const leg = Math.sin(walk) * s * 0.3;
    const h = s * 1.2 * def.size, sc = s * def.size;
    sy = sy + bobY;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(face, 1);
    ctx.globalAlpha = deathA * (hit > 0 ? 0.5 + Math.sin(hit * 50) * 0.4 : 1);
    if (def.rat) {
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.ellipse(0, h * 0.35, sc * 0.7, sc * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.skin; ctx.beginPath(); ctx.arc(sc * 0.55, h * 0.2, sc * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.eye; ctx.beginPath(); ctx.arc(sc * 0.65, h * 0.12, sc * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); return;
    }
    ctx.lineCap = "round";
    ctx.strokeStyle = def.bony ? "#ddd8cc" : def.color;
    ctx.lineWidth = Math.max(1.3, sc * (def.bony ? 0.12 : 0.2));
    ctx.beginPath();
    ctx.moveTo(-sc * 0.15, h * 0.4); ctx.lineTo(-sc * 0.25 - leg * 0.4, h * 0.95);
    ctx.moveTo(sc * 0.12, h * 0.4); ctx.lineTo(sc * 0.28 + leg * 0.4, h * 0.92);
    ctx.stroke();
    if (def.armored) {
      ctx.fillStyle = "#555868"; ctx.fillRect(-sc * 0.38, -h * 0.12, sc * 0.76, h * 0.55);
      ctx.strokeStyle = "#889"; ctx.lineWidth = 2; ctx.strokeRect(-sc * 0.38, -h * 0.12, sc * 0.76, h * 0.55);
    } else if (def.bony) {
      ctx.strokeStyle = "#eee"; ctx.lineWidth = Math.max(1.2, sc * 0.1);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(-sc * 0.28, -h * 0.05 + i * h * 0.12);
        ctx.lineTo(sc * 0.28, -h * 0.05 + i * h * 0.12); ctx.stroke();
      }
    } else {
      ctx.fillStyle = def.color; ctx.fillRect(-sc * 0.32, -h * 0.1, sc * 0.64, h * 0.52);
    }
    ctx.strokeStyle = def.bony ? "#e8e0d0" : def.skin;
    ctx.lineWidth = Math.max(1.2, sc * 0.15);
    const reach = def.boss ? 1.25 : 0.95;
    ctx.beginPath();
    ctx.moveTo(-sc * 0.3, h * 0.02); ctx.lineTo(-sc * reach, -h * 0.2 + Math.sin(walk) * sc * 0.1);
    ctx.moveTo(sc * 0.3, h * 0.05); ctx.lineTo(sc * reach * 0.9, -h * 0.05 + Math.cos(walk) * sc * 0.1);
    ctx.stroke();
    ctx.fillStyle = def.skin;
    const headR = sc * (def.boss ? 0.42 : 0.28);
    ctx.beginPath(); ctx.arc(0, -h * 0.32, headR, 0, Math.PI * 2); ctx.fill();
    if (def.boss) {
      ctx.fillStyle = "#1a1018";
      ctx.beginPath();
      ctx.moveTo(-headR * 1.3, -h * 0.25); ctx.lineTo(-headR * 0.4, -h * 0.95);
      ctx.lineTo(0, -h * 0.7); ctx.lineTo(headR * 0.4, -h * 0.95);
      ctx.lineTo(headR * 1.3, -h * 0.25); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#888"; ctx.lineWidth = Math.max(2, sc * 0.1);
      ctx.beginPath(); ctx.moveTo(sc * 0.9, h * 0.1); ctx.quadraticCurveTo(sc * 1.6, h * 0.4, sc * 1.5, h * 0.7); ctx.stroke();
      ctx.fillStyle = "#444"; ctx.beginPath(); ctx.arc(sc * 1.5, h * 0.75, sc * 0.28, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = def.eye;
    ctx.beginPath(); ctx.arc(-sc * 0.1, -h * 0.34, sc * 0.07, 0, Math.PI * 2);
    ctx.arc(sc * 0.12, -h * 0.34, sc * 0.07, 0, Math.PI * 2); ctx.fill();
    if (def.ranged) {
      ctx.fillStyle = "#8f4"; ctx.beginPath(); ctx.arc(sc * 0.05, -h * 0.15, sc * 0.08, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function drawFormation(f) {
    if (!f.alive || f.count <= 0) return;
    const cols = f.cols;
    const visCount = Math.min(f.count, cols * Math.min(f.rows, 8));
    const rows = Math.ceil(visCount / cols);
    const halfW = ((cols - 1) * f.spacing) / 2;
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c; if (idx >= visCount) continue;
        const p = worldToScreen(f.x - halfW + c * f.spacing, f.z + r * f.spacing * 0.85);
        if (!p) continue;
        drawRedTroop(p.sx, p.sy, p.s * 0.85, animTime * 6 + idx * 0.4);
      }
    }
    const mid = worldToScreen(f.x, f.z + rows * f.spacing * 0.3);
    if (mid) {
      ctx.font = "900 " + Math.max(18, 28 * mid.scale) + "px system-ui";
      ctx.textAlign = "center"; ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.fillStyle = "#fff";
      const txt = String(formationAliveCount(f));
      ctx.strokeText(txt, mid.sx, mid.sy - 40 * mid.scale);
      ctx.fillText(txt, mid.sx, mid.sy - 40 * mid.scale);
    }
  }
  function drawEnemy(en) {
    if (!en.alive && en.death > 0.7) return;
    const p = worldToScreen(en.x, en.z); if (!p) return;
    drawMonster(p.sx, p.sy, p.s, en);
    if (en.alive && (en.def.showBar || en.hp < en.maxHp)) {
      drawHpBar(p.sx, p.sy - p.s * en.size * 1.7, 36 * Math.max(0.8, en.size), 7, en.hp / en.maxHp, null);
    }
  }
  function drawBoss() {
    if (!boss || (boss.hp <= 0 && !boss.alive)) return;
    const p = worldToScreen(boss.x, boss.z); if (!p) return;
    if (boss.fighting || boss.hit) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,40,40,0.85)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy + 8, 55 * p.scale, 18 * p.scale, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,80,80,0.4)"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy + 8, 48 * p.scale, 14 * p.scale, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    drawMonster(p.sx, p.sy, p.s * 1.25, {
      def: MONSTER_DEFS.BossNecromancer, walk: boss.walk, bob: boss.bob,
      facing: playerX >= boss.x ? 1 : -1, hitFlash: boss.hitFlash, alive: boss.alive, death: 0,
    });
    drawHpBar(p.sx, p.sy - p.s * 5.0, 120, 16, boss.hp / boss.maxHp, Math.ceil(boss.hp) + " HP");
    ctx.fillStyle = "#ffee88"; ctx.font = "bold 13px system-ui"; ctx.textAlign = "center";
    ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
    ctx.strokeText("WŁADCA MOSTU", p.sx, p.sy - p.s * 5.0 - 12);
    ctx.fillText("WŁADCA MOSTU", p.sx, p.sy - p.s * 5.0 - 12);
  }

  function drawCrowd() {
    const sorted = crowd.slice().sort((a, b) => b.oz - a.oz);
    sorted.forEach((c, idx) => {
      const bob = Math.sin(c.bob) * 0.06;
      const p = worldToScreen(playerX + c.ox, worldZ + c.oz + bob);
      if (!p) return;
      drawSoldier(p.sx, p.sy, p.s * (c.isHero ? 1.25 : 1), {
        walk: c.walk + c.phase, facing: facing,
        muzzle: idx < 4 && muzzleFlash > 0 ? muzzleFlash : 0,
        hit: playerHitFlash, hero: c.isHero,
      });
    });
    const gp = worldToScreen(playerX, worldZ);
    if (gp) {
      ctx.fillStyle = playerHitFlash > 0 ? "rgba(255,80,80,0.35)" : "rgba(80,180,255,0.3)";
      ctx.beginPath(); ctx.ellipse(gp.sx, gp.sy + 8, 32 * gp.scale, 12 * gp.scale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.font = "900 " + Math.max(22, 32 * gp.scale) + "px system-ui";
      ctx.textAlign = "center"; ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,40,120,0.7)"; ctx.fillStyle = "#fff";
      ctx.strokeText(String(unitCount), gp.sx, gp.sy - 48 * gp.scale);
      ctx.fillText(String(unitCount), gp.sx, gp.sy - 48 * gp.scale);
    }
  }
  function drawProjectiles() {
    projectiles.forEach((pr) => {
      if (pr.trail && pr.trail.length > 1) {
        for (let i = 1; i < pr.trail.length; i++) {
          const prev = worldToScreen(pr.trail[i - 1].x, pr.trail[i - 1].z);
          const tp = worldToScreen(pr.trail[i].x, pr.trail[i].z);
          if (!prev || !tp) continue;
          const a = (i + 1) / pr.trail.length;
          ctx.strokeStyle = "rgba(100,200,255," + (0.15 + a * 0.55) + ")";
          ctx.lineWidth = 1.5 + a * 2;
          ctx.beginPath(); ctx.moveTo(prev.sx, prev.sy); ctx.lineTo(tp.sx, tp.sy); ctx.stroke();
        }
      }
      const p = worldToScreen(pr.x, pr.z); if (!p) return;
      ctx.strokeStyle = "#6cf"; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(p.sx, p.sy + 10 * p.scale); ctx.lineTo(p.sx, p.sy - 6 * p.scale); ctx.stroke();
      ctx.fillStyle = "#ffe080"; ctx.beginPath(); ctx.arc(p.sx, p.sy - 6 * p.scale, 2.6, 0, Math.PI * 2); ctx.fill();
    });
    enemyShots.forEach((s) => {
      const p = worldToScreen(s.x, s.z); if (!p) return;
      ctx.fillStyle = "#ff4040"; ctx.beginPath(); ctx.arc(p.sx, p.sy, 4 * p.scale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,60,40,0.35)"; ctx.beginPath(); ctx.arc(p.sx, p.sy, 9 * p.scale, 0, Math.PI * 2); ctx.fill();
    });
  }
  function drawParticles() {
    particles.forEach((p) => {
      const s = worldToScreen(p.x, p.z); if (!s) return;
      ctx.globalAlpha = Math.max(0, p.life * 2);
      if (p.spark) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.sx - p.r, s.sy); ctx.lineTo(s.sx + p.r, s.sy);
        ctx.moveTo(s.sx, s.sy - p.r); ctx.lineTo(s.sx, s.sy + p.r); ctx.stroke();
      } else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(s.sx, s.sy, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }
  function drawFloatTexts() {
    floatTexts.forEach((f) => {
      const p = worldToScreen(f.x, f.z); if (!p) return;
      ctx.globalAlpha = Math.max(0, f.life * 1.2);
      ctx.font = "900 " + Math.max(14, 20 * p.scale) + "px system-ui";
      ctx.textAlign = "center"; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 3;
      ctx.fillStyle = f.color; ctx.strokeText(f.text, p.sx, p.sy); ctx.fillText(f.text, p.sx, p.sy);
      ctx.globalAlpha = 1;
    });
  }
  function drawBanner() {
    if (bannerTimer <= 0 || !bannerText) return;
    ctx.globalAlpha = Math.min(1, bannerTimer * 2);
    ctx.font = "900 " + (isLandscape ? 22 : 28) + "px system-ui";
    ctx.textAlign = "center"; ctx.lineWidth = 6;
    ctx.strokeStyle = "#1a4aff"; ctx.fillStyle = "#fff";
    const y = H * (isLandscape ? 0.88 : 0.86);
    ctx.strokeText(bannerText, W / 2, y); ctx.fillText(bannerText, W / 2, y);
    ctx.globalAlpha = 1;
  }
  function drawTitle() {
    clearSky(); worldZ = 0; drawWater();
    const oldZ = worldZ; worldZ = 2; drawBridge(); worldZ = oldZ;
    ctx.fillStyle = "rgba(10,25,50,0.4)"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.font = "900 42px system-ui,sans-serif"; ctx.strokeStyle = "#1a4aff"; ctx.lineWidth = 6;
    ctx.strokeText("MOST ARMII", W / 2, H * 0.18); ctx.fillText("MOST ARMII", W / 2, H * 0.18);
    ctx.font = "700 15px system-ui"; ctx.fillStyle = "#8cf";
    ctx.fillText("HAOS Bridge Runner", W / 2, H * 0.18 + 26);
    for (let i = 0; i < 10; i++) {
      const a = titlePulse * 2 + i * 0.5;
      drawSoldier(W / 2 - 50 + Math.cos(a) * 28, H * 0.4 + Math.sin(a * 0.7) * 8, 11, {
        walk: titlePulse * 8 + i, facing: 1, hero: i === 0,
      });
    }
    for (let i = 0; i < 14; i++) {
      drawRedTroop(W / 2 + 40 + (i % 5) * 10, H * 0.38 + Math.floor(i / 5) * 12, 9, titlePulse * 5 + i);
    }
    const pulse = 1 + Math.sin(titlePulse * 3) * 0.04;
    ctx.save(); ctx.translate(W / 2, H * 0.58); ctx.scale(pulse, pulse);
    ctx.fillStyle = "#2a7fff"; roundRect(-110, -28, 220, 56, 16); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "900 20px system-ui";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("DOTKNIJ ABY GRAĆ", 0, 2);
    ctx.restore();
    ctx.font = "13px system-ui"; ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("Lewy: OGIEŃ  ·  Prawy: RUCH  ·  Bez auto-strzału", W / 2, H * 0.72);
    ctx.fillText("Bramy +/× · Beczki · Formacje · Boss z pierścieniem", W / 2, H * 0.72 + 18);
    ctx.fillText("Ulepszenia: dmg " + upgrades.dmg + " · rate " + upgrades.rate + " · hp " + upgrades.hp, W / 2, H * 0.72 + 38);
  }
  function drawUpgrade() {
    ctx.fillStyle = "rgba(5,15,35,0.78)"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "900 26px system-ui";
    ctx.fillText(pendingEnd === "win" ? "ZWYCIĘSTWO!" : "PORAŻKA", W / 2, H * 0.22);
    ctx.font = "15px system-ui"; ctx.fillStyle = "#cdf";
    ctx.fillText("Wybierz ulepszenie na kolejny bieg", W / 2, H * 0.28);
    ctx.fillText("(bez wioski / farmy zasobów)", W / 2, H * 0.28 + 20);
    const cardW = Math.min(100, W * 0.28), gap = 12;
    const total = upgradeChoices.length * cardW + (upgradeChoices.length - 1) * gap;
    let x0 = W / 2 - total / 2; const y0 = H * 0.42;
    upgradeChoices.forEach((c) => {
      ctx.fillStyle = "#1a3a7a"; roundRect(x0, y0, cardW, 120, 12); ctx.fill();
      ctx.strokeStyle = "#6af"; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = "28px system-ui"; ctx.fillStyle = "#fff"; ctx.fillText(c.icon, x0 + cardW / 2, y0 + 36);
      ctx.font = "bold 12px system-ui"; ctx.fillText(c.title, x0 + cardW / 2, y0 + 62);
      ctx.font = "10px system-ui"; ctx.fillStyle = "#acd"; ctx.fillText(c.desc, x0 + cardW / 2, y0 + 82);
      ctx.fillStyle = "#8cf";
      ctx.fillText("lvl " + (upgrades[c.id] || 0) + "→" + Math.min(5, (upgrades[c.id] || 0) + 1), x0 + cardW / 2, y0 + 102);
      x0 += cardW + gap;
    });
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "12px system-ui";
    ctx.fillText("Dotknij kartę lub 1/2/3", W / 2, H * 0.78);
  }
  function drawEnd(win) {
    ctx.fillStyle = "rgba(5,15,35,0.72)"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "900 40px system-ui"; ctx.strokeStyle = win ? "#1a8" : "#a22"; ctx.lineWidth = 6;
    const msg = win ? "ZWYCIĘSTWO!" : "PORAŻKA";
    ctx.strokeText(msg, W / 2, H * 0.36); ctx.fillStyle = "#fff"; ctx.fillText(msg, W / 2, H * 0.36);
    ctx.font = "16px system-ui"; ctx.fillStyle = "#cdf";
    if (win) ctx.fillText("Most zdobyty. Armia: " + unitCount, W / 2, H * 0.36 + 40);
    else ctx.fillText(playerHp <= 0 ? "HP spadło do zera" : "Armia rozbita", W / 2, H * 0.36 + 40);
    ctx.fillStyle = "#2a7fff"; roundRect(W / 2 - 100, H * 0.55, 200, 50, 14); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "900 18px system-ui"; ctx.fillText("JESZCZE RAZ", W / 2, H * 0.55 + 26);
  }
  function render() {
    const vw = canvas.width / dpr, vh = canvas.height / dpr;
    const scale = Math.max(vw / W, vh / H);
    const ox = (vw - W * scale) / 2, oy = (vh - H * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
    const shakeX = cameraShake > 0 ? (Math.random() - 0.5) * 8 * cameraShake : 0;
    const shakeY = cameraShake > 0 ? (Math.random() - 0.5) * 8 * cameraShake : 0;
    ctx.translate(shakeX, shakeY);
    if (state === "title") { drawTitle(); return; }
    drawWater(); drawBridge();
    const drawables = [];
    gates.forEach((g) => drawables.push({ z: g.z, draw: () => drawGate(g) }));
    barrels.forEach((b) => drawables.push({ z: b.z, draw: () => drawBarrel(b) }));
    pillars.forEach((p) => drawables.push({ z: p.z, draw: () => drawPillar(p) }));
    formations.forEach((f) => drawables.push({ z: f.z, draw: () => drawFormation(f) }));
    enemies.forEach((en) => drawables.push({ z: en.z, draw: () => drawEnemy(en) }));
    if (boss) drawables.push({ z: boss.z - 0.01, draw: () => drawBoss() });
    drawables.sort((a, b) => b.z - a.z);
    drawables.forEach((d) => d.draw());
    drawProjectiles(); drawCrowd(); drawParticles(); drawFloatTexts(); drawBanner();
    if (state === "upgrade") drawUpgrade();
    if (state === "win") drawEnd(true);
    if (state === "lose") drawEnd(false);
  }
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts; update(dt); render(); requestAnimationFrame(loop);
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  resize(); resetLevel(); requestAnimationFrame(loop);
})();
