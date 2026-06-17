# CSGO MVP — Multiplayer Browser FPS (Dust2)

A Counter-Strike-style multiplayer FPS in the browser: bomb-defusal rounds, an economy + buy menu, multiple weapons, a de_dust2-inspired map, team selection, sound effects, and text chat. Three.js client, Node.js + Socket.IO authoritative server.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Shoot (hold for auto weapons) |
| 1 / 2 / 3 / 4 | Primary / Pistol / Knife / Grenade |
| R | Reload |
| B | Buy menu (during buy phase) |
| E | Plant bomb (T) / Defuse (CT) — hold |
| Right click | Scope (AWP) |
| M | Switch team |
| Y / U | Chat (all / team) |
| Space | Jump · Shift: walk |
| Tab | Scoreboard |

## Game flow

- **Teams**: pick CT, T, or auto-assign in the menu; switch in-game with **M**.
- **Rounds**: when both teams have a player, rounds begin — **Buy phase** (frozen, 15s) → **Live** → **Round over**. With only one team it's a free warmup.
- **Win a round**: T's plant & detonate the bomb at site **A** or **B**, or eliminate all CTs. CT's defuse the bomb, eliminate all T's, or run out the clock.
- **Economy**: earn money from kills, round wins, plants, and defuses; spend it in the buy menu (**B**).

## Weapons

Knife (סכין), Pistol (אקדח), M16, M4 Rifle (רובה), AK-47, AWP Sniper (רובה צלפים), HE Grenade (רימון). Stats live in [public/weapons.json](public/weapons.json) — tweak prices/damage freely. Headshots apply a per-weapon multiplier; the server validates ownership, range, and friendly fire.

Each weapon has its **own 3D viewmodel, animation, and action** (see [public/viewmodels.js](public/viewmodels.js)):

- **Guns** (pistol/M16/M4/AK/AWP) — distinct models, hitscan fire with muzzle flash, recoil kick, and tracers. The AWP has a scope (right-click).
- **Knife** — a melee blade with a swing animation, short range, no ammo, no tracer. It only hits enemies close in front of you.
- **Grenade** — a thrown projectile that arcs with gravity and bounces; it is NOT hitscan. It explodes after a fuse and deals splash damage server-side.

## Run locally

```
npm install
npm start
```

Open http://localhost:3000 in two browser windows to test multiplayer. To play with friends on your LAN, they can open `http://<your-local-ip>:3000`.

## Deploying — important: Vercel can't host the game server

The game needs a **persistent WebSocket server** (Socket.IO). Vercel only runs short-lived serverless functions, so the multiplayer server **cannot run on Vercel**. Use a host that supports long-running Node processes:

### Option A (easiest): Render.com — free tier

1. Push this folder to a GitHub repo.
2. On https://render.com → New → Web Service → connect the repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Done. You get a public URL like `https://your-game.onrender.com` — share it and play.

(Free tier sleeps after inactivity; first visit takes ~30s to wake.)

### Option B: Railway.app or Fly.io

Same idea — connect repo, they detect Node, deploy. Railway has a small free trial; Fly has a free allowance.

### Option C: Vercel for the client + Render for the server

Possible, but pointless extra work for an MVP — the server already serves the client. Only do this later if you want Vercel's CDN for a landing page.

## Architecture

- `server.js` — Express serves `public/`, Socket.IO relays positions (20 ticks/s). Authoritative: round/phase state machine, economy, weapon damage + ownership/range checks, bomb plant/defuse timers, anti-cheat movement clamps, chat relay.
- `public/game.js` — Three.js renderer, first-person controller (pointer lock, gravity, jump, AABB collision), per-weapon hitscan shooting, weapon switching, buy menu, bomb plant/defuse, grenades, killfeed/scoreboard, chat.
- `public/map.js` + `public/mapdata.json` — the de_dust2-inspired map (A/B sites, mid, long A, tunnels, spawns).
- `public/weapons.json` — shared weapon catalog (loaded by both server and client).
- `public/audio.js` — synthesized sound effects (Web Audio, no asset files).
- `public/index.html` — menu/team-select, HUD, buy menu, chat, scoreboard.

## MVP limitations (next steps if you want to grow it)

- Movement is client-authoritative (a hacked client could speed-hack). Real games simulate movement on the server.
- No rounds/bomb/economy — it's team deathmatch.
- Hit detection trusts the client's raycast (server only checks range and friendly fire).
- No lag compensation; high-ping players will feel hits register late.
