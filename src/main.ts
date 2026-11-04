import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

/* ------------------------------------------------------------------
   BACKROOMS: grab your $20 before Sam Altman drains you.
   Player = a guy with 64GB of RAM. Collect $20 to buy an RTX 3090.
   Sam Altman chases you and steals 2GB of RAM on contact. 0GB = lose.
------------------------------------------------------------------- */

// ------------------------------------------------------------------
// Tunables
// ------------------------------------------------------------------
const CELL = 4; // world units per maze cell
const GRID = 21; // 21x21 grid (walls on even rows/cols, rooms on odd)
const PLAYER_EYE = 1.6;
const PLAYER_RADIUS = 0.35;

const START_RAM = 64; // GB
const TARGET_CASH = 20; // $
const STEAL_AMOUNT = 2; // GB per grab
const STEAL_DISTANCE = 3.2; // world units
const STEAL_COOLDOWN = 1.4; // seconds between grabs
const PLAYER_WALK = 3.6; // units/sec — a little slower than Sam
const PLAYER_SPRINT = 6.0; // units/sec — faster than Sam, so you can escape
const SAM_SPEED = 4.6; // units/sec — pathfindy, threatening but beatable
const PLAYER_MAX_STAMINA = 100;
const STAMINA_SPRINT_DRAIN = 22; // stamina/sec while sprinting
const STAMINA_REGEN = 18; // stamina/sec recovering when not sprinting
const STAMINA_RECOVER_THRESHOLD = 30; // sprint re-locks at 0 until regen to this
const SAM_REPATH = 0.45; // seconds between path recomputations

// Cash denominations scattered around the maze (sums to TARGET_CASH)
const CASH_DENOM = [2, 3, 4, 5, 6]; // = 20

// ------------------------------------------------------------------
// DOM refs
// ------------------------------------------------------------------
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ramText = document.getElementById("ram-text") as HTMLElement;
const ramBar = document.getElementById("ram-bar") as HTMLElement;
const staminaBar = document.getElementById("stamina-bar") as HTMLDivElement;
const cashText = document.getElementById("cash-text") as HTMLElement;
const proxHint = document.getElementById("prox-hint") as HTMLElement;
const samDist = document.getElementById("sam-dist") as HTMLElement;
const stealFlash = document.querySelector(".flash-steal") as HTMLElement;
const ramFlash = document.getElementById("ram-flash") as HTMLElement;
const startOverlay = document.getElementById("start-overlay") as HTMLElement;
const endOverlay = document.getElementById("end-overlay") as HTMLElement;
const endTitle = document.getElementById("end-title") as HTMLElement;
const endMsg = document.getElementById("end-msg") as HTMLElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const restartBtn = document.getElementById("restart-btn") as HTMLButtonElement;

// ------------------------------------------------------------------
// Maze generation (recursive backtracker -> perfect maze)
// ------------------------------------------------------------------
type Cell = { x: number; y: number };
let grid: number[][] = [];
let floorCells: Cell[] = [];

function genMaze() {
  grid = Array.from({ length: GRID }, () => Array(GRID).fill(1)); // 1 = wall
  const stack: Cell[] = [{ x: 1, y: 1 }];
  grid[1][1] = 0;
  const dirs = [
    [0, -2],
    [0, 2],
    [-2, 0],
    [2, 0],
  ];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    shuffle(dirs);
    let pushed = false;
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx >= 1 && nx < GRID - 1 && ny >= 1 && ny < GRID - 1 && grid[ny][nx] === 1) {
        grid[ny][nx] = 0;
        grid[cur.y + dy / 2][cur.x + dx / 2] = 0; // carve the wall between
        stack.push({ x: nx, y: ny });
        pushed = true;
        break;
      }
    }
    if (!pushed) stack.pop();
  }
  floorCells = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (grid[y][x] === 0) floorCells.push({ x, y });
    }
  }
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ------------------------------------------------------------------
// Collision helpers
// ------------------------------------------------------------------
function isWall(wx: number, wz: number): boolean {
  const gx = Math.floor(wx / CELL);
  const gz = Math.floor(wz / CELL);
  if (gz < 0 || gz >= GRID || gx < 0 || gx >= GRID) return true;
  return grid[gz][gx] === 1;
}

