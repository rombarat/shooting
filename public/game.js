import * as THREE from "three";

// ---------- Renderer / scene ----------
const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a8c8);
scene.fog = new THREE.Fog(0x87a8c8, 60, 140);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);

const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
sun.position.set(30, 60, 20);
sun.castShadow = true;
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x99aabb, 1.1));

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Map ----------
const MAP_HALF = 40;
const obstacles = []; // meshes used for collision + bullet blocking

const floorMat = new THREE.MeshStandardMaterial({ color: 0xb8a878 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function addBox(x, y, z, w, h, d, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  obstacles.push(m);
  return m;
}

// Outer walls
const WALL = 0x8a7f6a;
addBox(0, 0, -MAP_HALF, MAP_HALF * 2, 6, 1, WALL);
addBox(0, 0, MAP_HALF, MAP_HALF * 2, 6, 1, WALL);
addBox(-MAP_HALF, 0, 0, 1, 6, MAP_HALF * 2, WALL);
addBox(MAP_HALF, 0, 0, 1, 6, MAP_HALF * 2, WALL);

// Mid structure ("mid") + crates + side walls — dust2-ish vibes
const CRATE = 0x9c6b30, STONE = 0xa09484;
addBox(0, 0, 0, 10, 4, 10, STONE);              // central building
addBox(-12, 0, 8, 3, 3, 3, CRATE);
addBox(-12, 0, 11, 3, 3, 3, CRATE);
addBox(-12, 3, 9.5, 3, 3, 3, CRATE);            // stacked crate
addBox(14, 0, -10, 3, 3, 3, CRATE);
addBox(17, 0, -10, 3, 3, 3, CRATE);
addBox(8, 0, 18, 3, 3, 3, CRATE);
addBox(-18, 0, -14, 3, 3, 3, CRATE);
addBox(-6, 0, -20, 14, 4, 2, STONE);            // long wall A side
addBox(10, 0, 12, 2, 4, 14, STONE);             // long wall B side
addBox(-20, 0, 20, 8, 4, 2, STONE);
addBox(22, 0, -22, 2, 4, 10, STONE);

// ---------- Player physics ----------
const EYE = 1.7, RADIUS = 0.5, GRAVITY = 28, JUMP_V = 9, SPEED = 9, WALK = 4.5;
const pos = new THREE.Vector3(0, EYE, 30);
const vel = new THREE.Vector3();
let yaw = 0, pitch = 0, onGround = true;

const keys = {};
document.addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "Tab") { e.preventDefault(); scoreboardEl.style.display = "block"; } });
document.addEventListener("keyup", (e) => { keys[e.code] = false; if (e.code === "Tab") scoreboardEl.style.display = "none"; });

function collide(p) {
  // Keep inside map
  p.x = Math.max(-MAP_HALF + 1, Math.min(MAP_HALF - 1, p.x));
  p.z = Math.max(-MAP_HALF + 1, Math.min(MAP_HALF - 1, p.z));
  // Push out of obstacle AABBs (2D, feet-level check)
  for (const m of obstacles) {
    const g = m.geometry.parameters;
    const minX = m.position.x - g.width / 2 - RADIUS, maxX = m.position.x + g.width / 2 + RADIUS;
    const minZ = m.position.z - g.depth / 2 - RADIUS, maxZ = m.position.z + g.depth / 2 + RADIUS;
    const top = m.position.y + g.height / 2;
    if (p.y - EYE > top - 0.3) continue; // standing on top is fine
    if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
      const dxMin = p.x - minX, dxMax = maxX - p.x, dzMin = p.z - minZ, dzMax = maxZ - p.z;
      const m1 = Math.min(dxMin, dxMax, dzMin, dzMax);
      if (m1 === dxMin) p.x = minX; else if (m1 === dxMax) p.x = maxX;
      else if (m1 === dzMin) p.z = minZ; else p.z = maxZ;
    }
  }
}

// ---------- Other players ----------
const others = {}; // id -> { group, body, head, nameSprite, data }
const playerMeta = {}; // id -> { name, team, kills, deaths } (includes me)

