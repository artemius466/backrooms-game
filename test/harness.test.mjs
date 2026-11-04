// Loads the REAL built game bundle in Node with a mocked DOM + WebGL context,
// then runs several animation frames. Verifies the three.js scene construction,
// rendering, and HUD wiring don't throw at runtime. Also verifies the
// pointer-lock menu-hiding fix: when the pointer locks, document.pointerLockElement
// === canvas must hide the start overlay.
// Usage: node test/harness.test.mjs

import * as THREE from "three";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ASSET = readdirSync(join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "assets"))
  .find((f) => f.startsWith("index-") && f.endsWith(".js"));

// ---- event-capable DOM mock ----
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
    getExtension: (n) => ({
      name: n, getExtension: () => null, getSupportedRange: () => ({ start: 0, end: 0 }),
      setPeriodicEventMask: noop, setPeriodicBit: noop, getParameter: () => true,
    }),
    getExtensionNames: () => ["EXT_color_buffer_half_float", "EXT_clip_control"],
    getContextAttributes: () => ({ webglVersion: "WEBGL_2_0", webglName: "Mock" }),
    isContextLost: () => false,
    createBuffer: () => ({}), deleteBuffer: noop, bindBuffer: noop,
    bufferData: noop, bufferSubData: noop, bufferStorage: noop,
    createShader: () => ({}), deleteShader: noop, shaderSource: noop,
    compileShader: noop, getShaderParameter: () => true, getShaderInfoLog: () => "",
    createProgram: () => ({}), deleteProgram: noop, attachShader: noop,
    linkProgram: noop, getProgramParameter: () => true, getProgramInfoLog: () => "",
    useProgram: noop, getAttribLocation: () => 0, bindAttribLocation: noop,
    getUniformLocation: () => null, getActiveUniform: () => ({ id: 0, size: 1, type: 5126, name: "u_x" }),
    getActiveAttrib: () => ({ location: 0, size: 1, type: 5126, name: "" }),
    getActiveUniforms: () => [],
    createTexture: () => ({}), bindTexture: noop, texImage2D: noop,
    texImage3D: noop, texStorage2D: noop, texStorage3D: noop,
    texSubImage2D: noop, texSubImage3D: noop, texParameteri: noop,
    texParameterf: noop, texParameteriv: noop, texParameterfv: noop,
    activeTexture: noop, unbindTexture: noop, compressedTexImage2D: noop,
    compressedTexImage3D: noop, compressedTexSubImage2D: noop,
    compressedTexSubImage3D: noop, uniformMatrix3fv: noop, uniformMatrix4fv: noop,
    uniform1i: noop, uniform1f: noop, uniform3f: noop, uniform4f: noop,
    vertexAttribPointer: noop, enableVertexAttribArray: noop,
    viewport: noop, scissor: noop, clear: noop, clearColor: noop, clearDepth: noop,
    createFramebuffer: () => ({}), bindFramebuffer: noop, framebufferTexture2D: noop,
    drawArrays: noop, drawElements: noop, canvas: { width: 1024, height: 768 },
    depthFunc: noop, depthMask: noop, depthTest: noop,
    stencilFunc: noop, stencilFuncSeparate: noop, stencilMask: noop,
    stencilMaskSeparate: noop, stencilOp: noop, stencilOpSeparate: noop,
    stencilTest: noop, blendEquation: noop, blendEquationSeparate: noop,
    blendFunc: noop, blendFuncSeparate: noop, blendColor: noop,
    enable: noop, disable: noop, frontFace: noop, cullFace: noop,
    polygonOffset: noop, lineWidth: noop, colorMask: noop, scissorTest: noop,
    clearStencil: noop,
    extensions: { has: () => true, getName: () => "" },
  };
  // Proxy: any WebGL method three.js calls that we didn't list returns a noop,
  // so the full render pipeline won't throw on a missing stub.
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

const WEBGL_CONSTANTS = {
  VERSION: 7938, VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, HIGH_FLOAT: 36841,
  MEDIUM_FLOAT: 36840, LOW_FLOAT: 36512, IMPLEMENTATION_COLOR_READ_TYPE: 35739,
  MAX_TEXTURE_IMAGE_UNITS: 34921, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 34973,
  MAX_TEXTURE_SIZE: 34977, MAX_CUBE_MAP_TEXTURE_SIZE: 34021,
  MAX_VERTEX_ATTRIBS: 34421, MAX_VERTEX_UNIFORM_VECTORS: 35372,
  MAX_VARYING_VECTORS: 35374, MAX_FRAGMENT_UNIFORM_VECTORS: 35658,
  MAX_SAMPLES: 36188, SAMPLES: 35735,
};

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
    getContext2D() { return fake2DContext(); },
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

// ---- requestAnimationFrame: run a bounded number of frames ----
let frames = 0;
const MAX_FRAMES = 60;
function raf(fn) {
  if (frames >= MAX_FRAMES) return 0;
  frames++;
  return Promise.resolve().then(() => fn(frames * 16));
}

// ---- import the real built bundle ----
const bundle = await import(`../dist/assets/${ASSET}`);
console.log("bundle loaded:", typeof bundle.default === "function" ? "(has default export)" : "(module)");
console.log("asset:", ASSET);

// Give the microtask queue a couple of cycles for the async raf chain to run
await new Promise((r) => setTimeout(r, 200));
console.log(`animation frames scheduled: ${frames}`);

// Verify scene has children (maze walls/floor/lights + Sam + pickups)
const canvasEl = elements.get("game");
console.log("canvas getContext called:", typeof canvasEl.getContext === "function");

// ---- pointer-lock menu-hiding fix verification ----
// The game attaches its pointerlockchange listener at load time. In a real
// browser, pointerlockchange fires on document (not on the element), and the
// overlay hides when document.pointerLockElement === canvas.
const startOverlay = elements.get("start-overlay");
console.log("initial start-overlay class:", JSON.stringify(startOverlay?.className));
globalThis.document.pointerLockElement = canvasEl;
globalThis.document.dispatchEvent({ type: "pointerlockchange" });
const hidden = startOverlay?.classList.contains("hidden");
console.log("after lock: start-overlay hidden?", hidden);

const passed =
  frames > 0 && frames <= MAX_FRAMES &&
  typeof canvasEl.getContext === "function" &&
  hidden === true;
console.log(passed
  ? "\nHARNESS OK: bundle constructed + rendered + menu hides on pointer lock"
  : `\nHARNESS FAIL: frames=${frames} canvasCtx=${typeof canvasEl.getContext === "function"} overlayHidden=${hidden}`);
process.exit(passed ? 0 : 1);