function canWalk(wx: number, wz: number): boolean {
  const r = PLAYER_RADIUS;
  return (
    !isWall(wx - r, wz) &&
    !isWall(wx + r, wz) &&
    !isWall(wx, wz - r) &&
    !isWall(wx, wz + r)
  );
}

function cellToWorld(c: Cell): THREE.Vector3 {
  return new THREE.Vector3(c.x * CELL + CELL / 2, PLAYER_EYE, c.y * CELL + CELL / 2);
}

// ------------------------------------------------------------------
// Scene
// ------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f1c0e);
scene.fog = new THREE.Fog(0x2a2510, 2, 20);

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const controls = new PointerLockControls(camera, canvas);

// ------------------------------------------------------------------
// Materials (backrooms palette: yellow walls, carpet, fluorescent)
// ------------------------------------------------------------------
const wallMat = new THREE.MeshStandardMaterial({ color: 0xc9b94a, roughness: 0.85 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x7a6a2a, roughness: 0.95 });
const ceilMat = new THREE.MeshStandardMaterial({ color: 0xd8d2b0, emissive: 0x5a5420, emissiveIntensity: 0.4, roughness: 0.9 });

function buildMaze() {
  const total = (GRID - 1) * CELL;
  // Floor + ceiling planes spanning the whole maze
  const floorGeo = new THREE.PlaneGeometry(total, total);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((GRID - 1) * CELL / 2, 0, (GRID - 1) * CELL / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceil = new THREE.Mesh(floorGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((GRID - 1) * CELL / 2, GRID * CELL, (GRID - 1) * CELL / 2);
  scene.add(ceil);

  // Walls: one box per wall cell
  const wallGeo = new THREE.BoxGeometry(CELL, CELL * 2, CELL);
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, 1000);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (grid[y][x] === 1) {
        m.makeTranslation(x * CELL + CELL / 2, CELL, y * CELL + CELL / 2);
        wallMesh.setMatrixAt(i++, m);
      }
    }
  }
  wallMesh.count = i;
  wallMesh.instanceMatrix.needsUpdate = true;
  scene.add(wallMesh);
}

// ------------------------------------------------------------------
// Lighting (flickering fluorescent)
// ------------------------------------------------------------------
const ambient = new THREE.AmbientLight(0xfff0a0, 0.55);
scene.add(ambient);

const ceilingLights: THREE.PointLight[] = [];
const lightPositions: Cell[] = [];
function buildLights() {
  // re-add ambient (resetGame wipes all scene children, incl. the module-scope one)
  scene.add(new THREE.AmbientLight(0xfff0a0, 0.55));
  // place lights above some floor cells in a grid pattern
  for (let y = 3; y < GRID - 2; y += 6) {
    for (let x = 3; x < GRID - 2; x += 6) {
      const c = { x, y };
      if (grid[y][x] !== 0) continue;
      lightPositions.push(c);
      const pl = new THREE.PointLight(0xfff2c0);
      pl.intensity = 1.4;
      pl.distance = 30;
      pl.decay = 1.6;
      pl.position.set(x * CELL + CELL / 2, GRID * CELL - 0.5, y * CELL + CELL / 2);
      scene.add(pl);
      ceilingLights.push(pl);
    }
  }
}

// ------------------------------------------------------------------
// Game state
// ------------------------------------------------------------------
type Pickup = {
  value: number;
  pos: THREE.Vector3;
  mesh: THREE.Group;
  alive: boolean;
};

