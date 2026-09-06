/**
 * Most Armii (HAOS Runner) — original hyper-casual bridge crowd-runner
 * Portrait/landscape adaptive PWA. Procedural art only.
 * v16: FULL GRAPHICS PASS — dense blue army + hero, dark-fantasy monsters,
 * Olbrzym Nocy boss, fog bridge, polished props/VFX (procedural only)
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
  const MAX_VIS = 140;
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

  // Dark-fantasy roster (~10 classes + boss). Procedural silhouettes only.
  const MONSTER_DEFS = {
    Kolczatek: { label:"Kolczatek", hp:18, speed:1.15, size:0.88, damage:6, color:"#3a4a28", skin:"#6a7a42", eye:"#c8ff40", accent:"#8ab050", showBar:false, score:1, kind:"goblin" },
    KolczatekBiegacz: { label:"Biegacz", hp:12, speed:2.5, size:0.8, damage:5, color:"#4a5828", skin:"#7a8848", eye:"#eeff60", accent:"#a0c050", showBar:false, score:1, kind:"goblin" },
    SkalnySzpon: { label:"Skalny Szpon", hp:28, speed:1.15, size:1.05, damage:9, color:"#2a2838", skin:"#6a6878", eye:"#ff4060", accent:"#9080a0", showBar:false, score:2, kind:"cultist", cleaver:true },
    BagiennyTrup: { label:"Bagienny Trup", hp:22, speed:1.0, size:0.95, damage:7, color:"#243828", skin:"#5a7860", eye:"#40ff88", accent:"#3a6048", showBar:false, score:2, kind:"undead" },
    BagiennyPlujka: { label:"Bagienna Plujka", hp:20, speed:0.95, size:0.92, damage:4, ranged:true, rangeCd:1.55, color:"#1e3028", skin:"#4a6850", eye:"#a0ff40", accent:"#68a050", showBar:false, score:2, kind:"undead" },
    Bestia: { label:"Bestia", hp:60, speed:0.9, size:1.42, damage:13, color:"#3a2818", skin:"#6a4830", eye:"#ff6020", accent:"#8a6038", showBar:true, score:3, kind:"beast" },
    Rogacz: { label:"Rogacz", hp:45, speed:1.35, size:1.18, damage:10, color:"#281820", skin:"#503040", eye:"#ff2060", accent:"#804858", showBar:true, score:3, kind:"spider" },
    LodowyStrach: { label:"Lodowy Strach", hp:100, speed:0.58, size:1.58, damage:14, color:"#1a2838", skin:"#7090b0", eye:"#80e0ff", accent:"#a0d0ff", showBar:true, armored:true, score:5, kind:"ice" },
    CienistySzczur: { label:"Cienisty Szczur", hp:8, speed:2.9, size:0.52, damage:3, color:"#2a2220", skin:"#5a4840", eye:"#ffcc40", accent:"#806040", showBar:false, score:1, kind:"rat" },
    MrocznyPancerny: { label:"Mroczny Pancerny", hp:75, speed:0.7, size:1.28, damage:11, color:"#1a1a22", skin:"#505060", eye:"#ff3030", accent:"#707088", showBar:true, armored:true, score:4, kind:"armored" },
    OlbrzymNocy: { label:"Olbrzym Nocy", hp:520, speed:0.4, size:2.85, damage:18, color:"#120e16", skin:"#3a3040", eye:"#ffee44", accent:"#6a5080", showBar:true, boss:true, score:50, kind:"boss" },
  };
  const FORMATION_KINDS = ["Kolczatek", "BagiennyTrup", "SkalnySzpon", "KolczatekBiegacz"];

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
    const def = MONSTER_DEFS[type] || MONSTER_DEFS.Kolczatek;
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
    formations.push({
      x: cx, z, cols, rows, count, maxCount: count, groupId, alive: true,
      spacing: opts.spacing || 0.42,
      troopKinds: opts.troopKinds || FORMATION_KINDS.slice(),
    });
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
    playerHitFlash = 0; winTimer = 0; moveInput = 0; setFireArmed(false);
    bannerText = ""; bannerTimer = 0; crowd = [];
    for (let i = 0; i < 16; i++) spawnCrowdDot();
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
    spawnFormation(30, 1, 180, {
      cols: 12,
      elites: ["Kolczatek", "KolczatekBiegacz", "CienistySzczur"],
      troopKinds: ["Kolczatek", "KolczatekBiegacz", "CienistySzczur"],
    });
    spawnWave(31, 1, [["Kolczatek", 4], ["CienistySzczur", 3]]);

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
    spawnFormation(64, 2, 420, {
      cols: 14,
      elites: ["SkalnySzpon", "BagiennyPlujka", "Bestia"],
      troopKinds: ["BagiennyTrup", "SkalnySzpon", "BagiennyPlujka"],
    });
    spawnWave(65, 2, [["SkalnySzpon", 3], ["BagiennyPlujka", 2], ["Bestia", 1]]);

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
    spawnFormation(92, 3, 700, {
      cols: 16,
      elites: ["MrocznyPancerny", "LodowyStrach", "Rogacz", "KolczatekBiegacz"],
      troopKinds: ["MrocznyPancerny", "Rogacz", "SkalnySzpon", "BagiennyTrup"],
    });
    spawnWave(93, 3, [["MrocznyPancerny", 2], ["LodowyStrach", 1], ["Rogacz", 2], ["KolczatekBiegacz", 2]]);

    const bhp = MONSTER_DEFS.OlbrzymNocy.hp;
    boss = {
      z: 108, x: 0, type: "OlbrzymNocy", hp: bhp, maxHp: bhp,
      hit: false, fighting: false, phase: 0, hitFlash: 0, death: 0,
      walk: 0, bob: 0, contactCd: 0, rangeCd: 1, alive: true,
    };
    spawnFormation(110, 4, 900, {
      cols: 18, x: 0,
      troopKinds: ["SkalnySzpon", "BagiennyTrup", "MrocznyPancerny"],
    });
  }

  function spawnCrowdDot() {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 1.15;
    crowd.push({
      ox: Math.cos(a) * r, oz: Math.sin(a) * r * 0.65 - 0.15,
      bob: Math.random() * Math.PI * 2, walk: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2, isHero: false,
      shade: 0.85 + Math.random() * 0.25,
    });
  }
  function syncCrowdVis() {
    const want = Math.min(MAX_VIS, Math.max(6, Math.ceil(Math.sqrt(unitCount) * 5.8)));
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
        spark: Math.random() > 0.45,
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
  function setFireArmed(on) {
    fireHeld = !!on;
    btnFire.classList.toggle("pressed", fireHeld);
    btnFire.classList.toggle("armed", fireHeld);
    btnFire.textContent = fireHeld ? "OGIEŃ ON" : "OGIEŃ";
  }
  function toggleFire() {
    if (state === "title") { startGame(); setFireArmed(true); tryFire(); return; }
    if (state === "win" || state === "lose") { state = "title"; showControls(false); setFireArmed(false); return; }
    if (state === "upgrade") return;
    setFireArmed(!fireHeld);
    if (fireHeld) tryFire();
  }
  function onFirePointer(e) {
    e.preventDefault();
    e.stopPropagation();
    toggleFire();
  }
  btnFire.addEventListener("mousedown", onFirePointer);
  btnFire.addEventListener("touchstart", onFirePointer, { passive: false });
  // Never clear fire from window touchend — right stick must not kill shooting.
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
      if (!keys.fire) { keys.fire = true; toggleFire(); }
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
    if (e.code === "Space" || e.code === "KeyZ") { keys.fire = false; /* latch stays until toggle again */ }
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
          showBanner("OLBRZYM NOCY!", 2.5);
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
            hurtPlayer(MONSTER_DEFS.OlbrzymNocy.damage);
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
      if (pr.trail.length > 8) pr.trail.shift();
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
    g.addColorStop(0, "#1a1530");
    g.addColorStop(0.35, "#243050");
    g.addColorStop(0.7, "#1a3558");
    g.addColorStop(1, "#0e2038");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawFogLayer() {
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const y = H * (0.35 + i * 0.1) + Math.sin(titlePulse * 0.4 + i) * 6;
      const g = ctx.createLinearGradient(0, y - 30, 0, y + 40);
      g.addColorStop(0, "rgba(40,50,80,0)");
      g.addColorStop(0.5, "rgba(60,70,100," + (0.04 + i * 0.012) + ")");
      g.addColorStop(1, "rgba(40,50,80,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 40, W, 80);
    }
    ctx.restore();
  }
  function drawWater() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c2848");
    g.addColorStop(0.5, "#0a2040");
    g.addColorStop(1, "#061428");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 12; i++) {
      const y = ((i * 62 + titlePulse * 18) % (H + 40)) - 20;
      ctx.fillStyle = i % 2 ? "#4a80b0" : "#2a6090";
      ctx.fillRect(0, y, W, 4);
    }
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 90 + titlePulse * 12) % (W + 60)) - 30;
      ctx.fillStyle = "#6a90c0";
      ctx.beginPath(); ctx.ellipse(x, H * 0.55 + i * 30, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
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
      ctx.fillStyle = z % 2 === 0 ? "#5a5650" : "#4e4a44";
      ctx.beginPath();
      ctx.moveTo(left.sx, left.sy); ctx.lineTo(right.sx, right.sy);
      ctx.lineTo(rightN.sx, rightN.sy); ctx.lineTo(leftN.sx, leftN.sy);
      ctx.closePath(); ctx.fill();
      if (z % 4 === 0) {
        ctx.fillStyle = "rgba(50,70,45,0.18)";
        ctx.beginPath();
        ctx.moveTo(left.sx, left.sy); ctx.lineTo(right.sx, right.sy);
        ctx.lineTo(rightN.sx, rightN.sy); ctx.lineTo(leftN.sx, leftN.sy);
        ctx.closePath(); ctx.fill();
      }
      if (z % 3 === 0) {
        ctx.strokeStyle = "rgba(20,18,16,0.35)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left.sx, left.sy); ctx.lineTo(right.sx, right.sy); ctx.stroke();
      }
      if (z % 2 === 0) {
        const cL = worldToScreen(-1.2, z), cR = worldToScreen(1.2, z);
        const cLN = worldToScreen(-1.2, z + 1), cRN = worldToScreen(1.2, z + 1);
        if (cL && cR && cLN && cRN) {
          ctx.fillStyle = "rgba(90,88,80,0.35)";
          ctx.beginPath();
          ctx.moveTo(cL.sx, cL.sy); ctx.lineTo(cR.sx, cR.sy);
          ctx.lineTo(cRN.sx, cRN.sy); ctx.lineTo(cLN.sx, cLN.sy);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.fillStyle = "#3a3834";
      const railL = worldToScreen(-LANE_HALF - 0.85, z);
      const railLN = worldToScreen(-LANE_HALF - 0.85, z + 1);
      if (railL && railLN) {
        const hRail = 12 * railL.scale;
        ctx.fillRect(railL.sx - 4, Math.min(railL.sy, railLN.sy) - hRail, 8, Math.abs(railLN.sy - railL.sy) + hRail);
        if (z % 2 === 0) {
          ctx.fillStyle = "#6a5040";
          ctx.fillRect(railL.sx - 5, Math.min(railL.sy, railLN.sy) - hRail - 5, 10, 7);
          ctx.fillStyle = "#c08040";
          ctx.globalAlpha = 0.35;
          ctx.beginPath(); ctx.arc(railL.sx, Math.min(railL.sy, railLN.sy) - hRail - 2, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#3a3834";
        }
      }
      ctx.fillStyle = "#3a3834";
      const railR = worldToScreen(LANE_HALF + 0.85, z);
      const railRN = worldToScreen(LANE_HALF + 0.85, z + 1);
      if (railR && railRN) {
        const hRail = 12 * railR.scale;
        ctx.fillRect(railR.sx - 4, Math.min(railR.sy, railRN.sy) - hRail, 8, Math.abs(railRN.sy - railR.sy) + hRail);
        if (z % 2 === 0) {
          ctx.fillStyle = "#6a5040";
          ctx.fillRect(railR.sx - 5, Math.min(railR.sy, railRN.sy) - hRail - 5, 10, 7);
          ctx.fillStyle = "#c08040";
          ctx.globalAlpha = 0.35;
          ctx.beginPath(); ctx.arc(railR.sx, Math.min(railR.sy, railRN.sy) - hRail - 2, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
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
    const hw = 32 * p.scale, panelH = 18 * p.scale, stacks = 1 + (g.stacked || 0);
    ctx.fillStyle = "#3a3834";
    ctx.fillRect(p.sx - hw * 1.15, p.sy - stacks * panelH - 18, 8 * p.scale, stacks * panelH + 22);
    ctx.fillRect(p.sx + hw * 1.15 - 8 * p.scale, p.sy - stacks * panelH - 18, 8 * p.scale, stacks * panelH + 22);
    ctx.fillStyle = "#2a2824";
    roundRect(p.sx - hw * 1.1, p.sy - 4, hw * 2.2, 12 * p.scale, 3); ctx.fill();
    for (let i = 0; i < stacks; i++) {
      const yy = p.sy - 8 - (i + 1) * panelH;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = g.color;
      roundRect(p.sx - hw - 3, yy - 2, hw * 2 + 6, panelH + 2, 5); ctx.fill();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = g.color;
      roundRect(p.sx - hw, yy, hw * 2, panelH - 2, 4); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.globalAlpha = 0.95; ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold " + Math.max(11, 18 * p.scale) + "px system-ui,sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const label = i === 0 ? gateLabel(g) : (g.op === "add" ? "+1" : gateLabel(g));
      ctx.strokeStyle = "rgba(0,0,20,0.7)"; ctx.lineWidth = 4;
      ctx.strokeText(label, p.sx, yy + panelH * 0.45); ctx.fillText(label, p.sx, yy + panelH * 0.45);
    }
    ctx.globalAlpha = 1;
  }
  function drawBarrel(b) {
    if (b.hit) return;
    const p = worldToScreen(b.x, b.z); if (!p) return;
    const s = p.s;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(p.sx, p.sy + s * 0.15, s * 0.75, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(p.sx - s, p.sy, p.sx + s, p.sy);
    g.addColorStop(0, "#5a3818"); g.addColorStop(0.45, "#a07038"); g.addColorStop(1, "#4a3010");
    ctx.fillStyle = g;
    roundRect(p.sx - s * 0.72, p.sy - s * 1.15, s * 1.44, s * 1.35, 5); ctx.fill();
    ctx.strokeStyle = "#2a1808"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#c0a870";
    ctx.fillRect(p.sx - s * 0.72, p.sy - s * 0.95, s * 1.44, 3);
    ctx.fillRect(p.sx - s * 0.72, p.sy - s * 0.4, s * 1.44, 3);
    ctx.fillStyle = "#2a7fff";
    ctx.beginPath(); ctx.arc(p.sx - s * 0.25, p.sy - s * 0.78, s * 0.24, 0, Math.PI * 2);
    ctx.arc(p.sx + s * 0.22, p.sy - s * 0.72, s * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#9cf";
    ctx.beginPath(); ctx.arc(p.sx - s * 0.25, p.sy - s * 0.82, s * 0.1, 0, Math.PI * 2);
    ctx.arc(p.sx + s * 0.22, p.sy - s * 0.76, s * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold " + Math.max(12, 16 * p.scale) + "px system-ui";
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.65)"; ctx.lineWidth = 3;
    ctx.strokeText("+" + b.amount, p.sx, p.sy + s * 0.18);
    ctx.fillText("+" + b.amount, p.sx, p.sy + s * 0.18);
  }
  function drawPillar(p) {
    if (!p.alive && p.hp <= 0) return;
    const s = worldToScreen(p.x, p.z); if (!s) return;
    const w = 24 * s.scale, h = 74 * s.scale;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(s.sx, s.sy + 4, w * 0.7, 8 * s.scale, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(s.sx - w / 2, 0, s.sx + w / 2, 0);
    g.addColorStop(0, "#2a2a30"); g.addColorStop(0.5, p.hitFlash > 0 ? "#c8d0e0" : "#7a7880"); g.addColorStop(1, "#2a2a30");
    ctx.fillStyle = g;
    roundRect(s.sx - w / 2, s.sy - h, w, h, 4); ctx.fill();
    ctx.strokeStyle = "#1a1a20"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(20,20,25,0.7)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.sx - w * 0.2, s.sy - h * 0.75);
    ctx.lineTo(s.sx + w * 0.1, s.sy - h * 0.5);
    ctx.lineTo(s.sx - w * 0.15, s.sy - h * 0.25);
    ctx.stroke();
    ctx.fillStyle = "rgba(100,160,255,0.35)";
    ctx.beginPath(); ctx.arc(s.sx, s.sy - h * 0.55, 4 * s.scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold " + Math.max(14, 20 * s.scale) + "px system-ui";
    ctx.textAlign = "center"; ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
    const hpTxt = String(Math.ceil(p.hp));
    ctx.strokeText(hpTxt, s.sx, s.sy - h * 0.5); ctx.fillText(hpTxt, s.sx, s.sy - h * 0.5);
  }
  function drawHpBar(sx, sy, w, h, ratio, label) {
    ctx.fillStyle = "rgba(0,0,0,0.72)"; roundRect(sx - w / 2, sy, w, h, 3); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1; ctx.stroke();
    const fill = Math.max(0, (w - 2) * ratio);
    const g = ctx.createLinearGradient(sx - w / 2, 0, sx + w / 2, 0);
    g.addColorStop(0, "#a01010"); g.addColorStop(0.5, "#e03030"); g.addColorStop(1, "#ff8060");
    ctx.fillStyle = g;
    roundRect(sx - w / 2 + 1, sy + 1, fill, h - 2, 2); ctx.fill();
    if (label) {
      ctx.fillStyle = "#fff"; ctx.font = "bold 10px system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, sx, sy + h / 2);
    }
  }

  function drawSoldier(sx, sy, s, opts) {
    opts = opts || {};
    const walk = opts.walk || 0, face = opts.facing == null ? 1 : opts.facing;
    const flash = opts.muzzle || 0, hit = opts.hit || 0, hero = opts.hero || false;
    const shade = opts.shade == null ? 1 : opts.shade;
    const bobY = Math.sin(walk * 2) * s * 0.04;
    const legSwing = Math.sin(walk) * s * 0.28;
    const h = s * (hero ? 1.55 : 1.28);
    sy = sy + bobY;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(face, 1);
    if (hit > 0) ctx.globalAlpha = 0.55 + Math.sin(hit * 40) * 0.35;
    ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,20,60,0.25)";
    ctx.beginPath(); ctx.ellipse(0, h * 0.98, s * 0.45, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#0e1a40"; ctx.lineWidth = Math.max(1.6, s * 0.24);
    ctx.beginPath();
    ctx.moveTo(-s * 0.14, h * 0.4); ctx.lineTo(-s * 0.2 - legSwing * 0.35, h * 0.98);
    ctx.moveTo(s * 0.14, h * 0.4); ctx.lineTo(s * 0.2 + legSwing * 0.35, h * 0.98);
    ctx.stroke();
    if (hero) {
      ctx.fillStyle = "#0838b0";
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -h * 0.05);
      ctx.quadraticCurveTo(-s * 1.05, h * 0.15 + Math.sin(walk) * s * 0.08, -s * 0.55, h * 0.7);
      ctx.lineTo(s * 0.15, h * 0.55);
      ctx.quadraticCurveTo(s * 0.55, h * 0.2, s * 0.25, -h * 0.02);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#1a60e8";
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, 0);
      ctx.quadraticCurveTo(-s * 0.85, h * 0.2, -s * 0.4, h * 0.55);
      ctx.lineTo(s * 0.1, h * 0.45);
      ctx.closePath(); ctx.fill();
    }
    const torso = hero ? "#1a6aff" : ("rgba(" + Math.floor(30 * shade) + "," + Math.floor(110 * shade) + "," + Math.floor(255 * shade) + ",1)");
    ctx.fillStyle = torso;
    roundRect(-s * 0.34, -h * 0.12, s * 0.68, h * 0.58, s * 0.08); ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,0.35)";
    roundRect(-s * 0.18, -h * 0.05, s * 0.36, h * 0.22, 2); ctx.fill();
    ctx.fillStyle = "#0a2858";
    ctx.fillRect(-s * 0.34, h * 0.28, s * 0.68, s * 0.1);
    ctx.fillStyle = "#1a4aaa";
    ctx.beginPath(); ctx.ellipse(-s * 0.48, h * 0.12, s * 0.28, s * 0.36, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#9cf"; ctx.lineWidth = Math.max(1, s * 0.08); ctx.stroke();
    ctx.fillStyle = "#ffd060";
    ctx.beginPath(); ctx.arc(-s * 0.48, h * 0.1, s * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1a2030"; ctx.lineWidth = Math.max(1.8, s * 0.14);
    ctx.beginPath(); ctx.moveTo(s * 0.12, h * 0.08); ctx.lineTo(s * 1.15, -h * 0.32); ctx.stroke();
    ctx.strokeStyle = "#c4a882"; ctx.lineWidth = Math.max(1.2, s * 0.12);
    ctx.beginPath(); ctx.moveTo(s * 0.25, h * 0.05); ctx.lineTo(s * 0.75, -h * 0.14); ctx.stroke();
    ctx.fillStyle = "#e8f0ff";
    ctx.beginPath();
    ctx.moveTo(s * 1.15, -h * 0.32);
    ctx.lineTo(s * 1.28, -h * 0.38);
    ctx.lineTo(s * 1.12, -h * 0.22);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#c4a882";
    ctx.beginPath(); ctx.arc(0, -h * 0.32, s * 0.27, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hero ? "#0a3aaa" : "#1a4aaa";
    ctx.beginPath(); ctx.ellipse(0, -h * 0.42, s * 0.36, s * 0.22, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-s * 0.36, -h * 0.42, s * 0.72, s * 0.14);
    ctx.fillStyle = "#0a2048";
    ctx.fillRect(-s * 0.22, -h * 0.36, s * 0.44, s * 0.08);
    if (hero) {
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -h * 0.5); ctx.lineTo(-s * 0.2, -h * 0.72);
      ctx.lineTo(-s * 0.06, -h * 0.54); ctx.lineTo(0, -h * 0.78);
      ctx.lineTo(s * 0.06, -h * 0.54); ctx.lineTo(s * 0.2, -h * 0.72);
      ctx.lineTo(s * 0.3, -h * 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff0a0";
      ctx.beginPath(); ctx.arc(0, -h * 0.76, s * 0.06, 0, Math.PI * 2); ctx.fill();
    }
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,230,100," + Math.min(1, flash * 14) + ")";
      ctx.beginPath(); ctx.arc(s * 1.2, -h * 0.34, s * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255," + Math.min(1, flash * 10) + ")";
      ctx.beginPath(); ctx.arc(s * 1.2, -h * 0.34, s * 0.12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function glowEyes(sc, h, eye, spread) {
    spread = spread == null ? 0.12 : spread;
    ctx.save();
    ctx.shadowColor = eye; ctx.shadowBlur = 8;
    ctx.fillStyle = eye;
    ctx.beginPath(); ctx.arc(-sc * spread, -h * 0.34, sc * 0.08, 0, Math.PI * 2);
    ctx.arc(sc * spread, -h * 0.34, sc * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-sc * spread, -h * 0.35, sc * 0.03, 0, Math.PI * 2);
    ctx.arc(sc * spread, -h * 0.35, sc * 0.03, 0, Math.PI * 2); ctx.fill();
  }
  function weaponGlint(x, y, r) {
    ctx.fillStyle = "rgba(255,240,200,0.9)";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  function drawMonster(sx, sy, s, en) {
    const def = en.def || MONSTER_DEFS.Kolczatek;
    const walk = en.walk || 0, face = en.facing || -1, hit = en.hitFlash || 0;
    const deathA = en.alive ? 1 : Math.max(0, 1 - en.death * 1.4);
    const bobY = Math.sin(en.bob || 0) * s * 0.05;
    const leg = Math.sin(walk) * s * 0.28;
    const h = s * 1.2 * def.size, sc = s * def.size;
    const kind = def.kind || "goblin";
    sy = sy + bobY;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(face, 1);
    ctx.globalAlpha = deathA * (hit > 0 ? 0.5 + Math.sin(hit * 50) * 0.4 : 1);
    ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, h * 0.95, sc * 0.55, sc * 0.14, 0, 0, Math.PI * 2); ctx.fill();

    if (kind === "rat") {
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.ellipse(0, h * 0.35, sc * 0.75, sc * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.skin;
      ctx.beginPath(); ctx.arc(sc * 0.55, h * 0.18, sc * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = def.accent || def.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-sc * 0.6, h * 0.4); ctx.quadraticCurveTo(-sc * 1.1, h * 0.2, -sc * 1.0, h * 0.05); ctx.stroke();
      glowEyes(sc, h * 0.55, def.eye, 0.08);
      ctx.restore(); return;
    }

    if (kind === "spider") {
      ctx.strokeStyle = def.color; ctx.lineWidth = Math.max(1.5, sc * 0.12);
      for (let i = 0; i < 4; i++) {
        const ly = h * 0.45 + Math.sin(walk + i) * sc * 0.08;
        ctx.beginPath();
        ctx.moveTo(-sc * 0.2, h * 0.25);
        ctx.quadraticCurveTo(-sc * (0.9 + i * 0.1), ly - sc * 0.3, -sc * (1.1 + i * 0.05), ly);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sc * 0.2, h * 0.25);
        ctx.quadraticCurveTo(sc * (0.9 + i * 0.1), ly - sc * 0.3, sc * (1.1 + i * 0.05), ly);
        ctx.stroke();
      }
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.ellipse(0, h * 0.2, sc * 0.55, sc * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.skin;
      ctx.beginPath(); ctx.arc(0, -h * 0.15, sc * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1014";
      ctx.beginPath();
      ctx.moveTo(-sc * 0.25, -h * 0.3); ctx.lineTo(-sc * 0.55, -h * 0.75); ctx.lineTo(-sc * 0.05, -h * 0.35); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sc * 0.25, -h * 0.3); ctx.lineTo(sc * 0.55, -h * 0.75); ctx.lineTo(sc * 0.05, -h * 0.35); ctx.fill();
      glowEyes(sc, h * 0.45, def.eye, 0.14);
      ctx.restore(); return;
    }

    if (kind === "beast") {
      ctx.strokeStyle = def.color; ctx.lineWidth = Math.max(2, sc * 0.28);
      ctx.beginPath();
      ctx.moveTo(-sc * 0.25, h * 0.35); ctx.lineTo(-sc * 0.4 - leg * 0.3, h * 0.95);
      ctx.moveTo(sc * 0.25, h * 0.35); ctx.lineTo(sc * 0.4 + leg * 0.3, h * 0.95);
      ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.ellipse(0, h * 0.15, sc * 0.7, sc * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = def.accent || def.color; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const fx = -sc * 0.5 + i * sc * 0.25;
        ctx.beginPath(); ctx.moveTo(fx, -h * 0.05); ctx.lineTo(fx + sc * 0.05, -h * 0.25); ctx.stroke();
      }
      ctx.fillStyle = def.skin;
      ctx.beginPath(); ctx.arc(0, -h * 0.35, sc * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2a1810";
      ctx.beginPath();
      ctx.moveTo(-sc * 0.3, -h * 0.45); ctx.lineTo(-sc * 0.7, -h * 0.95); ctx.lineTo(-sc * 0.1, -h * 0.5); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sc * 0.3, -h * 0.45); ctx.lineTo(sc * 0.7, -h * 0.95); ctx.lineTo(sc * 0.1, -h * 0.5); ctx.fill();
      ctx.strokeStyle = "#d0c0a0"; ctx.lineWidth = Math.max(1.5, sc * 0.12);
      ctx.beginPath();
      ctx.moveTo(sc * 0.55, h * 0.1); ctx.lineTo(sc * 1.15, -h * 0.05 + Math.sin(walk) * sc * 0.1);
      ctx.stroke();
      weaponGlint(sc * 1.12, -h * 0.05, sc * 0.08);
      glowEyes(sc, h * 0.9, def.eye, 0.14);
      ctx.restore(); return;
    }

    ctx.strokeStyle = def.color;
    ctx.lineWidth = Math.max(1.5, sc * (kind === "boss" ? 0.28 : 0.22));
    ctx.beginPath();
    ctx.moveTo(-sc * 0.16, h * 0.38); ctx.lineTo(-sc * 0.28 - leg * 0.4, h * 0.95);
    ctx.moveTo(sc * 0.14, h * 0.38); ctx.lineTo(sc * 0.3 + leg * 0.4, h * 0.92);
    ctx.stroke();

    if (kind === "armored" || kind === "ice" || kind === "boss") {
      const g = ctx.createLinearGradient(-sc * 0.4, 0, sc * 0.4, 0);
      if (kind === "ice") {
        g.addColorStop(0, "#1a3048"); g.addColorStop(0.5, "#6088a8"); g.addColorStop(1, "#1a3048");
      } else if (kind === "boss") {
        g.addColorStop(0, "#0a0810"); g.addColorStop(0.5, "#3a3048"); g.addColorStop(1, "#0a0810");
      } else {
        g.addColorStop(0, "#1a1a24"); g.addColorStop(0.5, "#5a5a68"); g.addColorStop(1, "#1a1a24");
      }
      ctx.fillStyle = g;
      roundRect(-sc * 0.4, -h * 0.14, sc * 0.8, h * 0.58, 3); ctx.fill();
      ctx.strokeStyle = kind === "ice" ? "rgba(160,220,255,0.55)" : "#889";
      ctx.lineWidth = 2; ctx.stroke();
      if (kind === "ice") {
        ctx.fillStyle = "rgba(120,200,255,0.35)";
        ctx.beginPath(); ctx.arc(0, h * 0.1, sc * 0.55, 0, Math.PI * 2); ctx.fill();
      }
    } else if (kind === "undead") {
      ctx.fillStyle = def.color;
      roundRect(-sc * 0.34, -h * 0.1, sc * 0.68, h * 0.52, 2); ctx.fill();
      ctx.strokeStyle = "rgba(180,200,170,0.45)"; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-sc * 0.22, i * h * 0.12); ctx.lineTo(sc * 0.22, i * h * 0.12); ctx.stroke();
      }
    } else if (kind === "cultist") {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(-sc * 0.35, -h * 0.15);
      ctx.lineTo(-sc * 0.45, h * 0.5);
      ctx.lineTo(-sc * 0.15, h * 0.42);
      ctx.lineTo(0, h * 0.52);
      ctx.lineTo(sc * 0.15, h * 0.42);
      ctx.lineTo(sc * 0.45, h * 0.5);
      ctx.lineTo(sc * 0.35, -h * 0.15);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = def.color;
      roundRect(-sc * 0.32, -h * 0.08, sc * 0.64, h * 0.5, 3); ctx.fill();
      ctx.fillStyle = def.accent || def.color;
      ctx.beginPath();
      ctx.moveTo(-sc * 0.32, -h * 0.05); ctx.lineTo(-sc * 0.55, -h * 0.25); ctx.lineTo(-sc * 0.28, h * 0.05); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sc * 0.32, -h * 0.05); ctx.lineTo(sc * 0.55, -h * 0.25); ctx.lineTo(sc * 0.28, h * 0.05); ctx.fill();
    }

    ctx.strokeStyle = def.skin;
    ctx.lineWidth = Math.max(1.4, sc * 0.16);
    const armSwing = Math.sin(walk) * sc * 0.12;
    ctx.beginPath();
    ctx.moveTo(-sc * 0.32, h * 0.02); ctx.lineTo(-sc * 0.85, -h * 0.1 + armSwing);
    ctx.moveTo(sc * 0.32, h * 0.05); ctx.lineTo(sc * 0.9, -h * 0.02 - armSwing * 0.6);
    ctx.stroke();

    if (def.cleaver || kind === "cultist") {
      ctx.fillStyle = "#3a3a40";
      ctx.beginPath();
      ctx.moveTo(sc * 0.85, -h * 0.15 - armSwing * 0.6);
      ctx.lineTo(sc * 1.35, -h * 0.35);
      ctx.lineTo(sc * 1.4, h * 0.05);
      ctx.lineTo(sc * 0.95, h * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#a0a0b0"; ctx.lineWidth = 1; ctx.stroke();
      weaponGlint(sc * 1.3, -h * 0.2, sc * 0.07);
    } else if (kind === "boss") {
      ctx.strokeStyle = "#1a1018"; ctx.lineWidth = Math.max(3, sc * 0.18);
      ctx.beginPath();
      ctx.moveTo(sc * 0.7, h * 0.15); ctx.lineTo(sc * 1.85, -h * 0.85); ctx.stroke();
      ctx.fillStyle = "#2a2030";
      ctx.beginPath();
      ctx.moveTo(sc * 1.7, -h * 0.7);
      ctx.lineTo(sc * 2.05, -h * 1.05);
      ctx.lineTo(sc * 1.55, -h * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffd060";
      roundRect(sc * 0.55, h * 0.05, sc * 0.35, sc * 0.14, 2); ctx.fill();
      weaponGlint(sc * 1.95, -h * 0.95, sc * 0.12);
    } else if (kind === "ice") {
      ctx.strokeStyle = "#a0d0ff"; ctx.lineWidth = Math.max(2, sc * 0.12);
      ctx.beginPath();
      ctx.moveTo(sc * 0.7, h * 0.05); ctx.lineTo(sc * 1.5, -h * 0.55); ctx.stroke();
      ctx.fillStyle = "rgba(180,230,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(sc * 1.45, -h * 0.5); ctx.lineTo(sc * 1.7, -h * 0.75); ctx.lineTo(sc * 1.35, -h * 0.4); ctx.fill();
      weaponGlint(sc * 1.65, -h * 0.7, sc * 0.09);
    } else if (kind === "goblin") {
      ctx.fillStyle = "#707070";
      ctx.beginPath();
      ctx.moveTo(sc * 0.85, -h * 0.05 - armSwing * 0.6);
      ctx.lineTo(sc * 1.25, -h * 0.25);
      ctx.lineTo(sc * 1.15, h * 0.08);
      ctx.closePath(); ctx.fill();
      weaponGlint(sc * 1.2, -h * 0.18, sc * 0.06);
    } else if (kind === "undead") {
      ctx.strokeStyle = "#8a9070"; ctx.lineWidth = Math.max(1.5, sc * 0.1);
      ctx.beginPath();
      ctx.moveTo(sc * 0.8, 0); ctx.lineTo(sc * 1.2, -h * 0.35); ctx.stroke();
      weaponGlint(sc * 1.18, -h * 0.32, sc * 0.05);
    }

    ctx.fillStyle = def.skin;
    const headR = sc * (kind === "boss" ? 0.45 : kind === "goblin" ? 0.32 : 0.28);
    ctx.beginPath(); ctx.arc(0, -h * 0.32, headR, 0, Math.PI * 2); ctx.fill();

    if (kind === "goblin") {
      ctx.fillStyle = def.skin;
      ctx.beginPath();
      ctx.moveTo(-headR * 0.6, -h * 0.35); ctx.lineTo(-headR * 1.4, -h * 0.55); ctx.lineTo(-headR * 0.4, -h * 0.25); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(headR * 0.6, -h * 0.35); ctx.lineTo(headR * 1.4, -h * 0.55); ctx.lineTo(headR * 0.4, -h * 0.25); ctx.fill();
    }
    if (kind === "cultist") {
      ctx.fillStyle = "#1a1824";
      ctx.beginPath();
      ctx.moveTo(-headR * 1.2, -h * 0.2);
      ctx.quadraticCurveTo(0, -h * 0.85, headR * 1.2, -h * 0.2);
      ctx.lineTo(headR * 0.9, -h * 0.15);
      ctx.quadraticCurveTo(0, -h * 0.55, -headR * 0.9, -h * 0.15);
      ctx.closePath(); ctx.fill();
    }
    if (kind === "boss") {
      ctx.fillStyle = "#0a0810";
      ctx.beginPath();
      ctx.moveTo(-headR * 1.35, -h * 0.22);
      ctx.lineTo(-headR * 0.55, -h * 1.05);
      ctx.lineTo(-headR * 0.1, -h * 0.7);
      ctx.lineTo(headR * 0.1, -h * 0.7);
      ctx.lineTo(headR * 0.55, -h * 1.05);
      ctx.lineTo(headR * 1.35, -h * 0.22);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#2a2038";
      ctx.beginPath(); ctx.ellipse(0, -h * 0.38, headR * 1.05, headR * 0.55, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1420";
      ctx.beginPath(); ctx.ellipse(-sc * 0.55, -h * 0.05, sc * 0.35, sc * 0.22, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sc * 0.55, -h * 0.05, sc * 0.35, sc * 0.22, 0.4, 0, Math.PI * 2); ctx.fill();
    }
    if (kind === "ice") {
      ctx.fillStyle = "#406080";
      ctx.beginPath(); ctx.ellipse(0, -h * 0.42, headR * 1.15, headR * 0.5, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(140,210,255,0.5)";
      ctx.beginPath(); ctx.arc(0, -h * 0.32, headR * 1.2, 0, Math.PI * 2); ctx.fill();
    }
    if (kind === "armored") {
      ctx.fillStyle = "#2a2a34";
      ctx.beginPath(); ctx.ellipse(0, -h * 0.4, headR * 1.1, headR * 0.45, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillRect(-headR * 1.05, -h * 0.4, headR * 2.1, headR * 0.35);
    }

    glowEyes(sc, h, def.eye, kind === "boss" ? 0.16 : 0.11);

    if (def.ranged) {
      ctx.fillStyle = "#8f4";
      ctx.beginPath(); ctx.arc(sc * 0.05, -h * 0.12, sc * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(160,255,80,0.4)";
      ctx.beginPath(); ctx.arc(sc * 0.05, -h * 0.12, sc * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawFormation(f) {
    if (!f.alive || f.count <= 0) return;
    const cols = f.cols;
    const visCount = Math.min(f.count, cols * Math.min(f.rows, 8));
    const rows = Math.ceil(visCount / cols);
    const halfW = ((cols - 1) * f.spacing) / 2;
    const kinds = f.troopKinds || FORMATION_KINDS;
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c; if (idx >= visCount) continue;
        const p = worldToScreen(f.x - halfW + c * f.spacing, f.z + r * f.spacing * 0.85);
        if (!p) continue;
        const kindKey = kinds[idx % kinds.length];
        const def = MONSTER_DEFS[kindKey] || MONSTER_DEFS.Kolczatek;
        drawMonster(p.sx, p.sy, p.s * 0.82, {
          def, walk: animTime * 6 + idx * 0.4, bob: animTime + idx * 0.2,
          facing: -1, hitFlash: 0, alive: true, death: 0,
        });
      }
    }
    const mid = worldToScreen(f.x, f.z + rows * f.spacing * 0.3);
    if (mid) {
      ctx.font = "900 " + Math.max(18, 28 * mid.scale) + "px system-ui";
      ctx.textAlign = "center"; ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.fillStyle = "#ffd0d0";
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
      const pulse = 1 + Math.sin(animTime * 4) * 0.06;
      ctx.strokeStyle = "rgba(255,40,60,0.9)"; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy + 10, 70 * p.scale * pulse, 22 * p.scale * pulse, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,80,40,0.35)"; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy + 10, 58 * p.scale, 16 * p.scale, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,200,80,0.45)"; ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy + 10, 48 * p.scale, 12 * p.scale, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const aura = ctx.createRadialGradient(p.sx, p.sy - p.s * 2, 10, p.sx, p.sy, 90 * p.scale);
      aura.addColorStop(0, "rgba(80,20,100,0.25)");
      aura.addColorStop(1, "rgba(20,0,30,0)");
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(p.sx, p.sy - p.s, 90 * p.scale, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    drawMonster(p.sx, p.sy, p.s * 1.35, {
      def: MONSTER_DEFS.OlbrzymNocy, walk: boss.walk, bob: boss.bob,
      facing: playerX >= boss.x ? 1 : -1, hitFlash: boss.hitFlash, alive: boss.alive, death: 0,
    });
    drawHpBar(p.sx, p.sy - p.s * 5.4, 140, 18, boss.hp / boss.maxHp, Math.ceil(boss.hp) + " HP");
    ctx.fillStyle = "#ffee88"; ctx.font = "bold 14px system-ui"; ctx.textAlign = "center";
    ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
    ctx.strokeText("OLBRZYM NOCY", p.sx, p.sy - p.s * 5.4 - 14);
    ctx.fillText("OLBRZYM NOCY", p.sx, p.sy - p.s * 5.4 - 14);
  }

  function drawCrowd() {
    const sorted = crowd.slice().sort((a, b) => b.oz - a.oz);
    sorted.forEach((c, idx) => {
      const bob = Math.sin(c.bob) * 0.06;
      const p = worldToScreen(playerX + c.ox, worldZ + c.oz + bob);
      if (!p) return;
      drawSoldier(p.sx, p.sy, p.s * (c.isHero ? 1.35 : 1.05), {
        walk: c.walk + c.phase, facing: facing,
        muzzle: idx < 5 && muzzleFlash > 0 ? muzzleFlash : 0,
        hit: playerHitFlash, hero: c.isHero, shade: c.shade,
      });
    });
    const gp = worldToScreen(playerX, worldZ);
    if (gp) {
      ctx.fillStyle = playerHitFlash > 0 ? "rgba(255,80,80,0.4)" : "rgba(60,160,255,0.35)";
      ctx.beginPath(); ctx.ellipse(gp.sx, gp.sy + 10, 38 * gp.scale, 14 * gp.scale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(120,200,255,0.55)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(gp.sx, gp.sy + 10, 38 * gp.scale, 14 * gp.scale, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.font = "900 " + Math.max(24, 36 * gp.scale) + "px system-ui";
      ctx.textAlign = "center"; ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(0,30,90,0.85)"; ctx.fillStyle = "#fff";
      ctx.strokeText(String(unitCount), gp.sx, gp.sy - 52 * gp.scale);
      ctx.fillText(String(unitCount), gp.sx, gp.sy - 52 * gp.scale);
      ctx.font = "bold " + Math.max(10, 12 * gp.scale) + "px system-ui";
      ctx.fillStyle = "#8cf";
      ctx.fillText("ARMIA", gp.sx, gp.sy - 52 * gp.scale - Math.max(12, 16 * gp.scale));
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
          ctx.strokeStyle = "rgba(120,220,255," + (0.2 + a * 0.65) + ")";
          ctx.lineWidth = 2 + a * 2.5;
          ctx.beginPath(); ctx.moveTo(prev.sx, prev.sy); ctx.lineTo(tp.sx, tp.sy); ctx.stroke();
        }
      }
      const p = worldToScreen(pr.x, pr.z); if (!p) return;
      ctx.strokeStyle = "#aef"; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(p.sx, p.sy + 12 * p.scale); ctx.lineTo(p.sx, p.sy - 8 * p.scale); ctx.stroke();
      ctx.fillStyle = "#ffe080";
      ctx.beginPath(); ctx.arc(p.sx, p.sy - 8 * p.scale, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,200,0.55)";
      ctx.beginPath(); ctx.arc(p.sx, p.sy - 8 * p.scale, 6, 0, Math.PI * 2); ctx.fill();
    });
    enemyShots.forEach((s) => {
      const p = worldToScreen(s.x, s.z); if (!p) return;
      ctx.fillStyle = "rgba(255,40,40,0.4)";
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 11 * p.scale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff5050";
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 4.5 * p.scale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffc080";
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 2 * p.scale, 0, Math.PI * 2); ctx.fill();
    });
  }
  function drawParticles() {
    particles.forEach((p) => {
      const s = worldToScreen(p.x, p.z); if (!s) return;
      ctx.globalAlpha = Math.max(0, p.life * 2.2);
      if (p.spark) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(s.sx - p.r, s.sy); ctx.lineTo(s.sx + p.r, s.sy);
        ctx.moveTo(s.sx, s.sy - p.r); ctx.lineTo(s.sx, s.sy + p.r); ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(s.sx, s.sy, 1.2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(s.sx, s.sy, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }
  function drawFloatTexts() {
    floatTexts.forEach((f) => {
      const p = worldToScreen(f.x, f.z); if (!p) return;
      ctx.globalAlpha = Math.max(0, f.life * 1.25);
      ctx.font = "900 " + Math.max(15, 22 * p.scale) + "px system-ui";
      ctx.textAlign = "center"; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.lineWidth = 4;
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
    drawFogLayer();
    ctx.fillStyle = "rgba(8,10,25,0.45)"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    ctx.font = "900 42px system-ui,sans-serif"; ctx.strokeStyle = "#1a4aff"; ctx.lineWidth = 6;
    ctx.strokeText("MOST ARMII", W / 2, H * 0.16); ctx.fillText("MOST ARMII", W / 2, H * 0.16);
    ctx.font = "700 14px system-ui"; ctx.fillStyle = "#8cf";
    ctx.fillText("HAOS Bridge Runner · dark fantasy", W / 2, H * 0.16 + 24);
    for (let i = 0; i < 12; i++) {
      const a = titlePulse * 2 + i * 0.45;
      drawSoldier(W / 2 - 70 + Math.cos(a) * 32, H * 0.38 + Math.sin(a * 0.7) * 10, 12, {
        walk: titlePulse * 8 + i, facing: 1, hero: i === 0,
      });
    }
    const showcase = ["Kolczatek", "SkalnySzpon", "BagiennyTrup", "Bestia", "Rogacz", "LodowyStrach"];
    showcase.forEach((key, i) => {
      const def = MONSTER_DEFS[key];
      drawMonster(W / 2 + 30 + (i % 3) * 36, H * 0.34 + Math.floor(i / 3) * 42, 10, {
        def, walk: titlePulse * 5 + i, bob: titlePulse + i, facing: -1, hitFlash: 0, alive: true, death: 0,
      });
    });
    const pulse = 1 + Math.sin(titlePulse * 3) * 0.04;
    ctx.save(); ctx.translate(W / 2, H * 0.58); ctx.scale(pulse, pulse);
    ctx.fillStyle = "#2a7fff"; roundRect(-110, -28, 220, 56, 16); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "900 20px system-ui";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("DOTKNIJ ABY GRAĆ", 0, 2);
    ctx.restore();
    ctx.font = "13px system-ui"; ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText("Lewy: włącz/wyłącz ogień  ·  Prawy: tylko ruch", W / 2, H * 0.72);
    ctx.fillText("Bramy +/× · Beczki · Potwory · Olbrzym Nocy", W / 2, H * 0.72 + 18);
    ctx.fillText("Ulepszenia: dmg " + upgrades.dmg + " · rate " + upgrades.rate + " · hp " + upgrades.hp, W / 2, H * 0.72 + 38);
  }
  function drawUpgrade() {
    ctx.fillStyle = "rgba(5,10,25,0.82)"; ctx.fillRect(0, 0, W, H);
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
    ctx.fillStyle = "rgba(5,10,25,0.78)"; ctx.fillRect(0, 0, W, H);
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
    drawWater(); drawBridge(); drawFogLayer();
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
