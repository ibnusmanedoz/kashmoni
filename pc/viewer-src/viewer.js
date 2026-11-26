// Kash Moni AI - 3D viewer (runs inside a sandboxed iframe).
// The parent sends three.js code; we run it, frame the camera, render,
// and send back a snapshot. Also exports GLB / PNG on request.
import * as THREE_CORE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

// THREE plus the most useful add-ons, all in one object for the AI's code.
const THREE = { ...THREE_CORE, OrbitControls, GLTFExporter, RoundedBoxGeometry, ConvexGeometry, BufferGeometryUtils };
window.THREE = THREE;

let renderer, scene, camera, controls, clock, frameFns = [], running = false, pmrem;

function setup(bg) {
  const wrap = document.getElementById("wrap");
  wrap.innerHTML = "";
  if (renderer) { renderer.dispose(); }
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(wrap.clientWidth || 640, wrap.clientHeight || 480);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  wrap.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(bg || "#1b2420");
  pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  camera = new THREE.PerspectiveCamera(45, (wrap.clientWidth || 640) / (wrap.clientHeight || 480), 0.01, 5000);
  camera.position.set(3, 2.5, 4);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  clock = new THREE.Clock();
  frameFns = [];
}

function addDefaultLights() {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334433, 0.6);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(5, 8, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(hemi, sun);
}

function frameScene() {
  const box = new THREE.Box3();
  scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) box.expandByObject(o); });
  if (box.isEmpty()) return { size: [0, 0, 0] };
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.001);
  const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.15;
  const dir = new THREE.Vector3(1, 0.75, 1.25).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(dist));
  camera.near = dist / 100; camera.far = dist * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
  return { size: [size.x, size.y, size.z].map((v) => +v.toFixed(3)) };
}

function stats() {
  let meshes = 0, tris = 0;
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    meshes++;
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  });
  return { meshes, triangles: Math.round(tris) };
}

function loop() {
  if (!running) return;
  requestAnimationFrame(loop);
  const dt = clock.getDelta(), t = clock.elapsedTime;
  for (const f of frameFns) { try { f(dt, t); } catch (e) { report("frame error: " + e.message); frameFns = []; } }
  controls.update();
  renderer.render(scene, camera);
}

let lastId = null;
function report(err) { parent.postMessage({ type: "km3d-runtime-error", id: lastId, error: String(err) }, "*"); }
window.addEventListener("error", (e) => report(e.message));

async function run(msg) {
  running = false;
  lastId = msg.id;
  setup(msg.bg);
  const animate = (fn) => { if (typeof fn === "function") frameFns.push(fn); };
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction("THREE", "scene", "camera", "renderer", "controls", "animate", msg.code);
    await Promise.race([
      fn(THREE, scene, camera, renderer, controls, animate),
      new Promise((_, rej) => setTimeout(() => rej(new Error("The code took longer than 10 seconds")), 10000)),
    ]);
    let hasLight = false;
    scene.traverse((o) => { if (o.isLight) hasLight = true; });
    if (!hasLight && !scene.userData.noDefaultLights) addDefaultLights();
    const framed = scene.userData.keepCamera ? { size: [] } : frameScene();
    running = true;
    loop();
    // let a few frames render (and animations start) before the snapshot
    await new Promise((r) => setTimeout(r, msg.snapshotDelay || 400));
    renderer.render(scene, camera);
    const snapshot = msg.snapshot ? renderer.domElement.toDataURL("image/jpeg", 0.82) : null;
    parent.postMessage({ type: "km3d-result", id: msg.id, ok: true, snapshot, stats: { ...stats(), size: framed.size } }, "*");
  } catch (e) {
    running = false;
    parent.postMessage({ type: "km3d-result", id: msg.id, ok: false, error: (e && (e.stack || e.message)) ? String(e.message) + (e.stack ? "\n" + String(e.stack).split("\n").slice(1, 3).join("\n") : "") : String(e) }, "*");
  }
}

async function exportGLB(msg) {
  try {
    const exporter = new GLTFExporter();
    const objs = scene.children.filter((o) => !o.isLight);
    const result = await exporter.parseAsync(objs.length ? objs : scene, { binary: true, animations: [] });
    parent.postMessage({ type: "km3d-glb", id: msg.id, buffer: result }, "*", [result]);
  } catch (e) {
    parent.postMessage({ type: "km3d-glb", id: msg.id, error: String(e.message || e) }, "*");
  }
}

window.addEventListener("message", (ev) => {
  const msg = ev.data || {};
  if (msg.type === "km3d-run") run(msg);
  else if (msg.type === "km3d-export") exportGLB(msg);
  else if (msg.type === "km3d-png") { renderer.render(scene, camera); parent.postMessage({ type: "km3d-pngdata", id: msg.id, dataUrl: renderer.domElement.toDataURL("image/png") }, "*"); }
  else if (msg.type === "km3d-reset") frameScene();
});

window.addEventListener("resize", () => {
  if (!renderer) return;
  const w = document.getElementById("wrap");
  renderer.setSize(w.clientWidth, w.clientHeight);
  camera.aspect = w.clientWidth / w.clientHeight;
  camera.updateProjectionMatrix();
});

parent.postMessage({ type: "km3d-ready" }, "*");