let ram = START_RAM;
let cash = 0;
let gameOver = false;
let won = false;
let pickups: Pickup[] = [];
let sam: THREE.Group;
let samLabel: THREE.Sprite;
let samPath: Cell[] = [];
let samNextIdx = 1;
let lastRepath = 0;
let lastSteal = -100;
let time = 0;
let stamina = PLAYER_MAX_STAMINA;
let exhausted = false; // sprint locked while true; releases at recovery threshold

// BFS pathfinding on the grid toward the player's cell
function bfsPath(target: Cell): Cell[] | null {
  const start: Cell = {
    x: Math.floor(sam.position.x / CELL),
    y: Math.floor(sam.position.z / CELL),
  };
  if (start.x === target.x && start.y === target.y) return [];
  const key = (c: Cell) => c.y * GRID + c.x;
  const visited = new Set<number>([key(start)]);
  const cameFrom = new Map<number, Cell | null>();
  const queue: Cell[] = [start];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === target.x && cur.y === target.y) {
      // reconstruct
      const path: Cell[] = [cur];
      let node: Cell | null = cur;
      while (cameFrom.has(key(node))) {
        node = cameFrom.get(key(node))!;
        path.unshift(node);
        if (node === null) break;
      }
      return path;
    }
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID && grid[ny][nx] === 0) {
        const k = key({ x: nx, y: ny });
        if (!visited.has(k)) {
          visited.add(k);
          cameFrom.set(k, cur);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  return null;
}

function makeSam() {
  sam = new THREE.Group();
  // body (suit)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, 1.3, 12),
    new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.5 })
  );
  body.position.y = 0.65;
  sam.add(body);
  // head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xe6b98f, roughness: 0.7 })
  );
  head.position.y = 1.5;
  sam.add(head);
  // eyes (glow)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4040 });
  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 8);
  const e1 = new THREE.Mesh(eyeGeo, eyeMat);
  e1.position.set(-0.1, 1.53, 0.24);
  const e2 = new THREE.Mesh(eyeGeo, eyeMat);
  e2.position.set(0.1, 1.53, 0.24);
  sam.add(e1, e2);
  // floating label
  samLabel = makeLabel("SAM ALTMAN");
  samLabel.position.set(0, 2.2, 0);
  sam.add(samLabel);

  const glow = new THREE.PointLight(0xff3030);
  glow.intensity = 0.8;
  glow.distance = 12;
  glow.decay = 2;
  glow.position.set(0, 1.2, 0);
  sam.add(glow);

  scene.add(sam);
}

function makeLabel(text: string): THREE.Sprite {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size / 3;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0.01)";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = "bold 42px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff4b4b";
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.8, 1);
  return sprite;
}

function makePickup(value: number, c: Cell): Pickup {
  const group = new THREE.Group();
  // cash bill
  const bill = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.06, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0x2f9c5a,
      emissive: 0x135a2c,
      emissiveIntensity: 0.6,
      roughness: 0.5,
    })
  );
  group.add(bill);
  // border ring glow
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.05, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x66ff99 })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const light = new THREE.PointLight(0x44dd77);
  light.intensity = 0.6;
  light.distance = 8;
  light.decay = 2;
  light.position.y = 0.2;
  group.add(light);

  const pos = cellToWorld(c);
  pos.y = 0.7;
  group.position.copy(pos);
  scene.add(group);
  return { value, pos: pos.clone(), mesh: group, alive: true };
}

function spawnPickups() {
  // pick cells far from the player start (1,1) and spread apart
  const start = { x: 1, y: 1 };
  const candidates = floorCells
    .filter((c) => Math.abs(c.x - start.x) + Math.abs(c.y - start.y) > 4)
    .sort(() => Math.random() - 0.5);
  let idx = 0;
  let remaining = TARGET_CASH;
  for (let i = 0; i < CASH_DENOM.length; i++) {
    const c = candidates[idx++];
    let val = CASH_DENOM[i];
    if (i === CASH_DENOM.length - 1) val = remaining; // last takes the remainder
    pickups.push(makePickup(val, c));
    remaining -= val;
  }
}

