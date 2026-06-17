import * as THREE from "three";

// First-person weapon viewmodels: a distinct 3D model + animations per weapon.
// Usage:
//   const vm = createViewmodels(camera);
//   vm.setWeapon("ak47");
//   vm.update(dt, moving);          // every frame
//   vm.recoil(); vm.swing(); vm.throwGrenade(); vm.reload(ms);
//   vm.muzzleWorld(out);            // world-space muzzle point (for tracers)

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: opts.metal ?? 0.3, roughness: opts.rough ?? 0.6, ...opts });
}
function box(w, h, d, color, opts) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
}
function cyl(r1, r2, h, color, seg = 12) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat(color, { metal: 0.6, rough: 0.4 }));
}

// Each builder returns { group, muzzle:[x,y,z], hasFlash:bool }
const BUILDERS = {
  pistol() {
    const g = new THREE.Group();
    const body = box(0.07, 0.12, 0.26, 0x2b2b30, { metal: 0.7, rough: 0.35 }); body.position.set(0, 0, -0.06);
    const slide = box(0.075, 0.05, 0.28, 0x4a4a52, { metal: 0.8, rough: 0.3 }); slide.position.set(0, 0.07, -0.05);
    const grip = box(0.07, 0.16, 0.09, 0x1c1c20); grip.position.set(0, -0.12, 0.06); grip.rotation.x = 0.25;
    const barrel = cyl(0.018, 0.018, 0.08, 0x111); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.05, -0.22);
    g.add(body, slide, grip, barrel);
    return { group: g, muzzle: [0, 0.05, -0.26], hasFlash: true };
  },
  m16() {
    const g = new THREE.Group();
    const body = box(0.06, 0.09, 0.6, 0x16181c, { metal: 0.6, rough: 0.4 });
    const handle = box(0.05, 0.06, 0.18, 0x222); handle.position.set(0, 0.08, -0.05); // carry handle
    const barrel = cyl(0.014, 0.014, 0.34, 0x111); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.46);
    const mag = box(0.045, 0.18, 0.07, 0x2a2a2a); mag.position.set(0, -0.13, 0.02); mag.rotation.x = -0.1;
    const stock = box(0.05, 0.08, 0.16, 0x16181c); stock.position.set(0, -0.01, 0.34);
    g.add(body, handle, barrel, mag, stock);
    return { group: g, muzzle: [0, 0.01, -0.64], hasFlash: true };
  },
  m4() {
    const g = new THREE.Group();
    const body = box(0.06, 0.09, 0.5, 0x3a3f45, { metal: 0.7, rough: 0.35 });
    const rail = box(0.05, 0.03, 0.3, 0x55595f); rail.position.set(0, 0.06, -0.12);
    const barrel = cyl(0.014, 0.014, 0.3, 0x111); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.4);
    const mag = box(0.045, 0.16, 0.07, 0x2a2e33); mag.position.set(0, -0.12, 0.02); mag.rotation.x = -0.08;
    const stock = box(0.05, 0.085, 0.18, 0x3a3f45); stock.position.set(0, -0.01, 0.3);
    g.add(body, rail, barrel, mag, stock);
    return { group: g, muzzle: [0, 0.01, -0.56], hasFlash: true };
  },
  ak47() {
    const g = new THREE.Group();
    const body = box(0.06, 0.09, 0.58, 0x2a2a2e, { metal: 0.6, rough: 0.45 });
    const wood = box(0.055, 0.07, 0.2, 0x6b3f1e, { metal: 0.1, rough: 0.8 }); wood.position.set(0, -0.005, -0.18); // handguard
    const barrel = cyl(0.014, 0.014, 0.3, 0x111); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.46);
    const mag = box(0.05, 0.2, 0.08, 0x3a2410, { rough: 0.8 }); mag.position.set(0, -0.15, 0.0); mag.rotation.x = 0.5; // curved-ish
    const stock = box(0.05, 0.08, 0.2, 0x6b3f1e, { rough: 0.8 }); stock.position.set(0, -0.02, 0.34);
    g.add(body, wood, barrel, mag, stock);
    return { group: g, muzzle: [0, 0.01, -0.62], hasFlash: true };
  },
  awp() {
    const g = new THREE.Group();
    const body = box(0.06, 0.1, 0.8, 0x1c3320, { metal: 0.4, rough: 0.5 });
    const barrel = cyl(0.016, 0.016, 0.5, 0x0a0a0a); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.0, -0.66);
    const scope = cyl(0.04, 0.04, 0.22, 0x0a0a0a, 16); scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.1, -0.12);
    const scopeLens = cyl(0.035, 0.035, 0.01, 0x3366aa, 16); scopeLens.rotation.x = Math.PI / 2; scopeLens.position.set(0, 0.1, -0.01);
    const mag = box(0.05, 0.1, 0.1, 0x222); mag.position.set(0, -0.1, 0.06);
    const stock = box(0.05, 0.1, 0.24, 0x1c3320); stock.position.set(0, -0.02, 0.46);
    g.add(body, barrel, scope, scopeLens, mag, stock);
    return { group: g, muzzle: [0, 0.0, -0.92], hasFlash: true };
  },
  knife() {
    const g = new THREE.Group();
    const blade = box(0.012, 0.05, 0.28, 0xd8dde6, { metal: 0.95, rough: 0.15 }); blade.position.set(0, 0.02, -0.2);
    // angled tip
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), mat(0xd8dde6, { metal: 0.95, rough: 0.15 }));
    tip.rotation.x = -Math.PI / 2; tip.position.set(0, 0.02, -0.36); tip.scale.set(0.4, 1, 1);
    const guard = box(0.09, 0.02, 0.03, 0x222); guard.position.set(0, 0.01, -0.05);
    const handle = box(0.03, 0.04, 0.13, 0x111); handle.position.set(0, 0, 0.04);
    g.add(blade, tip, guard, handle);
    return { group: g, muzzle: [0, 0, -0.4], hasFlash: false };
  },
  grenade() {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), mat(0x3b5323, { rough: 0.8 }));
    ball.scale.set(1, 1.2, 1);
    const cap = cyl(0.03, 0.03, 0.04, 0x555); cap.position.set(0, 0.09, 0);
    const lever = box(0.015, 0.07, 0.02, 0x999); lever.position.set(0.03, 0.07, 0);
    g.add(ball, cap, lever);
    g.userData.ball = ball;
    return { group: g, muzzle: [0, 0, 0], hasFlash: false };
  },
};