function makeNameSprite(name, team) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = team === "CT" ? "#7db8ff" : "#ffd966";
  ctx.fillText(name, 128, 42);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}

function addOtherPlayer(p) {
  const color = p.team === "CT" ? 0x3b6ea5 : 0xc8a040;
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 12), new THREE.MeshStandardMaterial({ color }));
  body.position.y = -0.5;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), new THREE.MeshStandardMaterial({ color: 0xd8b89a }));
  head.position.y = 0.45;
  head.castShadow = true;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  gun.position.set(0.3, -0.1, -0.5);
  const nameSprite = makeNameSprite(p.name, p.team);
  nameSprite.position.y = 1.1;
  group.add(body, head, gun, nameSprite);
  group.position.set(p.x, p.y, p.z);
  group.visible = p.alive !== false;
  // tag meshes so raycast hits resolve to a player
  body.userData = { playerId: p.id, part: "body" };
  head.userData = { playerId: p.id, part: "head" };
  scene.add(group);
  others[p.id] = { group, body, head, target: new THREE.Vector3(p.x, p.y, p.z), targetRy: p.ry || 0 };
  playerMeta[p.id] = { name: p.name, team: p.team, kills: p.kills || 0, deaths: p.deaths || 0 };
}

function removeOtherPlayer(id) {
  if (others[id]) { scene.remove(others[id].group); delete others[id]; }
  delete playerMeta[id];
}

// ---------- Weapon viewmodel ----------
const gunGroup = new THREE.Group();
const gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
gunMesh.position.set(0.25, -0.22, -0.5);
const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3), new THREE.MeshStandardMaterial({ color: 0x333333 }));
barrel.rotation.x = Math.PI / 2;
barrel.position.set(0.25, -0.18, -0.9);
const flash = new THREE.PointLight(0xffaa33, 0, 4);
flash.position.set(0.25, -0.18, -1.1);
gunGroup.add(gunMesh, barrel, flash);
camera.add(gunGroup);
scene.add(camera);

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const hpEl = $("hp"), ammoEl = $("ammo"), msgEl = $("msg"), feedEl = $("killfeed");
const scoreboardEl = $("scoreboard"), scoreRowsEl = $("scoreRows");
const hitmarkerEl = $("hitmarker"), vignetteEl = $("damageVignette");

let hp = 100, ammo = 30, alive = true, reloading = false;
const MAG = 30, FIRE_INTERVAL = 110, RELOAD_MS = 2200;

function setHP(v) {
  hp = v;
  hpEl.textContent = Math.max(0, Math.round(v));
  hpEl.className = v <= 30 ? "low" : "";
}
function setAmmo(v) {
  ammo = v;
  ammoEl.innerHTML = `${v} <small>/ &infin;</small>`;
}
function addFeed(html) {
  const div = document.createElement("div");
  div.className = "feedItem";
  div.innerHTML = html;
  feedEl.prepend(div);
  while (feedEl.children.length > 6) feedEl.lastChild.remove();
  setTimeout(() => div.remove(), 7000);
}
function refreshScoreboard() {
  const rows = Object.entries(playerMeta)
    .sort((a, b) => b[1].kills - a[1].kills)
    .map(([id, m]) => {
      const me = id === myId ? ' style="color:#fff;font-weight:bold"' : "";
      const tc = m.team === "CT" ? "ct" : "t";
      return `<tr${me}><td>${m.name}</td><td class="${tc}">${m.team}</td><td>${m.kills}</td><td>${m.deaths}</td></tr>`;
    }).join("");
  scoreRowsEl.innerHTML = rows;
}

// ---------- Tracers ----------
const tracers = [];
function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from.x, from.y, from.z),
    new THREE.Vector3(to.x, to.y, to.z),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, t: 0 });
}

// ---------- Networking ----------
let socket = null, myId = null;
let myTeam = "CT";

