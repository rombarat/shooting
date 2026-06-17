import * as THREE from "three";
import { buildMap } from "./map.js";
import * as Sfx from "./audio.js";

// ===================== Renderer / scene =====================
const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcd0e8);
scene.fog = new THREE.Fog(0xbcd0e8, 70, 160);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 400);
const BASE_FOV = 75;

const sun = new THREE.DirectionalLight(0xfff2d0, 2.3);
sun.position.set(40, 70, 25);
sun.castShadow = true;
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x99aabb, 1.2));

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ===================== Globals loaded from server =====================
let WEAPONS = {}, MAP = null, obstacles = [];
const MAP_HALF = () => MAP.bounds;
const PLANT_TIME = 3200, DEFUSE_TIME = 8000;

// ===================== Player physics =====================
const EYE = 1.7, RADIUS = 0.5, GRAVITY = 28, JUMP_V = 9, RUN = 9, WALK = 4.5;
const pos = new THREE.Vector3(0, EYE, 40);
const vel = new THREE.Vector3();
let yaw = 0, pitch = 0, onGround = true;

const keys = {};
let chatOpen = false;
addEventListener("keydown", (e) => {
  if (chatOpen) return;
  keys[e.code] = true;
  if (e.code === "Tab") { e.preventDefault(); $("scoreboard").style.display = "block"; }
  if (e.code === "Digit1") selectSlot("primary");
  if (e.code === "Digit2") selectSlot("secondary");
  if (e.code === "Digit3") selectSlot("melee");
  if (e.code === "Digit4") selectSlot("grenade");
  if (e.code === "KeyR") startReload();
  if (e.code === "KeyB") toggleBuy();
  if (e.code === "KeyY") openChat(false);
  if (e.code === "KeyU") openChat(true);
});
addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "Tab") $("scoreboard").style.display = "none";
});

function collide(p) {
  p.x = Math.max(-MAP_HALF() + 1, Math.min(MAP_HALF() - 1, p.x));
  p.z = Math.max(-MAP_HALF() + 1, Math.min(MAP_HALF() - 1, p.z));
  for (const m of obstacles) {
    const g = m.geometry.parameters;
    const minX = m.position.x - g.width / 2 - RADIUS, maxX = m.position.x + g.width / 2 + RADIUS;
    const minZ = m.position.z - g.depth / 2 - RADIUS, maxZ = m.position.z + g.depth / 2 + RADIUS;
    const top = m.position.y + g.height / 2;
    if (p.y - EYE > top - 0.3) continue;
    if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
      const dxMin = p.x - minX, dxMax = maxX - p.x, dzMin = p.z - minZ, dzMax = maxZ - p.z;
      const m1 = Math.min(dxMin, dxMax, dzMin, dzMax);
      if (m1 === dxMin) p.x = minX; else if (m1 === dxMax) p.x = maxX;
      else if (m1 === dzMin) p.z = minZ; else p.z = maxZ;
    }
  }
}

// ===================== Other players =====================
const others = {};       // id -> { group, body, head, target, targetRy }
const meta = {};         // id -> { name, team, kills, deaths, money }
let myId = null, myTeam = "CT";
const me = { weapons: {}, slot: "secondary", money: 800, hp: 100, armor: 0, alive: true, hasBomb: false };

function makeNameSprite(name, team) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "bold 30px Arial"; ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = team === "CT" ? "#7db8ff" : "#ffd966";
  ctx.fillText(name, 128, 42);
  // depthTest:true => name is correctly occluded by walls (fixes see-through bug)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true, depthWrite: false }));
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}

function addOther(p) {
  if (p.id === myId) { meta[p.id] = { name: p.name, team: p.team, kills: p.kills || 0, deaths: p.deaths || 0, money: p.money || 0 }; return; }
  const color = p.team === "CT" ? 0x3b6ea5 : 0xc8a040;
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 12), new THREE.MeshStandardMaterial({ color }));
  body.position.y = -0.5; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), new THREE.MeshStandardMaterial({ color: 0xd8b89a }));
  head.position.y = 0.45; head.castShadow = true;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0x222 }));
  gun.position.set(0.3, -0.1, -0.5);
  const nameSprite = makeNameSprite(p.name, p.team);
  nameSprite.position.y = 1.15;
  body.userData = { playerId: p.id, part: "body" };
  head.userData = { playerId: p.id, part: "head" };
  group.add(body, head, gun, nameSprite);
  group.position.set(p.x, p.y, p.z);
  group.visible = p.alive !== false;
  scene.add(group);
  others[p.id] = { group, body, head, target: new THREE.Vector3(p.x, p.y, p.z), targetRy: p.ry || 0 };
  meta[p.id] = { name: p.name, team: p.team, kills: p.kills || 0, deaths: p.deaths || 0, money: p.money || 0 };
}
function removeOther(id) { if (others[id]) { scene.remove(others[id].group); delete others[id]; } delete meta[id]; }