// Per-weapon base placement (right hand, lower portion of view)
const BASE = {
  pistol:  { pos: [0.22, -0.2, -0.42], rot: [0, 0.04, 0] },
  m16:     { pos: [0.24, -0.22, -0.5], rot: [0, 0.03, 0] },
  m4:      { pos: [0.24, -0.22, -0.5], rot: [0, 0.03, 0] },
  ak47:    { pos: [0.24, -0.22, -0.5], rot: [0, 0.03, 0] },
  awp:     { pos: [0.26, -0.24, -0.6], rot: [0, 0.02, 0] },
  knife:   { pos: [0.2, -0.18, -0.4],  rot: [0, 0.1, 0.2] },
  grenade: { pos: [0.22, -0.22, -0.4], rot: [0, 0, 0] },
};

export function createViewmodels(camera) {
  const root = new THREE.Group();
  camera.add(root);

  const models = {};
  for (const id in BUILDERS) {
    const built = BUILDERS[id]();
    built.group.visible = false;
    built.group.traverse((o) => { if (o.isMesh) o.renderOrder = 999; o.frustumCulled = false; });
    // muzzle flash sprite for guns
    if (built.hasFlash) {
      const flash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.18),
        new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0, depthTest: false })
      );
      flash.position.set(built.muzzle[0], built.muzzle[1], built.muzzle[2] - 0.02);
      flash.renderOrder = 1000;
      built.flash = flash;
      built.group.add(flash);
      built.light = new THREE.PointLight(0xffaa33, 0, 4);
      built.light.position.set(...built.muzzle);
      built.group.add(built.light);
    }
    root.add(built.group);
    models[id] = built;
  }

  let current = null, currentId = null;
  // animation state
  let recoilZ = 0, recoilPitch = 0, flashT = 0;
  let swingT = 0, throwT = 0, reloadT = 0, reloadDur = 0, raiseT = 0;
  let bobPhase = 0;

  function setWeapon(id) {
    if (id === currentId) return;
    if (current) current.group.visible = false;
    current = models[id] || null;
    currentId = id;
    if (current) {
      current.group.visible = true;
      raiseT = 1; // play raise animation
    }
  }

  function recoil(amount = 1) {
    recoilZ = Math.min(0.08, recoilZ + 0.05 * amount);
    recoilPitch = Math.min(0.12, recoilPitch + 0.06 * amount);
    if (current && current.hasFlash) { flashT = 1; }
  }
  function swing() { swingT = 1; }
  function throwGrenade() { throwT = 1; }
  function reload(ms) { reloadT = 1; reloadDur = Math.max(300, ms || 1500); }

  function muzzleWorld(out) {
    if (!current) return out.set(0, 0, 0);
    return current.group.localToWorld(out.set(...current.muzzle));
  }

  function update(dt, moving) {
    if (!current) return;
    const g = current.group;
    const base = BASE[currentId] || BASE.pistol;

    // walking bob
    bobPhase += dt * (moving ? 9 : 2.5);
    const bobY = (moving ? Math.sin(bobPhase) * 0.012 : Math.sin(bobPhase) * 0.003);
    const bobX = (moving ? Math.cos(bobPhase * 0.5) * 0.008 : 0);

    g.position.set(base.pos[0] + bobX, base.pos[1] + bobY, base.pos[2]);
    g.rotation.set(base.rot[0], base.rot[1], base.rot[2]);

    // recoil (guns): kick back + up, decay
    g.position.z += recoilZ;
    g.rotation.x -= recoilPitch;
    recoilZ *= Math.pow(0.001, dt);   // fast decay
    recoilPitch *= Math.pow(0.001, dt);
    if (recoilZ < 0.0005) recoilZ = 0;
    if (recoilPitch < 0.0005) recoilPitch = 0;

    // muzzle flash
    if (current.hasFlash) {
      flashT = Math.max(0, flashT - dt * 22);
      current.flash.material.opacity = flashT * 0.95;
      current.flash.rotation.z = Math.random() * Math.PI;
      const sc = 0.6 + flashT * 0.8; current.flash.scale.set(sc, sc, sc);
      current.light.intensity = flashT * 3;
    }

    // knife swing: arc the blade across
    if (swingT > 0) {
      swingT = Math.max(0, swingT - dt * 4.5);
      const s = Math.sin((1 - swingT) * Math.PI); // 0->1->0
      g.rotation.z += s * 1.2;
      g.rotation.x += s * 0.6;
      g.position.x -= s * 0.12;
      g.position.z -= s * 0.1;
    }

    // grenade throw: wind up then fling forward
    if (throwT > 0) {
      throwT = Math.max(0, throwT - dt * 3);
      const p = 1 - throwT;
      if (current.userData?.ball) {}
      if (p < 0.4) { g.rotation.x += p * 1.5; g.position.z += p * 0.1; }       // wind up
      else { const f = (p - 0.4) / 0.6; g.rotation.x += (0.6 - f) * 1.5; g.position.z -= f * 0.3; g.visible = f < 0.9; }
      if (throwT === 0) g.visible = true;
    }

    // reload: dip down and rock, then come back
    if (reloadT > 0) {
      reloadT = Math.max(0, reloadT - dt * (1000 / reloadDur));
      const r = Math.sin(reloadT * Math.PI); // up at middle
      g.position.y -= r * 0.18;
      g.rotation.z += r * 0.5;
    }

    // raise (on weapon switch): swing up from below
    if (raiseT > 0) {
      raiseT = Math.max(0, raiseT - dt * 4);
      g.position.y -= raiseT * 0.25;
      g.rotation.x += raiseT * 0.6;
    }
  }

  function setVisible(v) { if (current) current.group.visible = v; }

  return { setWeapon, recoil, swing, throwGrenade, reload, update, muzzleWorld, setVisible, get id() { return currentId; } };
}