function resetGame() {
  // clear old scene objects
  while (scene.children.length) {
    const c = scene.children[scene.children.length - 1];
    scene.remove(c);
    if (c instanceof THREE.InstancedMesh) {
      c.geometry.dispose();
      c.material.dispose();
    }
  }
  ram = START_RAM;
  cash = 0;
  gameOver = false;
  won = false;
  time = 0;
  stamina = PLAYER_MAX_STAMINA;
  exhausted = false;
  samNextIdx = 1;
  lastRepath = 0;
  lastSteal = -100;
  samPath = [];
  pickups = [];

  genMaze();
  buildMaze();
  buildLights();
  makeSam();

  // Sam starts at a far floor cell
  const far = floorCells
    .filter((c) => Math.abs(c.x - 1) + Math.abs(c.y - 1) > 12)
    .sort(() => Math.random() - 0.5)[0];
  const sp = cellToWorld(far ?? { x: GRID - 2, y: GRID - 2 });
  sp.y = 0;
  sam.position.copy(sp);

  spawnPickups();

  // player start
  const pStart = cellToWorld({ x: 1, y: 1 });
  pStart.y = PLAYER_EYE;
  camera.position.copy(pStart);
  camera.lookAt(pStart.x, PLAYER_EYE, pStart.z + 4);

  updateHUD();
}

// ------------------------------------------------------------------
// Input
// ------------------------------------------------------------------
const keys: Record<string, boolean> = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

function onPointerLockChange() {
  if (document.pointerLockElement === canvas) {
    startOverlay.classList.add("hidden");
  } else if (!gameOver && !won) {
    // paused: show start overlay again
    startOverlay.classList.remove("hidden");
    startBtn.textContent = "CLICK TO RESUME";
  }
}

document.addEventListener("pointerlockchange", onPointerLockChange);

startBtn.addEventListener("click", () => {
  if (gameOver || won) return;
  canvas.requestPointerLock();
  void initSamSound(); // user gesture -> satisfies autoplay policy
});
restartBtn.addEventListener("click", () => {
  endOverlay.classList.add("hidden");
  resetGame();
  canvas.requestPointerLock();
});

// ------------------------------------------------------------------
// HUD
// ------------------------------------------------------------------
function updateHUD() {
  ramText.textContent = ram.toFixed(1) + " GB";
  ramBar.style.width = `${(ram / START_RAM) * 100}%`;
  ramBar.style.background =
    ram <= 12
      ? "linear-gradient(90deg, #ff3b3b, #ff8a3b)"
      : ram <= 28
        ? "linear-gradient(90deg, #ffb03b, #ffd23b)"
        : "linear-gradient(90deg, #3f8cff, #4dff88)";
  cashText.textContent = cash.toFixed(2);
  staminaBar.style.width = `${Math.round(stamina / PLAYER_MAX_STAMINA * 100)}%`;
  staminaBar.style.background =
    stamina <= 20
      ? "linear-gradient(90deg, #ff3b3b, #ff8a3b)"
      : "linear-gradient(90deg, #ffb03b, #ffd23b)";
}

function flashScreen(color: "red" | "gold") {
  const el = color === "red" ? ramFlash : stealFlash;
  el.style.transition = "opacity 0.05s";
  el.style.opacity = "1";
  setTimeout(() => {
    el.style.transition = "opacity 0.6s";
    el.style.opacity = "0";
  }, 120);
}

// ------------------------------------------------------------------
// Sam proximity sound — positional Web Audio. A short Sam Altman clip
// loops and gets louder as Sam closes in. Positional via a PannerNode
// sitting on Sam with the AudioContext listener on the camera, so
// distance attenuation + stereo pan come for free. If Web Audio isn't
// available (or the clip won't load) it degrades to silent — no crash.
// ------------------------------------------------------------------
const SAM_SOUND_URL = "/assets/sam.mp3"; // served from public/assets/
const SAM_PROX_MAX = 24; // units: fades to silence beyond this
let samCtx: AudioContext | null = null;
let samPanner: PannerNode | null = null;
let samSource: AudioBufferSourceNode | null = null;
let samLoaded = false; // attempted load (so we don't retry forever)
let samReady = false;  // fully set up and looping

