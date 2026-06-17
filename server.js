const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const WEAPONS = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "weapons.json"), "utf8"));
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "mapdata.json"), "utf8"));

// ---------- Tunables ----------
const TICK_RATE = 20;
const BUY_TIME = 15000;     // freeze / buy phase
const ROUND_TIME = 115000;  // live phase
const ROUNDEND_TIME = 5000;
const BOMB_TIME = 40000;
const PLANT_TIME = 3200;
const DEFUSE_TIME = 8000;
const START_MONEY = 800;
const MAX_MONEY = 16000;
const WIN_REWARD = 3000;
const PLANT_BONUS = 300;
const DEFUSE_BONUS = 300;
const MAX_HP = 100;

// ---------- State ----------
const players = {};
const scores = { CT: 0, T: 0 };
const lossStreak = { CT: 0, T: 0 };
let phase = "warmup";       // warmup | buy | live | roundend
let roundNum = 0;
let phaseEndsAt = 0;        // wall-clock ms
let bomb = null;            // { planted, x, z, plantedAt, carrierId }

function now() { return Date.now(); }

function teamCounts() {
  let ct = 0, t = 0;
  for (const id in players) {
    if (players[id].team === "CT") ct++;
    else if (players[id].team === "T") t++;
  }
  return { ct, t };
}
function aliveCounts() {
  let ct = 0, t = 0;
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    if (p.team === "CT") ct++;
    else if (p.team === "T") t++;
  }
  return { ct, t };
}

function pickSpawn(team) {
  const list = MAP.spawns[team] || MAP.spawns.CT;
  return list[Math.floor(Math.random() * list.length)];
}

function sanitize(str, max) {
  return String(str || "").replace(/[^\w \-\[\].!?א-ת]/g, "").trim().slice(0, max);
}

function defaultLoadout() {
  return { primary: null, secondary: "pistol", melee: "knife", grenade: null };
}

function spawnPlayer(p) {
  const s = pickSpawn(p.team);
  p.x = s.x; p.y = 1.7; p.z = s.z;
  p.hp = MAX_HP;
  p.armor = p.boughtArmor ? 100 : 0;
  p.alive = true;
  p.planting = null;
  p.defusing = null;
  // refill ammo for owned weapons
  p.ammo = {};
  for (const slot of ["primary", "secondary", "melee", "grenade"]) {
    const w = p.weapons[slot];
    if (w) p.ammo[w] = { mag: WEAPONS[w].mag, reserve: WEAPONS[w].reserve };
  }
  if (!p.weapons[p.currentSlot] || (p.currentSlot === "primary" && !p.weapons.primary)) {
    p.currentSlot = p.weapons.primary ? "primary" : "secondary";
  }
}

function publicPlayer(p) {
  return {
    id: p.id, name: p.name, team: p.team,
    x: p.x, y: p.y, z: p.z, ry: p.ry,
    hp: p.hp, armor: p.armor, alive: p.alive,
    kills: p.kills, deaths: p.deaths, money: p.money,
    weapons: p.weapons, currentSlot: p.currentSlot,
    streak: p.streak,
  };
}

// ---------- Round flow ----------
function canPlayRounds() {
  const { ct, t } = teamCounts();
  return ct >= 1 && t >= 1;
}

function startBuyPhase() {
  if (!canPlayRounds()) { enterWarmup(); return; }
  phase = "buy";
  roundNum++;
  bomb = null;
  // reset everyone, assign bomb to a random T
  const ts = [];
  for (const id in players) {
    const p = players[id];
    if (p.team === "SPEC") { p.alive = false; continue; }
    spawnPlayer(p);
    p.hasBomb = false;
    if (p.team === "T") ts.push(p);
  }
  if (ts.length) ts[Math.floor(Math.random() * ts.length)].hasBomb = true;
  phaseEndsAt = now() + BUY_TIME;
  io.emit("phase", { phase, roundNum, scores, endsAt: phaseEndsAt, msg: "BUY PHASE" });
  io.emit("state", snapshotFull());
}

function startLivePhase() {
  phase = "live";
  phaseEndsAt = now() + ROUND_TIME;
  io.emit("phase", { phase, roundNum, scores, endsAt: phaseEndsAt, msg: "GO!" });
}