function connect(name) {
  socket = io();
  socket.emit("join", { name });

  socket.on("init", (data) => {
    myId = data.id;
    const me = data.players[myId];
    myTeam = me.team;
    pos.set(me.x, me.y, me.z);
    playerMeta[myId] = { name: me.name, team: me.team, kills: 0, deaths: 0 };
    for (const id in data.players) {
      if (id !== myId) addOtherPlayer(data.players[id]);
    }
    $("ctScore").textContent = data.scores.CT;
    $("tScore").textContent = data.scores.T;
    startGame();
  });

  socket.on("playerJoined", (p) => addOtherPlayer(p));
  socket.on("playerLeft", (d) => removeOtherPlayer(d.id));
  socket.on("feed", (d) => addFeed(d.text));

  socket.on("snapshot", (snap) => {
    for (const id in snap) {
      if (id === myId) {
        const m = playerMeta[myId];
        if (m) { m.kills = snap[id].kills; m.deaths = snap[id].deaths; }
        continue;
      }
      const o = others[id];
      if (!o) continue;
      o.target.set(snap[id].x, snap[id].y, snap[id].z);
      o.targetRy = snap[id].ry;
      o.group.visible = snap[id].alive;
      const m = playerMeta[id];
      if (m) { m.kills = snap[id].kills; m.deaths = snap[id].deaths; }
    }
    if (scoreboardEl.style.display === "block") refreshScoreboard();
  });

  socket.on("shot", (d) => spawnTracer(d.from, d.to));

  socket.on("damaged", (d) => {
    setHP(d.hp);
    vignetteEl.style.opacity = 0.9;
    setTimeout(() => (vignetteEl.style.opacity = 0), 250);
  });

  socket.on("kill", (d) => {
    const kc = d.killerTeam === "CT" ? "ct" : "t", vc = d.victimTeam === "CT" ? "ct" : "t";
    addFeed(`<span class="${kc}">${d.killerName}</span> ${d.headshot ? "🎯" : "🔫"} <span class="${vc}">${d.victimName}</span>`);
    $("ctScore").textContent = d.scores.CT;
    $("tScore").textContent = d.scores.T;
    if (d.victimId === myId) {
      alive = false;
      msgEl.textContent = `Killed by ${d.killerName}`;
      setHP(0);
    }
    if (d.killerId === myId) {
      hitmarkerEl.style.opacity = 1;
      setTimeout(() => (hitmarkerEl.style.opacity = 0), 200);
    }
  });

  socket.on("respawn", (d) => {
    if (d.id === myId) {
      pos.set(d.x, d.y, d.z);
      vel.set(0, 0, 0);
      setHP(d.hp);
      alive = true;
      msgEl.textContent = "";
      setAmmo(MAG);
    } else if (others[d.id]) {
      others[d.id].target.set(d.x, d.y, d.z);
      others[d.id].group.position.set(d.x, d.y, d.z);
      others[d.id].group.visible = true;
    }
  });
}

// ---------- Input: pointer lock + shooting ----------
let pointerLocked = false, lastShot = 0, mouseDown = false;

canvas.addEventListener("click", () => {
  if (started && !pointerLocked) canvas.requestPointerLock();
});
document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
});
document.addEventListener("mousemove", (e) => {
  if (!pointerLocked) return;
  yaw -= e.movementX * 0.0023;
  pitch -= e.movementY * 0.0023;
  pitch = Math.max(-1.55, Math.min(1.55, pitch));
});
document.addEventListener("mousedown", () => (mouseDown = true));
document.addEventListener("mouseup", () => (mouseDown = false));

const raycaster = new THREE.Raycaster();
raycaster.far = 150;

