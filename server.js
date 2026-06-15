const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const TICK_RATE = 20; // snapshots per second
const RESPAWN_MS = 3000;
const MAX_HP = 100;
const DAMAGE = 27;
const HEADSHOT_DAMAGE = 100;
const MAX_SHOT_RANGE = 120;

// Spawn points per team (must be clear spots on the map in public/game.js)
const SPAWNS = {
  CT: [
    { x: -28, z: -28 }, { x: -22, z: -28 }, { x: -28, z: -22 }, { x: -24, z: -24 },
  ],
  T: [
    { x: 28, z: 28 }, { x: 22, z: 28 }, { x: 28, z: 22 }, { x: 24, z: 24 },
  ],
};

const players = {}; // id -> player state
const scores = { CT: 0, T: 0 };

function teamCounts() {
  let ct = 0, t = 0;
  for (const id in players) players[id].team === "CT" ? ct++ : t++;
  return { ct, t };
}

function pickSpawn(team) {
  const list = SPAWNS[team];
  return list[Math.floor(Math.random() * list.length)];
}

function sanitizeName(name) {
  const n = String(name || "").replace(/[^\w \-\[\]\.]/g, "").trim().slice(0, 16);
  return n.length ? n : "Player";
}

io.on("connection", (socket) => {
  socket.on("join", (data) => {
    const { ct, t } = teamCounts();
    const team = ct <= t ? "CT" : "T";
    const spawn = pickSpawn(team);
    players[socket.id] = {
      id: socket.id,
      name: sanitizeName(data && data.name),
      team,
      x: spawn.x, y: 1.7, z: spawn.z, ry: 0,
      hp: MAX_HP,
      alive: true,
      kills: 0,
      deaths: 0,
    };
    socket.emit("init", { id: socket.id, players, scores });
    socket.broadcast.emit("playerJoined", players[socket.id]);
    io.emit("feed", { text: `${players[socket.id].name} joined (${team})` });
  });

  socket.on("move", (d) => {
    const p = players[socket.id];
    if (!p || !p.alive || !d) return;
    // Basic sanity clamp so a tampered client can't teleport outside the map
    p.x = Math.max(-39, Math.min(39, +d.x || 0));
    p.y = Math.max(0, Math.min(20, +d.y || 0));
    p.z = Math.max(-39, Math.min(39, +d.z || 0));
    p.ry = +d.ry || 0;
  });

  socket.on("shoot", (d) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    socket.broadcast.emit("shot", { id: socket.id, from: d.from, to: d.to });
  });

  socket.on("hit", (d) => {
    const shooter = players[socket.id];
    const target = d && players[d.targetId];
    if (!shooter || !shooter.alive || !target || !target.alive) return;
    if (target.team === shooter.team) return; // no friendly fire
    // Server-side range check (anti-cheat lite)
    const dx = shooter.x - target.x, dz = shooter.z - target.z;
    if (Math.sqrt(dx * dx + dz * dz) > MAX_SHOT_RANGE) return;

    const dmg = d.headshot ? HEADSHOT_DAMAGE : DAMAGE;
    target.hp -= dmg;
    io.to(target.id).emit("damaged", { hp: Math.max(0, target.hp), by: shooter.name });

    if (target.hp <= 0) {
      target.alive = false;
      target.deaths++;
      shooter.kills++;
      scores[shooter.team]++;
      io.emit("kill", {
        killerId: shooter.id, killerName: shooter.name, killerTeam: shooter.team,
        victimId: target.id, victimName: target.name, victimTeam: target.team,
        headshot: !!d.headshot, scores,
      });
      setTimeout(() => {
        const t = players[target.id];
        if (!t) return; // disconnected while dead
        const spawn = pickSpawn(t.team);
        t.x = spawn.x; t.y = 1.7; t.z = spawn.z;
        t.hp = MAX_HP;
        t.alive = true;
        io.emit("respawn", { id: t.id, x: t.x, y: t.y, z: t.z, hp: t.hp });
      }, RESPAWN_MS);
    }
  });

  socket.on("disconnect", () => {
    const p = players[socket.id];
    if (p) {
      io.emit("feed", { text: `${p.name} left` });
      delete players[socket.id];
      io.emit("playerLeft", { id: socket.id });
    }
  });
});

// Broadcast world snapshot
setInterval(() => {
  const snapshot = {};
  for (const id in players) {
    const p = players[id];
    snapshot[id] = { x: p.x, y: p.y, z: p.z, ry: p.ry, hp: p.hp, alive: p.alive, kills: p.kills, deaths: p.deaths };
  }
  io.emit("snapshot", snapshot);
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CSGO MVP server running on http://localhost:${PORT}`);
});