function endRound(winner, reason) {
  if (phase === "roundend") return;
  phase = "roundend";
  scores[winner]++;
  const loser = winner === "CT" ? "T" : "CT";
  // economy
  for (const id in players) {
    const p = players[id];
    if (p.team === winner) addMoney(p, WIN_REWARD);
    else if (p.team === loser) addMoney(p, Math.min(1400 + 500 * lossStreak[loser], 3400));
  }
  lossStreak[loser]++;
  lossStreak[winner] = 0;
  phaseEndsAt = now() + ROUNDEND_TIME;
  io.emit("roundend", { winner, reason, scores, endsAt: phaseEndsAt });
  bomb = null;
}

function enterWarmup() {
  phase = "warmup";
  for (const id in players) {
    if (players[id].team !== "SPEC") spawnPlayer(players[id]);
  }
  io.emit("phase", { phase, roundNum: 0, scores, endsAt: 0, msg: "WARMUP — waiting for both teams" });
  io.emit("state", snapshotFull());
}

function addMoney(p, amt) { p.money = Math.max(0, Math.min(MAX_MONEY, p.money + amt)); }

function snapshotFull() {
  const out = {};
  for (const id in players) out[id] = publicPlayer(players[id]);
  return { players: out, scores, phase, roundNum, bomb };
}