// ===================== Weapon viewmodel =====================
const gunGroup = new THREE.Group();
const gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
gunMesh.position.set(0.25, -0.22, -0.5);
const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3), new THREE.MeshStandardMaterial({ color: 0x333 }));
barrel.rotation.x = Math.PI / 2; barrel.position.set(0.25, -0.18, -0.9);
const flash = new THREE.PointLight(0xffaa33, 0, 5); flash.position.set(0.25, -0.18, -1.1);
gunGroup.add(gunMesh, barrel, flash);
camera.add(gunGroup);
scene.add(camera);

// ===================== Bomb model =====================
let bombMesh = null;
function showBomb(x, z) {
  if (bombMesh) scene.remove(bombMesh);
  bombMesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), new THREE.MeshStandardMaterial({ color: 0x222 }));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000 }));
  led.position.y = 0.2; bombMesh.userData.led = led;
  bombMesh.add(body, led);
  bombMesh.position.set(x, 0.2, z);
  scene.add(bombMesh);
}
function hideBomb() { if (bombMesh) { scene.remove(bombMesh); bombMesh = null; } }

// ===================== HUD =====================
const $ = (id) => document.getElementById(id);
const hpEl = $("hp"), armorEl = $("armor"), ammoEl = $("ammo"), weaponNameEl = $("weaponName"),
      moneyEl = $("money"), msgEl = $("msg"), feedEl = $("killfeed"), progressEl = $("progress"),
      progressBar = $("progressBar"), progressLabel = $("progressLabel"),
      roundTimerEl = $("roundTimer"), phaseLabelEl = $("phaseLabel"), bombHudEl = $("bombHud");

let reloading = false, lastShot = 0, mouseDown = false;
let phase = "warmup", phaseEndsAt = 0, bombState = null, bombTime = 40000;
let planting = false, defusing = false, actionStart = 0;

function curWeapon() { return me.weapons[me.slot]; }
function curStats() { return WEAPONS[curWeapon()] || null; }
const ammo = {}; // weaponId -> {mag, reserve}

function setHP(v, a) {
  me.hp = v; hpEl.textContent = Math.max(0, Math.round(v));
  hpEl.className = v <= 30 ? "low" : "";
  if (a !== undefined) { me.armor = a; armorEl.textContent = Math.round(a); }
}
function refreshWeaponHud() {
  const w = curStats();
  if (!w) { weaponNameEl.textContent = ""; ammoEl.textContent = ""; return; }
  weaponNameEl.textContent = w.name;
  const a = ammo[curWeapon()];
  if (w.slot === "melee") ammoEl.innerHTML = "🔪";
  else if (w.slot === "grenade") ammoEl.innerHTML = a && a.mag > 0 ? "💣 x1" : "—";
  else ammoEl.innerHTML = a ? `${a.mag} <small>/ ${a.reserve}</small>` : "";
}
function setMoney(v) { me.money = v; moneyEl.textContent = "$" + v; renderBuyMenu(); }
function selectSlot(slot) {
  if (!me.weapons[slot]) return;
  me.slot = slot;
  socket.emit("switchSlot", slot);
  refreshWeaponHud();
}

function addFeed(html) {
  const div = document.createElement("div");
  div.className = "feedItem"; div.innerHTML = html;
  feedEl.prepend(div);
  while (feedEl.children.length > 6) feedEl.lastChild.remove();
  setTimeout(() => div.remove(), 7000);
}

