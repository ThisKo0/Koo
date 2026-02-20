import * as THREE from "three";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";
const gui = new GUI();
//#region SETUP

const canvas = document.getElementById("starlight-bg");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 0); // alpha = 0 (transparent)
camera.position.setZ(100);
renderer.render(scene, camera);

const d_light = new THREE.DirectionalLight();
d_light.position.copy(camera.position);
d_light.intensity = 10;
scene.add(d_light);

const mouse = { x: 0, y: 0 };
window.addEventListener("mousemove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});

//#endregion

//#region STAR CONFIG
const STAR_CONFIG = {
  // Field
  total: 5000,
  smallRatio: 0.9,
  halfSize: 1000,
  seed: 1337,

  // Scale
  bigMaxScale: 5,
  smallMaxScale: 1.5,

  // Colors (used by twinkle directly)
  bigIcoColor: new THREE.Color(0xd724ff),
  bigPlaneColor: new THREE.Color(0xb514ff),
  smallIcoColor: new THREE.Color(0x2e58ff),
  smallPlaneColor: new THREE.Color(0x3e95b1),

  // Animations
  planeSpeed: 1,
  icoSpeed: 0.5,
  spaceSpeed: 125,
  hoverRadius: 0.10, // screen-space proximity threshold (0..1)
  hoverScaleAmp: 5, // how much bigger on hover
  hoverEase: 0.12, // smoothing
};
//#endregion

//#region STAR BUILDING
const clock = new THREE.Clock();

async function LoadStar(starfield) {
  const mtlLoader = new MTLLoader();
  const materials = await mtlLoader.loadAsync("models/star.mtl");
  materials.preload();

  const objLoader = new OBJLoader();
  objLoader.setMaterials(materials);
  const obj = await objLoader.loadAsync("models/star.obj");

  let ico_mesh, plane_mesh;
  obj.traverse((child) => {
    if (!child.isMesh) return;

    child.material.blending = THREE.AdditiveBlending;
    child.material.side = THREE.DoubleSide;
    child.material.depthWrite = false;
    child.material.depthTest = false;

    if (child.name === "IcoSphere") ico_mesh = child;
    else plane_mesh = child;
  });

  // Create separate materials per type (so you can tint later)
  ico_mesh.geometry.center();
  plane_mesh.geometry.center();
  const bigIcoMat = ico_mesh.material.clone();
  const bigPlaneMat = plane_mesh.material.clone();
  const smallIcoMat = ico_mesh.material.clone();
  const smallPlaneMat = plane_mesh.material.clone();

  // (optional) slight differentiation for testing
  bigIcoMat.color.setHex(0xffffff);
  bigPlaneMat.color.setHex(0xffffff);
  bigPlaneMat.transparent = true;
  bigPlaneMat.opacity = 0.85;

  smallIcoMat.color.setHex(0xffffff);
  smallPlaneMat.color.setHex(0xffffff);
  smallPlaneMat.transparent = true;
  smallPlaneMat.opacity = 0.65;

  // IMPORTANT: use counts from STARFIELD
  const big_ico_inst = new THREE.InstancedMesh(
    ico_mesh.geometry,
    bigIcoMat,
    starfield.bigCount,
  );
  const big_plane_inst = new THREE.InstancedMesh(
    plane_mesh.geometry,
    bigPlaneMat,
    starfield.bigCount,
  );

  const small_ico_inst = new THREE.InstancedMesh(
    ico_mesh.geometry,
    smallIcoMat,
    starfield.smallCount,
  );
  const small_plane_inst = new THREE.InstancedMesh(
    plane_mesh.geometry,
    smallPlaneMat,
    starfield.smallCount,
  );

  // Optional: avoid popping (starfields are huge)
  big_ico_inst.frustumCulled = false;
  big_plane_inst.frustumCulled = false;
  small_ico_inst.frustumCulled = false;
  small_plane_inst.frustumCulled = false;

  scene.add(big_ico_inst, big_plane_inst, small_ico_inst, small_plane_inst);

  return { big_ico_inst, big_plane_inst, small_ico_inst, small_plane_inst };
}

// --- RNG (deterministic) ---
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randRange(rng, min, max) {
  return min + rng() * (max - min);
}
// --- STAR DATA STRUCTURE ---
/**
 * star = {
 *   type: "big" | "small",
 *   pos: { x,y,z },
 *   rot: { x,y,z },          // radians
 *   scale: number,
 *   spin: { y,z }            // radians/sec (future)
 * }
 */

function seedStars() {
  const rng = mulberry32(STAR_CONFIG.seed);

  const smallCount = Math.floor(STAR_CONFIG.total * STAR_CONFIG.smallRatio);
  const bigCount = STAR_CONFIG.total - smallCount;

  const makeStar = (type) => {
    const isBig = type === "big";
    return {
      type,
      pos: {
        x: randRange(rng, -STAR_CONFIG.halfSize, STAR_CONFIG.halfSize),
        y: randRange(rng, -STAR_CONFIG.halfSize, STAR_CONFIG.halfSize),
        z: randRange(rng, -STAR_CONFIG.halfSize, STAR_CONFIG.halfSize),
      },
      scale: isBig
        ? randRange(rng, 1.0, STAR_CONFIG.bigMaxScale)
        : randRange(rng, 0.2, STAR_CONFIG.smallMaxScale),
      hoverScale: 1.0,
    };
  };

  const big = Array.from({ length: bigCount }, () => makeStar("big"));
  const small = Array.from({ length: smallCount }, () => makeStar("small"));

  return { bigCount, smallCount, big, small };
}

// ✅ Step 1 output (store this globally for future use)
const STARFIELD = seedStars();
const { big_ico_inst, big_plane_inst, small_ico_inst, small_plane_inst } =
  await LoadStar(STARFIELD);

console.log("Counts:", {
  big: STARFIELD.bigCount,
  small: STARFIELD.smallCount,
});
console.table(
  STARFIELD.big
    .slice(0, 10)
    .map((s) => ({ x: s.pos.x, y: s.pos.y, z: s.pos.z, scale: s.scale })),
);
console.table(
  STARFIELD.small
    .slice(0, 10)
    .map((s) => ({ x: s.pos.x, y: s.pos.y, z: s.pos.z, scale: s.scale })),
);

const guiColors = gui.addFolder("Star Colors");
guiColors.addColor(STAR_CONFIG, "bigIcoColor");
guiColors.addColor(STAR_CONFIG, "bigPlaneColor");
guiColors.addColor(STAR_CONFIG, "smallIcoColor");
guiColors.addColor(STAR_CONFIG, "smallPlaneColor");

const guiAnims = gui.addFolder("Star Animation");
guiAnims.add(STAR_CONFIG, "planeSpeed", 0.5, 5.0);
guiAnims.add(STAR_CONFIG, "icoSpeed", 0.5, 5.0);
guiAnims.add(STAR_CONFIG, "spaceSpeed", 0, 1000);
guiAnims.add(STAR_CONFIG, "hoverRadius", 0.01, 0.3);
guiAnims.add(STAR_CONFIG, "hoverScaleAmp", 1.0, 5.0);
guiAnims.add(STAR_CONFIG, "hoverEase", 0.01, 0.3);
gui.hide();

const _project = new THREE.Vector3();
const dummy = new THREE.Object3D();
function UpdateStar(stars, icoInst, planeInst, icoColor, planeColor, t, dt) {
  const cfg = STAR_CONFIG;
  const half = cfg.halfSize;
  const depth = half * 2;

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];

    s.pos.z += cfg.spaceSpeed * dt;
    s.pos.z = ((((s.pos.z + half) % depth) + depth) % depth) - half;

    icoInst.setColorAt(i, icoColor);
    planeInst.setColorAt(i, planeColor);

    // ✅ project star to screen space
    _project.set(s.pos.x, s.pos.y, s.pos.z);
    _project.project(camera); // now _project.x/_project.y are -1..1

    const dx = _project.x - mouse.x;
    const dy = -_project.y - mouse.y; // Y is flipped
    const dist = Math.sqrt(dx * dx + dy * dy);

    // ✅ ease hoverScale toward target
    const target = dist < cfg.hoverRadius ? cfg.hoverScaleAmp : 1.0;
    s.hoverScale += (target - s.hoverScale) * cfg.hoverEase;

    const finalScale = s.scale * s.hoverScale;

    dummy.position.set(s.pos.x, s.pos.y, s.pos.z);

    dummy.rotation.set(t * cfg.icoSpeed, t * cfg.icoSpeed, t * cfg.icoSpeed);
    dummy.scale.setScalar(finalScale);
    dummy.updateMatrix();
    icoInst.setMatrixAt(i, dummy.matrix);

    dummy.rotation.set(
      t * cfg.planeSpeed,
      t * cfg.planeSpeed,
      t * cfg.planeSpeed,
    );
    dummy.scale.setScalar(finalScale);
    dummy.updateMatrix();
    planeInst.setMatrixAt(i, dummy.matrix);
  }

  icoInst.instanceColor.needsUpdate = true;
  planeInst.instanceColor.needsUpdate = true;
  icoInst.instanceMatrix.needsUpdate = true;
  planeInst.instanceMatrix.needsUpdate = true;
}
function UpdateStars(t, dt) {
  UpdateStar(
    STARFIELD.big,
    big_ico_inst,
    big_plane_inst,
    STAR_CONFIG.bigIcoColor,
    STAR_CONFIG.bigPlaneColor,
    t,
    dt,
  );
  UpdateStar(
    STARFIELD.small,
    small_ico_inst,
    small_plane_inst,
    STAR_CONFIG.smallIcoColor,
    STAR_CONFIG.smallPlaneColor,
    t,
    dt,
  );
}

let elapsed = 0;
function animate() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(window.devicePixelRatio);

  renderer.setSize(window.innerWidth, window.innerHeight);

  const dt = clock.getDelta(); // ✅ only call one clock method
  elapsed += dt;

  UpdateStars(elapsed, dt);

  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
//#endregion
