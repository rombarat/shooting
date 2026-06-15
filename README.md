# CSGO MVP — Multiplayer Browser FPS

A minimal Counter-Strike-style multiplayer FPS that runs in the browser. Three.js client, Node.js + Socket.IO server with authoritative health/kills, two teams (CT vs T), kill feed, scoreboard, and respawns.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Shoot (hold for auto) |
| R | Reload |
| Space | Jump |
| Shift | Walk (slow) |
| Tab | Scoreboard |

Headshots are instant kills. Body shots deal 27 damage. Respawn after 3 seconds.

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

- `server.js` — Express serves `public/`, Socket.IO relays positions (20 ticks/s), validates hits, tracks HP/kills/teams, handles respawns.
- `public/game.js` — Three.js renderer, first-person controller (pointer lock, gravity, jump, AABB collision), hitscan shooting via raycast, interpolation of other players.
- `public/index.html` — HUD (health, ammo, kill feed, team score, scoreboard) and menu.

## MVP limitations (next steps if you want to grow it)

- Movement is client-authoritative (a hacked client could speed-hack). Real games simulate movement on the server.
- No rounds/bomb/economy — it's team deathmatch.
- Hit detection trusts the client's raycast (server only checks range and friendly fire).
- No lag compensation; high-ping players will feel hits register late.