// ---------- Connection ----------
io.on("connection", (socket) => {
  socket.on("join", (data) => {
    let team = data && data.team;
    if (team !== "CT" && team !== "T") {
      const { ct, t } = teamCounts();
      team = ct <= t ? "CT" : "T";
    }
    const p = {
      id: socket.id,
      name: sanitize(data && data.name, 16) || "Player",
      team,
      ry: 0,
      kills: 0, deaths: 0, streak: 0,
      money: START_MONEY,
      weapons: defaultLoadout(),
      currentSlot: "secondary",
      boughtArmor: false,
      hasBomb: false,
    };
    players[socket.id] = p;
    spawnPlayer(p);

    socket.emit("init", {
      id: socket.id, weapons: WEAPONS, map: MAP,
      snapshot: snapshotFull(), phaseEndsAt,
    });
    socket.broadcast.emit("playerJoined", publicPlayer(p));
    io.emit("feed", { text: `${p.name} joined ${team}` });

    if (phase === "warmup" && canPlayRounds()) startBuyPhase();
  });

  socket.on("switchTeam", (data) => {
    const p = players[socket.id];
    if (!p) return;
    let team = data && data.team;
    if (team !== "CT" && team !== "T" && team !== "SPEC") return;
    if (team === p.team) return;
    p.team = team;
    p.alive = false;          // sit out until next round
    p.weapons = defaultLoadout();
    p.hasBomb = false;
    io.emit("feed", { text: `${p.name} switched to ${team}` });
    io.emit("playerUpdate", publicPlayer(p));
    if (phase === "warmup" && canPlayRounds()) startBuyPhase();
  });

  socket.on("buy", (data) => {
    const p = players[socket.id];
    if (!p || p.team === "SPEC") return;
    if (phase !== "buy" && phase !== "warmup") return;
    // must be in own spawn region (near a spawn point) to buy
    const item = data && data.item;
    if (item === "armor") {
      if (p.money < 650 || p.armor >= 100) return;
      addMoney(p, -650); p.armor = 100; p.boughtArmor = true;
      io.to(p.id).emit("bought", { item, money: p.money }); return;
    }
    const w = WEAPONS[item];
    if (!w || p.money < w.price) return;
    addMoney(p, -w.price);
    p.weapons[w.slot] = item;
    p.ammo[item] = { mag: w.mag, reserve: w.reserve };
    if (w.slot === "primary" || w.slot === "secondary") p.currentSlot = w.slot;
    io.to(p.id).emit("bought", { item, slot: w.slot, money: p.money, weapons: p.weapons });
    io.emit("playerUpdate", publicPlayer(p));
  });

  socket.on("switchSlot", (slot) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    if (["primary", "secondary", "melee", "grenade"].includes(slot) && p.weapons[slot]) {
      p.currentSlot = slot;
    }
  });

  socket.on("move", (d) => {
    const p = players[socket.id];
    if (!p || !p.alive || !d) return;
    if (phase === "buy") return; // frozen during buy phase
    // anti-cheat: clamp to map + reject large jumps
    const nx = Math.max(-MAP.bounds + 1, Math.min(MAP.bounds - 1, +d.x || 0));
    const nz = Math.max(-MAP.bounds + 1, Math.min(MAP.bounds - 1, +d.z || 0));
    const dx = nx - p.x, dz = nz - p.z;
    if (dx * dx + dz * dz > 16) { // > 4 units in one update = reject
      socket.emit("correct", { x: p.x, y: p.y, z: p.z });
    } else {
      p.x = nx; p.z = nz; p.y = Math.max(0, Math.min(20, +d.y || 1.7));
    }
    p.ry = +d.ry || 0;
  });

  socket.on("shoot", (d) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    socket.broadcast.emit("shot", { id: socket.id, from: d.from, to: d.to, weapon: d.weapon });
  });

  socket.on("hit", (d) => {
    const shooter = players[socket.id];
    const target = d && players[d.targetId];
    if (!shooter || !shooter.alive || !target || !target.alive) return;
    if (target.team === shooter.team) return;
    const wid = d.weapon;
    const w = WEAPONS[wid];
    if (!w) return;
    // verify shooter owns this weapon
    const owns = Object.values(shooter.weapons).includes(wid);
    if (!owns) return;
    const dx = shooter.x - target.x, dz = shooter.z - target.z;
    if (Math.sqrt(dx * dx + dz * dz) > w.range + 5) return;

    applyDamage(shooter, target, w.damage * (d.headshot ? w.headMult : 1), wid, d.headshot);
  });

  socket.on("grenade", (d) => {
    const p = players[socket.id];
    if (!p || !p.alive || p.weapons.grenade !== "grenade") return;
    if (!p.ammo.grenade || p.ammo.grenade.mag <= 0) return;
    p.ammo.grenade.mag = 0;
    const g = WEAPONS.grenade;
    const landing = { x: +d.x || p.x, z: +d.z || p.z };
    io.emit("grenadeThrow", { from: d.from, to: landing, id: p.id });
    setTimeout(() => {
      io.emit("explosion", { x: landing.x, z: landing.z });
      for (const id in players) {
        const t = players[id];
        if (!t.alive || t.team === p.team) continue;
        const ddx = t.x - landing.x, ddz = t.z - landing.z;
        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist < g.splash) {
          const dmg = g.damage * (1 - dist / g.splash);
          applyDamage(p, t, dmg, "grenade", false);
        }
      }
    }, g.fuseMs);
  });

  // Bomb plant / defuse (hold)
  socket.on("plantStart", () => {
    const p = players[socket.id];
    if (!p || !p.alive || p.team !== "T" || !p.hasBomb || phase !== "live" || bomb) return;
    if (!inAnySite(p.x, p.z)) return;
    p.planting = now();
  });
  socket.on("plantStop", () => { const p = players[socket.id]; if (p) p.planting = null; });

  socket.on("defuseStart", () => {
    const p = players[socket.id];
    if (!p || !p.alive || p.team !== "CT" || !bomb || !bomb.planted || phase !== "live") return;
    const dx = p.x - bomb.x, dz = p.z - bomb.z;
    if (dx * dx + dz * dz > 9) return; // within 3 units
    p.defusing = now();
  });
  socket.on("defuseStop", () => { const p = players[socket.id]; if (p) p.defusing = null; });

  socket.on("chat", (d) => {
    const p = players[socket.id];
    if (!p || !d) return;
    const text = sanitize(d.text, 120);
    if (!text) return;
    const payload = { name: p.name, team: p.team, text, teamOnly: !!d.teamOnly };
    if (d.teamOnly) {
      for (const id in players) if (players[id].team === p.team) io.to(id).emit("chat", payload);
    } else {
      io.emit("chat", payload);
    }
  });

  socket.on("disconnect", () => {
    const p = players[socket.id];
    if (!p) return;
    io.emit("feed", { text: `${p.name} left` });
    delete players[socket.id];
    io.emit("playerLeft", { id: socket.id });
    if (phase !== "warmup" && !canPlayRounds()) enterWarmup();
  });
});

function applyDamage(shooter, target, dmg, wid, headshot) {
  if (target.armor > 0) {
    target.armor = Math.max(0, target.armor - dmg * 0.5);
    dmg *= 0.66;
  }
  target.hp -= dmg;
  io.to(target.id).emit("damaged", { hp: Math.max(0, target.hp), armor: target.armor, by: shooter.name, dir: { x: shooter.x, z: shooter.z } });
  if (target.hp <= 0) killPlayer(shooter, target, wid, headshot);
}