// ===================== Scoreboard =====================
function refreshScoreboard() {
  const rows = (team) => Object.entries(meta)
    .filter(([, m]) => m.team === team)
    .sort((a, b) => b[1].kills - a[1].kills)
    .map(([id, m]) => {
      const you = id === myId ? ' style="color:#fff;font-weight:bold"' : "";
      return `<tr${you}><td>${m.name}</td><td>${m.kills}</td><td>${m.deaths}</td><td>$${m.money}</td></tr>`;
    }).join("");
  $("ctRows").innerHTML = rows("CT");
  $("tRows").innerHTML = rows("T");
  $("sbCt").textContent = scores.CT;
  $("sbT").textContent = scores.T;
}

// ===================== Tracers / FX =====================
const tracers = [];
function spawnTracer(from, to, color = 0xffdd88) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z)]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(line); tracers.push({ line, t: 0 });
}
function spawnExplosion(x, z, big) {
  const r = big ? 6 : 3;
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.8 }));
  m.position.set(x, 1.5, z); scene.add(m);
  let s = 0.2; const grow = setInterval(() => {
    s += 0.15; m.scale.setScalar(s); m.material.opacity -= 0.08;
    if (m.material.opacity <= 0) { clearInterval(grow); scene.remove(m); }
  }, 30);
  Sfx.playExplosion();
}

// ===================== Networking =====================
let socket = null, scores = { CT: 0, T: 0 };

function connect(name, team) {
  socket = io();
  socket.emit("join", { name, team });

  socket.on("init", (data) => {
    myId = data.id; WEAPONS = data.weapons; MAP = data.map;
    ({ obstacles } = buildMap(scene, MAP));
    applyFull(data.snapshot);
    startGame();
  });

  socket.on("playerJoined", (p) => addOther(p));
  socket.on("playerLeft", (d) => removeOther(d.id));
  socket.on("playerUpdate", (p) => { if (meta[p.id]) { meta[p.id].money = p.money; meta[p.id].team = p.team; } if (p.id === myId) { me.weapons = p.weapons; setMoney(p.money); } });
  socket.on("feed", (d) => addFeed(d.text));

  socket.on("phase", (d) => {
    phase = d.phase; phaseEndsAt = d.endsAt; scores = d.scores;
    refreshScoreboard();
    flashMsg(d.msg, d.phase === "live" ? "#4f4" : "#ffd54f");
    if (d.phase === "buy") { Sfx.playRoundStart(); hideBomb(); bombState = null; }
    bombHudEl.style.display = "none";
  });

  socket.on("roundend", (d) => {
    phase = "roundend"; scores = d.scores; phaseEndsAt = d.endsAt;
    refreshScoreboard();
    const won = d.winner === myTeam;
    flashMsg(`${d.winner} WIN — ${d.reason}`, won ? "#4f4" : "#f55");
    won ? Sfx.playWin() : Sfx.playLose();
    hideBomb(); bombState = null; bombHudEl.style.display = "none";
  });

  socket.on("state", applyFull);

  socket.on("snapshot", (data) => {
    const snap = data.players;
    for (const id in snap) {
      const s = snap[id];
      if (id === myId) {
        if (meta[id]) { meta[id].kills = s.kills; meta[id].deaths = s.deaths; meta[id].money = s.money; }
        me.hasBomb = s.hasBomb; me.alive = s.alive;
        if (s.money !== me.money) setMoney(s.money);
        continue;
      }
      if (!others[id]) continue;
      others[id].target.set(s.x, s.y, s.z);
      others[id].targetRy = s.ry;
      others[id].group.visible = s.alive;
      if (meta[id]) { meta[id].kills = s.kills; meta[id].deaths = s.deaths; meta[id].money = s.money; meta[id].team = s.team; }
    }
    if ($("scoreboard").style.display === "block") refreshScoreboard();
  });

  socket.on("shot", (d) => { spawnTracer(d.from, d.to); Sfx.playShot(d.weapon); });
  socket.on("bought", (d) => {
    if (d.weapons) me.weapons = d.weapons;
    setMoney(d.money);
    if (d.slot) { me.slot = d.slot; ammo[d.item] = { mag: WEAPONS[d.item].mag, reserve: WEAPONS[d.item].reserve }; }
    if (d.item === "grenade") ammo.grenade = { mag: 1, reserve: 0 };
    refreshWeaponHud(); Sfx.playBuy();
  });

  socket.on("correct", (d) => { pos.set(d.x, d.y, d.z); });

  socket.on("damaged", (d) => {
    setHP(d.hp, d.armor); Sfx.playHitTaken();
    $("damageVignette").style.opacity = 0.9;
    setTimeout(() => ($("damageVignette").style.opacity = 0), 250);
  });

  socket.on("kill", (d) => {
    const kc = d.killerTeam === "CT" ? "ct" : "t", vc = d.victimTeam === "CT" ? "ct" : "t";
    const icon = d.headshot ? "🎯" : (WEAPONS[d.weapon] && WEAPONS[d.weapon].slot === "melee" ? "🔪" : "🔫");
    addFeed(`<span class="${kc}">${d.killerName}</span> ${icon} <span class="${vc}">${d.victimName}</span>${d.streak >= 3 ? ` <b style="color:#ff8">x${d.streak}</b>` : ""}`);
    if (d.killerId === myId) { hit(); if (d.streak >= 3) flashMsg(`${d.streak} KILL STREAK!`, "#ff8"); }
    if (d.victimId === myId) { me.alive = false; flashMsg(`Killed by ${d.killerName}`, "#f55"); setHP(0); }
  });

  socket.on("bombPlanted", (d) => {
    bombState = { x: d.x, z: d.z, plantedAt: d.plantedAt }; bombTime = d.bombTime;
    showBomb(d.x, d.z); bombHudEl.style.display = "block"; Sfx.playBeep();
  });
  socket.on("grenadeThrow", (d) => { if (d.id !== myId) spawnTracer(d.from, d.to, 0x88ff88); });
  socket.on("explosion", (d) => spawnExplosion(d.x, d.z, d.big));
  socket.on("chat", (d) => {
    const tc = d.team === "CT" ? "ct" : "t";
    addChat(`<span class="${tc}">${d.teamOnly ? "(team) " : ""}${d.name}</span>: ${d.text}`);
  });
}

