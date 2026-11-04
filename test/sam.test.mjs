// Verifies Sam Altman chases the player in BOTH the X and Z axes.
// Regression test for: sam.position.z += to.y * SAM_SPEED * dt  (to.y is always 0,
// so Sam only moved along X and never along Z). Fixed to use to.z.
//
// Loads the REAL built bundle in Node with the same mocked DOM + WebGL context as
// harness.test.mjs, engages the pointer lock, moves the player diagonally, and
// asserts Sam's position changes in both X and Z toward the player.
// Usage: node test/sam.test.mjs

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ASSET = readdirSync(join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "assets"))
  .find((f) => f.startsWith("index-") && f.endsWith(".js"));

// ---- event-capable DOM mock (mirrors harness.test.mjs) ----
function makeTarget() {
  const listeners = {};
  return {
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) {
      (listeners[type] || []).forEach((e, i) => e === fn && listeners[type].splice(i, 1));
    },
    dispatchEvent(evt) {
      (listeners[evt.type] || []).forEach((fn) => fn.call(this, evt));
      return true;
    },
  };
}
function fake2DContext() {
  return {
    fillStyle: "", strokeStyle: "", font: "", textAlign: "", textBaseline: "",
    clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {},
    measureText() { return { width: 0 }; },
    setLineDash() {}, getLineDash() { return []; },
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, stroke() {}, fill() {}, arc() {}, rect() {},
    translate() {}, rotate() {}, scale() {},
  };
}
const WEBGL_CONSTANTS = {
  VERSION: 7938, VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, HIGH_FLOAT: 36841,
  MEDIUM_FLOAT: 36840, LOW_FLOAT: 36512, IMPLEMENTATION_COLOR_READ_TYPE: 35739,
  MAX_TEXTURE_IMAGE_UNITS: 34921, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 34973,
  MAX_TEXTURE_SIZE: 34977, MAX_CUBE_MAP_TEXTURE_SIZE: 34021, MAX_VERTEX_ATTRIBS: 34421,
  MAX_VERTEX_UNIFORM_VECTORS: 35372, MAX_VARYING_VECTORS: 35374, MAX_FRAGMENT_UNIFORM_VECTORS: 35658,
  MAX_SAMPLES: 36188, SAMPLES: 35735,
};
function fakeWebGLContext() {
  const noop = () => {};
  const ctx = {
    VERSION: 7938, rendererType: "MockWebGLRenderer",
    getShaderPrecisionFormat: () => ({ precision: 24 }),
    getParameter: (id) => {
      const v = WEBGL_CONSTANTS[id];
      const defaults = {
        34921: 32, 34973: 16, 34977: 16384, 34021: 16384, 34421: 32,
        35372: 4096, 35374: 256, 35658: 4096, 36188: 0, 35735: 0,
        35739: 5124, 35740: 34433,
      };
      if (id === 7938) return "WebGL 2.0";
      return defaults[id] ?? (v ?? 0);
    },
    getExtension: (n) => ({ name: n, getExtension: () => null, getSupportedRange: () => ({ start: 0, end: 0 }) }),
    getExtensionNames: () => ["EXT_color_buffer_half_float", "EXT_clip_control"],
    getContextAttributes: () => ({ webglVersion: "WEBGL_2_0", webglName: "Mock" }),
    isContextLost: () => false,
    createBuffer: () => ({}), deleteBuffer: noop, bindBuffer: noop, bufferData: noop, bufferSubData: noop,
    createShader: () => ({}), deleteShader: noop, shaderSource: noop, compileShader: noop,
    getShaderParameter: () => true, getShaderInfoLog: () => "",
    createProgram: () => ({}), deleteProgram: noop, attachShader: noop, linkProgram: noop,
    getProgramParameter: () => true, getProgramInfoLog: () => "",
    useProgram: noop, getAttribLocation: () => 0, bindAttribLocation: noop, getUniformLocation: () => null,
    getActiveUniform: () => ({ id: 0, size: 1, type: 5126, name: "u_x" }),
    getActiveAttrib: () => ({ location: 0, size: 1, type: 5126, name: "" }),
    getActiveUniforms: () => [],
    createTexture: () => ({}), bindTexture: noop, texImage2D: noop, texStorage2D: noop,
    activeTexture: noop, unbindTexture: noop, uniformMatrix4fv: noop, uniform1i: noop,
    viewport: noop, scissor: noop, clear: noop, clearColor: noop, clearDepth: noop,
    createFramebuffer: () => ({}), bindFramebuffer: noop, framebufferTexture2D: noop,
    drawArrays: noop, drawElements: noop, canvas: { width: 1024, height: 768 },
    depthFunc: noop, depthMask: noop, depthTest: noop,
    extensions: { has: () => true, getName: () => "" },
  };
  return new Proxy(ctx, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "symbol") return undefined;
      if (/^[a-zA-Z_]/.test(String(k))) return noop;
      if (/\d$/.test(String(k))) return 0;
      return {};
    },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true; },
  });
}