function killPlayer(shooter, target, wid, headshot) {
  target.alive = false;
  target.deaths++;
  target.streak = 0;
  target.planting = null; target.defusing = null;
  shooter.kills++;
  shooter.streak++;
  addMoney(shooter, WEAPONS[wid] ? WEAPONS[wid].killReward : 300);
  // drop bomb to nearest alive teammate if carrier dies
  if (target.hasBomb) {
    target.hasBomb = false;
    const mates = Object.values(players).filter((q) => q.team === target.team && q.alive);
    if (mates.length) mates[0].hasBomb = true;
  }
  io.emit("kill", {
    killerId: shooter.id, killerName: shooter.name, killerTeam: shooter.team,
    victimId: target.id, victimName: target.name, victimTeam: target.team,
    weapon: wid, headshot: !!headshot, streak: shooter.streak,
  });
}

function inAnySite(x, z) {
  for (const k of Object.keys(MAP.sites)) {
    const s = MAP.sites[k];
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return k;
  }
  return null;
}

// ---------- Main tick ----------
setInterval(() => {
  const t = now();

  // Phase transitions
  if (phase === "buy" && t >= phaseEndsAt) startLivePhase();
  else if (phase === "roundend" && t >= phaseEndsAt) startBuyPhase();
  else if (phase === "live") {
    handlePlantDefuse(t);
    handleBombTimer(t);
    checkWinConditions(t);
  }

  // Broadcast movement snapshot
  const snap = {};
  for (const id in players) {
    const p = players[id];
    snap[id] = { x: p.x, y: p.y, z: p.z, ry: p.ry, hp: p.hp, armor: p.armor, alive: p.alive, kills: p.kills, deaths: p.deaths, streak: p.streak, team: p.team, money: p.money, hasBomb: p.hasBomb, slot: p.currentSlot };
  }
  io.emit("snapshot", { players: snap, bomb });
}, 1000 / TICK_RATE);

function handlePlantDefuse(t) {
  for (const id in players) {
    const p = players[id];
    if (p.planting && !bomb) {
      if (!inAnySite(p.x, p.z) || !p.alive) { p.planting = null; continue; }
      if (t - p.planting >= PLANT_TIME) {
        bomb = { planted: true, x: p.x, z: p.z, plantedAt: t, site: inAnySite(p.x, p.z) };
        p.planting = null; p.hasBomb = false;
        addMoney(p, PLANT_BONUS);
        io.emit("bombPlanted", { x: bomb.x, z: bomb.z, site: bomb.site, plantedAt: bomb.plantedAt, bombTime: BOMB_TIME });
        io.emit("feed", { text: `${p.name} planted the bomb at ${bomb.site}` });
      }
    }
    if (p.defusing && bomb && bomb.planted) {
      const dx = p.x - bomb.x, dz = p.z - bomb.z;
      if (dx * dx + dz * dz > 9 || !p.alive) { p.defusing = null; continue; }
      if (t - p.defusing >= DEFUSE_TIME) {
        addMoney(p, DEFUSE_BONUS);
        io.emit("feed", { text: `${p.name} defused the bomb` });
        endRound("CT", "defused");
        return;
      }
    }
  }
}

function handleBombTimer(t) {
  if (!bomb || !bomb.planted) return;
  if (t - bomb.plantedAt >= BOMB_TIME) {
    // explode
    io.emit("explosion", { x: bomb.x, z: bomb.z, big: true });
    for (const id in players) {
      const p = players[id];
      if (!p.alive) continue;
      const dx = p.x - bomb.x, dz = p.z - bomb.z;
      if (dx * dx + dz * dz < 225) { p.alive = false; p.deaths++; } // 15u blast
    }
    endRound("T", "exploded");
  }
}

function checkWinConditions(t) {
  const { ct, t: tt } = aliveCounts();
  if (!bomb || !bomb.planted) {
    if (tt === 0) { endRound("CT", "elimination"); return; }
    if (ct === 0) { endRound("T", "elimination"); return; }
    if (t >= phaseEndsAt) { endRound("CT", "time"); return; } // bomb not planted -> CT win
  } else {
    if (ct === 0) { endRound("T", "elimination"); return; } // no one to defuse
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`CSGO server running on http://localhost:${PORT}`));