function applyFull(snap) {
  scores = snap.scores; phase = snap.phase;
  const ps = snap.players;
  // remove stale
  for (const id in others) if (!ps[id]) removeOther(id);
  for (const id in ps) {
    const p = ps[id];
    if (id === myId) {
      myTeam = p.team; me.weapons = p.weapons; me.slot = p.currentSlot; me.alive = p.alive;
      setMoney(p.money); setHP(p.hp, p.armor);
      for (const slot of ["primary", "secondary", "melee", "grenade"]) {
        const w = p.weapons[slot]; if (w) ammo[w] = { mag: WEAPONS[w].mag, reserve: WEAPONS[w].reserve };
      }
      pos.set(p.x, p.y, p.z);
      meta[id] = { name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, money: p.money };
      refreshWeaponHud();
    } else if (!others[id]) addOther(p);
  }
  if (snap.bomb && snap.bomb.planted) { bombState = { x: snap.bomb.x, z: snap.bomb.z, plantedAt: snap.bomb.plantedAt }; showBomb(snap.bomb.x, snap.bomb.z); }
  refreshScoreboard();
}

// ===================== Input: shooting =====================
let pointerLocked = false;
function lockPointer() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* preview iframe blocks pointer lock */ } }
canvas.addEventListener("click", () => { if (started && !pointerLocked && !buyOpen && !chatOpen) lockPointer(); });
document.addEventListener("pointerlockchange", () => { pointerLocked = document.pointerLockElement === canvas; });
addEventListener("mousemove", (e) => {
  if (!pointerLocked) return;
  yaw -= e.movementX * 0.0023; pitch -= e.movementY * 0.0023;
  pitch = Math.max(-1.55, Math.min(1.55, pitch));
});
addEventListener("mousedown", (e) => { if (e.button === 0) mouseDown = true; if (e.button === 2) toggleScope(); });
addEventListener("mouseup", (e) => { if (e.button === 0) mouseDown = false; });
addEventListener("contextmenu", (e) => e.preventDefault());

let scoped = false;
function toggleScope() {
  const w = curStats();
  if (!w || !w.scoped) return;
  scoped = !scoped;
  camera.fov = scoped ? 25 : BASE_FOV; camera.updateProjectionMatrix();
}

const raycaster = new THREE.Raycaster(); raycaster.far = 220;

