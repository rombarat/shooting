import * as THREE from "three";

// Builds the de_dust2-inspired map from mapdata.json.
// Returns { obstacles } where obstacles are meshes used for collision + bullet blocking.
export function buildMap(scene, map) {
  const obstacles = [];

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(map.bounds * 2, map.bounds * 2),
    new THREE.MeshStandardMaterial({ color: map.floorColor })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Boxes (walls + crates)
  for (const b of map.boxes) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      new THREE.MeshStandardMaterial({ color: b.c })
    );
    const baseY = b.y || 0;
    mesh.position.set(b.x, baseY + b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push(mesh);
  }

  // Bomb site markers (flat colored plates + floating letter)
  for (const key of Object.keys(map.sites)) {
    const s = map.sites[key];
    const plate = new THREE.Mesh(
      new THREE.CircleGeometry(s.r, 32),
      new THREE.MeshStandardMaterial({ color: 0xffcc33, transparent: true, opacity: 0.18 })
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(s.x, 0.05, s.z);
    scene.add(plate);
    scene.add(makeSiteLabel(key, s.x, s.z));
  }

  return { obstacles };
}

function makeSiteLabel(text, x, z) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(255,200,40,0.9)";
  ctx.font = "bold 100px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 64);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: true }));
  sprite.scale.set(4, 4, 1);
  sprite.position.set(x, 4, z);
  return sprite;
}