function setPannerPos(p: PannerNode, x: number, y: number, z: number) {
  p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
}

function setListenerPos(ctx: AudioContext, x: number, y: number, z: number) {
  ctx.listener.setPosition(x, y, z);
  ctx.listener.setOrientation(x, y, z, 0, 0, -1);
}

async function initSamSound() {
  if (samReady || samLoaded) return;
  const AC = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
  if (!AC) { samLoaded = true; return; } // no Web Audio — skip silently
  try {
    const ctx = new AC();
    await ctx.resume(); // resume inside the user gesture
    const res = await fetch(SAM_SOUND_URL);
    if (!res.ok) { samLoaded = true; return; }
    const buf = await res.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(buf);
    const panner = ctx.createPanner();
    panner.distanceModel = "linear";
    panner.refDistance = 2; // full volume at this distance
    panner.maxDistance = SAM_PROX_MAX; // silent at/over this
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    setPannerPos(panner, sam.position.x, sam.position.y, sam.position.z);

    const source = ctx.createBufferSource();
    source.buffer = audioBuf;
    source.loop = true;
    source.connect(panner);
    panner.connect(ctx.destination);
    source.start();

    samCtx = ctx;
    samPanner = panner;
    samSource = source;
    samReady = true;
  } catch {
    samLoaded = true; // couldn't load the clip — continue without sound
  }
}

function updateSamSound() {
  if (!samReady || !samCtx || !samPanner || !samSource) return;
  const dist = Math.hypot(
    camera.position.x - sam.position.x,
    camera.position.z - sam.position.z,
  );
  if (dist > SAM_PROX_MAX) return; // silent beyond range (attenuation handles it)
  if (samCtx.state === "suspended") void samCtx.resume();
  setPannerPos(samPanner, sam.position.x, sam.position.y, sam.position.z);
  setListenerPos(samCtx, camera.position.x, camera.position.y, camera.position.z);
}

// ------------------------------------------------------------------
// Main loop
// ------------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  if (!gameOver && !won && controls.isLocked) {
    // ---- movement ----
    const dirX = (keys["d"] ? 1 : 0) - (keys["a"] ? 1 : 0);
    const dirZ = (keys["s"] ? 1 : 0) - (keys["w"] ? 1 : 0);

    // ---- stamina ----
    const wantSprint = keys["shift"] && !exhausted && stamina > 0;
    if (wantSprint) {
      stamina = Math.max(0, stamina - STAMINA_SPRINT_DRAIN * dt);
    } else {
      stamina = Math.min(PLAYER_MAX_STAMINA, stamina + STAMINA_REGEN * dt);
    }
    if (stamina <= 0) {
      exhausted = true; // sprint re-locks until stamina recovers to the threshold
    } else if (exhausted && stamina >= STAMINA_RECOVER_THRESHOLD) {
      exhausted = false; // recovered — sprint available again
    }

    const speed = wantSprint ? PLAYER_SPRINT : PLAYER_WALK;

    // rotate input by the camera's facing direction so WASD follows where
    // you're looking (forward/back + strafe) instead of fixed world axes
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0),
    ).normalize();

    const vx = right.x * dirX + forward.x * -dirZ;
    const vz = right.z * dirX + forward.z * -dirZ;

    let nx = camera.position.x + vx * speed * dt;
    let nz = camera.position.z + vz * speed * dt;
    if (canWalk(nx, camera.position.z)) camera.position.x = nx;
    if (canWalk(camera.position.x, nz)) camera.position.z = nz;

    // ---- money pickup ----
    for (const p of pickups) {
      if (!p.alive) continue;
      const dx = camera.position.x - p.pos.x;
      const dz = camera.position.z - p.pos.z;
      if (dx * dx + dz * dz < 1.8) {
        p.alive = false;
        scene.remove(p.mesh);
        cash += p.value;
        if (cash >= TARGET_CASH) { win(); }
      }
      // animate
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y = p.pos.y + Math.sin(time * 2 + p.pos.x) * 0.08;
    }

    // ---- Sam chase ----
    updateSam(dt);

    // ---- Sam proximity sound (positional) ----
    updateSamSound();

    // ---- flicker lights ----
    for (const pl of ceilingLights) {
      pl.intensity = 1.2 + Math.sin(time * (12 + pl.position.x) * 0.7) * 0.15 + Math.random() * 0.1;
    }

    updateHUD();
    updateSamHint();
  }

  renderer.render(scene, camera);
}