function tryShoot(t) {
  if (!me.alive || !pointerLocked || reloading || phase === "buy") return;
  const w = curStats(); if (!w) return;
  if (t - lastShot < w.fireRate) return;
  if (w.slot === "grenade") { throwGrenade(t); return; }
  if (w.slot !== "melee") {
    const a = ammo[curWeapon()];
    if (!a || a.mag <= 0) { startReload(); return; }
    a.mag--;
  }
  lastShot = t;
  refreshWeaponHud();
  flash.intensity = 3; setTimeout(() => (flash.intensity = 0), 45);
  gunGroup.position.z = 0.06;
  pitch += (w.spread || 0.01) * 0.5; // recoil kick
  Sfx.playShot(curWeapon());

  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  // apply spread
  if (w.spread) { dir.x += (Math.random() - 0.5) * w.spread; dir.y += (Math.random() - 0.5) * w.spread; dir.normalize(); }
  raycaster.set(camera.position.clone(), dir);
  raycaster.far = w.range;

  const targets = [...obstacles];
  for (const id in others) if (others[id].group.visible) targets.push(others[id].body, others[id].head);
  const hits = raycaster.intersectObjects(targets, false);
  let end = camera.position.clone().add(dir.clone().multiplyScalar(w.range));
  if (hits.length) {
    end = hits[0].point;
    const ud = hits[0].object.userData;
    if (ud && ud.playerId) {
      socket.emit("hit", { targetId: ud.playerId, weapon: curWeapon(), headshot: ud.part === "head" });
      hit();
    }
  }
  const from = camera.position.clone().add(dir.clone().multiplyScalar(1.2)).add(new THREE.Vector3(0, -0.15, 0));
  spawnTracer(from, end);
  socket.emit("shoot", { from: { x: from.x, y: from.y, z: from.z }, to: { x: end.x, y: end.y, z: end.z }, weapon: curWeapon() });
}

function throwGrenade(t) {
  const a = ammo.grenade; if (!a || a.mag <= 0) return;
  a.mag = 0; lastShot = t; refreshWeaponHud();
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const land = camera.position.clone().add(dir.multiplyScalar(18));
  land.y = 0.5; collide(land);
  socket.emit("grenade", { from: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, x: land.x, z: land.z });
  selectSlot(me.weapons.primary ? "primary" : "secondary");
}

function hit() { const h = $("hitmarker"); h.style.opacity = 1; Sfx.playHit(); setTimeout(() => (h.style.opacity = 0), 120); }

function startReload() {
  const w = curStats();
  if (!w || w.slot === "melee" || w.slot === "grenade" || reloading) return;
  const a = ammo[curWeapon()];
  if (!a || a.mag === w.mag || a.reserve <= 0) return;
  reloading = true; weaponNameEl.textContent = w.name + " — reloading…";
  Sfx.playReload();
  setTimeout(() => {
    const need = w.mag - a.mag, take = Math.min(need, a.reserve);
    a.mag += take; a.reserve -= take; reloading = false; refreshWeaponHud();
  }, w.reloadMs);
}