function tryShoot(now) {
  if (!alive || !pointerLocked || reloading) return;
  if (now - lastShot < FIRE_INTERVAL) return;
  if (ammo <= 0) { startReload(); return; }
  lastShot = now;
  setAmmo(ammo - 1);

  // muzzle flash + recoil
  flash.intensity = 3;
  setTimeout(() => (flash.intensity = 0), 50);
  gunGroup.position.z = 0.06;
  pitch += 0.006;

  // Raycast from camera center
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  raycaster.set(camera.position.clone(), dir);

  const targets = [...obstacles];
  for (const id in others) {
    if (others[id].group.visible) targets.push(others[id].body, others[id].head);
  }
  const hits = raycaster.intersectObjects(targets, false);
  let end = camera.position.clone().add(dir.clone().multiplyScalar(120));
  if (hits.length) {
    end = hits[0].point;
    const ud = hits[0].object.userData;
    if (ud && ud.playerId) {
      socket.emit("hit", { targetId: ud.playerId, headshot: ud.part === "head" });
      hitmarkerEl.style.opacity = 1;
      setTimeout(() => (hitmarkerEl.style.opacity = 0), 150);
    }
  }
  const from = camera.position.clone().add(dir.clone().multiplyScalar(1.2)).add(new THREE.Vector3(0, -0.15, 0));
  spawnTracer(from, end);
  socket.emit("shoot", { from: { x: from.x, y: from.y, z: from.z }, to: { x: end.x, y: end.y, z: end.z } });
}

function startReload() {
  if (reloading || ammo === MAG) return;
  reloading = true;
  ammoEl.innerHTML = `<small>reloading…</small>`;
  setTimeout(() => { reloading = false; setAmmo(MAG); }, RELOAD_MS);
}

// ---------- Game loop ----------
let started = false, lastTime = 0, lastNetSend = 0;

function startGame() {
  $("menu").style.display = "none";
  $("crosshair").style.display = "block";
  $("hud").style.display = "flex";
  $("teamScores").style.display = "flex";
  started = true;
  canvas.requestPointerLock();
  requestAnimationFrame(loop);
}

function loop(time) {
  requestAnimationFrame(loop);
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (alive) {
    // Movement
    const speed = keys["ShiftLeft"] ? WALK : SPEED;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const move = new THREE.Vector3();
    if (keys["KeyW"]) move.add(f);
    if (keys["KeyS"]) move.sub(f);
    if (keys["KeyD"]) move.add(r);
    if (keys["KeyA"]) move.sub(r);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    vel.x = move.x; vel.z = move.z;

    if (keys["Space"] && onGround) { vel.y = JUMP_V; onGround = false; }
    vel.y -= GRAVITY * dt;

    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    pos.y += vel.y * dt;

    // Ground / standing on boxes
    let groundY = EYE;
    for (const m of obstacles) {
      const g = m.geometry.parameters;
      const top = m.position.y + g.height / 2;
      if (
        pos.x > m.position.x - g.width / 2 - RADIUS && pos.x < m.position.x + g.width / 2 + RADIUS &&
        pos.z > m.position.z - g.depth / 2 - RADIUS && pos.z < m.position.z + g.depth / 2 + RADIUS &&
        pos.y - EYE >= top - 0.4 && top + EYE > groundY
      ) groundY = top + EYE;
    }
    if (pos.y <= groundY) { pos.y = groundY; vel.y = 0; onGround = true; }
    collide(pos);

    if (mouseDown) tryShoot(time);
    if (keys["KeyR"]) startReload();
  }

  // Camera
  camera.position.copy(pos);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(yaw);
  camera.rotateX(pitch);
  gunGroup.position.z += (0 - gunGroup.position.z) * 0.15; // recoil recovery

  // Interpolate other players
  for (const id in others) {
    const o = others[id];
    o.group.position.lerp(o.target, 0.25);
    o.group.rotation.y += (o.targetRy - o.group.rotation.y) * 0.25;
  }

  // Fade tracers
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].t += dt;
    tracers[i].line.material.opacity = Math.max(0, 0.9 - tracers[i].t * 4);
    if (tracers[i].t > 0.25) {
      scene.remove(tracers[i].line);
      tracers.splice(i, 1);
    }
  }

  // Send position ~20Hz
  if (socket && alive && time - lastNetSend > 50) {
    lastNetSend = time;
    socket.emit("move", { x: pos.x, y: pos.y, z: pos.z, ry: yaw });
  }

  renderer.render(scene, camera);
}

// ---------- Menu ----------
$("playBtn").addEventListener("click", () => {
  const name = $("nameInput").value.trim() || "Player" + Math.floor(Math.random() * 999);
  $("menuStatus").textContent = "Connecting…";
  connect(name);
});
$("nameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("playBtn").click();
});