function updateSam(dt: number) {
  const targetCell: Cell = {
    x: Math.floor(camera.position.x / CELL),
    y: Math.floor(camera.position.z / CELL),
  };
  if (time - lastRepath > SAM_REPATH || samPath.length === 0) {
    samPath = bfsPath(targetCell) ?? [];
    samNextIdx = 1;
    lastRepath = time;
  }

  // move Sam toward next waypoint
  let target = camera.position.clone().setY(0);
  if (samPath.length && samNextIdx < samPath.length) {
    const wp = cellToWorld(samPath[samNextIdx]);
    wp.y = 0;
    target = wp;
  }
  const to = new THREE.Vector3(target.x - sam.position.x, 0, target.z - sam.position.z);
  const dist = to.length();
  if (dist > 0.01) {
    to.divideScalar(dist);
    sam.position.x += to.x * SAM_SPEED * dt;
    sam.position.z += to.z * SAM_SPEED * dt;
    // face the player
    sam.lookAt(target.x, sam.position.y, target.z);
  }

  // ---- grab ----
  const playerDist = Math.hypot(
    camera.position.x - sam.position.x,
    camera.position.z - sam.position.z
  );
  if (playerDist < STEAL_DISTANCE && time - lastSteal > STEAL_COOLDOWN) {
    lastSteal = time;
    ram -= STEAL_AMOUNT;
    flashScreen("red");
    if (ram <= 0) { ram = 0; lose(); }
  }
  samDist.textContent = playerDist.toFixed(1) + " units";
}

function updateSamHint() {
  const playerDist = Math.hypot(
    camera.position.x - sam.position.x,
    camera.position.z - sam.position.z
  );
  if (playerDist < STEAL_DISTANCE) proxHint.textContent = "⚠ HE'S HERE!";
  else if (playerDist < 8) proxHint.textContent = "Close…";
  else if (playerDist < 18) proxHint.textContent = "Tracking you";
  else proxHint.textContent = "Far away";
}

function win() {
  if (won || gameOver) return;
  won = true;
  gameOver = true;
  controls.unlock();
  endTitle.textContent = "YOU BOUGHT THE RTX 3090";
  endTitle.className = "win";
  endMsg.innerHTML =
    `You gathered <b>$${TARGET_CASH.toFixed(2)}</b> and slotted an RTX 3090 into your ` +
    `backrooms rig. <br>You still have <b>${ram.toFixed(1)} GB</b> of RAM. <br>Sam fumes in the dark.`;
  setTimeout(() => endOverlay.classList.remove("hidden"), 400);
}

function lose() {
  if (gameOver) return;
  gameOver = true;
  won = false;
  controls.unlock();
  endTitle.textContent = "RAM DEPLETED";
  endTitle.className = "lose";
  endMsg.innerHTML =
    `Sam Altman drained your last <b>${START_RAM} GB</b> of RAM. <br>` +
    `You collected <b>$${cash.toFixed(2)}</b> of <b>$${TARGET_CASH.toFixed(2)}</b>.<br>` +
    `The backrooms hum on without you.`;
  setTimeout(() => endOverlay.classList.remove("hidden"), 400);
}

// ------------------------------------------------------------------
// Resize
// ------------------------------------------------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
resetGame();
animate();