// ===================== Bomb plant/defuse =====================
function updateBombAction(t) {
  // Plant (T with bomb in a site)
  const site = inSite(pos.x, pos.z);
  const canPlant = me.alive && myTeam === "T" && me.hasBomb && phase === "live" && site && !bombState;
  const nearBomb = bombState && Math.hypot(pos.x - bombState.x, pos.z - bombState.z) < 3;
  const canDefuse = me.alive && myTeam === "CT" && phase === "live" && bombState && nearBomb;

  if (canPlant && keys["KeyE"]) {
    if (!planting) { planting = true; actionStart = t; socket.emit("plantStart"); }
    showProgress((t - actionStart) / PLANT_TIME, "PLANTING…");
  } else if (canDefuse && keys["KeyE"]) {
    if (!defusing) { defusing = true; actionStart = t; socket.emit("defuseStart"); }
    showProgress((t - actionStart) / DEFUSE_TIME, "DEFUSING…");
  } else {
    if (planting) { socket.emit("plantStop"); planting = false; }
    if (defusing) { socket.emit("defuseStop"); defusing = false; }
    progressEl.style.display = "none";
    // hint
    if (canPlant) hintMsg("Hold E to plant");
    else if (canDefuse) hintMsg("Hold E to defuse");
    else hintMsg("");
  }

  // bomb HUD timer + ticking
  if (bombState) {
    const left = Math.max(0, bombTime - (Date.now() - bombState.plantedAt));
    bombHudEl.textContent = "💣 " + (left / 1000).toFixed(1) + "s";
    if (bombMesh) {
      const blink = Math.floor(Date.now() / Math.max(120, left / 30)) % 2;
      bombMesh.userData.led.material.emissiveIntensity = blink ? 2 : 0.2;
    }
  }
}
function inSite(x, z) {
  for (const k in MAP.sites) { const s = MAP.sites[k]; if ((x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r) return k; }
  return null;
}
function showProgress(frac, label) {
  progressEl.style.display = "block";
  progressBar.style.width = Math.min(100, frac * 100) + "%";
  progressLabel.textContent = label;
}
function hintMsg(text) { $("hint").textContent = text; }

// ===================== Buy menu =====================
let buyOpen = false;
function toggleBuy() {
  if (phase !== "buy" && phase !== "warmup") { flashMsg("Can only buy during buy phase", "#f55"); return; }
  buyOpen = !buyOpen;
  $("buyMenu").style.display = buyOpen ? "block" : "none";
  if (buyOpen) { document.exitPointerLock(); renderBuyMenu(); }
  else if (started) lockPointer();
}
function renderBuyMenu() {
  if (!buyOpen) return;
  const order = ["pistol", "m16", "m4", "ak47", "awp", "grenade"];
  let html = "";
  for (const id of order) {
    const w = WEAPONS[id]; if (!w) continue;
    const owned = Object.values(me.weapons).includes(id);
    const afford = me.money >= w.price;
    html += `<div class="buyItem ${owned ? "owned" : afford ? "" : "broke"}" data-item="${id}">
      <span>${w.name} <small>${w.he}</small></span><span>${owned ? "OWNED" : "$" + w.price}</span></div>`;
  }
  const armorOwned = me.armor >= 100;
  html += `<div class="buyItem ${armorOwned ? "owned" : me.money >= 650 ? "" : "broke"}" data-item="armor">
    <span>Kevlar Armor</span><span>${armorOwned ? "OWNED" : "$650"}</span></div>`;
  $("buyList").innerHTML = html;
  $("buyMoney").textContent = "$" + me.money;
  $("buyList").querySelectorAll(".buyItem").forEach((el) => {
    el.onclick = () => { socket.emit("buy", { item: el.dataset.item }); };
  });
}

// ===================== Chat =====================
let chatTeamOnly = false;
function openChat(teamOnly) {
  chatOpen = true; chatTeamOnly = teamOnly;
  document.exitPointerLock();
  const box = $("chatInput");
  box.placeholder = teamOnly ? "Team message…" : "All message…";
  $("chatInputWrap").style.display = "block"; box.value = ""; box.focus();
}
function closeChat() { chatOpen = false; $("chatInputWrap").style.display = "none"; if (started && !buyOpen) lockPointer(); }
$("chatInput").addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") {
    const v = e.target.value.trim();
    if (v) socket.emit("chat", { text: v, teamOnly: chatTeamOnly });
    closeChat();
  } else if (e.key === "Escape") closeChat();
});
function addChat(html) {
  const div = document.createElement("div"); div.className = "chatLine"; div.innerHTML = html;
  $("chatLog").appendChild(div);
  while ($("chatLog").children.length > 8) $("chatLog").firstChild.remove();
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
  setTimeout(() => { if (div.parentNode) div.remove(); }, 12000);
}

// ===================== Messages =====================
let msgTimer = null;
function flashMsg(text, color) {
  if (!text) return;
  msgEl.textContent = text; msgEl.style.color = color || "#fff";
  clearTimeout(msgTimer); msgTimer = setTimeout(() => (msgEl.textContent = ""), 2500);
}

// ===================== Game loop =====================
let started = false, lastTime = 0, lastNet = 0, footTimer = 0;
function startGame() {
  $("menu").style.display = "none";
  $("crosshair").style.display = "block"; $("hud").style.display = "flex";
  $("topBar").style.display = "flex";
  started = true; Sfx.initAudio();
  lockPointer();
  refreshWeaponHud();
  requestAnimationFrame(loop);
}