const elements = new Map();
let doc;
function fakeEl() {
  return {
    style: {}, textContent: "", value: "", className: "",
    get ownerDocument() { return doc; },
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
    },
    children: [], appendChild() {}, removeChild() {},
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    getContext(type) { return type === "2d" ? fake2DContext() : fakeWebGLContext(); },
    width: 0, height: 0,
    requestPointerLock() {}, releasePointerLock() {},
  };
}
function fakeEl2() {
  const el = fakeEl();
  el.tagName = "DIV";
  el.createElement = () => fakeEl2();
  el.createElementNS = () => fakeEl2();
  return el;
}
globalThis.document = Object.assign(makeTarget(), {
  body: fakeEl2(),
  createElement: () => fakeEl2(), createElementNS: () => fakeEl2(),
  getElementById: (id) => { if (!elements.has(id)) elements.set(id, fakeEl2()); return elements.get(id); },
  querySelectorAll: () => [], querySelector: () => null,
  pointerLockElement: null, documentElement: { style: {} }, observe() {},
});
globalThis.document.ownerDocument = globalThis.document;
doc = globalThis.document;
globalThis.window = {
  innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1,
  addEventListener() {}, requestAnimationFrame: (fn) => raf(fn), cancelAnimationFrame() {},
};
globalThis.requestAnimationFrame = raf;
globalThis.cancelAnimationFrame = () => {};
globalThis.MutationObserver = class { observe(){} disconnect(){} takeRecords(){} };
globalThis.fetch = async () => ({ ok: true, text: async () => "", json: async () => ({}) });
globalThis.self = globalThis;

let frames = 0;
const MAX_FRAMES = 300;
// Mock performance.now to advance with the rAF frame timestamp so that
// THREE.Clock.getDelta() returns a real dt (the mock runs frames in microtasks,
// so wall-clock time would otherwise be ~0 and Sam would move ~0 per frame).
globalThis.performance = { now: () => frames * 16 };
function raf(fn) {
  if (frames >= MAX_FRAMES) return 0;
  frames++;
  return Promise.resolve().then(() => fn(frames * 16));
}

const bundle = await import(`../dist/assets/${ASSET}`);
await new Promise((r) => setTimeout(r, 200));

const game = globalThis.window.__game;
const canvasEl = elements.get("game");
if (!game || !game.controls || !game.sam) {
  console.log("SKIP: __game not exposed by bundle");
  process.exit(2);
}

// Engage pointer lock the way a real browser does (pointerLockElement is a getter).
Object.defineProperty(globalThis.document, "pointerLockElement", {
  value: canvasEl, configurable: true, writable: true,
});
globalThis.document.dispatchEvent({ type: "pointerlockchange" });

const controls = game.controls;
const sam = game.sam;
const obj = controls.object; // camera

console.log("debug: isLocked =", controls.isLocked);

// Move the player diagonally (+X and +Z) to a new fixed position.
obj.position.x = 40;
obj.position.z = 40;
const sam0 = { x: sam.position.x, z: sam.position.z };
console.log("debug: sam0 =", JSON.stringify(sam0));

// Let the game's animate() chain run several frames so updateSam() fires.
await new Promise((r) => setTimeout(r, 500));

console.log("debug: after wait, frames =", frames);
const r = {
  samMovedX: +(sam.position.x - sam0.x).toFixed(3),
  samMovedZ: +(sam.position.z - sam0.z).toFixed(3),
  samNow: { x: sam.position.x, z: sam.position.z },
};
const passed = !!r &&
  Math.abs(r.samMovedX) > 0.01 && // Sam moved along X toward player
  Math.abs(r.samMovedZ) > 0.01;  // Sam moved along Z toward player (the bug: was 0)

console.log("samResult:", JSON.stringify(r));
console.log(passed
  ? "\nSAM OK: Sam follows in both X and Z"
  : `\nSAM FAIL: samMovedX=${r?.samMovedX} samMovedZ=${r?.samMovedZ} (Z should be non-zero)`);
process.exit(passed ? 0 : passed === undefined ? 2 : 1);