function loop(time) {
  requestAnimationFrame(loop);
  const dt = Math.min((time - lastTime) / 1000, 0.05); lastTime = time;

  if (me.alive && phase !== "buy" && !buyOpen && !chatOpen) {
    const speed = keys["ShiftLeft"] ? WALK : RUN;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const move = new THREE.Vector3();
    if (keys["KeyW"]) move.add(f); if (keys["KeyS"]) move.sub(f);
    if (keys["KeyD"]) move.add(r); if (keys["KeyA"]) move.sub(r);
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar(speed);
    vel.x = move.x; vel.z = move.z;
    if (keys["Space"] && onGround) { vel.y = JUMP_V; onGround = false; }
    vel.y -= GRAVITY * dt;
    pos.x += vel.x * dt; pos.z += vel.z * dt; pos.y += vel.y * dt;

    let groundY = EYE;
    for (const m of obstacles) {
      const g = m.geometry.parameters; const top = m.position.y + g.height / 2;
      if (pos.x > m.position.x - g.width / 2 - RADIUS && pos.x < m.position.x + g.width / 2 + RADIUS &&
          pos.z > m.position.z - g.depth / 2 - RADIUS && pos.z < m.position.z + g.depth / 2 + RADIUS &&
          pos.y - EYE >= top - 0.4 && top + EYE > groundY) groundY = top + EYE;
    }
    if (pos.y <= groundY) { pos.y = groundY; vel.y = 0; onGround = true; }
    collide(pos);

    if (moving && onGround) { footTimer += dt; if (footTimer > 0.4) { Sfx.playFootstep(); footTimer = 0; } }
    if (mouseDown) tryShoot(time);
  }

  camera.position.copy(pos);
  camera.rotation.set(0, 0, 0); camera.rotateY(yaw); camera.rotateX(pitch);
  gunGroup.position.z += (0 - gunGroup.position.z) * 0.15;
  gunGroup.visible = !scoped;

  for (const id in others) {
    const o = others[id];
    o.group.position.lerp(o.target, 0.25);
    o.group.rotation.y += (o.targetRy - o.group.rotation.y) * 0.25;
  }

  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].t += dt; tracers[i].line.material.opacity = Math.max(0, 0.9 - tracers[i].t * 4);
    if (tracers[i].t > 0.25) { scene.remove(tracers[i].line); tracers.splice(i, 1); }
  }

  if (started) updateBombAction(time);
  updateTopBar();

  if (socket && me.alive && phase !== "buy" && time - lastNet > 50) {
    lastNet = time;
    socket.emit("move", { x: pos.x, y: pos.y, z: pos.z, ry: yaw });
  }
  renderer.render(scene, camera);
}

function updateTopBar() {
  $("ctScore").textContent = scores.CT;
  $("tScore").textContent = scores.T;
  let label = phase.toUpperCase();
  let secs = phaseEndsAt ? Math.max(0, (phaseEndsAt - Date.now()) / 1000) : 0;
  if (phase === "buy") label = "BUY";
  else if (phase === "live") label = "LIVE";
  else if (phase === "roundend") label = "ROUND OVER";
  else if (phase === "warmup") { label = "WARMUP"; secs = 0; }
  phaseLabelEl.textContent = label;
  roundTimerEl.textContent = secs ? Math.ceil(secs) + "s" : "--";
}

// ===================== Menu / team select =====================
let chosenTeam = "auto";
document.querySelectorAll(".teamBtn").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".teamBtn").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel"); chosenTeam = b.dataset.team;
  });
});
$("playBtn").addEventListener("click", () => {
  const name = $("nameInput").value.trim() || "Player" + Math.floor(Math.random() * 999);
  $("menuStatus").textContent = "Connecting…";
  connect(name, chosenTeam);
});
$("nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("playBtn").click(); });

// In-game team switch (M key)
addEventListener("keydown", (e) => {
  if (chatOpen || !started) return;
  if (e.code === "KeyM") $("teamSwitch").style.display = $("teamSwitch").style.display === "block" ? "none" : "block";
});
document.querySelectorAll(".switchBtn").forEach((b) => {
  b.addEventListener("click", () => {
    socket.emit("switchTeam", { team: b.dataset.team });
    myTeam = b.dataset.team; $("teamSwitch").style.display = "none";
  });
});
