/**
 * LM.SPACE -- the leaderboard as a volume.
 *
 * Every model is a body in three dimensions: price on X, intelligence on Y,
 * output speed on Z. Nothing here is interpolated or inferred -- a coordinate
 * is a field of the Artificial Analysis payload, and a model missing one of
 * those fields is placed in an annexe outside the measured box where the
 * unmeasured axis visibly drifts rather than pretending to a value.
 *
 * Loaded on demand: three.js and the ~640KB of marks and sky are only fetched
 * when this view is opened, so they never enter the main bundle.
 */
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

const ASSETS = '/lm-space';

/**
 * @typedef {'A'|'B'|'D'|'X'} Quadrant
 *   A: price and speed both measured -- a real position on all three axes.
 *   B: no speed. D: intelligence only. X: nothing measured.
 */

/**
 * Flatten the API payload into the shape the scene plots, and record for each
 * model which of its coordinates are real. Speed is the scarcest field
 * upstream, so this split is what lets the whole field be shown at once
 * without inventing the gaps.
 */
function prepare(payload) {
  const out = [];
  for (const m of payload.models) {
    const e = m.evaluations ?? {};
    const pr = m.pricing ?? {};
    const i = e.artificial_analysis_intelligence_index ?? null;
    const price = pr.price_1m_blended_3_to_1 ?? null;
    const sp = m.median_output_tokens_per_second ?? null;
    /** @type {Quadrant} */
    const q = i == null ? 'X' : price != null && sp != null ? 'A' : price != null ? 'B' : 'D';
    out.push({
      n: m.name,
      s: m.slug ?? '',
      c: m.model_creator?.name ?? 'Unknown',
      d: m.release_date ?? null,
      i,
      cd: e.artificial_analysis_coding_index ?? null,
      ag: e.artificial_analysis_agentic_index ?? null,
      p: price,
      pi: pr.price_1m_input_tokens ?? null,
      po: pr.price_1m_output_tokens ?? null,
      sp,
      t: m.median_time_to_first_token_seconds ?? null,
      q
    });
  }
  return out;
}

/**
 * Build the scene into `root`.
 *
 * Returns a disposer: the view is mounted and unmounted with the tab, and a
 * WebGL context plus a running animation frame outlive their DOM unless they
 * are explicitly released.
 */
export async function mountLmSpace(root, payload) {
const MODELS = prepare(payload);
const N = MODELS.length;
const DATA = { fetchedAt: payload.fetchedAt, v: payload.intelligenceIndexVersion };

const [ATLAS, BRAND] = await Promise.all([
  fetch(`${ASSETS}/atlas.json`).then((r) => r.json()),
  fetch(`${ASSETS}/brand.json`).then((r) => r.json())
]);

const $ = (id) => root.querySelector('#' + id);
const S = 100;

/* Listeners are registered through these so they can all be released together:
   the view is mounted and unmounted with its tab, and a stray keydown handler
   driving a disposed renderer is a leak that survives navigation. */
const winOff = [];
function onWin(type, fn, opts) {
  window.addEventListener(type, fn, opts);
  winOff.push(() => window.removeEventListener(type, fn, opts));
}
function onDoc(type, fn, opts) {
  document.addEventListener(type, fn, opts);
  winOff.push(() => document.removeEventListener(type, fn, opts));
}

/* The stage is a panel in the workbench, not the window. Sizing to
   innerWidth/innerHeight renders a canvas larger than its container and shows
   only its top-left corner. A hidden panel measures 0, which would make the
   projection matrix degenerate, so hold the last good size until it is laid
   out again. */
let stageW = 1, stageH = 1;
function measureStage() {
  const w = root.clientWidth, h = root.clientHeight;
  if (w > 0 && h > 0) { stageW = w; stageH = h; return true; }
  return false;
}
measureStage();

function dispose() {
  running = false;
  cancelAnimationFrame(rafId);
  for (const off of winOff) off();
  renderer.dispose();
  renderer.forceContextLoss();
  scene.traverse((o) => {
    o.geometry?.dispose?.();
    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
    else o.material?.dispose?.();
  });
  atlasTex.dispose();
  skyTex.dispose();
  tipEl.remove();
}

const CREATORS = [...new Set(MODELS.map((m) => m.c))]
  .map((c) => [c, MODELS.filter((m) => m.c === c).length])
  .sort((a, b) => b[1] - a[1]);

/* Each creator wears its own brand colour, taken from that vendor's mark --
 * extracted from the favicon where the logo is chromatic, and the published
 * brand colour where the mark is monochrome (OpenAI, Anthropic, xAI, IBM).
 * A fallback hue is derived from the name only if a vendor is missing, so a
 * new creator appearing upstream still gets a stable colour. */
const FALLBACK = ['#8a94a6', '#a3adbb', '#75808e'];

/* Every creator carries up to four stops, not one flat fill: the vendors whose
 * mark is genuinely multi-colour (Google's four, Microsoft's four, Mistral's
 * flame) keep those colours, and a single-colour brand is spread into analogous
 * stops. All of them are remapped into the site's One Dark envelope -- hue is
 * preserved because that is what carries the identity, while saturation and
 * lightness are pulled down to the muted range the rest of the UI uses. */
const stopsOf = new Map();
CREATORS.forEach(([c]) => stopsOf.set(c, BRAND[c] || FALLBACK));
/** The single colour used wherever one is needed: legends, borders, labels. */
const colorOf = new Map();
CREATORS.forEach(([c]) => colorOf.set(c, stopsOf.get(c)[0]));

const hidden = new Set();

/* ---------- scales ---------- */
const lg = (v) => Math.log10(Math.max(v, 0.01) + 0.05);
const ext = (fn) => {
  const vs = MODELS.map(fn).filter(Number.isFinite);
  return [Math.min(...vs), Math.max(...vs)];
};
/* ---------- axis scales, derived from the data at load ---------------------- *
 * Using the raw minimum and maximum wastes most of an axis whenever the field
 * has outliers. Output speed runs 11.8 to 1574 tok/s, but the median is 92 and
 * only 23 models sit above 385 -- scaled to the full range, 93% of the field
 * crowded into the bottom half and the rest of the axis was empty.
 *
 * So each axis is scaled to the 2nd-98th percentile of the values actually
 * present and the handful beyond that is clamped to the ends. Measured on this
 * payload it takes speed from five of ten tenths occupied to all ten, and costs
 * 12 of 326 models their exact position at the extremes -- which is the right
 * trade, because those positions were unreadable anyway.
 */
function robustExtent(fn, loQ = 0.02, hiQ = 0.98) {
  const vs = MODELS.map(fn).filter(Number.isFinite).sort((a, b) => a - b);
  if (!vs.length) return [0, 1];
  const lo = vs[Math.floor(vs.length * loQ)];
  const hi = vs[Math.ceil(vs.length * hiQ) - 1];
  return hi > lo ? [lo, hi] : [vs[0], vs[vs.length - 1] || vs[0] + 1];
}
const [pLo, pHi] = robustExtent((m) => (m.p == null ? NaN : lg(m.p)));
const [sLo, sHi] = robustExtent((m) => (m.sp == null ? NaN : lg(m.sp)));
const [iLo, iHi] = robustExtent((m) => (m.i == null ? NaN : m.i));
const dNum = (m) => (m.d ? Date.parse(m.d) : NaN);
const [dLo, dHi] = robustExtent(dNum);

/** Position on an axis, clamped: the few models beyond the percentile band sit
 *  at the ends rather than flying off the scale. */
const norm = (v, lo, hi) => (hi === lo ? 0.5 : Math.max(0, Math.min(1, (v - lo) / (hi - lo))));

/* ---------- where a model sits, and what that position claims --------------- *
 * Speed is the scarcest field upstream: 322 models carry all three axes, 96
 * have price but no measured throughput, and 193 have only an intelligence
 * score. Plotting just the complete 322 threw away half the field; inventing
 * the missing numbers would be worse.
 *
 * So the box is divided. The main quadrant (+X +Z) holds models whose three
 * coordinates are all real measurements. The two annexes hold the rest, and in
 * an annexe a coordinate along a missing axis is NOT a value -- it is a parking
 * position, sorted by intelligence so the band stays readable. Every axis that
 * IS measured keeps its true scale in every quadrant, so a model in the annexe
 * can still be compared by price and by intelligence.
 */
const ANNEX_GAP = 22;          // dead space between the main box and an annexe
// The band only has to read as "this axis has no value"; making it as deep as
// the measured box gave the unmeasured regions more of the scene than the data
// they cannot describe deserves.
const ANNEX_D = 30;            // depth of an annexe band

/** Rank within a quadrant, used to spread a band along its parking axis. */
const bandRank = new Map();
(() => {
  for (const q of ['B', 'D']) {
    const list = MODELS.map((m, i) => [m, i]).filter(([m]) => m.q === q)
      .sort((a, b) => (a[0].i ?? 0) - (b[0].i ?? 0));
    list.forEach(([, i], k) => bandRank.set(i, list.length > 1 ? k / (list.length - 1) : 0.5));
  }
})();

const posSpace = (m, idx) => {
  const y = (norm(m.i, iLo, iHi) - 0.5) * 2 * S;         // always a real value
  if (m.q === 'A') {
    return new THREE.Vector3(
      (norm(lg(m.p), pLo, pHi) - 0.5) * 2 * S,
      y,
      (norm(lg(m.sp), sLo, sHi) - 0.5) * 2 * S
    );
  }
  if (m.q === 'B') {
    // Price is real, so X keeps its true scale. Speed was never measured, so
    // rather than parking the model at a fixed depth -- which would read as a
    // value -- it wanders along Z, outside the measured box.
    return new THREE.Vector3(
      (norm(lg(m.p), pLo, pHi) - 0.5) * 2 * S,
      y,
      wanderAxis(idx, 0, 0)
    );
  }
  if (m.q === 'D') {
    // Neither price nor speed is known, so both horizontal coordinates wander.
    return new THREE.Vector3(wanderAxis(idx, 1, 0), y, wanderAxis(idx, 2, 0));
  }
  // 'X': not one field is measured, so it has no business inside any region.
  return driftPos(idx, 0);
};

/* ---------- unknown coordinates wander ---------- *
 * A model missing a field has no position along that axis. Parking it at a
 * fixed slot outside the box was still a position, and a still one reads as a
 * measurement. Instead the unknown coordinate drifts slowly back and forth
 * beyond the measured range: the model holds its true height (and its true
 * price, where it has one) while the axis it was never measured on visibly
 * refuses to settle.
 */
const WANDER_MIN = S + ANNEX_GAP;          // never inside the measured box
const WANDER_SPAN = ANNEX_D;

function wanderAxis(idx, salt, time) {
  // Deterministic per model and per axis, so a model keeps its own rhythm.
  const seed = idx * 12.9898 + salt * 78.233;
  const phase = (Math.sin(seed) * 43758.5453) % 1;
  const rate = 0.06 + Math.abs(Math.sin(seed * 1.7)) * 0.10;
  const t = Math.sin(time * rate + phase * Math.PI * 2) * 0.5 + 0.5;
  return -(WANDER_MIN + t * WANDER_SPAN);
}

/* ---------- the unplaced ---------- *
 * Thirteen models carry no intelligence score, hence no price or speed either.
 * Rather than dropping them silently they circle the whole map: each on its own
 * slow, tilted orbit, so they read as belonging to the set but not to any
 * position within it.
 */
// Wide enough to clear the annexes as well as the measured box.

const driftTmp = new THREE.Vector3();
// The far corner of the annexes is the furthest point any box reaches, so the
// orbit has to clear that, not merely the measured box.
const BOX_REACH = Math.hypot(WANDER_MIN + WANDER_SPAN, WANDER_MIN + WANDER_SPAN);

/** Effort variants share one wandering path, so a family drifts as a group. */
const driftAnchor = new Int32Array(N);
for (let i = 0; i < N; i++) driftAnchor[i] = i;

function driftPos(idx, time) {
  // A family's variants follow the same trajectory with a small fixed offset:
  // scattered across the void they read as unrelated models, when they are one
  // model at several settings.
  const lead = driftAnchor[idx];
  if (lead !== idx) {
    const p = driftPos(lead, time);
    const k = idx - lead;
    return p.clone().add(new THREE.Vector3(
      Math.sin(k * 2.1) * 7, Math.cos(k * 1.7) * 5, Math.sin(k * 3.3) * 7
    ));
  }
  // Not an orbit. A circle reads as something in a fixed relationship with the
  // centre, which is the opposite of what these are: they have no coordinate at
  // all. Each wanders its own irregular path -- three slow sine terms per axis
  // at unrelated periods, so the trajectory never repeats visibly -- and is
  // simply pushed clear of every box.
  const a = idx * 2.399963;                       // golden angle: no clumping
  const s1 = Math.sin(a), s2 = Math.sin(a * 1.7), s3 = Math.sin(a * 2.9);
  const r1 = 0.031 + (idx % 7) * 0.004;
  const r2 = 0.019 + (idx % 5) * 0.005;
  const r3 = 0.043 + (idx % 3) * 0.006;

  let x = Math.sin(time * r1 + a) + 0.6 * Math.sin(time * r3 + s2 * 6.0);
  let y = Math.sin(time * r2 + s1 * 6.0) + 0.5 * Math.sin(time * r1 * 1.3 + a);
  let z = Math.cos(time * r1 * 0.8 + s3 * 6.0) + 0.6 * Math.sin(time * r2 + a);

  // A stable offset per model so they do not all drift through the same volume.
  x += s1 * 1.5; y += s2 * 0.9; z += s3 * 1.5;

  // Keep the direction, then push the point clear of everything the plot
  // occupies. Scaling by a radius is not enough on its own: the boxes are
  // rectangular, so a direction near a corner can still land inside one even
  // at a radius larger than the box's half-width. The horizontal distance is
  // therefore also checked against the actual extent of the regions.
  const len = Math.hypot(x, y, z) || 1;
  const reach = BOX_REACH * (1.10 + ((idx * 5) % 8) / 8 * 0.24);
  let px = x / len * reach;
  let py = y / len * reach * 0.55;
  let pz = z / len * reach;

  // Everything the plot occupies lies within this square on X and Z, from the
  // far corner of the annexes to the far edge of the measured box.
  const EX_MIN = -(WANDER_MIN + WANDER_SPAN) - 12, EX_MAX = S + 12;
  const inside = px > EX_MIN && px < EX_MAX && pz > EX_MIN && pz < EX_MAX
                 && py > -S - 12 && py < S + 12;
  if (inside) {
    // Push out along whichever horizontal axis it is nearest to escaping by,
    // so the body skirts the outside of the regions instead of crossing them.
    const dx = px > (EX_MIN + EX_MAX) / 2 ? EX_MAX - px : EX_MIN - px;
    const dz = pz > (EX_MIN + EX_MAX) / 2 ? EX_MAX - pz : EX_MIN - pz;
    if (Math.abs(dx) < Math.abs(dz)) px += dx + Math.sign(dx) * 26;
    else pz += dz + Math.sign(dz) * 26;
  }
  return driftTmp.set(px, py, pz).clone();
}

/** One lane per creator, ordered by how many models they have. Still used by
 *  RACE's own side-lane layout (raceLaneZ, below), independently of posTime. */
const laneOf = new Map(CREATORS.map(([c], i) => [c, i]));

/* TIMELINE's X/Z used to be release date and creator lane, on a flat grid.
 * They are now one axis, not two: release date alone, run out as a spiral --
 * the earliest model sits at the centre, and each later one lands further
 * round and further out, the way a time axis reads on a clock face rather
 * than a ruler. Y keeps its own meaning, intelligence, unchanged -- the
 * spiral is what got rebuilt, not the whole layout.
 *
 * Wound at the true release-date pace, months with several launches placed
 * their bodies close enough to overlap outright -- a real release calendar
 * is bursty, not evenly spaced. So the spiral parameter is not quite the raw
 * date: each model is pushed at least MIN_ARC further along the curve than
 * whichever of its neighbours came just before it, in release order. A
 * launch week with ten models spreads those ten out along a short stretch of
 * curve instead of stacking them at one point; everything not that
 * crowded still lands within a hair of its true chronological position. */
const SPIRAL_TURNS = 4.5;
const SPIRAL_R = S * 2.2;      // outer radius -- wider than the box was, so a
                                // full turn's worth of bodies has room to sit apart
const MIN_ARC = 6.5;            // minimum spacing along the curve, in scene units
const spiralParam = new Float32Array(N);
{
  const order = MODELS.map((m, i) => i).sort((a, b) => dNum(MODELS[a]) - dNum(MODELS[b]));
  let prevS = -1;
  for (const i of order) {
    const raw = norm(dNum(MODELS[i]), dLo, dHi);
    // The parameter can only move forward from the previous body's -- release
    // order stays intact even where the minimum spacing pushes a date's true
    // position later than its neighbour's true position would have been.
    let s = Math.max(raw, prevS);
    if (prevS >= 0) {
      // Arc length is approximated as radius times the angle swept, evaluated
      // at the outer of the two points -- exact enough for a spacing floor,
      // not meant as a true rectification of the curve.
      const radius = Math.max(s, 0.02) * SPIRAL_R;
      const minDs = MIN_ARC / (radius * SPIRAL_TURNS * Math.PI * 2);
      if (s < prevS + minDs) s = prevS + minDs;
    }
    spiralParam[i] = s;
    prevS = s;
  }
  // Renormalise back to 0..1: the spacing floor can push the last few points
  // past a parameter of 1, which would draw them outside every ring and
  // label built for the 0..1 range.
  const maxS = prevS || 1;
  for (let i = 0; i < N; i++) spiralParam[i] /= maxS;
}
const posTime = (m, idx) => {
  const t01 = spiralParam[idx];
  const angle = t01 * SPIRAL_TURNS * Math.PI * 2;
  const radius = t01 * SPIRAL_R;
  // A pure curve puts every model from the same moment on the same point;
  // the same per-model jitter posSpace uses for drift keeps a release date
  // with several launches that day readable as several bodies, not one.
  const jx = (idx * 12.9898 % 1 - 0.5) * 5;
  const jz = (idx * 78.233 % 1 - 0.5) * 5;
  return new THREE.Vector3(
    Math.cos(angle) * radius + jx,
    (norm(m.i, iLo, iHi) - 0.5) * 2 * S,
    Math.sin(angle) * radius + jz
  );
};

/* RACE keeps the flat grid TIMELINE used to have -- release date on X,
 * creator lane on Z -- rather than the spiral: a replay you can scrub with
 * transport controls needs a straight track to read progress along, and the
 * standings panel already reports rank as a list, so the spiral's "further
 * round the curve" reading would just fight the panel that already says the
 * same thing in text. */
const posRace = (m, idx) => new THREE.Vector3(
  (norm(dNum(m), dLo, dHi) - 0.5) * 2 * S,
  (norm(m.i, iLo, iHi) - 0.5) * 2 * S,
  (laneOf.get(m.c) / Math.max(CREATORS.length - 1, 1) - 0.5) * 2 * S
);

/* ---------- scene ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0b0d);
// No exponential fog: it would grey out the sky sphere along with the data.


/* Two cameras share one transform. Perspective is right for flying through the
 * cloud; orthographic removes foreshortening, so bodies the same size read the
 * same size wherever they sit -- which is what you want when comparing
 * positions along an axis rather than exploring. */
const persp = new THREE.PerspectiveCamera(62, stageW / stageH, 0.5, 3000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000);
let camera = persp;
let projMode = 'persp';
/** Set once the projection ◄ value ► cycle is wired, below; setProjection can
 *  run before then (setView is called at boot before the HUD is wired up). */
let paintProjCycle;
/** Set once the view ◄ value ► cycle is wired; startRace/stopRace can be
 *  triggered before then is never true in practice, but keeping the same
 *  optional-call shape as paintProjCycle costs nothing and rules it out. */
let paintViewCycle;
/** World height the orthographic view spans; kept in step with the dolly. */
let orthoZoom = 300;

function sizeOrtho() {
  const a = stageW / stageH;
  ortho.left = -orthoZoom * a * 0.5;
  ortho.right = orthoZoom * a * 0.5;
  ortho.top = orthoZoom * 0.5;
  ortho.bottom = -orthoZoom * 0.5;
  ortho.updateProjectionMatrix();
}
sizeOrtho();

function setProjection(mode) {
  if (mode === projMode) return;
  const from = camera;
  projMode = mode;
  camera = mode === 'persp' ? persp : ortho;
  camera.position.copy(from.position);
  camera.quaternion.copy(from.quaternion);
  if (mode === 'ortho') sizeOrtho();
  paintProjCycle?.();
  syncProjUI();
}

/* Framed on the measured box, close enough that the orbs read as objects
   rather than dots. The old position sat back far enough to include the
   annexes, which put the actual data in the middle distance. */
const HOME = new THREE.Vector3(-25, 48, 190);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(stageW, stageH);
$('app').appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer({ element: $('labels') });
labelRenderer.setSize(stageW, stageH);

scene.add(new THREE.AmbientLight(0xffffff, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(1, 1.4, 0.8);
scene.add(key);

/* ---------- backdrop: a galactic panorama on the inside of a sphere -------- *
 * Drawn procedurally rather than fetched, so the demo stays self-contained and
 * the band can be kept dim and desaturated -- the models must remain the
 * brightest thing on screen. It is a backdrop, not data.
 */
const skyTex = await new THREE.TextureLoader().loadAsync(`${ASSETS}/sky.jpg`);
skyTex.colorSpace = THREE.SRGBColorSpace;
skyTex.mapping = THREE.EquirectangularReflectionMapping;
// The panorama is a cylinder, so the horizontal axis must repeat: with the
// default clamp the sampler holds the last column at the meridian and the two
// edges meet as a visible line. Repeating lets it interpolate across instead.
skyTex.wrapS = THREE.RepeatWrapping;
skyTex.wrapT = THREE.ClampToEdgeWrapping;
// A mip level averages the whole row near the poles, which reintroduces a seam
// as a bright band; linear filtering without mips avoids it on a backdrop that
// is never seen at a grazing angle.
skyTex.generateMipmaps = false;
skyTex.minFilter = THREE.LinearFilter;
const skyMat = new THREE.MeshBasicMaterial({
  map: skyTex, side: THREE.BackSide, depthWrite: false, color: 0x4a525e
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 32), skyMat);
sky.rotation.y = 0.6;
sky.renderOrder = -1;
scene.add(sky);



/* ---------- star dust ---------- *
 * A thin field of motes filling the space between the bodies. It is what gives
 * flying through the scene any sense of speed -- without something in the near
 * field, moving the camera through empty black reads as nothing happening.
 *
 * Deliberately cheap: 1400 points in one buffer, no per-frame CPU work beyond
 * wrapping them around the camera, and additive so they never occlude data.
 */
const DUST_N = 1400, DUST_BOX = 420;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST_N * 3);
const dustSeed = new Float32Array(DUST_N);
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * DUST_BOX;
  dustPos[i * 3 + 1] = (Math.random() - 0.5) * DUST_BOX;
  dustPos[i * 3 + 2] = (Math.random() - 0.5) * DUST_BOX;
  dustSeed[i] = Math.random();
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1));
const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  glslVersion: THREE.GLSL3,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `
    in float aSeed;
    uniform float uTime;
    out float vA;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float d = -mv.z;
      // Fade in from the near plane and out into the distance, so motes appear
      // and vanish softly instead of popping at the wrap boundary.
      vA = smoothstep(6.0, 40.0, d) * (1.0 - smoothstep(140.0, 300.0, d));
      // A slow twinkle keeps the field from looking like fixed grain.
      vA *= 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.4 + aSeed) + aSeed * 40.0));
      gl_PointSize = (1.0 + aSeed * 1.4) * (70.0 / max(d, 1.0));
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    in float vA; out vec4 o;
    void main() {
      vec2 q = gl_PointCoord - 0.5;
      float m = smoothstep(0.5, 0.05, length(q));
      float a = m * vA * 0.30;
      if (a < 0.004) discard;
      o = vec4(0.72, 0.78, 0.88, a);
    }`
}));
dust.frustumCulled = false;
scene.add(dust);

/** Wrap the field around the camera so it is never flown out of. */
function updateDust(t) {
  dust.material.uniforms.uTime.value = t;
  const c = camera.position;
  let moved = false;
  for (let i = 0; i < DUST_N; i++) {
    for (let k = 0; k < 3; k++) {
      const a = i * 3 + k;
      const rel = dustPos[a] - (k === 0 ? c.x : k === 1 ? c.y : c.z);
      if (rel > DUST_BOX / 2) { dustPos[a] -= DUST_BOX; moved = true; }
      else if (rel < -DUST_BOX / 2) { dustPos[a] += DUST_BOX; moved = true; }
    }
  }
  if (moved) dustGeo.attributes.position.needsUpdate = true;
}

/* ---------- the measurement cage ---------- *
 * Three thin lines and a floor grid told you where the origin was but did
 * nothing to help you read a position in depth, which is the hard part of any
 * 3D scatter. This draws a proper instrument instead:
 *
 *   - a full wireframe box, so every point sits inside a volume you can judge
 *     against rather than floating beside three rays;
 *   - graduated ticks on all three axes, brighter at decade boundaries;
 *   - two back walls carrying a faint gridded lattice, which give parallax and
 *     make depth legible when the camera moves;
 *   - a floor "shadow" under every body, dropping the 3D cloud onto a 2D plane
 *     so you can read the price/speed footprint directly.
 *
 * The walls are drawn only on the far side of the box: rendering all six would
 * put a lattice between you and the data from every angle.
 */
const frame = new THREE.Group();
scene.add(frame);

const AX = { x: '#e5c07b', y: '#56b6c2', z: '#61afef' };

function lineSet(pts, hex, opacity, width = 1) {
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color: hex, transparent: true, opacity, linewidth: width
  }));
}
const zoneTags = [];
function tag(text, pos, color, cls = 'tag', tip) {
  const d = document.createElement('div');
  d.className = cls; d.textContent = text; d.style.color = color;
  // Long explanations become hover text: a sentence floating in the scene is
  // read once and then is only clutter, but it still has to be available.
  if (tip) { d.title = tip; d.classList.add('has-tip'); }
  const o = new CSS2DObject(d); o.position.copy(pos);
  if (cls.includes('zone') || cls.includes('axmain')) zoneTags.push(o);
  return o;
}

// --- the box: twelve edges, the three at the origin corner in axis colour ---
const V = (x, y, z) => new THREE.Vector3(x * S, y * S, z * S);
const boxEdges = [
  // the three measured axes, drawn strongly
  [V(-1,-1,-1), V( 1,-1,-1), AX.x, 1.0],
  [V(-1,-1,-1), V(-1, 1,-1), '#78889a', 0.55],   // just a cage edge now
  [V(-1,-1,-1), V(-1,-1, 1), AX.z, 1.0],
  // the rest of the cage, faint
  [V( 1,-1,-1), V( 1, 1,-1), '#78889a', 0.55],
  [V( 1,-1,-1), V( 1,-1, 1), '#78889a', 0.55],
  [V(-1, 1,-1), V( 1, 1,-1), '#78889a', 0.55],
  [V(-1, 1,-1), V(-1, 1, 1), '#78889a', 0.55],
  [V(-1,-1, 1), V( 1,-1, 1), '#78889a', 0.55],
  [V(-1,-1, 1), V(-1, 1, 1), '#78889a', 0.55],
  [V( 1, 1,-1), V( 1, 1, 1), '#78889a', 0.42],
  [V( 1,-1, 1), V( 1, 1, 1), '#78889a', 0.42],
  [V(-1, 1, 1), V( 1, 1, 1), '#78889a', 0.42]
];
for (const [a, b, hex, op] of boxEdges) frame.add(lineSet([a, b], hex, op));

/* The main volume needs to read as a room, not as twelve thin lines -- the
 * annexes have solid floors and walls, and without equivalent weight the
 * measured region looked like the weaker of the three. It gets a floor, a
 * tinted skin on the far faces only, and bracketed corners. */

// Floor: a solid plate under the measured region.
{
  const g = new THREE.PlaneGeometry(S * 2, S * 2);
  const floorMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: 0x121820, transparent: true, opacity: 0.72,
    side: THREE.DoubleSide, depthWrite: false
  }));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -S - 0.6;
  floorMesh.renderOrder = -1;
  frame.add(floorMesh);
}

// Corner brackets: short thick runs at every vertex, which is what makes a
// wireframe box read as an enclosure rather than as a diagram.
{
  const L = 0.16, pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = V(sx, sy, sz);
    pts.push(c, new THREE.Vector3(c.x - sx * L * S, c.y, c.z));
    pts.push(c, new THREE.Vector3(c.x, c.y - sy * L * S, c.z));
    pts.push(c, new THREE.Vector3(c.x, c.y, c.z - sz * L * S));
  }
  const brackets = lineSet(pts, '#9fb3c8', 0.75);
  frame.add(brackets);
}

// Skin: faint filled faces, drawn only on the sides facing away from the
// camera so the data is never seen through a tinted pane.
const skins = [];
for (const [axis, sign] of [['x', -1], ['x', 1], ['y', -1], ['z', -1], ['z', 1]]) {
  const g = new THREE.PlaneGeometry(S * 2, S * 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: 0x2a3a4a, transparent: true, opacity: 0.13,
    side: THREE.DoubleSide, depthWrite: false
  }));
  if (axis === 'x') { m.rotation.y = Math.PI / 2; m.position.x = sign * S; }
  else if (axis === 'y') { m.rotation.x = Math.PI / 2; m.position.y = sign * S; }
  else { m.position.z = sign * S; }
  m.userData = { axis, sign };
  m.renderOrder = -1;
  skins.push(m);
  frame.add(m);
}

/** Show only the faces behind the data, so nothing is viewed through a pane. */
function updateSkins() {
  for (const m of skins) {
    const { axis, sign } = m.userData;
    const c = axis === 'x' ? camera.position.x : axis === 'y' ? camera.position.y : camera.position.z;
    m.visible = frame.visible && (sign > 0 ? c < S : c > -S);
  }
}

// --- gridded back walls, shown only when they are behind the data ---
function wall(axis, sign, hex) {
  const pts = [];
  const D = 8;
  for (let k = 0; k <= D; k++) {
    const t = (k / D) * 2 - 1;
    if (axis === 'z') {
      pts.push(V(t, -1, sign), V(t, 1, sign));
      pts.push(V(-1, t, sign), V(1, t, sign));
    } else if (axis === 'x') {
      pts.push(V(sign, -1, t), V(sign, 1, t));
      pts.push(V(sign, t, -1), V(sign, t, 1));
    } else {
      pts.push(V(t, sign, -1), V(t, sign, 1));
      pts.push(V(-1, sign, t), V(1, sign, t));
    }
  }
  const m = lineSet(pts, hex, 0.10);
  m.userData.axis = axis;
  m.userData.sign = sign;
  return m;
}
// The cage edges, corner brackets and axis ticks already say "this is a box";
// a lattice on every wall said it a fourth time and crosshatched the scene.
const walls = [];
walls.forEach((w) => frame.add(w));

/** Keep only the walls facing away from the camera, so none sits in front. */
function updateWalls() {
  for (const w of walls) {
    const a = w.userData.axis, sg = w.userData.sign;
    const c = a === 'x' ? camera.position.x : a === 'y' ? camera.position.y : camera.position.z;
    w.visible = frame.visible && (sg > 0 ? c < S : c > -S);
  }
}

// --- ticks: a graduated rule along each axis ---
function ticks(axis, count) {
  const pts = [];
  for (let k = 0; k <= count; k++) {
    const t = (k / count) * 2 - 1;
    const big = k % 2 === 0;
    const L = big ? 0.045 : 0.025;
    if (axis === 'x') { pts.push(V(t, -1, -1), V(t, -1 + L, -1)); pts.push(V(t, -1, -1), V(t, -1, -1 + L)); }
    if (axis === 'y') { pts.push(V(-1, t, -1), V(-1 + L, t, -1)); pts.push(V(-1, t, -1), V(-1, t, -1 + L)); }
    if (axis === 'z') { pts.push(V(-1, -1, t), V(-1 + L, -1, t)); pts.push(V(-1, -1, t), V(-1, -1 + L, t)); }
  }
  return lineSet(pts, axis === 'x' ? AX.x : axis === 'y' ? AX.y : AX.z, 0.5);
}
// Only the two axes this box actually measures get an edge rule; height is
// read off the central spine instead.
frame.add(ticks('x', 10), ticks('z', 10));

// --- floor shadows: the cloud's footprint on the base plane ---
const shadowGeo = new THREE.BufferGeometry();
const shadowPos = new Float32Array(N * 3);
shadowGeo.setAttribute('position', new THREE.BufferAttribute(shadowPos, 3));
// Drawn with a shader rather than PointsMaterial so the dots stay small round
// marks: the default square sprite reads as chunky debris when you fly close to
// the floor, which is the one place the shadows should be least intrusive.
const shadows = new THREE.Points(shadowGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, glslVersion: THREE.GLSL3,
  vertexShader: `
    out float vFade;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      // Shrink with distance, but clamped so they never bloat up close.
      gl_PointSize = clamp(90.0 / -mv.z, 1.0, 4.0);
      // Fade out as the camera nears the floor plane, so the shadows stay a
      // background reference instead of covering the view.
      vFade = smoothstep(30.0, 150.0, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    in float vFade; out vec4 o;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float m = smoothstep(0.5, 0.15, length(d));
      float a = m * vFade * 0.11;
      if (a < 0.01) discard;
      o = vec4(0.56, 0.64, 0.72, a);
    }`
}));
shadows.frustumCulled = false;
frame.add(shadows);

function updateShadows() {
  if (!frame.visible) return;
  for (let i = 0; i < N; i++) {
    const off = isOff(MODELS[i]) || (raceOn && raceScale[i] < 0.999);
    shadowPos[i * 3] = off ? 0 : cur[i].x;
    shadowPos[i * 3 + 1] = off ? -9999 : -S + 0.5;
    shadowPos[i * 3 + 2] = off ? 0 : cur[i].z;
  }
  shadowGeo.attributes.position.needsUpdate = true;
}


/* ---------- annexe enclosures ---------- *
 * The annexes are walled off rather than merely tinted. A model sitting in one
 * has at least one coordinate that is a parking slot, not a measurement, and
 * that is a strong enough caveat to deserve a visible boundary: inside the main
 * box every position means something, outside it some positions do not.
 */
const annexGroup = new THREE.Group();
scene.add(annexGroup);

function boxWire(min, max, hex, opacity) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const c = [
    [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
    [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]
  ].map((p) => new THREE.Vector3(...p));
  const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const pts = [];
  for (const [a, b] of E) pts.push(c[a], c[b]);
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity })
  );
}

function buildAnnexes() {
  annexGroup.clear();
  const zA = -(WANDER_MIN), zB = -(WANDER_MIN + WANDER_SPAN);
  const AMBER = '#d19a66', GREY = '#7c8794';

  // B: price is real, so the annexe spans the full price axis.
  annexGroup.add(boxWire([-S - 6, -S, zB - 6], [S + 6, S, zA + 6], AMBER, 0.34));
  const bTag = tag('SPEED  ?', new THREE.Vector3(0, S + 6, (zA + zB) / 2), 'rgba(209,154,102,.85)',
                   'tag zone', 'Speed was never measured for these models. Price and height are real; ' +
                   'they drift along depth because that axis has no value.');
  annexGroup.add(bTag);

  // D: only intelligence is real, so the annexe is a corner block.
  annexGroup.add(boxWire([zB - 6, -S, zB - 6], [zA + 6, S, zA + 6], GREY, 0.30));
  annexGroup.add(tag('PRICE  ?   SPEED  ?', new THREE.Vector3((zA + zB) / 2, S + 6, (zA + zB) / 2),
                     'rgba(124,135,148,.8)', 'tag zone',
                     'Only an intelligence score exists upstream. Height is real; both ' +
                     'horizontal positions drift because neither axis has a value.'));

  // A floor for each annexe, so they read as rooms rather than floating cages.
  for (const [min, max, hex] of [
    [[-S - 6, zB - 6], [S + 6, zA + 6], 0x2a2117],
    [[zB - 6, zB - 6], [zA + 6, zA + 6], 0x1b1f24]
  ]) {
    const g = new THREE.PlaneGeometry(max[0] - min[0], max[1] - min[1]);
    const mesh2 = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false
    }));
    mesh2.rotation.x = -Math.PI / 2;
    mesh2.position.set((min[0] + max[0]) / 2, -S - 0.5, (min[1] + max[1]) / 2);
    annexGroup.add(mesh2);
  }
}
buildAnnexes();


/* ---------- the shared spine ---------- *
 * Intelligence is the one axis every quadrant is measured on: a model in an
 * annexe has no real X or Z, but its height is always a true score. So the
 * scale is drawn through the middle of the whole arrangement -- main box and
 * annexes alike -- rather than only along one edge of one box. Reading across
 * at a constant height is valid everywhere, and the spine is what says so.
 */
const spineGroup = new THREE.Group();
scene.add(spineGroup);
{
  // At the origin corner, where the price and speed rules already begin, so
  // all three axes meet at one point instead of the vertical one floating in
  // the middle of the cloud. The level rings still reach across every quadrant,
  // which is what carries "same height means same score" into the annexes.
  const cx = -S, cz = -S;

  // The shaft: a bright core with a wider, softer glow around it.
  const shaft = lineSet([new THREE.Vector3(cx, -S, cz), new THREE.Vector3(cx, S, cz)], AX.y, 0.95);
  // Depth-tested like everything else: drawing it on top made a UI element sit
  // visually in front of the data, which is what made the scene read as
  // scribbled over.
  shaft.material.depthTest = true;
  spineGroup.add(shaft);
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, S * 2, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x56b6c2, transparent: true, opacity: 0.11,
      side: THREE.DoubleSide, depthWrite: false })
  );
  glow.position.set(cx, 0, cz);
  spineGroup.add(glow);

  // Level rings: a hoop at each labelled score, so a height can be read off
  // anywhere in the scene, including inside an annexe.
  for (const v of [10, 20, 30, 40, 50, 60]) {
    if (v < iLo || v > iHi) continue;
    const y = (norm(v, iLo, iHi) - 0.5) * 2 * S;
    const major = v % 20 === 0;
    // The rule stands at the origin, but its level marks have to reach every
    // quadrant, so they are drawn as a rectangle spanning the whole occupied
    // region rather than as a circle around the shaft.
    const x0 = -S - ANNEX_GAP - ANNEX_D - 6, x1 = S;
    const z0 = -S - ANNEX_GAP - ANNEX_D - 6, z1 = S;
    const pts = [];
    const dash = (ax, az, bx, bz) => {
      const SEGS = 46;
      for (let k = 0; k < SEGS; k += 2) {
        const t0 = k / SEGS, t1 = (k + 1) / SEGS;
        pts.push(new THREE.Vector3(ax + (bx - ax) * t0, y, az + (bz - az) * t0));
        pts.push(new THREE.Vector3(ax + (bx - ax) * t1, y, az + (bz - az) * t1));
      }
    };
    dash(x0, z0, x1, z0); dash(x1, z0, x1, z1);
    dash(x1, z1, x0, z1); dash(x0, z1, x0, z0);
    // Only the major levels get a ring, and faintly: a dashed rectangle at every
    // step crossed through the clusters and read as noise.
    if (!major) continue;
    const hoop = lineSet(pts, AX.y, 0.10);
    spineGroup.add(hoop);
    // The spine now carries the only intelligence scale, so its numbers are
    // styled as a real rule rather than as faint annotations.
    const t = tag(String(v), new THREE.Vector3(cx, y, cz),
                  major ? 'rgba(86,182,194,1)' : 'rgba(86,182,194,.7)', 'tag spinenum');
    spineGroup.add(t);
  }

  spineGroup.add(tag('INTELLIGENCE', new THREE.Vector3(cx, S + 12, cz), 'rgba(86,182,194,.95)',
                     'tag axmain', 'The one axis every model is measured on. Its rings reach ' +
                     'across all regions: the same height always means the same score.'));
}

/* ---------- the spiral's own spine and wall ---------- *
 * TIMELINE has no box any more -- price and speed are gone, so a rectangular
 * frame around a spiral read as leftover scaffolding from the layout it used
 * to be. What replaces it: a thick central shaft carrying the intelligence
 * scale, and the time curve itself drawn once at the floor and swept upward
 * into a translucent wall, so the spiral reads as a shape in space -- a
 * tornado's surface -- rather than a bare line with nothing around it.
 */
const timeSpineGroup = new THREE.Group();
timeSpineGroup.visible = false;
scene.add(timeSpineGroup);
{
  const cx = 0, cz = 0;
  // Thicker than the box's own corner spine: this one has to read as the
  // single anchor for a whole open layout, not as one of three rules meeting
  // at a corner.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, S * 2, 16),
    new THREE.MeshBasicMaterial({ color: 0x56b6c2, transparent: true, opacity: 0.85 })
  );
  timeSpineGroup.add(shaft);
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, S * 2, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x56b6c2, transparent: true, opacity: 0.1,
      side: THREE.DoubleSide, depthWrite: false })
  );
  timeSpineGroup.add(glow);

  // The spiral wall: the same curve the bodies sit along the floor projection
  // of, swept from floor to ceiling. A ribbon strip rather than a full tube --
  // it only has to read as one continuous surface from outside, the way a
  // tornado's funnel is drawn as a wall rather than a solid.
  const WALL_SEGS = 240;
  const wallPos = [];
  for (let k = 0; k <= WALL_SEGS; k++) {
    const t = k / WALL_SEGS;
    const angle = t * SPIRAL_TURNS * Math.PI * 2;
    const r = t * SPIRAL_R;
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    wallPos.push(x, -S, z, x, S, z);
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
  const wallIdx = [];
  for (let k = 0; k < WALL_SEGS; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    wallIdx.push(a, b, c, b, d, c);
  }
  wallGeo.setIndex(wallIdx);
  wallGeo.computeVertexNormals();
  const wall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({
    color: 0x56b6c2, transparent: true, opacity: 0.07,
    side: THREE.DoubleSide, depthWrite: false
  }));
  timeSpineGroup.add(wall);
  // A brighter thread along the floor and one along the ceiling mark the
  // wall's two edges, the way the box's own edges were drawn brighter than
  // its faces.
  const floorPts = [], ceilPts = [];
  for (let k = 0; k < WALL_SEGS; k++) {
    for (const [dk, arr, y] of [[0, floorPts, -S], [1, ceilPts, S]]) {
      const t0 = k / WALL_SEGS, t1 = (k + 1) / WALL_SEGS;
      const a0 = t0 * SPIRAL_TURNS * Math.PI * 2, a1 = t1 * SPIRAL_TURNS * Math.PI * 2;
      const r0 = t0 * SPIRAL_R, r1 = t1 * SPIRAL_R;
      arr.push(new THREE.Vector3(Math.cos(a0) * r0, y, Math.sin(a0) * r0));
      arr.push(new THREE.Vector3(Math.cos(a1) * r1, y, Math.sin(a1) * r1));
    }
  }
  timeSpineGroup.add(lineSet(floorPts, 0xe5c07b, 0.5));
  timeSpineGroup.add(lineSet(ceilPts, AX.y, 0.35));

  // A ring at each level, wide enough to reach past the fully wound-out edge
  // of the spiral, so a height can still be read off out where the latest
  // models sit and not only near the centre.
  const ringR = SPIRAL_R + 14;
  for (const v of [10, 20, 30, 40, 50, 60]) {
    if (v < iLo || v > iHi) continue;
    const y = (norm(v, iLo, iHi) - 0.5) * 2 * S;
    const major = v % 20 === 0;
    const pts = [];
    const SEGS = 96;
    for (let k = 0; k < SEGS; k += 2) {
      const a0 = (k / SEGS) * Math.PI * 2, a1 = ((k + 1) / SEGS) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a0) * ringR, y, Math.sin(a0) * ringR));
      pts.push(new THREE.Vector3(Math.cos(a1) * ringR, y, Math.sin(a1) * ringR));
    }
    if (!major) continue;
    timeSpineGroup.add(lineSet(pts, AX.y, 0.10));
    timeSpineGroup.add(tag(String(v), new THREE.Vector3(cx, y, cz),
                       major ? 'rgba(86,182,194,1)' : 'rgba(86,182,194,.7)', 'tag spinenum'));
  }

  timeSpineGroup.add(tag('INTELLIGENCE', new THREE.Vector3(cx, S + 12, cz), 'rgba(86,182,194,.95)',
                     'tag axmain', 'The one axis every model is measured on, read the same way ' +
                     'here as through the centre of the box: height alone is the score.'));
  timeSpineGroup.add(tag('← EARLIEST', new THREE.Vector3(cx, -S - 10, cz), 'rgba(229,192,123,.85)',
                     'tag axmain', 'The spiral winds outward from here -- the centre is the ' +
                     'earliest release date in the field, and each later model lands further round.'));
}


/** Round decade-and-half steps inside a log range, for readable axis ticks. */
function niceTicks(logLo, logHi, want) {
  const lo = Math.pow(10, logLo), hi = Math.pow(10, logHi);
  const out = [];
  for (let e = Math.floor(logLo) - 1; e <= Math.ceil(logHi) + 1; e++) {
    for (const mant of [1, 2, 5]) {
      const v = mant * Math.pow(10, e);
      if (v >= lo * 0.98 && v <= hi * 1.02) out.push(v);
    }
  }
  // Thin out until roughly `want` remain, keeping the ends.
  while (out.length > want) {
    let drop = 1;
    for (let i = 1; i < out.length - 1; i += 2) { drop = i; break; }
    out.splice(drop, 1);
  }
  return out;
}
const fmtTick = (v) => (v >= 1000 ? (v / 1000) + 'k' : v >= 1 ? String(v) : String(v));

const axisLabels = [];
function buildAxisLabels(mode) {
  // TIMELINE has no box for these to sit at the edge of, so its own labels
  // are children of the spiral's spine instead -- which is hidden and shown
  // as a whole with the rest of that view, rather than needing its own
  // visibility bookkeeping here.
  const host = mode === 'space' ? frame : timeSpineGroup;
  axisLabels.forEach((l) => l.parent?.remove(l));
  axisLabels.length = 0;
  const mk = (t, p, c, cls) => { const l = tag(t, p, c, cls); axisLabels.push(l); host.add(l); };
  if (mode === 'space') {
    mk('PRICE  $/1M →', new THREE.Vector3(S + 6, -S, -S), AX.x);
    mk('SPEED  tok/s →', new THREE.Vector3(-S, -S, S + 6), AX.z);
    // Ticks are chosen from the scale the data produced, not hardcoded: a
    // fixed list either falls outside the axis or bunches at one end whenever
    // the distribution shifts.
    for (const v of niceTicks(pLo, pHi, 5)) {
      mk(v === 0 ? 'free' : '$' + fmtTick(v),
         new THREE.Vector3((norm(lg(v), pLo, pHi) - 0.5) * 2 * S, -S - 7, -S), 'rgba(229,192,123,.55)');
    }
    for (const v of niceTicks(sLo, sHi, 5)) {
      mk(fmtTick(v),
         new THREE.Vector3(-S - 4, -S - 7, (norm(lg(v), sLo, sHi) - 0.5) * 2 * S), 'rgba(97,175,239,.55)');
    }
  } else {
    // Month ticks sit on the spiral itself rather than an edge, at the same
    // radius and angle release dates from that month land at -- an edge label
    // has no fixed meaning left to point at once time is wound into a curve.
    // Every one is spelled out as "Aug/2024" and drawn as a filled chip
    // rather than a bare number: against a cloud of hundreds of spheres a
    // faint letter was unreadable, and half a date is ambiguous the moment
    // the spiral has wound past one full year.
    const MONTH3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let cursor = new Date(dLo); cursor.setUTCDate(1); cursor.setUTCHours(0, 0, 0, 0);
    if (cursor.getTime() < dLo) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    for (; cursor.getTime() <= dHi; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
      const t = cursor.getTime();
      const t01 = norm(t, dLo, dHi);
      const angle = t01 * SPIRAL_TURNS * Math.PI * 2;
      const radius = t01 * SPIRAL_R;
      const pos = new THREE.Vector3(Math.cos(angle) * radius, -S - 4, Math.sin(angle) * radius);
      mk(`${MONTH3[cursor.getUTCMonth()]}/${cursor.getUTCFullYear()}`, pos, '#e5c07b', 'tmonth');
    }
  }
  // No intelligence numbers here: that scale lives on the central spine, which
  // is shared by every quadrant. Repeating it on this edge implied the box had
  // its own separate vertical scale.
}

/* ---------- model orbs: sphere impostors carrying the creator's mark -------- *
 * Each model is ONE camera-facing quad that the fragment shader ray-traces
 * into a lit sphere -- the impostor technique used for atoms in molecular
 * viewers and for stars in point-cloud astrophysics renderers.
 *
 * Doing it this way rather than with real sphere geometry buys three things:
 * the mark is projected onto the sphere normal, so it faces the viewer from
 * every angle with no seam and no pole distortion; the silhouette stays
 * perfectly round however close you fly; and 322 lit, textured orbs cost one
 * draw call and 4 vertices each.
 */
const atlasTex = await new THREE.TextureLoader().loadAsync(`${ASSETS}/atlas.png`);
atlasTex.colorSpace = THREE.SRGBColorSpace;
atlasTex.generateMipmaps = true;
atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
atlasTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

const CW = 1 / ATLAS.cols, CH = 1 / ATLAS.rows;

const agE = ext((m) => (m.ag == null ? NaN : m.ag));

/* Radius is switchable, but only among fields no axis already shows: X, Y and
 * Z already draw price, intelligence and speed as position, so pressing one
 * of those into size too would just repeat an axis instead of adding one --
 * agentic and coding are the two the box has no other way to see. */
const RADIUS_FIELDS = {
  agentic: { get: (m) => m.ag, label: 'agentic', ext: agE },
  coding: { get: (m) => m.cd, label: 'coding', ext: ext((m) => (m.cd == null ? NaN : m.cd)) }
};
let radiusField = 'agentic';
const radiusOf = (m) => {
  const cfg = RADIUS_FIELDS[radiusField];
  const v = cfg.get(m);
  return v == null ? 1.7 : 1.5 + norm(v, cfg.ext[0], cfg.ext[1]) * 2.6;
};

/* ---------- filters ---------------------------------------------------------
 * Creator mutes are the original filter; each of these adds a numeric band on
 * one field. A model missing the field a filter is drawn on passes that
 * filter rather than being dropped by it -- a range you never opened should
 * not silently hide the two-thirds of the field with no measured speed, say.
 * Bounds are the same robust extents the axes themselves use, so the slider's
 * ends line up with where the box actually starts and stops. */
const RANGE_FIELDS = {
  price: { get: (m) => m.p, lo: Math.pow(10, pLo) - 0.05, hi: Math.pow(10, pHi) - 0.05, log: true },
  intel: { get: (m) => m.i, lo: iLo, hi: iHi, log: false },
  speed: { get: (m) => m.sp, lo: Math.pow(10, sLo) - 0.05, hi: Math.pow(10, sHi) - 0.05, log: true },
  agentic: { get: (m) => m.ag, lo: agE[0], hi: agE[1], log: false }
};
/** Current [lo, hi] per field, in the field's own (non-log) units; null means unset. */
const range = {};
for (const k of Object.keys(RANGE_FIELDS)) range[k] = null;

function passesRange(m) {
  for (const [k, cfg] of Object.entries(RANGE_FIELDS)) {
    const r = range[k];
    if (!r) continue;
    const v = cfg.get(m);
    if (v == null) continue; // never measured -- a range cannot rule it out
    if (v < r[0] || v > r[1]) return false;
  }
  return true;
}

/** Mute-and-solo, the same rule the synth's own tracks use: muted is always
 *  off, and the moment anything is soloed only the soloed set stays on. */
const soloed = new Set();
function creatorOn(c) {
  if (hidden.has(c)) return false;
  return soloed.size === 0 || soloed.has(c);
}

/** The single visibility predicate: every place that used to check only
 *  hidden.has(m.c) now goes through this, so a range filter reaches every
 *  system creator muting already did -- LOD, gravity, race, ranks. */
function isOff(m) {
  return !creatorOn(m.c) || !passesRange(m);
}

const from = MODELS.map((m, i) => posSpace(m, i));
const to = MODELS.map((m, i) => posSpace(m, i));
const cur = MODELS.map((m, i) => posSpace(m, i));
const base = MODELS.map((m) => new THREE.Color(colorOf.get(m.c)));
// Up to four stops per model, padded by repeating the ramp so the shader can
// always read four without branching.
const STOPS = MODELS.map((m) => {
  const s4 = stopsOf.get(m.c) || FALLBACK;
  return [0, 1, 2, 3].map((k) => new THREE.Color(s4[k % s4.length]));
});
const dummy = new THREE.Object3D();

/* Spin rate and axis per model.
 *
 * Rate comes from time-to-first-token, inverted: a model that answers straight
 * away turns quickly, one that stalls barely moves. TTFT is the only measured
 * field with no other job in this view, and rotation is a channel the eye reads
 * without being told. The axis is arbitrary but fixed, so a body always
 * presents its faces in the same order.
 */
const spinRate = new Float32Array(N);
const spinAxis = [];
{
  const ts = MODELS.map((m) => (m.t == null ? NaN : m.t)).filter(Number.isFinite).sort((a, b) => a - b);
  const tLo = ts.length ? ts[Math.floor(ts.length * 0.05)] : 1;
  const tHi = ts.length ? ts[Math.floor(ts.length * 0.95)] : 40;
  for (let i = 0; i < N; i++) {
    const t = MODELS[i].t;
    // Latency spans 0.7s to 43s and is dominated at the top by a few stragglers,
    // so it is compared on a log scale: linearly, the median model spun almost
    // as fast as the quickest and the whole middle of the field looked alike.
    const f = t == null ? 0
      : 1 - THREE.MathUtils.clamp(
          (Math.log(Math.max(t, 0.05)) - Math.log(tLo)) /
          Math.max(Math.log(tHi) - Math.log(tLo), 0.001), 0, 1);
    /* Linear in that fraction, so the spread is even across the field.
       Radians per second: the whole range maps onto 0 to 3 rev/s, so the
       quickest model turns three times a second and the slowest is genuinely
       stationary rather than merely slow. */
    spinRate[i] = f * 18.849556;
    const a = i * 2.399963, b = i * 1.61803;
    spinAxis.push(new THREE.Vector3(
      Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b)
    ).normalize());
  }
}
/** Bodies that landed in a cluster; the rest are the diffuse background. */
const inCluster = new Uint8Array(N);
const tmpC = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);
let morph = 1, view = 'space';
let logosOn = true;

/* A real sphere rather than a camera-facing quad.
 *
 * The impostor kept the mark facing the viewer at all times, which reads as a
 * sticker that follows you. With genuine geometry the body has an orientation:
 * the logo is applied to three faces spaced evenly around the equator, so one
 * is always legible while the others turn away, and the shading belongs to the
 * surface instead of being re-derived every frame. */
const geo = new THREE.SphereGeometry(1, 22, 16);
const cellUv = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  const cell = ATLAS.index[MODELS[i].c] ?? 0;
  cellUv[i * 2] = (cell % ATLAS.cols) * CW;
  cellUv[i * 2 + 1] = 1 - CH - Math.floor(cell / ATLAS.cols) * CH;
}
/* `cellUv` and the buffers below are sources indexed by model. They are not
   attached to a geometry: each level draws a repacking of them. */

const mat = new THREE.ShaderMaterial({
  uniforms: {
    uAtlas: { value: atlasTex },
    uCell: { value: new THREE.Vector2(CW, CH) },
    uLogoMix: { value: 1 },
    uLightDir: { value: new THREE.Vector3(0.45, 0.75, 0.5).normalize() },
    // Declared in the fragment shader for the depth write, so it is not the
    // one three.js injects automatically; it tracks the active camera.
    uProj: { value: new THREE.Matrix4() },
    // Viewport height, so the shader can size a body in pixels.
    uViewH: { value: stageH }
  },
  transparent: true,
  glslVersion: THREE.GLSL3,
  vertexShader: `
    in vec2 aCell;
    in vec3 aColor;
    in vec3 aColor2;
    in vec3 aColor3;
    in vec3 aColor4;
    in vec4 aState;
    in float aAge;
    uniform float uViewH;
    out vec2 vCell;
    out vec4 vState;
    out float vAge;
    out vec3 vColor;
    out vec3 vColor2;
    out vec3 vColor3;
    out vec3 vColor4;
    out vec3 vNrm;          // surface normal, view space
    out vec3 vLocal;        // position on the unit sphere, object space
    out float vScreen;      // approximate radius on screen, in pixels
    void main() {
      vCell = aCell;
      vColor = aColor; vColor2 = aColor2; vColor3 = aColor3; vColor4 = aColor4;
      vState = aState;
      vAge = aAge;
      vLocal = normalize(position);
      vNrm = normalize(mat3(modelViewMatrix * instanceMatrix) * normal);
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      // Radius in pixels: the instance scale, divided by depth, times the
      // projection's vertical scale and half the viewport height.
      float r = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
      vScreen = r * projectionMatrix[1][1] / max(-mv.z, 0.001) * uViewH * 0.5;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform sampler2D uAtlas;
    uniform vec2 uCell;
    uniform float uLogoMix;
    uniform vec3 uLightDir;
    in vec2 vCell;
    in vec4 vState;
    in float vAge;
    in vec3 vColor;
    in vec3 vColor2;
    in vec3 vColor3;
    in vec3 vColor4;
    in vec3 vNrm;
    in vec3 vLocal;
    in float vScreen;
    out vec4 outColor;

    float vnoise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      #define H(o) fract(sin(dot(i + o, vec3(12.9898,78.233,37.719))) * 43758.5453)
      return mix(mix(mix(H(vec3(0,0,0)),H(vec3(1,0,0)),f.x), mix(H(vec3(0,1,0)),H(vec3(1,1,0)),f.x), f.y),
                 mix(mix(H(vec3(0,0,1)),H(vec3(1,0,1)),f.x), mix(H(vec3(0,1,1)),H(vec3(1,1,1)),f.x), f.y), f.z);
    }

    /* Height of the weathered shell: broad dents, pitting and grit, all scaled
       by age so a current model is geometrically smooth.

       Six octaves running an order of magnitude finer than the first version,
       which only ever produced soft blobs. The parameter oct is how many of
       them are worth evaluating at this size -- detail finer than a pixel costs
       the same to compute and cannot be seen, so a distant body stops paying
       for it. */
    float relief(vec3 p, float wear, int oct) {
      float h = 0.0, amp = 0.5, frq = 3.1;
      for (int o = 0; o < 6; o++) {
        if (o >= oct) { h += amp * 0.5; amp *= 0.52; frq *= 2.17; continue; }
        h += vnoise(p * frq) * amp;
        amp *= 0.52; frq *= 2.17;      // non-integer, so octaves never align
      }
      // Deep, sharp-edged craters instead of a soft dip.
      float crater = smoothstep(0.56, 0.34, h);
      // A second, much finer field scratches the surface -- only worth
      // sampling when the body is close enough for it to land on real pixels.
      float scratch = oct >= 5 ? (vnoise(p * 64.0) - 0.5) * 0.10 : 0.0;
      return ((h - 0.5) * 1.15 + scratch) * wear - crater * wear * 0.62;
    }

    /* The mark, applied to three faces spaced evenly around the equator.
       Each face projects the atlas cell along its own axis and is masked to the
       cap facing that way, so one is always readable while the others turn out
       of view -- and the logo belongs to the body rather than to the camera. */
    /* The mark, applied to the six cube faces.
     *
     * Three faces around the equator left the mark unreadable from above and
     * below. With one on each cube axis no viewing direction is ever more than
     * about 54 degrees from a face centre, so a whole logo is legible from any
     * angle. Faces are blended by how squarely they face the viewer, which
     * hides the joins between them. */
    float markAt(vec3 p, vec3 viewN) {
      // Only the face the point most squarely belongs to draws its mark. The
      // earlier version blended all six, so several partial logos crowded each
      // sphere and none of them read. Picking a single winner, and keeping each
      // mark well inside its own face, leaves clear metal between them.
      // Four faces on a tetrahedron, not six on a cube: they sit 109 degrees
      // apart rather than 90, which leaves room for a much larger mark on each
      // while still covering every viewing direction.
      const float T = 0.5773503;
      float bestF = -1.0;
      vec3 bestAxis = vec3(T, T, T);
      for (int k = 0; k < 4; k++) {
        vec3 axis = k == 0 ? vec3( T,  T,  T) : k == 1 ? vec3( T, -T, -T)
                  : k == 2 ? vec3(-T,  T, -T) : vec3(-T, -T,  T);
        float f = dot(p, axis);
        if (f > bestF) { bestF = f; bestAxis = axis; }
      }
      // The cut sits just past where two faces meet, so the marks nearly touch.
      if (bestF < 0.335) return 0.0;

      vec3 up = abs(bestAxis.y) > 0.9 ? vec3(0,0,1) : vec3(0,1,0);
      vec3 right = normalize(cross(up, bestAxis));
      vec3 realUp = cross(bestAxis, right);
      // Large enough to fill its share of the sphere: with only four faces the
      // mark can run almost to where the next one starts.
      vec2 uv = vec2(dot(p, right), dot(p, realUp)) / 0.92 * 0.5 + 0.5;
      if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return 0.0;
      float a = texture(uAtlas, vCell + clamp(uv, 0.002, 0.998) * uCell).a;
      // Fade in over the last few degrees so the edge of a face is not a line.
      return a * smoothstep(0.335, 0.42, bestF);
    }

    void main() {
      vec3 n = normalize(vNrm);

      // --- surface relief -------------------------------------------------
      float wear = pow(clamp(1.0 - vAge, 0.0, 1.0), 0.7);
      vec3 nrm = n;
      float h0 = 0.0;
      // Level of detail. vScreen is the body's radius in pixels, computed once
      // per vertex: a sphere a few pixels across gets no relief at all, since
      // every octave of it would land inside one pixel.
      int oct = vScreen > 46.0 ? 6 : vScreen > 22.0 ? 4 : vScreen > 9.0 ? 2 : 0;
      if (wear > 0.02 && oct > 0) {
        // The gradient step widens as detail drops, so the normal stays smooth
        // instead of sampling noise the height field no longer contains.
        float E = oct >= 6 ? 0.014 : oct >= 4 ? 0.035 : 0.08;
        h0 = relief(vLocal, wear, oct);
        vec3 grad = vec3(relief(vLocal + vec3(E,0,0), wear, oct) - h0,
                         relief(vLocal + vec3(0,E,0), wear, oct) - h0,
                         relief(vLocal + vec3(0,0,E), wear, oct) - h0) / E;
        grad -= n * dot(grad, n);
        nrm = normalize(n - grad * 0.16 * wear);
      }

      // --- metal / roughness ----------------------------------------------
      // A current model is polished metal: tight highlight, coloured reflection,
      // bright fresnel edge. An old one has oxidised to a rough dielectric that
      // scatters light instead of reflecting it.
      // The two ends are pushed as far apart as the model allows: a current
      // release is a mirror-finish shell, an obsolete one is bare corroded
      // metal that scatters almost everything. Both maps also vary with the
      // height field, so no body is uniformly anything -- high points keep
      // their polish while hollows corrode first.
      float detail = clamp(h0 * 2.4, -0.5, 0.5);
      float metal = clamp(mix(0.96, 0.02, wear) + detail * 0.45, 0.0, 1.0);
      float rough = clamp(mix(0.045, 0.98, wear) - detail * 0.6, 0.02, 1.0);
      float a2 = max(rough * rough, 0.002);

      vec3 L = normalize(uLightDir);
      vec3 V = vec3(0.0, 0.0, 1.0);
      vec3 H = normalize(L + V);
      float NdL = clamp(dot(nrm, L), 0.0, 1.0);
      float NdV = clamp(dot(nrm, V), 0.0, 1.0);
      float NdH = clamp(dot(nrm, H), 0.0, 1.0);
      float VdH = clamp(dot(V, H), 0.0, 1.0);
      float dd = NdH * NdH * (a2 - 1.0) + 1.0;
      float D = a2 / (3.14159 * dd * dd);
      float kk = a2 * 0.5;
      float G = (NdL / (NdL * (1.0 - kk) + kk)) * (NdV / (NdV * (1.0 - kk) + kk));

      float rim = pow(1.0 - clamp(NdV, 0.0, 1.0), 2.6);
      float wrap = clamp(dot(nrm, L) * 0.5 + 0.5, 0.0, 1.0);
      float shade = 0.62 + 0.55 * wrap * wrap;

      // --- creator colour --------------------------------------------------
      // Four stops blended as overlapping bands rather than picked by a hard
      // segment index. The branch version was only C0-continuous at the joins,
      // so a four-colour mark like Google's showed a visible edge where one
      // stop handed over to the next. Weighting every stop by its distance
      // along the sweep removes the seam entirely.
      float sweep = clamp(vLocal.x * 0.55 + vLocal.y * 0.28 + 0.5, 0.0, 1.0);
      float u = smoothstep(0.0, 1.0, sweep) * 3.0;
      float w0 = max(0.0, 1.0 - abs(u - 0.0));
      float w1 = max(0.0, 1.0 - abs(u - 1.0));
      float w2 = max(0.0, 1.0 - abs(u - 2.0));
      float w3 = max(0.0, 1.0 - abs(u - 3.0));
      // Smooth each weight so the transitions ease rather than ramp linearly.
      w0 = w0 * w0 * (3.0 - 2.0 * w0);
      w1 = w1 * w1 * (3.0 - 2.0 * w1);
      w2 = w2 * w2 * (3.0 - 2.0 * w2);
      w3 = w3 * w3 * (3.0 - 2.0 * w3);
      float wt = max(w0 + w1 + w2 + w3, 0.0001);
      vec3 tint = (vColor * w0 + vColor2 * w1 + vColor3 * w2 + vColor4 * w3) / wt;
      tint = mix(tint * vState.x, vec3(1.0), vState.y);

      vec3 avgStop = (vColor + vColor2 + vColor3 + vColor4) * 0.25;
      float orbLum = dot(avgStop, vec3(0.299, 0.587, 0.114));

      vec3 aged = mix(tint, vec3(dot(tint, vec3(0.33))), wear * 0.62);
      aged = mix(aged, aged * vec3(1.05, 0.98, 0.90), wear * 0.55);
      aged *= 1.0 + h0 * 0.55;
      float rimAge = rim * mix(1.0, 0.22, wear);

      vec3 F0 = mix(vec3(0.05), aged, metal);
      vec3 F = F0 + (1.0 - F0) * pow(1.0 - VdH, 5.0);
      vec3 spec = F * (D * G / max(4.0 * NdL * NdV, 0.001)) * NdL;
      vec3 diffuse = aged * shade * (1.0 - metal * 0.70);
      vec3 edge = mix(aged, vec3(1.0), 0.45) * rimAge * mix(0.95, 0.28, wear);
      // --- new: emissive ----------------------------------------------------
      // A current model glows faintly from within, brightest at the limb, so it
      // reads as powered rather than merely shiny. Nothing old emits at all.
      float fresh = 1.0 - wear;
      float glow = pow(fresh, 2.2);
      // A new body is lit from inside and ringed with a hard energy edge; an
      // iridescent sheen shifts across it as it turns, which is what sells
      // "just shipped" at a glance.
      float irid = pow(1.0 - NdV, 3.0) * glow;
      vec3 shimmer = vec3(0.45 + 0.55 * sin(NdV * 9.0),
                          0.45 + 0.55 * sin(NdV * 9.0 + 2.1),
                          0.45 + 0.55 * sin(NdV * 9.0 + 4.2));
      vec3 emissive = mix(aged, vec3(1.0), 0.45) * glow * (0.24 + rim * 1.35)
                    + shimmer * irid * 0.42;

      // --- old: wasteland metal --------------------------------------------
      // Corrosion blooms in the hollows of the height field: rust-brown streaks
      // where water would sit, with the bare alloy showing on the high points.
      // Corrosion blooms in every hollow, and the deepest pits burn through to
      // scorched, unreflective slag. An obsolete model should look salvaged.
      float rust = smoothstep(0.06, -0.26, h0) * wear;
      float burn = smoothstep(-0.16, -0.34, h0) * wear;
      vec3 oxide = vec3(0.30, 0.14, 0.06);
      vec3 corroded = mix(aged, oxide, rust * 0.92);
      corroded = mix(corroded, vec3(0.055, 0.05, 0.048), burn * 0.85);
      corroded *= 1.0 - rust * 0.42;
      // Dust settles on the upward faces of an old shell.
      corroded = mix(corroded, corroded * vec3(1.18, 1.10, 0.94),
                     wear * clamp(nrm.y, 0.0, 1.0) * 0.5);

      vec3 col = mix(diffuse, corroded * shade * 0.78, wear * 0.95)
               + spec * mix(2.1, 0.55, wear)
               + edge * 0.45
               + emissive;
      col += mix(aged, vec3(1.0), 0.5) * rim * vState.z * 1.9;   // selection halo

      // --- the mark ---------------------------------------------------------
      if (uLogoMix > 0.001 && vScreen > 6.0) {
        float ink = markAt(vLocal, n);
        if (ink > 0.004) {
          float markWear = 1.0 - clamp(-h0, 0.0, 1.0) * 1.6;
          vec3 dark = mix(vec3(0.06, 0.065, 0.08), avgStop * 0.22, 0.45);
          vec3 light = mix(vec3(1.0), avgStop, 0.22);
          vec3 inkCol = mix(dark, light, step(orbLum, 0.34)) * (0.72 + 0.4 * wrap);
          col = mix(col, inkCol, ink * uLogoMix * markWear);
        }
      }

      outColor = vec4(col, vState.w);
    }`
});

/* Three levels of geometry, not one.
 *
 * A 22x16 sphere is 704 triangles; 624 of them is 440k a frame, most of which
 * land on bodies a handful of pixels across. Each level draws only the bodies
 * in its distance band, so the near ones keep their silhouette and the far
 * ones cost almost nothing. All three share the material and the per-instance
 * attributes -- only the index buffer differs. */
/* Three levels of geometry.
 *
 * A 22x16 sphere is 704 triangles, and 624 of them is 440k a frame -- most of
 * it spent on bodies a handful of pixels across, where the difference between
 * 704 triangles and 96 is invisible. Each level draws only the bodies in its
 * distance band, so a body near the camera keeps a clean silhouette and a
 * distant one costs almost nothing.
 *
 * All three share the material and every per-instance attribute; only the
 * geometry differs, and each keeps its own instance count. */
const LOD_GEOS = [
  geo,                                       // near: the full sphere
  new THREE.SphereGeometry(1, 12, 8),        // mid
  new THREE.SphereGeometry(1, 7, 5)          // far
];
/** Radius in pixels below which a body drops to the next level down. */
const LOD_PX = [30, 11];

/* The attributes hung on `geo` stay the canonical copy, indexed by model.
   What each mesh draws is a repacking of them, indexed by the slot the body
   took on that level this frame -- so every level needs its own buffers,
   including the near one. Sharing them draws each body with whichever model
   happens to land in the same slot, and since slots are reassigned as the
   camera moves, the marks change while flying. */
const LOD_ATTRS = [['aCell', 2], ['aColor', 3], ['aColor2', 3],
                   ['aColor3', 3], ['aColor4', 3], ['aState', 4], ['aAge', 1]];
const meshes = LOD_GEOS.map((g) => {
  // Every level gets its own attribute buffers, the near one included. They
  // cannot be shared: an instance attribute is read by gl_InstanceID, and a
  // body's slot is its position in that level's draw list, not its model index.
  for (const [name, size] of LOD_ATTRS) {
    g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(N * size), size));
  }
  const m = new THREE.InstancedMesh(g, mat, N);
  m.frustumCulled = false;
  m.count = 0;
  scene.add(m);
  return m;
});
/** The near mesh, kept under its old name for the code that raycasts it. */
const mesh = meshes[0];

// Per-instance colour, fed to the impostor shader.
const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
for (let i = 0; i < N; i++) {
  const c = STOPS[i][0];
  colorAttr.setXYZ(i, c.r, c.g, c.b);
}
const stateAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);

/* Release date is otherwise unused in this view, and it is the one field that
 * says whether a model is current. Newer bodies are rendered clean and lit;
 * older ones weather -- the surface breaks up, the colour desaturates and the
 * rim light fades, so age is legible without reading a date. */
const ageAttr = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
for (let i = 0; i < N; i++) {
  const t = dNum(MODELS[i]);
  ageAttr.setX(i, Number.isFinite(t) ? norm(t, dLo, dHi) : 0.5);
}
/* The master values, indexed by model rather than by draw slot. Each level
 * copies out of these into the position the body occupies in its own list.
 * They are deliberately not attached to `geo`: it is level 0's destination,
 * and re-attaching a source there would make the near bodies read by model
 * index again. */
const srcStops = [1, 2, 3].map((k) => {
  const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const c = STOPS[i][k];
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  return arr;
});

const logoUniforms = mat.uniforms;

const emph = new Float32Array(N);
let dtNow = 0.016, nowMs = 0;

const lodN = [0, 0, 0];
/** Which level each body is currently drawn at, for the hysteresis test. */
const lodOf = new Uint8Array(N);
/** Per-instance sources, indexed by model: [attribute, array, itemSize]. */
const SRC = [
  ['aCell', cellUv, 2],
  ['aColor', colorAttr.array, 3],
  ['aColor2', srcStops[0], 3],
  ['aColor3', srcStops[1], 3],
  ['aColor4', srcStops[2], 3],
  ['aState', stateAttr.array, 4],
  ['aAge', ageAttr.array, 1]
];

/** Move model `i`'s values into the slot it occupies on level `lod`. */
function copyInstanceAttrs(i, lod, slot) {
  const dst = LOD_GEOS[lod];
  for (const [name, src, n] of SRC) {
    const out = dst.getAttribute(name);
    for (let k = 0; k < n; k++) out.array[slot * n + k] = src[i * n + k];
    out.needsUpdate = true;
  }
}
/** Pixels per world unit at unit depth, for the level-of-detail test. */
let projScale = 500;

function writeInstances() {
  nowMs = performance.now();
  lodN[0] = lodN[1] = lodN[2] = 0;
  projScale = (stageH * 0.5) * Math.abs(camera.projectionMatrix.elements[5]);
  for (let i = 0; i < N; i++) {
    const m = MODELS[i];
    const off = isOff(m);
    const q = MODELS[i].q;
    if (!gravityOn && view === 'space' && q !== 'A') {
      // An unmeasured axis has no resting value, so it is re-evaluated every
      // frame rather than interpolated toward a fixed target.
      if (q === 'X') {
        cur[i].copy(driftPos(i, driftClock));
      } else {
        cur[i].copy(to[i]);
        if (q === 'B') cur[i].z = wanderAxis(i, 0, driftClock);
        else { cur[i].x = wanderAxis(i, 1, driftClock); cur[i].z = wanderAxis(i, 2, driftClock); }
      }
    } else if (!gravityOn) {
      cur[i].lerpVectors(from[i], to[i], morph);
    }
    // A breath of drift on every placed body. The amplitude is under a third of
    // an orb radius -- far too small to misread a position by, but enough that
    // the field looks alive rather than pinned to a lattice. Each has its own
    // phase and period so nothing pulses in unison.
    if (!gravityOn && MODELS[i].q === 'A') {
      const ph = i * 0.7391;
      const sw = radiusOf(m) * 0.30;
      cur[i].x += Math.sin(driftClock * 0.32 + ph) * sw;
      cur[i].y += Math.sin(driftClock * 0.26 + ph * 1.7) * sw;
      cur[i].z += Math.cos(driftClock * 0.29 + ph * 2.3) * sw;
    }
    if (raceOn) cur[i].y += raceBob[i];
    dummy.position.copy(cur[i]);
    // Emphasis is animated rather than switched: a body eases up to its
    // highlighted size and pulses gently while selected. Snapping the scale
    // read as a glitch instead of as feedback. A frontier body reuses the
    // same halo -- strong enough to read as "on the front" at a glance, but
    // a notch under selection so picking one still stands out on top of it.
    const wantEmph = i === selIdx ? 1 : i === hoverIdx ? 0.5 : onFrontier[i] ? 0.8 : 0;
    emph[i] += (wantEmph - emph[i]) * Math.min(1, dtNow * 9);
    const e = emph[i];
    const tgt = missionOn && missionTarget === i;
    let r = radiusOf(m) * (off ? 0.35 : 1)
          * (1 + e * 0.55 + e * 0.10 * Math.sin(nowMs / 320));
    // Effort variants stay as bodies but shrink with the setting: the strongest
    // is the full orb and each weaker one is a smaller sphere, so a family
    // reads as one model turned down rather than as several separate models
    // all claiming the same weight.
    let alpha = 1;
    if (constellationsOn && !gravityOn && famRank[i] >= 0) {
      r *= 0.34 + 0.66 * famRank[i];
      // Solid at full effort, ghosted at the lowest setting.
      alpha = 0.32 + 0.68 * famRank[i];
    }
    // During the race a model has no presence until its release date.
    if (raceOn) r *= raceScale[i];
    if (tgt) r *= 1 + 0.18 * Math.sin(nowMs / 150);
    dummy.scale.setScalar(r);
    dummy.quaternion.setFromAxisAngle(spinAxis[i], driftClock * spinRate[i]);
    dummy.updateMatrix();
    // Pick a level from the body's size on screen, then append it to that
    // mesh's instance list. Counting up per level each frame is what lets the
    // three meshes share one attribute set.
    const dz = Math.max(camera.position.distanceTo(cur[i]), 0.001);
    const px = (r / dz) * projScale;
    // Hysteresis: a body sitting on a threshold would otherwise flip level
    // every frame, and each flip repacks its attributes. It has to cross by a
    // clear margin before it moves.
    const was = lodOf[i];
    let lod = px > LOD_PX[0] ? 0 : px > LOD_PX[1] ? 1 : 2;
    if (lod !== was) {
      // The boundary being crossed is the one between the two levels, which
      // for a move of more than one level is the one nearest the old level.
      const edge = LOD_PX[Math.min(lod, was)];
      // Moving up a level needs a clear overshoot, moving down a clear
      // undershoot; inside the band the body keeps the level it had.
      if (lod < was ? px < edge * 1.25 : px > edge * 0.8) lod = was;
      lodOf[i] = lod;
    }
    // State rides as (dim, whiten) so the highlight applies to every stop of a
    // multi-colour mark, not just the first one. It is written to the source
    // before the repack below, so the slot copy carries this frame's value.
    const dim = off ? 0.18 : 1;
    // The glow rides the same eased value, so brightness and size move together.
    const white = e * 0.42 + (tgt ? 0.3 + 0.3 * Math.sin(nowMs / 160) : 0);
    stateAttr.setXYZW(i, dim, white, e, alpha);

    const slot = lodN[lod]++;
    meshes[lod].setMatrixAt(slot, dummy.matrix);
    // Copy this body's attributes into the slot it occupies at this level.
    // Every level packs by draw order, so a body's slot is never its model
    // index -- the near level included.
    copyInstanceAttrs(i, lod, slot);
  }
  for (let k = 0; k < meshes.length; k++) {
    meshes[k].count = lodN[k];
    meshes[k].instanceMatrix.needsUpdate = true;
  }
  stateAttr.needsUpdate = true;
}

/* ---------- labels with screen-space declutter ---------- */
/* ---------- leader-line labels ---------- *
 * A label is pinned beside its orb and joined to it by a thin leader, rather
 * than sitting on top of the body where it hides the mark. Which orbs get one
 * is decided per frame: the nearest bodies first, then anything whose label
 * still fits without colliding, so flying closer names more of the field
 * instead of showing a fixed top-N that ignores where you actually are.
 */
const LABEL_POOL = 30;
const labelEls = [];
const labelObjs = [];
for (let k = 0; k < LABEL_POOL; k++) {
  const el = document.createElement('div');
  el.className = 'ntag';
  el.innerHTML = '<span class="nt-row"><span class="nt-line"></span>' +
                 '<span class="nt-txt"></span></span>';
  const o = new CSS2DObject(el);
  o.visible = false;
  scene.add(o);
  labelEls.push(el);
  labelObjs.push(o);
}

const LBL_W = 148, LBL_H = 17;
const projV = new THREE.Vector3();
const camDir = new THREE.Vector3();
const camUp = new THREE.Vector3();

/**
 * What a body's label says.
 *
 * Every label used to be the name with its parenthetical stripped, which for a
 * family of effort variants meant five orbs in a row all reading "GPT-6 Astra"
 * -- the one thing they have in common, and the one thing that does not tell
 * them apart. The suffix that was being thrown away ("high", "low",
 * "non-reasoning") is exactly what distinguishes them.
 *
 * So the strongest member of a family carries the full name, and the rest carry
 * only their branch. The family reads as one model at several settings, which
 * is what it is, and the name is stated once rather than five times.
 * A model with no family keeps its plain name.
 */
function labelText(i) {
  const raw = MODELS[i].n;
  const base = raw.replace(/\s*\(.*$/, '');
  if (!isTail[i]) return base;
  const m = raw.match(/\(([^)]*)\)/);
  // A variant whose name carries no parenthetical has nothing shorter to say
  // than the name itself; better a repeat than an empty label.
  if (!m) return base;
  const inner = m[1].trim();
  /* Upstream writes the setting two ways: bare ("max", "Non-reasoning") and
     spelled out as a clause list ("Adaptive Reasoning, Max Effort, Default
     Fallback"). The effort word is the only part that varies within a family --
     every member repeats the rest -- so the long form is reduced to it. */
  const effort = inner.match(/\b(max|xhigh|high|medium|low|minimal|none)\b\s*effort/i);
  if (effort) return effort[1].toLowerCase();
  if (/non-?reasoning/i.test(inner)) return 'non-reasoning';
  // Short enough to read as a branch already.
  return inner.length <= 18 ? inner : inner.split(',')[0].trim();
}

function declutterLabels() {
  // Rank candidates by distance so the labels follow the camera.
  camera.getWorldDirection(camDir);
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

  // Zone captions are placed first and reserve their screen boxes, so the model
  // labels flow around them instead of overprinting -- they were colliding into
  // an illegible mash at the default angle.
  const reserved = [];
  for (const el of zoneTags) {
    const o = el.parent ? el : null;
    if (!o) continue;
    projV.copy(el.position).project(camera);
    const vis = projV.z < 1 && Math.abs(projV.x) < 1.05 && Math.abs(projV.y) < 1.05;
    el.element.style.opacity = vis ? '1' : '0';
    if (vis) reserved.push([(projV.x * 0.5 + 0.5) * stageW, (-projV.y * 0.5 + 0.5) * stageH]);
  }

  const cand = [];
  for (let i = 0; i < N; i++) {
    if (isOff(MODELS[i])) continue;
    if (raceOn && raceScale[i] < 0.999) continue;
    // Only the strongest setting is named; five labels for one model was the
    // densest part of the scene.
    if (constellationsOn && isTail[i] && !gravityOn) continue;
    projV.copy(cur[i]).project(camera);
    if (projV.z > 1 || Math.abs(projV.x) > 0.98 || Math.abs(projV.y) > 0.95) continue;
    const d = camera.position.distanceTo(cur[i]);
    // Distance is what perspective uses to prioritise the near bodies over
    // the far ones; an orthographic replay has no near or far to speak of,
    // so the same cutoff would just be an arbitrary hole in the track.
    if (!raceOn && d > 300) continue;
    cand.push([d, i, (projV.x * 0.5 + 0.5) * stageW, (-projV.y * 0.5 + 0.5) * stageH]);
  }
  if (raceOn) {
    // The leaders are the point of a replay -- the standings panel already
    // says who they are in text, but seeing the name on the body they belong
    // to is what makes the standings legible as a shape in the track rather
    // than a list to cross-reference against it. Sorted first by rank, so a
    // fixed-size label pool always keeps the frontier over any mid-pack tie.
    const rank = new Map();
    standings().forEach((i, k) => rank.set(i, k));
    cand.sort((a, b) => (rank.get(a[1]) ?? 1e9) - (rank.get(b[1]) ?? 1e9));
  } else {
    cand.sort((a, b) => a[0] - b[0]);
  }

  const placed = [];
  let used = 0;
  for (const [dist, i, sx, sy] of cand) {
    if (used >= LABEL_POOL) break;
    // Offset the label up and to the right of the body, then reject it if that
    // slot is taken -- the leader keeps the association clear once moved.
    const lx = sx + 16, ly = sy - 14;
    let clash = false;
    for (const p of placed) {
      if (Math.abs(p[0] - lx) < LBL_W && Math.abs(p[1] - ly) < LBL_H) { clash = true; break; }
    }
    if (clash) continue;
    placed.push([lx, ly]);

    const o = labelObjs[used], el = labelEls[used];
    o.visible = true;
    // Anchor the label slightly toward the camera and up, so it is never
    // covered by its own orb (or by a body just behind it). The DOM label
    // layer has no depth test, so this has to be done in world space.
    o.position.copy(cur[i])
      .addScaledVector(camDir, -radiusOf(MODELS[i]) * 1.6)
      .addScaledVector(camUp, radiusOf(MODELS[i]) * 0.55);
    const txt = el.querySelector('.nt-txt');
    const name = labelText(i);
    if (txt.textContent !== name) txt.textContent = name;
    const col = colorOf.get(MODELS[i].c);
    if (el.dataset.col !== col) { el.dataset.col = col; txt.style.color = col; }
    // Near labels are larger and brighter, distant ones smaller and dimmer, so
    // the text carries the same depth cue the orbs do.
    const near = THREE.MathUtils.clamp(1 - dist / 300, 0, 1);
    el.style.opacity = String(0.38 + near * 0.62);
    el.style.fontSize = (10.5 + near * 6.5).toFixed(1) + 'px';
    used++;
  }
  for (let k = used; k < LABEL_POOL; k++) labelObjs[k].visible = false;
}


/* ---------- constellations: the variants of one model ---------------------- *
 * A single model usually appears several times over -- one row per reasoning
 * depth or effort setting ("Claude Opus 5", "... Max Effort", "... Xhigh"), and
 * those rows scatter across the cloud because they genuinely differ in price,
 * speed and score. Joining them shows at a glance which points are the same
 * model turned up or down, rather than unrelated neighbours.
 */
const constellationGroup = new THREE.Group();
scene.add(constellationGroup);
let constellationsOn = true;

/**
 * Family key: the model name with only its parenthesised effort suffix removed.
 *
 * Size words are deliberately kept -- "GPT-5" and "GPT-5 mini" are different
 * models that happen to share a prefix, and joining them would claim a
 * relationship the data does not have. Only the bracketed reasoning-depth
 * variants of one model are treated as the same thing turned up or down.
 */
function familyKey(m) {
  return (m.c + '/' + m.n.replace(/\s*\(.*$/, '').trim()).toLowerCase();
}

const FAMILIES = (() => {
  const byKey = new Map();
  for (let i = 0; i < N; i++) {
    const k = familyKey(MODELS[i]);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(i);
  }
  // Ordered weakest to strongest, so the tail runs from low effort up to the
  // orb that represents the family.
  const out = [];
  for (const g of byKey.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (MODELS[a].i ?? 0) - (MODELS[b].i ?? 0));
    out.push(g);
  }
  return out;
})();

/* Only the strongest variant of a family is drawn as an orb. Five spheres for
 * one model at five effort settings was more than half the field repeating
 * itself; the weaker settings say more as the shape of a trail behind the one
 * orb than as separate bodies competing with it for attention. */
/** How many variants the family of a given model has. */
const famSize = new Int16Array(N);
for (const g of FAMILIES) for (const i of g) famSize[i] = g.length;
const famCount = (i) => famSize[i] || 1;

/** 0 for the weakest setting in a family, 1 for the strongest; -1 if solitary. */
const famRank = new Float32Array(N).fill(-1);
for (const g of FAMILIES) {
  g.forEach((i, k) => { famRank[i] = g.length > 1 ? k / (g.length - 1) : 1; });
}

// Point every variant of a family at its strongest member, so the whole family
// drifts along one path.
for (const g of FAMILIES) {
  const lead = g[g.length - 1];
  for (const i of g) driftAnchor[i] = lead;
}

const isTail = new Uint8Array(N);
for (const g of FAMILIES) for (let k = 0; k < g.length - 1; k++) isTail[g[k]] = 1;

/* The trail is built from short quads rather than lines so it can taper: a
 * constant-width line between every variant read as a wire diagram, which is
 * what made the effort ladders look like clutter. Width and opacity both fall
 * away toward the weakest setting, so the trail reads as motion into the orb. */
const TRAIL_STEPS = FAMILIES.reduce((a, g) => a + (g.length - 1), 0);
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(Math.max(1, TRAIL_STEPS) * 18);   // 2 tris
const trailCol = new Float32Array(Math.max(1, TRAIL_STEPS) * 18);
const trailAlp = new Float32Array(Math.max(1, TRAIL_STEPS) * 6);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlp, 1));
const trailMesh = new THREE.Mesh(trailGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  glslVersion: THREE.GLSL3,
  vertexShader: `
    in float aAlpha;
    out vec3 vCol; out float vA;
    void main() {
      vCol = color; vA = aAlpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    in vec3 vCol; in float vA; out vec4 o;
    void main() { if (vA < 0.004) discard; o = vec4(vCol, vA); }`,
  vertexColors: true
}));
trailMesh.frustumCulled = false;
constellationGroup.add(trailMesh);

const tA = new THREE.Vector3(), tB = new THREE.Vector3();
const tSide = new THREE.Vector3(), tView = new THREE.Vector3();

function updateConstellations() {
  if (!constellationsOn) { trailGeo.setDrawRange(0, 0); return; }
  camera.getWorldDirection(tView);
  let s = 0;
  for (const fam of FAMILIES) {
    const vis = fam.filter((i) => !isOff(MODELS[i]) && !(raceOn && raceScale[i] < 0.999));
    if (vis.length < 2) continue;
    const headR = radiusOf(MODELS[vis[vis.length - 1]]);
    for (let k = 0; k + 1 < vis.length; k++, s++) {
      tA.copy(cur[vis[k]]);
      tB.copy(cur[vis[k + 1]]);
      // Width grows toward the head; the far end of the tail comes to a point.
      const f0 = k / Math.max(1, vis.length - 1);
      const f1 = (k + 1) / Math.max(1, vis.length - 1);
      // A thin thread now that the variants are spheres again -- it only has to
      // say "these belong together", not carry the shape on its own.
      const w0 = headR * (0.05 + 0.16 * f0);
      const w1 = headR * (0.05 + 0.16 * f1);
      // A long jump means the settings are far apart in the plot; fade it so a
      // trail crossing the scene does not dominate.
      const fade = 1 - Math.min(1, tA.distanceTo(tB) / 170) ** 2;

      tSide.subVectors(tB, tA).cross(tView).normalize();
      if (!Number.isFinite(tSide.x)) tSide.set(1, 0, 0);

      const c = base[vis[k + 1]];
      const quad = [
        [tA, -w0, 0.14 * fade], [tA, w0, 0.14 * fade],
        [tB, w1, 0.40 * fade], [tA, -w0, 0.14 * fade],
        [tB, w1, 0.40 * fade], [tB, -w1, 0.40 * fade]
      ];
      quad.forEach(([p, off, a], v) => {
        const b = s * 18 + v * 3;
        trailPos[b] = p.x + tSide.x * off;
        trailPos[b + 1] = p.y + tSide.y * off;
        trailPos[b + 2] = p.z + tSide.z * off;
        trailCol[b] = c.r; trailCol[b + 1] = c.g; trailCol[b + 2] = c.b;
        trailAlp[s * 6 + v] = a;
      });
    }
  }
  for (let k = s; k < TRAIL_STEPS; k++) for (let v = 0; v < 6; v++) trailAlp[k * 6 + v] = 0;
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
  trailGeo.attributes.aAlpha.needsUpdate = true;
  trailGeo.setDrawRange(0, TRAIL_STEPS * 6);
}

function toggleConstellations() {
  constellationsOn = !constellationsOn;
  constellationGroup.visible = constellationsOn;
}

/* ---------- controls ---------- */
const kb = new Set();
const yawPitch = { yaw: 0, pitch: 0 };
/** World up, for a strafe that stays level regardless of pitch. */
const UP = new THREE.Vector3(0, 1, 0);
let locked = false;
const vel = new THREE.Vector3();
function lookAtHome() {
  camera.position.copy(HOME);
  const dir = new THREE.Vector3().sub(camera.position).normalize();
  yawPitch.yaw = Math.atan2(-dir.x, -dir.z);
  yawPitch.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  vel.set(0, 0, 0);
}
lookAtHome();

const cv = renderer.domElement;
cv.addEventListener('click', (e) => {
  if (dragged) return;
  if (locked) {
    // Aiming with the crosshair: shoot down the centre of the screen. Firing
    // at nothing while a body is selected lets go of it.
    const hit = pick(null);
    if (hit !== -1) select(hit);
    else if (selIdx !== -1) closeCard();
    return;
  }
  const idx = pick(e);
  if (idx !== -1) { select(idx); return; }
  // Empty space. With a body selected the click means "done with that one",
  // not "start looking around" -- only a click with nothing selected engages
  // free-look, so deselecting never drops you into pointer lock by surprise.
  if (selIdx !== -1) { closeCard(); return; }
  cv.requestPointerLock();
});
onDoc('pointerlockchange', () => {
  locked = document.pointerLockElement === cv;
  $('crosshair').style.display = locked ? 'block' : 'none';
});
onDoc('mousemove', (e) => { if (locked && !raceOn) applyLook(e.movementX, e.movementY); });

let dragging = 0, dragged = false, lx = 0, ly = 0;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  dragging = e.button === 2 ? 2 : 1; dragged = false;
  lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointerup', (e) => { dragging = 0; try { cv.releasePointerCapture(e.pointerId); } catch {} });
cv.addEventListener('pointermove', (e) => {
  if (!dragging) { hoverTest(e); return; }
  // RACE holds a fixed, straight-on view -- a scrubbable replay reads like a
  // chart, and a chart does not tilt while you drag on it.
  if (raceOn) { dragged = true; return; }
  const dx = e.clientX - lx, dy = e.clientY - ly;
  lx = e.clientX; ly = e.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
  if (dragging === 2) applyLook(dx, dy);
  else {
    const right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    camera.getWorldDirection(right).cross(up).normalize();
    camera.position.addScaledVector(right, -dx * 0.32);
    camera.position.addScaledVector(up, dy * 0.32);
  }
});
function clearSnap() {
  $('vp-cycle').classList.remove('on');
  vpAt = -1;
}
function applyLook(dx, dy) {
  clearSnap();
  yawPitch.yaw -= dx * 0.0024;
  yawPitch.pitch = THREE.MathUtils.clamp(yawPitch.pitch - dy * 0.0024, -1.5, 1.5);
}
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (projMode === 'ortho') {
    // Dollying an orthographic camera does nothing visible; scale the frustum.
    orthoZoom = THREE.MathUtils.clamp(orthoZoom * (1 + e.deltaY * 0.0012), 20, 1400);
    sizeOrtho();
    return;
  }
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  camera.position.addScaledVector(d, -e.deltaY * 0.28);
}, { passive: false });
onWin('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (locked) document.exitPointerLock(); closeCard(); return; }
  // X also closes the card. Esc is the obvious key but while the pointer is
  // locked the browser consumes it to release the lock and the page never
  // sees the keydown, so in free-look the card would otherwise only close
  // via its own button, which there is no cursor to reach.
  if (k === 'x') { closeCard(); return; }
  if (k === 'r') { lookAtHome(); return; }
  if (k === 'l') { toggleLogos(); return; }
  if (k === 'c') { toggleConstellations(); return; }
  if (k === 'f' && gravityOn) { gravityFrozen = !gravityFrozen; renderGravityPanel(); return; }
  kb.add(k);
});
onWin('keyup', (e) => kb.delete(e.key.toLowerCase()));
onWin('blur', () => kb.clear());


/* ---------- flight range ---------- *
 * Free flight has no walls, so it is easy to end up far outside the data with
 * nothing on screen and no sense of which way to turn back. Rather than
 * fencing the camera in -- which would stop you pulling back for a wide shot --
 * the HUD reports how far out you are, warns once the cloud is behind you, and
 * offers a way home.
 */
const rangeEl = $('range');
const warnEl = $('outwarn');
/* Derived from the geometry rather than guessed: the furthest thing the plot
 * contains is the corner of the annexes, and the drifters orbit just beyond
 * that. The camera is allowed out to a comfortable margin past all of it, so a
 * wide shot of the whole arrangement is possible but flying off into empty
 * space is not. */
const CLOUD_R = BOX_REACH * 1.15;
let lastRangeShown = '', lastRangeExact = false;

function updateRange() {
  const d = camera.position.length();
  const out = d / CLOUD_R;

  // The readout is the intelligence score the crosshair is on. Two ways to get
  // one, in order of how honest each is:
  //
  //   1. If the crosshair is over a body, report that model's actual score --
  //      it is a measurement, not a projection.
  //   2. Otherwise intersect the view ray with the spine's vertical plane and
  //      read the height there. This is the level you are sighting along, which
  //      is what the rings show.
  //
  // The earlier version pushed a fixed distance down the view ray, so the
  // number swung wildly as the camera turned without anything having changed.
  const aim = new THREE.Vector3();
  camera.getWorldDirection(aim);

  let score = null, exact = false;
  if (hoverIdx !== -1 && MODELS[hoverIdx].i != null) {
    score = MODELS[hoverIdx].i;
    exact = true;
  } else if (Math.abs(aim.z) > 1e-4 || Math.abs(aim.x) > 1e-4) {
    // Distance along the ray to the plane through the origin corner, which is
    // where the spine and its level rings stand.
    const denom = aim.x * aim.x + aim.z * aim.z;
    const t = denom > 1e-6
      ? -((camera.position.x + S) * aim.x + (camera.position.z + S) * aim.z) / denom
      : -1;
    if (t > 0) {
      const y = camera.position.y + aim.y * t;
      if (y >= -S - 4 && y <= S + 4) score = iLo + (y / (2 * S) + 0.5) * (iHi - iLo);
    }
  }

  const shown = score === null ? '—' : score.toFixed(1);
  if (shown !== lastRangeShown || exact !== lastRangeExact) {
    lastRangeShown = shown; lastRangeExact = exact;
    rangeEl.innerHTML =
      `<span class="rg-lab">${exact ? 'MODEL' : 'LEVEL'}</span> ` +
      `<span class="rg-num">${shown}</span>`;
  }
  // The out-of-bounds warning is its own badge above the crosshair: sharing a
  // line with the readout made the number jump sideways whenever it appeared.
  warnEl.classList.toggle('show', out > 1.35);

  // Visible while flying, or whenever you have left the field.
  // Shown while flying, while aiming at a body, or when outside the field.
  rangeEl.style.opacity =
    (locked || vel.lengthSq() > 4 || out > 1.35 || exact) ? '1' : '0';

  // A soft tether: past twice the cloud radius the camera is eased back rather
  // than blocked, so you can still pull out for a wide shot but cannot drift
  // away for good.
  // Far enough out to frame everything including the drift orbits, and no
  // further -- past this the plot is a speck and there is nothing else to see.
  const LEASH = CLOUD_R * 1.5;
  if (d > LEASH) {
    const pull = (d - LEASH) * 0.04;
    camera.position.addScaledVector(camera.position.clone().normalize(), -pull);
    vel.multiplyScalar(0.90);
  }
}

/* ---------- fixed viewpoints ---------- *
 * Orthographic projection plus an axis-aligned camera turns the scene into a
 * true 2D plot of whichever pair of axes faces you: no foreshortening, no
 * perspective, so positions can be compared directly along both axes. These
 * are the three faces worth reading, plus a return to the free 3/4 view.
 */
const VIEWPOINTS = {
  front: { name: 'PRICE × INTEL', short: '$ × I',   dir: [0, 0, 1], up: [0, 1, 0] },
  side:  { name: 'SPEED × INTEL', short: 'SPD × I', dir: [1, 0, 0], up: [0, 1, 0] },
  top:   { name: 'PRICE × SPEED', short: '$ × SPD', dir: [0, 1, 0], up: [0, 0, -1] }
};

function snapTo(key) {
  const vp = VIEWPOINTS[key];
  if (!vp) return;
  setProjection('ortho');
  // Frame the whole occupied region, annexes included.
  const reach = WANDER_MIN + WANDER_SPAN;
  orthoZoom = reach * 2.15;
  sizeOrtho();
  const centre = new THREE.Vector3(-(reach - S) / 2, 0, -(reach - S) / 2);
  const d = new THREE.Vector3(...vp.dir).normalize();
  camera.position.copy(centre).addScaledVector(d, reach * 3);
  // Drive the same yaw/pitch the flight controls use, so the view does not
  // snap back the moment the camera updates.
  const look = d.clone().negate();
  yawPitch.yaw = Math.atan2(-look.x, -look.z);
  yawPitch.pitch = Math.asin(THREE.MathUtils.clamp(look.y, -1, 1));
  vel.set(0, 0, 0);
  const cyc = $('vp-cycle');
  cyc.classList.add('on');
  cyc.textContent = vp.short;

}

function freeView() {
  setProjection('persp');
  lookAtHome();
  vpAt = -1;
}

/* ---------- picking ---------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hoverIdx = -1, selIdx = -1;
/**
 * The orbs are impostor quads, so a mesh raycast would hit flat cards rather
 * than the spheres they depict. Intersect the ray against each orb's actual
 * sphere instead, and keep the nearest hit.
 */
const pickTmp = new THREE.Vector3();

/**
 * Picks the orb under the aim point.
 *
 * While the pointer is locked there is no cursor: the player aims with the
 * centre crosshair, and `clientX/clientY` stay frozen wherever the pointer
 * happened to be when lock engaged. Aiming from those stale coordinates is
 * what made free-look selection pick the wrong body, so a locked pointer
 * always shoots down the centre of the screen instead.
 */
function pick(e) {
  if (locked || !e) {
    ndc.x = 0; ndc.y = 0;
  } else {
    // Relative to the canvas: the stage is a panel with its own origin, so
    // viewport coordinates alone aim at the wrong body.
    const b = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - b.left) / b.width) * 2 - 1;
    ndc.y = -((e.clientY - b.top) / b.height) * 2 + 1;
  }
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  let best = -1, bestT = Infinity;
  for (let i = 0; i < N; i++) {
    if (isOff(MODELS[i])) continue;
    // Match the radius the orb is actually drawn at, including the enlargement
    // applied while it is hovered or selected, so the hit target never
    // disagrees with what is on screen.
    const grown = (i === hoverIdx || i === selIdx) ? 1.9 : 1;
    const r = radiusOf(MODELS[i]) * grown * 1.15;
    pickTmp.copy(cur[i]).sub(o);
    const tca = pickTmp.dot(d);
    if (tca < 0) continue;
    const d2 = pickTmp.lengthSq() - tca * tca;
    if (d2 > r * r) continue;
    const t = tca - Math.sqrt(r * r - d2);
    if (t < bestT) { bestT = t; best = i; }
  }
  return best;
}
function hoverTest(e) {
  const i = pick(e);
  if (i !== hoverIdx) { hoverIdx = i; cv.style.cursor = i === -1 ? 'grab' : 'pointer'; }
}

/** Aim under the crosshair changes as the camera turns, not as the mouse moves. */
function crosshairHover() {
  const i = pick(null);
  if (i === hoverIdx) return;
  hoverIdx = i;
  // Colour the crosshair when it is over a body, so free-look aiming has the
  // same "this is selectable" feedback the cursor gives when unlocked.
  const ch = $('crosshair');
  ch.classList.toggle('hot', i !== -1);
  ch.title = i === -1 ? '' : MODELS[i].n;
}

/* ---------- card ---------- */
const card = $('card');
const fmt = (v, d = 1) => (v == null ? '—' : (+v).toFixed(d));
const money = (v) => (v == null ? '—' : v === 0 ? 'free' : '$' + (+v).toFixed(v < 1 ? 2 : v < 10 ? 2 : 0));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kv = (k, v, c) => `<div class="kv"><div class="k">${k}</div><div class="v" style="color:${c}">${v}</div></div>`;
function rank(m, keyName, lowBest) {
  if (m[keyName] == null) return '—';
  const vs = MODELS.filter((x) => !isOff(x)).map((x) => x[keyName]).filter((v) => v != null);
  vs.sort((a, b) => (lowBest ? a - b : b - a));
  return '#' + (vs.indexOf(m[keyName]) + 1) + '/' + vs.length;
}
function select(i) {
  selIdx = i;
  const m = MODELS[i], col = colorOf.get(m.c);
  const cell = ATLAS.index[m.c] ?? 0;
  const bx = (cell % ATLAS.cols) * 100 / (ATLAS.cols - 1);
  const by = Math.floor(cell / ATLAS.cols) * 100 / (ATLAS.rows - 1);
  card.style.borderColor = col;
  card.innerHTML = `
    <div class="hd">
      <div style="display:flex;gap:8px;align-items:flex-start;min-width:0">
        <div class="logo" style="color:${col};
          -webkit-mask-image:url(${ASSETS}/atlas.png); mask-image:url(${ASSETS}/atlas.png);
          -webkit-mask-size:${ATLAS.cols * 100}% ${ATLAS.rows * 100}%;
          mask-size:${ATLAS.cols * 100}% ${ATLAS.rows * 100}%;
          -webkit-mask-position:${bx}% ${by}%; mask-position:${bx}% ${by}%"></div>
        <div style="min-width:0">
          <div class="nm" style="color:${col}">${esc(m.n)}</div>
          <div class="cr">${esc(m.c)} &middot; released ${m.d ?? '—'}</div>
          ${famCount(i) > 1 ? `<div class="cr" style="color:var(--cyan)">stands for ${famCount(i)} effort settings &middot; the trail is the rest</div>` : ''}
          ${m.q === 'A' ? '' :
            `<div class="qwarn">${
              m.q === 'B' ? 'no speed measured &mdash; its depth in the box is a parking slot, not a value'
              : m.q === 'D' ? 'intelligence only &mdash; its horizontal position is a parking slot, not a value'
              : 'not measured at all &mdash; this model has no position, it drifts'
            }</div>`}
        </div>
      </div>
      <button class="x" id="cardx" title="Close (X, or click empty space)">✕</button>
    </div>
    <div class="bd">
      <div class="grid">
        ${kv('intelligence', fmt(m.i), '#56b6c2')}
        ${kv('coding', fmt(m.cd), '#98c379')}
        ${kv('agentic', fmt(m.ag), '#c678dd')}
        ${kv('blended 3:1', money(m.p), '#e5c07b')}
        ${kv('speed', fmt(m.sp, 0) + ' tok/s', '#61afef')}
        ${kv('ttft', m.t == null ? '—' : fmt(m.t, 2) + 's', '#e06c75')}
        ${kv('input', money(m.pi), 'rgba(255,255,255,.7)')}
        ${kv('output', money(m.po), 'rgba(255,255,255,.7)')}
        ${kv('slug', esc(m.s || '—'), 'rgba(255,255,255,.5)')}
      </div>
      <div class="ranks">
        <span style="color:rgba(255,255,255,.3)">rank among ${MODELS.filter((x) => !isOff(x)).length} visible:</span>
        <span>INTEL <b style="color:#56b6c2">${rank(m, 'i', false)}</b></span>
        <span>PRICE <b style="color:#e5c07b">${rank(m, 'p', true)}</b></span>
        <span>SPEED <b style="color:#61afef">${rank(m, 'sp', false)}</b></span>
      </div>
    </div>`;
  card.style.display = 'block';
  $('hint').style.visibility = 'hidden';
  placeCard();
  $('cardx').onclick = closeCard;
  if (missionOn) checkAnswer(i);
  // During a race, clicking a node backs it as your runner.
  if (raceOn && !raceDone) { racePick = i; renderRacePanel(); }
}
function placeCard() {
  if (selIdx === -1) return;
  // Always bottom-right: the mode panels occupy the left column and the
  // crosshair sits centre-screen, so a fixed slot on the right is the one
  // place the card never covers something you are looking at.
  card.style.left = 'auto';
  card.style.right = '12px';
  card.style.bottom = '52px';
  card.style.top = 'auto';
}

function closeCard() {
  card.style.display = 'none';
  $('hint').style.visibility = '';
  selIdx = -1;
}

/* ---------- filter panel ----------------------------------------------------
 * One panel, two kinds of control: creators are membership (in the field or
 * out), the sliders are range. Both end up muting the same models through
 * isOff, so anything downstream that already respected creator toggles --
 * LOD, gravity, race, ranks -- picks up range filtering for free.
 */
const legend = $('legend');

/** Whatever changed the visible set needs to unsettle the same things a
 *  creator toggle always did, plus repaint the live count every control shares. */
function onFilterChanged() {
  memberReady = false;
  if (gravityOn) { gravSettled = false; gravCalm = 0; gravAnneal = Math.min(gravAnneal, 0.55); lastClusterSig = ''; }
  updateFilterCount();
  buildParetoViz();
}
function updateFilterCount() {
  const shown = MODELS.reduce((n, m) => n + (isOff(m) ? 0 : 1), 0);
  const el = $('filtercount');
  if (el) el.textContent = `${shown} / ${MODELS.length} shown`;
}

const RANGE_UI = [
  { key: 'price', label: 'price $/1M', fmt: (v) => money(v), step: 0.01 },
  { key: 'intel', label: 'intelligence', fmt: (v) => fmt(v, 0), step: 1 },
  { key: 'speed', label: 'speed tok/s', fmt: (v) => fmt(v, 0), step: 1 },
  { key: 'agentic', label: 'agentic', fmt: (v) => fmt(v, 0), step: 1 }
];

/** Log fields are dragged in log space so the handle sits where the field's
 *  own axis puts it -- a linear slider over $0.01-$200 would spend most of its
 *  travel above $20, where three-quarters of the field never prices. */
const toSlider = (key, v) => (RANGE_FIELDS[key].log ? Math.log10(Math.max(v, 0.01)) : v);
const fromSlider = (key, v) => (RANGE_FIELDS[key].log ? Math.pow(10, v) : v);

/** Field colour for each range row -- reused from the axis legend so a
 *  filter's fill reads as "the same price axis", not an unrelated control. */
const RANGE_COLOR = { price: '#e5c07b', intel: '#56b6c2', speed: '#61afef', agentic: '#c678dd' };

legend.innerHTML =
  '<div id="filtercount" class="fcount"></div>' +
  '<div id="franges">' +
  RANGE_UI.map(({ key, label }) => {
    return `<div class="frow" data-k="${key}">
      <div class="flbl"><span>${label}</span><span class="fval"></span></div>
      <div class="fslider" data-k="${key}">
        <div class="ftrack"></div>
        <div class="ffill" style="background:${RANGE_COLOR[key]}"></div>
        <div class="fhandle flo" style="background:${RANGE_COLOR[key]}"><div class="fgrip"></div></div>
        <div class="fhandle fhi" style="background:${RANGE_COLOR[key]}"><div class="fgrip"></div></div>
      </div>
    </div>`;
  }).join('') +
  '</div>' +
  '<button id="freset" class="x" style="margin-top:2px">reset filters</button>' +
  '<div id="fcreators">' +
  '<div class="lbl" style="margin:8px 0 5px">creators</div>' +
  CREATORS.map(([c, n]) => {
    const cell = ATLAS.index[c] ?? 0;
    const bx = (cell % ATLAS.cols) * 100 / (ATLAS.cols - 1);
    const by = Math.floor(cell / ATLAS.cols) * 100 / (ATLAS.rows - 1);
    return `<div class="lg" data-c="${esc(c)}">
      <span class="lgico" style="color:${colorOf.get(c)};
        -webkit-mask-image:url(${ASSETS}/atlas.png); mask-image:url(${ASSETS}/atlas.png);
        -webkit-mask-size:${ATLAS.cols * 100}% ${ATLAS.rows * 100}%;
        mask-size:${ATLAS.cols * 100}% ${ATLAS.rows * 100}%;
        -webkit-mask-position:${bx}% ${by}%; mask-position:${bx}% ${by}%"></span>
      <span class="dot" style="background:${colorOf.get(c)}"></span>
      <span class="lgname">${esc(c)}</span><span class="lgn">${n}</span>
      <button type="button" class="lgm" data-c="${esc(c)}" title="Mute ${esc(c)}">M</button>
      <button type="button" class="lgs" data-c="${esc(c)}" title="Solo ${esc(c)}">S</button>
      </div>`;
  }).join('') +
  '</div>';

function refreshCreatorRows() {
  legend.querySelectorAll('.lg').forEach((el) => {
    const c = el.dataset.c;
    el.classList.toggle('mute', hidden.has(c));
    el.querySelector('.lgm').classList.toggle('on', hidden.has(c));
    el.querySelector('.lgs').classList.toggle('on', soloed.has(c));
  });
}
legend.querySelectorAll('.lgm').forEach((btn) => {
  btn.onclick = (e) => {
    e.stopPropagation();
    const c = btn.dataset.c;
    hidden.has(c) ? hidden.delete(c) : hidden.add(c);
    refreshCreatorRows();
    onFilterChanged();
  };
});
legend.querySelectorAll('.lgs').forEach((btn) => {
  btn.onclick = (e) => {
    e.stopPropagation();
    const c = btn.dataset.c;
    soloed.has(c) ? soloed.delete(c) : soloed.add(c);
    refreshCreatorRows();
    onFilterChanged();
  };
});

/** Two-handle drag, in the same absolute-x style the hardware faders use:
 *  a pointer down on a handle tracks pointermove against the track's own
 *  rect until pointerup, unified across mouse/touch/pen. */
function wireRangeRow(row) {
  const key = row.dataset.k;
  const track = row.querySelector('.fslider');
  const loEl = track.querySelector('.flo'), hiEl = track.querySelector('.fhi');
  const fill = track.querySelector('.ffill');
  const cfg = RANGE_FIELDS[key];
  const slLo = toSlider(key, cfg.lo), slHi = toSlider(key, cfg.hi);
  let vLo = slLo, vHi = slHi;

  const pctOf = (v) => (v - slLo) / (slHi - slLo);
  const paint = () => {
    const loP = pctOf(vLo) * 100, hiP = pctOf(vHi) * 100;
    loEl.style.left = loP + '%';
    hiEl.style.left = hiP + '%';
    fill.style.left = loP + '%';
    fill.style.width = (hiP - loP) + '%';
    const ui = RANGE_UI.find((r) => r.key === key);
    row.querySelector('.fval').textContent =
      `${ui.fmt(fromSlider(key, vLo))} – ${ui.fmt(fromSlider(key, vHi))}`;
  };
  const commit = () => {
    const atFloor = vLo <= slLo + 1e-9, atCeil = vHi >= slHi - 1e-9;
    // A band pinned to both ends is the same as no filter, and is kept that
    // way rather than as [lo, hi] so a model with no value still passes it.
    range[key] = atFloor && atCeil ? null : [fromSlider(key, vLo), fromSlider(key, vHi)];
    paint();
    onFilterChanged();
  };

  function dragHandle(which) {
    return (e) => {
      e.preventDefault();
      const move = (ev) => {
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const v = slLo + pct * (slHi - slLo);
        // Clamping to the other handle rather than letting them cross keeps
        // lo <= hi without the two handles fighting over the same pixel.
        if (which === 'lo') vLo = Math.min(v, vHi);
        else vHi = Math.max(v, vLo);
        commit();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      move(e);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }
  loEl.addEventListener('pointerdown', dragHandle('lo'));
  hiEl.addEventListener('pointerdown', dragHandle('hi'));
  row._resetRange = () => { vLo = slLo; vHi = slHi; commit(); };
  paint();
}
legend.querySelectorAll('.frow').forEach(wireRangeRow);

$('freset').onclick = () => {
  hidden.clear();
  soloed.clear();
  refreshCreatorRows();
  legend.querySelectorAll('.frow').forEach((row) => row._resetRange());
  onFilterChanged();
};

updateFilterCount();

/* ---------- Pareto frontier ---------------------------------------------- *
 * A model is on the frontier if no other visible model beats it on every
 * objective at once -- cheaper, smarter and faster all simultaneously, for
 * the fully-measured field, or cheaper and smarter for the price-only annex.
 * Shown as geometry rather than a highlight because the shape itself is the
 * point: the frontier is a surface (quadrant A, all three axes) or a curve
 * (quadrant B, missing speed) in the same space the bodies already occupy,
 * not a separate chart.
 *
 * O(n^2) against the visible field, which is a few hundred points -- run only
 * when the toggle is on and only once every few frames (paretoTick, below),
 * not per rendered frame.
 */
let paretoOn = false;
let paretoStaleAt = 0;
/** Which bodies are currently on the frontier, read by writeInstances to give
 *  them the same selection-halo glow a hovered or selected body gets. */
const onFrontier = new Uint8Array(N);
const paretoGroup = new THREE.Group();
scene.add(paretoGroup);
/** Model indices along quadrant B's frontier curve, in price order -- who is
 *  on it changes rarely (only on a filter/gravity rebuild), but the tube
 *  meshes tracing it have to move every frame with the wander those bodies
 *  never stop doing. A sibling of paretoGroup rather than a child of it, so
 *  disposeParetoViz's rebuild of the static frontA content never touches it. */
let paretoBChain = [];
const paretoBGroup = new THREE.Group();
scene.add(paretoBGroup);
function updateParetoTubes() {
  paretoBGroup.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  paretoBGroup.clear();
  for (let k = 0; k + 1 < paretoBChain.length; k++) {
    paretoBGroup.add(mkTube(cur[paretoBChain[k]], cur[paretoBChain[k + 1]], 0.4, 0x98c379, 0.9));
  }
}

/** objs: [[key, betterIsHigher], ...]. Returns the subset of `items` no other
 *  item in the list beats on every objective at once. */
function paretoFront(items, objs) {
  const dominates = (a, b) => {
    let strictly = false;
    for (const [key, hi] of objs) {
      const av = a[key], bv = b[key];
      if (hi ? av < bv : av > bv) return false;
      if (av !== bv) strictly = true;
    }
    return strictly;
  };
  return items.filter(([m]) => !items.some(([n]) => n !== m && dominates(n, m)));
}

function disposeParetoViz() {
  // Object3D.clear() only drops the children from the graph, not their GPU
  // resources -- and this rebuilds on every filter change, gravity tick and
  // view settle while the toggle is on, so leaving geometries behind would
  // leak one set per rebuild for as long as the frontier stayed visible.
  paretoGroup.traverse((o) => {
    o.geometry?.dispose?.();
    o.material?.dispose?.();
  });
  paretoGroup.clear();
}

/** A single edge as a real cylinder rather than a line -- LineBasicMaterial's
 *  linewidth is a no-op on most GPUs, so a tube is the only reliable way to
 *  draw a visibly thick connector between two points. */
function mkTube(p0, p1, radius, color, opacity) {
  const geo = new THREE.CylinderGeometry(radius, radius, p0.distanceTo(p1), 6, 1);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, p0.distanceTo(p1) / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
  mesh.position.copy(p0);
  mesh.lookAt(p1);
  return mesh;
}

function buildParetoViz() {
  disposeParetoViz();
  onFrontier.fill(0);
  if (!paretoOn) {
    paretoBChain = [];
    paretoBGroup.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    paretoBGroup.clear();
    return;
  }

  if (view === 'space') {
    // Quadrant A: three real axes, so the frontier is a surface. The convex
    // hull of the frontier points is closed on every side, though, and a
    // Pareto front only has one meaningful face -- the one looking toward the
    // dominated region. Keeping every face of the hull drew the far side too
    // and the whole thing read as a solid wedge rather than a sheet, so only
    // triangles whose normal points away from the "better" corner (cheaper,
    // smarter, faster) survive: those are the ones actually bounding the
    // frontier, and dropping the rest leaves an open shell instead of a solid.
    const A = vis();
    const frontA = paretoFront(A, [['p', false], ['i', true], ['sp', true]]);
    if (frontA.length >= 4) {
      try {
        const geo = new ConvexGeometry(frontA.map(([, i]) => cur[i].clone()));
        const pos = geo.attributes.position;
        const centroid = new THREE.Vector3();
        for (let k = 0; k < pos.count; k++) centroid.add(new THREE.Vector3().fromBufferAttribute(pos, k));
        centroid.divideScalar(pos.count);
        const keep = [];
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3(), toCenter = new THREE.Vector3();
        for (let k = 0; k < pos.count; k += 3) {
          a.fromBufferAttribute(pos, k); b.fromBufferAttribute(pos, k + 1); c.fromBufferAttribute(pos, k + 2);
          ab.subVectors(b, a); ac.subVectors(c, a); normal.crossVectors(ab, ac);
          toCenter.subVectors(centroid, a);
          // A face pointing toward the hull's own centroid is an inner/back
          // face from the frontier's point of view; only the outward ones --
          // facing away from the bulk of the data -- are the frontier itself.
          if (normal.dot(toCenter) < 0) keep.push(a.clone(), b.clone(), c.clone());
        }
        if (keep.length) {
          // Wireframe only, no fill: a translucent mesh still read as a solid
          // from some angles even with only the outward faces kept, and the
          // wireframe alone traces the same shape without ever being
          // mistaken for a volume. LineBasicMaterial's own linewidth is a
          // no-op on most GPUs, so each edge is a real tube instead -- the
          // only reliable way to draw a visibly thick line in three.js.
          const shellGeo = new THREE.BufferGeometry().setFromPoints(keep);
          const wire = new THREE.WireframeGeometry(shellGeo);
          const wPos = wire.attributes.position;
          const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
          for (let k = 0; k < wPos.count; k += 2) {
            p0.fromBufferAttribute(wPos, k); p1.fromBufferAttribute(wPos, k + 1);
            paretoGroup.add(mkTube(p0, p1, 0.35, 0x98c379, 0.85));
          }
        }
        for (const [, i] of frontA) onFrontier[i] = 1;
      } catch { /* degenerate hull (near-coplanar points): skip the mesh, no line either */ }
    }

    // Quadrant B: price and intelligence are real, speed never was, so the
    // frontier there is a curve through the annex band, not a surface -- and
    // every body out there wanders (the jitter that marks an unmeasured axis
    // as a parking position rather than a value), so its tubes cannot be
    // built once here and left standing. This only records which models are
    // on that curve and in what order; updateParetoTubes, called every
    // frame below, is what actually places the tube meshes each time,
    // against wherever the wander put the bodies on that particular frame.
    const B = MODELS.map((m, i) => [m, i]).filter(([m]) => !isOff(m) && m.q === 'B');
    const frontB = paretoFront(B, [['p', false], ['i', true]])
      .sort((a, b) => a[0].p - b[0].p);
    paretoBChain = frontB.map(([, i]) => i);
    for (const i of paretoBChain) onFrontier[i] = 1;
  } else {
    // TIMELINE and RACE both leave view === 'time' -- RACE is a scrubbable
    // replay of the same layout, not a separate mode of it -- so a model not
    // yet launched at the current raceT has to be left out here exactly as
    // every other race-aware system already excludes it (isOff itself does
    // not: the race's launch clock is a separate, later cut than filtering).
    // Without this the line reached toward release dates with no body drawn
    // for them yet, which is what read as stuck on an old shape after
    // scrubbing or switching into RACE.
    const T = vis()
      .filter(([, i]) => !raceOn || raceScale[i] >= 0.999)
      .sort((a, b) => dNum(a[0]) - dNum(b[0]));
    const frontT = [];
    let best = -Infinity;
    for (const pair of T) { if (pair[0].i > best) { best = pair[0].i; frontT.push(pair); } }
    if (frontT.length >= 2) {
      paretoGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(frontT.map(([, i]) => cur[i])),
        new THREE.LineBasicMaterial({ color: 0x98c379, transparent: true, opacity: 0.75 })
      ));
    }
  }
}

$('pareto-toggle').onclick = () => {
  paretoOn = !paretoOn;
  $('pareto-toggle').classList.toggle('on', paretoOn);
  paretoGroup.visible = paretoOn;
  paretoBGroup.visible = paretoOn;
  buildParetoViz();
  updateParetoTubes();
};

/* ---------- views ---------- */
/* r's row is a placeholder, not the field name: which index sizes the sphere
 * is a choice, not a fixed fact about the plot the way X/Y/Z are, so it gets
 * its own render pass wired up after the innerHTML swap rather than baked
 * into the string like the fixed axes. */
const AXTEXT = {
  space: '<span title="US dollars per million tokens, blended 3:1 input to output. Log scale."><b style="color:#e5c07b">X</b> price</span><br>' +
         '<span title="Artificial Analysis Intelligence Index. The one axis every model has."><b style="color:#56b6c2">Y</b> intelligence</span><br>' +
         '<span title="Median output tokens per second. Log scale."><b style="color:#61afef">Z</b> speed</span><br>' +
         '<span id="rfield"></span><br>' +
         '<span class="hint-tip" title="Models missing a field upstream sit outside the ' +
         'measured box and drift along the axis they were never measured on." ' +
         'style="color:#d19a66">unmeasured &#9432;</span>',
  time:  '<span title="Release date, run out as a spiral instead of a straight line: the earliest model sits at the centre, and each later one lands further round and further out."><b style="color:#e5c07b">X&#8226;Z</b> released, spiralled</span><br>' +
         '<span title="Artificial Analysis Intelligence Index."><b style="color:#56b6c2">Y</b> intelligence</span><br>' +
         '<span id="rfield"></span>'
};

/** Wires an existing ◄ value ► triple (prev/val/next ids already in the
 *  markup) to step through a small list -- the one shape used for every short
 *  cycle on this HUD (radius, projection, view), the same as the synth's own
 *  METER stepper: arrows step, the centre names where you are. */
function wireCycle(prevId, valId, nextId, order, get, set, label) {
  const step = (dir) => {
    const at = order.indexOf(get());
    set(order[(at + dir + order.length) % order.length]);
    paint();
  };
  function paint() {
    const el = $(valId);
    if (el) el.textContent = label(get());
  }
  $(prevId).onclick = () => step(-1);
  $(nextId).onclick = () => step(1);
  $(valId).onclick = () => step(1);
  paint();
  return paint;
}

const RADIUS_ORDER = Object.keys(RADIUS_FIELDS);
function renderRadiusField() {
  const el = $('rfield');
  if (!el) return;
  el.innerHTML = '<span class="cyc" style="--g:#c678dd">r&nbsp;' +
    '<button type="button" class="carrow" id="r-prev">&#9664;</button>' +
    '<button type="button" class="cval" id="r-val"></button>' +
    '<button type="button" class="carrow" id="r-next">&#9654;</button></span>';
  wireCycle('r-prev', 'r-val', 'r-next', RADIUS_ORDER,
    () => radiusField, (v) => { radiusField = v; }, (k) => RADIUS_FIELDS[k].label);
}

function setView(v) {
  if (v === view) return;
  view = v;
  for (let i = 0; i < N; i++) {
    from[i].copy(cur[i]);
    to[i].copy(v === 'space' ? posSpace(MODELS[i], i) : posTime(MODELS[i], i));
  }
  morph = 0;
  $('axinfo').innerHTML = AXTEXT[v];
  renderRadiusField();
  annexGroup.visible = v === 'space';
  spineGroup.visible = v === 'space';
  timeSpineGroup.visible = v === 'time';
  // TIMELINE has no rectangular anything left to measure -- price and speed
  // are gone, and a straight-edged box around a spiral read as leftover
  // scaffolding from the layout it used to be rather than a frame for this
  // one. The spiral's own spine is what orients it now.
  frame.visible = v === 'space';
  buildAxisLabels(v);
  // Hidden through the morph; runFrame rebuilds both once bodies settle.
  paretoGroup.visible = false;
  paretoBGroup.visible = false;
}
/* One control, not four: clicking advances through the axis pairs and the
   label says which one you are on. Four buttons for what is really a single
   choice made this the widest row in the panel. */
const VP_ORDER = ['front', 'side', 'top'];
let vpAt = -1;
$('vp-cycle').onclick = () => {
  vpAt = (vpAt + 1) % VP_ORDER.length;
  snapTo(VP_ORDER[vpAt]);
};

/* An axis-aligned view is only meaningful without foreshortening, so the cycle
   control belongs to orthographic and is hidden in perspective rather than
   sitting in a row of its own implying it is a third mode. */
function syncProjUI() {
  const cyc = $('vp-cycle');
  const on = projMode === 'ortho';
  // The control keeps its place in the row whether or not it applies: removing
  // it changed the width of a right-anchored panel, so every other row shifted
  // sideways as the projection was switched.
  cyc.classList.toggle('inert', !on);
  cyc.disabled = !on;
  if (!on) { cyc.classList.remove('on'); vpAt = -1; }
}

const PROJ_ORDER = ['persp', 'ortho'];
paintProjCycle = wireCycle('proj-prev', 'proj-val', 'proj-next', PROJ_ORDER,
  () => projMode, (v) => setProjection(v), (k) => (k === 'persp' ? 'PERSP' : 'ORTHO'));
syncProjUI();

/* RACE only ever replays the timeline with the release-date axis animated, so
 * it is a third position on the same VIEW cycle instead of a separate
 * TIMELAPSE group: selecting it is what starts it, and stepping away from it
 * is what stops it, rather than a start/stop button living somewhere else.
 * raceOn itself is declared down with the rest of the race state below, but
 * the cycle's first paint runs synchronously right here, before that
 * declaration's own line executes -- so the flag needed hoisting up to this
 * point instead, ahead of every other read of it (all of them inside
 * functions that only run later, so this is the one spot order matters). */
let raceOn = false;
const VIEW_ORDER = ['space', 'time', 'race'];
function viewModeNow() { return raceOn ? 'race' : view; }
function setViewMode(v) {
  /* Gravity is a rearrangement of the SPACE layout: it throws away the plotted
     coordinates and lets the field fall into its own groups. TIMELINE and RACE
     both place bodies by release date instead, so there is nothing for it to
     rearrange there -- left running it fought the timeline for the same
     positions, kept its panel and lit button over a view they no longer
     described, and went on integrating the whole field every frame for a layout
     nobody could see. Leaving SPACE ends it, the same way starting it ends a
     running race. Ordered before the switch so stopGravity's fallback reads the
     view it is actually leaving. */
  if (gravityOn && v !== 'space') stopGravity();
  if (v === 'race') { if (!raceOn) startRace(); return; }
  if (raceOn) stopRace();
  setView(v);
}
paintViewCycle = wireCycle('view-prev', 'view-val', 'view-next', VIEW_ORDER,
  viewModeNow, setViewMode, (k) => (k === 'space' ? 'SPACE' : k === 'time' ? 'TIMELINE' : 'RACE'));

$('axinfo').innerHTML = AXTEXT.space;
renderRadiusField();
buildAxisLabels('space');

/* ---------- narrow-stage panel collapse ------------------------------------
 * A phone-width stage is barely taller than either side panel on its own, so
 * AXES and FILTER cannot both stay open the way they do on desktop -- one
 * would always cover the other, or both would eat the whole box and leave
 * nothing to fly through. Below the breakpoint they start collapsed to a
 * heading, and a tap opens one at a time; above it, both stay open exactly as
 * they always have, so nothing here touches desktop's layout. */
const NARROW = () => root.clientWidth < 520;
function setCollapsed(panel, on) {
  panel.classList.toggle('collapsed', on);
}
const modesHd = $('modeshd');
modesHd.onclick = () => {
  const modes = $('modes');
  const wasCollapsed = modes.classList.contains('collapsed');
  setCollapsed(modes, !wasCollapsed);
  if (wasCollapsed && NARROW()) setCollapsed(legend, true);
};
legend.insertAdjacentHTML('afterbegin',
  '<button type="button" id="legendhd" class="phd"><span class="lbl">filter</span><span class="pcaret">&#9662;</span></button>');
$('legendhd').onclick = () => {
  const wasCollapsed = legend.classList.contains('collapsed');
  setCollapsed(legend, !wasCollapsed);
  if (wasCollapsed && NARROW()) setCollapsed($('modes'), true);
};
if (NARROW()) { setCollapsed($('modes'), true); setCollapsed(legend, true); }

function toggleLogos() {
  logosOn = !logosOn;
  logoUniforms.uLogoMix.value = logosOn ? 1 : 0;
}

/* ---------- MISSION: navigate to the answer ---------- */
const missionEl = $('mission');
const scoreEl = { textContent: '' };   // the score badge went with the mission UI
let missionOn = false, missionTarget = -1, missionT0 = 0, missionN = 0, missionHit = 0, missionQ = '';
/* Missions ask you to navigate to an answer, so they may only involve models
 * whose position is a real measurement -- a model parked in an annexe cannot be
 * "the cheapest at 300 tok/s" because its speed was never measured. */
const vis = () => MODELS.map((m, i) => [m, i]).filter(([m]) => !isOff(m) && m.q === 'A');
const MISSIONS = [
  () => { const p = vis().filter(([m]) => m.p <= 2 && m.p > 0); if (!p.length) return null;
    return { q: 'Find the highest INTELLIGENCE under $2/1M', i: p.reduce((a, b) => (b[0].i > a[0].i ? b : a))[1] }; },
  () => { const p = vis().filter(([m]) => m.sp >= 300); if (!p.length) return null;
    return { q: 'Find the smartest model running at 300+ tok/s', i: p.reduce((a, b) => (b[0].i > a[0].i ? b : a))[1] }; },
  () => { const p = vis().filter(([m]) => m.i >= 45); if (!p.length) return null;
    return { q: 'Find the cheapest model with intelligence 45+', i: p.reduce((a, b) => (b[0].p < a[0].p ? b : a))[1] }; },
  () => { const p = vis().filter(([m]) => m.cd != null); if (!p.length) return null;
    return { q: 'Find the highest CODING index in the field', i: p.reduce((a, b) => (b[0].cd > a[0].cd ? b : a))[1] }; },
  () => { const p = vis().filter(([m]) => m.t != null && m.i >= 35); if (!p.length) return null;
    return { q: 'Fastest first token among models at index 35+', i: p.reduce((a, b) => (b[0].t < a[0].t ? b : a))[1] }; }
];
function nextMission() {
  const opts = MISSIONS.map((f) => f()).filter(Boolean);
  if (!opts.length) { stopMission(); return; }
  const m = opts[(Math.random() * opts.length) | 0];
  missionTarget = m.i; missionQ = m.q; missionT0 = performance.now(); missionN++;
  missionEl.style.display = 'block';
  missionEl.innerHTML = `<div class="q">${esc(m.q)}</div><div class="m">fly to it and click the node &middot; ${missionN} of 5</div>`;
}
function checkAnswer(i) {
  if (!missionOn || missionTarget === -1) return;
  const dt = ((performance.now() - missionT0) / 1000).toFixed(1);
  const right = i === missionTarget;
  if (right) missionHit++;
  missionEl.innerHTML = `<div class="q">${esc(missionQ)}</div>
    <div class="res" style="color:${right ? 'var(--green)' : 'var(--red)'}">
      ${right ? 'CORRECT' : 'MISS — the answer was ' + esc(MODELS[missionTarget].n)} &middot; ${dt}s</div>`;
  const done = missionN >= 5;
  missionTarget = -1;
  setTimeout(() => {
    if (!missionOn) return;
    if (done) {
      missionEl.innerHTML = `<div class="q">RUN COMPLETE &mdash; ${missionHit}/5</div><div class="m">press START for another run</div>`;
      missionOn = false;
    } else nextMission();
  }, right ? 1400 : 2600);
}
function stopMission() {
  missionOn = false; missionTarget = -1;
  missionEl.style.display = 'none';
}
const _missionStart = () => {
  if (missionOn) { stopMission(); return; }
  if (raceOn) stopRace();
  missionOn = true; missionN = 0; missionHit = 0;
  scoreEl.textContent = '0/0';
  nextMission();
};

/* ------------------------------------------------------------------ *
 * RACE — the animated mode.
 *
 * Time runs forward along the release-date axis. Every model launches
 * on the day it shipped and climbs a track whose height is its
 * intelligence index; a token stream flies along each lane at a rate
 * set by that model's real tok/s. You pick a horse before the gun,
 * and the field replays three years of releases in ninety seconds.
 * Every quantity animated here is a payload field, not a simulation.
 * ------------------------------------------------------------------ */
const RACE_SECONDS = 42;
let raceT = 0, racePick = -1, raceDone = false, racePaused = false; // raceOn itself is declared above, before the view cycle
const raceBob = new Float32Array(N);
// Per-model scale during the race: 0 until it ships, 1 once it has arrived.
const raceScale = new Float32Array(N).fill(1);
const raceEl = $('race');

// Token streams: one small point cloud per lane, advected by real tok/s.
const STREAM_PER = 5;
const streamGeo = new THREE.BufferGeometry();
const streamPos = new Float32Array(N * STREAM_PER * 3);
const streamCol = new Float32Array(N * STREAM_PER * 3);
const streamAlpha = new Float32Array(N * STREAM_PER);
streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPos, 3));
streamGeo.setAttribute('color', new THREE.BufferAttribute(streamCol, 3));
streamGeo.setAttribute('aAlpha', new THREE.BufferAttribute(streamAlpha, 1));
// A per-point alpha lets a trail fade along its length instead of every dot
// being equally bright, which is what made the old streams read as confetti.
const streamPts = new THREE.Points(streamGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  glslVersion: THREE.GLSL3,
  vertexShader: `
    in float aAlpha;
    out vec3 vCol;
    out float vA;
    void main() {
      vCol = color; vA = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = (26.0 / -mv.z) * (0.5 + aAlpha);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    in vec3 vCol; in float vA; out vec4 o;
    void main() {
      // Round, soft-edged dots.
      vec2 d = gl_PointCoord - 0.5;
      float m = smoothstep(0.5, 0.1, length(d));
      if (m * vA < 0.01) discard;
      o = vec4(vCol, m * vA * 0.85);
    }`,
  vertexColors: true
}));
streamPts.frustumCulled = false;
streamPts.visible = false;
scene.add(streamPts);

const raceLaneZ = (i) => (laneOf.get(MODELS[i].c) / Math.max(CREATORS.length - 1, 1) - 0.5) * 2 * S;
const raceStart = (i) => norm(dNum(MODELS[i]), dLo, dHi);   // 0..1 across the window

function startRace() {
  if (missionOn) stopMission();
  // The race runs along the release-date axis, so it needs a timeline layout
  // -- but its own flat one, not the spiral TIMELINE otherwise shows: a
  // scrubbable replay needs a straight track to read progress along, and
  // setView('time') would leave the spiral's spine up and the box down.
  setView('time');
  frame.visible = true;
  timeSpineGroup.visible = false;
  morph = 1;
  for (let i = 0; i < N; i++) { to[i].copy(posRace(MODELS[i], i)); from[i].copy(to[i]); }
  raceOn = true; raceT = 0; raceDone = false; racePick = -1; racePaused = false;
  streamPts.visible = true;
  raceEl.style.display = 'block';
  raceCtl.classList.add('show');
  paintRaceCtl();
  syncLeftColumn();
  paintViewCycle?.();
  // A replay reads like a chart, not a scene to fly through: orthographic and
  // dead front-on, so date runs perfectly horizontal and intelligence
  // perfectly vertical with no perspective to bend either. Free look and
  // WASD are also switched off for as long as raceOn holds, above.
  setProjection('ortho');
  orthoZoom = S * 2.3;
  sizeOrtho();
  camera.position.set(0, 0, 300);
  yawPitch.yaw = 0; yawPitch.pitch = 0; vel.set(0, 0, 0);
  renderRacePanel();
}
function stopRace() {
  raceOn = false;
  streamPts.visible = false;
  raceBob.fill(0);
  raceScale.fill(1);
  raceEl.style.display = 'none';
  raceCtl.classList.remove('show');
  syncLeftColumn();
  // Coming off RACE still leaves view === 'time'; restore the spiral's own
  // frame/spine state now that the flat track it borrowed is done with.
  frame.visible = false;
  timeSpineGroup.visible = true;
  for (let i = 0; i < N; i++) { to[i].copy(posTime(MODELS[i], i)); from[i].copy(to[i]); }
  morph = 1;
  // The locked ortho view was RACE's own; free flight comes back with it.
  setProjection('persp');
  lookAtHome();
  paintViewCycle?.();
}

/* ---------- transport: play/pause, step, restart -------------------------- *
 * A replay is more useful paused than always running: stopping on a date to
 * read the standings, or nudging forward one launch at a time, both need the
 * clock to hold still until told otherwise. Built once, outside renderRacePanel
 * so pausing does not have to fight a rebuild that runs four times a second.
 */
const raceCtl = $('racectl');
const RACE_STEP = 0.01;   // one nudge, in the same 0..1 units raceT itself uses
function paintRaceCtl() {
  const playBtn = $('race-play');
  playBtn.innerHTML = racePaused || raceDone ? '&#9654;' : '&#10074;&#10074;';
  playBtn.title = racePaused || raceDone ? 'Play' : 'Pause';
  playBtn.classList.toggle('on', !racePaused && !raceDone);
}
function raceSeek(t) {
  raceT = THREE.MathUtils.clamp(t, 0, 1);
  raceDone = raceT >= 1;
  renderRacePanel();
  paintRaceCtl();
  // A manual scrub is a deliberate, discrete jump rather than the steady
  // drift autoplay makes -- worth an immediate rebuild rather than waiting
  // on the same interval that smooths over continuous playback.
  if (paretoOn) buildParetoViz();
}
$('race-restart').onclick = () => { racePaused = true; raceSeek(0); };
$('race-back').onclick = () => { racePaused = true; raceSeek(raceT - RACE_STEP); };
$('race-fwd').onclick = () => { racePaused = true; raceSeek(raceT + RACE_STEP); };
$('race-play').onclick = () => {
  if (raceDone) { raceSeek(0); racePaused = false; }
  else racePaused = !racePaused;
  paintRaceCtl();
};

// Standings: who has actually launched by now, ranked by intelligence.
function standings() {
  const live = [];
  for (let i = 0; i < N; i++) {
    if (isOff(MODELS[i])) continue;
    if (raceStart(i) <= raceT) live.push(i);
  }
  live.sort((a, b) => MODELS[b].i - MODELS[a].i);
  return live;
}
function renderRacePanel() {
  const live = standings();
  const top = live.slice(0, 8);
  const when = new Date(dLo + (dHi - dLo) * raceT);
  const pickRank = racePick === -1 ? null : live.indexOf(racePick);
  raceEl.innerHTML = `
    <div class="rhd">
      <span class="q">${when.toLocaleDateString('en-AU', { year: 'numeric', month: 'short' })}</span>
      <span class="m">${live.length} models shipped</span>
    </div>
    ${top.map((i, k) => {
      const m = MODELS[i];
      const cell = ATLAS.index[m.c] ?? 0;
      const bx = (cell % ATLAS.cols) * 100 / (ATLAS.cols - 1);
      const by = Math.floor(cell / ATLAS.cols) * 100 / (ATLAS.rows - 1);
      return `<div class="rrow ${i === racePick ? 'me' : ''}">
        <span class="rk">${k + 1}</span>
        <span class="lgico" style="color:${colorOf.get(m.c)};
          -webkit-mask-image:url(${ASSETS}/atlas.png); mask-image:url(${ASSETS}/atlas.png);
          -webkit-mask-size:${ATLAS.cols * 100}% ${ATLAS.rows * 100}%;
          mask-size:${ATLAS.cols * 100}% ${ATLAS.rows * 100}%;
          -webkit-mask-position:${bx}% ${by}%; mask-position:${bx}% ${by}%"></span>
        <span class="rn">${esc(m.n.replace(/\s*\(.*$/, ''))}</span>
        <span class="rv" style="color:${colorOf.get(m.c)}">${m.i.toFixed(1)}</span>
      </div>`;
    }).join('')}
    ${racePick !== -1 && pickRank >= 8
      ? `<div class="rrow me"><span class="rk">${pickRank + 1}</span>
         <span class="rn">${esc(MODELS[racePick].n.replace(/\s*\(.*$/, ''))}</span>
         <span class="rv">${MODELS[racePick].i.toFixed(1)}</span></div>` : ''}
    ${racePick === -1
      ? `<div class="rhint">click any node to back a runner</div>`
      : raceDone
        ? `<div class="rhint" style="color:${pickRank === 0 ? 'var(--green)' : 'var(--yellow)'}">
             your pick finished #${pickRank + 1} of ${live.length}</div>`
        : ''}`;
}

function updateRace(dt) {
  if (!raceDone && !racePaused) {
    raceT += dt / RACE_SECONDS;
    if (raceT >= 1) { raceT = 1; raceDone = true; }
  }
  const now = performance.now() / 1000;
  let s = 0;
  for (let i = 0; i < N; i++) {
    const m = MODELS[i];
    const born = raceStart(i);
    const live = born <= raceT && !isOff(m);

    // An unreleased model is scaled away rather than parked under the floor:
    // sinking it merely moved the orb somewhere the camera can still fly to,
    // which is what made unborn models show through from below.
    const age = THREE.MathUtils.clamp((raceT - born) / 0.015, 0, 1);
    raceScale[i] = live ? age : 0;
    // A small settle as it arrives, then it holds its own height.
    raceBob[i] = live ? (1 - age) * -26 + Math.sin(now * 1.1 + i) * 0.7 * age : 0;

    if (!live || age < 0.999) {
      // No stream until the model has fully arrived.
      for (let k = 0; k < STREAM_PER; k++, s++) streamAlpha[s] = 0;
      continue;
    }

    // The stream is what the model emits: tokens leaving the body along the
    // time axis, spaced by its measured throughput. A fast model lays down a
    // dense, quick trail and a slow one a sparse, crawling one, so the speed
    // figure is legible as motion rather than decoration.
    const y = (norm(m.i, iLo, iHi) - 0.5) * 2 * S + raceBob[i];
    const z = raceLaneZ(i);
    const x0 = (born - 0.5) * 2 * S;
    const rate = 0.10 + (Math.min(m.sp, 1200) / 1200) * 0.85;   // trail speed
    const reach = 10 + (Math.min(m.sp, 1200) / 1200) * 30;      // trail length
    for (let k = 0; k < STREAM_PER; k++, s++) {
      // Each dot leaves the body and fades out as it runs ahead in time.
      const phase = (now * rate + k / STREAM_PER) % 1;
      streamPos[s * 3] = x0 + phase * reach;
      streamPos[s * 3 + 1] = y + Math.sin(phase * 3.1 + i) * 0.8;
      streamPos[s * 3 + 2] = z;
      const c = base[i];
      // Bright at the body, gone by the end of the trail.
      const a = (1 - phase) * (1 - phase);
      streamCol[s * 3] = c.r; streamCol[s * 3 + 1] = c.g; streamCol[s * 3 + 2] = c.b;
      streamAlpha[s] = a;
    }
  }
  streamGeo.attributes.position.needsUpdate = true;
  streamGeo.attributes.color.needsUpdate = true;
  streamGeo.attributes.aAlpha.needsUpdate = true;
  if (Math.floor(now * 4) !== lastPanel) { lastPanel = Math.floor(now * 4); renderRacePanel(); paintRaceCtl(); }
}
let lastPanel = -1;

/* ------------------------------------------------------------------ *
 * GRAVITY — N-body clustering in capability space.
 *
 * Each model is a body whose mass is its intelligence index. The force
 * between two bodies is not a function of where they happen to sit: it is
 * their similarity across the five measured capabilities (intelligence,
 * coding, agentic, price, speed), each z-scored so no axis dominates by
 * unit. Similar models attract, dissimilar ones are pushed apart, and a
 * short-range repulsion keeps them from collapsing to a point.
 *
 * Nothing here is laid out by hand or by category. The clusters that form
 * are the structure the measurements actually contain -- if every vendor's
 * models land together, that is a finding; if they scatter across the same
 * few clumps, that is a different one.
 *
 * 322 bodies is ~52k pairs a step, which runs comfortably on the CPU.
 * ------------------------------------------------------------------ */
const FEATURES = ['i', 'cd', 'ag', 'p', 'sp'];
let gravityOn = false, gravityFrozen = false;
const gravEl = $('gravity');

// z-scored capability vectors; a missing field sits at the mean (0) so it
// neither attracts nor repels rather than being invented.
const FEAT = (() => {
  const cols = FEATURES.map((k) => {
    const raw = MODELS.map((m) => {
      const v = m[k];
      if (v == null) return null;
      return k === 'p' || k === 'sp' ? lg(v) : v;      // price and speed are log-scaled
    });
    const have = raw.filter((v) => v !== null);
    const mean = have.reduce((a, b) => a + b, 0) / have.length;
    const sd = Math.sqrt(have.reduce((a, b) => a + (b - mean) ** 2, 0) / have.length) || 1;
    return raw.map((v) => (v === null ? 0 : (v - mean) / sd));
  });
  return MODELS.map((_, i) => cols.map((c) => c[i]));
})();

const gForce = new Float32Array(N * 3);
/** Members per group; separation is normalised by it. */
const groupSize = new Float32Array(64).fill(1);
/** Seconds of cooling before the layout is treated as final. */
const GRAV_SETTLE = 12;
let gravAnneal = 0, gravMotion = Infinity, gravSettled = false, gravCalm = 0;
const gPos = MODELS.map(() => new THREE.Vector3());
const gVel = MODELS.map(() => new THREE.Vector3());
const massOf = MODELS.map((m) => 0.5 + norm(m.i, iLo, iHi) * 2.5);

/** Similarity in capability space, mapped to (-1, 1): >0 attracts, <0 repels. */
function affinity(a, b) {
  let d2 = 0;
  for (let k = 0; k < FEATURES.length; k++) {
    const d = FEAT[a][k] - FEAT[b][k];
    d2 += d * d;
  }
  // Pair distances run from ~0.9 (5th percentile) to ~19 (90th); putting the
  // zero crossing at 3.0 makes roughly the closest fifth of pairs attract and
  // the rest repel, which is what separates clusters instead of merging them.
  return 1 - d2 / 3.0;
}

// Precompute the pair affinities once: they never change, only positions do.
let AFF = null;
function buildAffinity() {
  AFF = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = affinity(i, j);
      AFF[i * N + j] = a;
      AFF[j * N + i] = a;
    }
  }
}

/* ---------- showing which bodies ended up in the same cluster -------------- *
 * The panel names the clusters, but the point of running the simulation is to
 * see them, so each one is drawn twice over: a translucent convex hull marking
 * the volume it occupies, and a spanning tree of links joining its members.
 * The hull answers "how far does this group reach"; the links answer "which
 * bodies are actually in it" -- a hull alone is ambiguous where two groups
 * overlap on screen.
 */
const clusterGroup = new THREE.Group();
scene.add(clusterGroup);
let clusterMode = 'link';                 // 'hull' | 'link' | 'both' | 'off'
let lastClusterSig = '';
let lastHullAt = 0;

const CLUSTER_TINTS = ['#56b6c2', '#98c379', '#e5c07b', '#c678dd', '#61afef', '#e06c75', '#d19a66'];

function disposeClusterViz() {
  clusterGroup.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  clusterGroup.clear();
}

/** Minimum spanning tree over a cluster: the fewest links that still join it. */
function spanningLinks(members) {
  const links = [];
  if (members.length < 2) return links;
  const inTree = [members[0]];
  const rest = members.slice(1);
  while (rest.length) {
    let bi = 0, bj = 0, bd = Infinity;
    for (let a = 0; a < inTree.length; a++) {
      for (let b = 0; b < rest.length; b++) {
        const d = gPos[inTree[a]].distanceToSquared(gPos[rest[b]]);
        if (d < bd) { bd = d; bi = a; bj = b; }
      }
    }
    links.push([inTree[bi], rest[bj]]);
    inTree.push(rest[bj]);
    rest.splice(bj, 1);
  }
  return links;
}

function buildClusterViz(cl) {
  disposeClusterViz();
  inCluster.fill(0);
  for (const g of cl) for (const i of g) inCluster[i] = 1;
  if (clusterMode === 'off') return;

  // Every cluster is drawn, not just the ones the panel lists; the tint ramp
  // repeats past its length rather than leaving later groups unmarked.
  cl.forEach((members, k) => {
    const tint = new THREE.Color(CLUSTER_TINTS[k % CLUSTER_TINTS.length]);

    if (clusterMode === 'hull' || clusterMode === 'both') {
      // A hull needs four non-coplanar points; smaller groups get links only.
      if (members.length >= 4) {
        try {
          const geo = new ConvexGeometry(members.map((i) => gPos[i].clone()));
          clusterGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: tint, transparent: true, opacity: 0.13,
            side: THREE.DoubleSide, depthWrite: false
          })));
          clusterGroup.add(new THREE.LineSegments(
            new THREE.WireframeGeometry(geo),
            new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.28 })
          ));
        } catch { /* degenerate hull: the links still show the grouping */ }
      }
    }

    if (clusterMode === 'link' || clusterMode === 'both') {
      const pts = [];
      for (const [a, b] of spanningLinks(members)) { pts.push(gPos[a], gPos[b]); }
      if (pts.length) {
        clusterGroup.add(new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.5 })
        ));
      }
    }
  });
}

/** The axes only describe the plotted layouts, so gravity hides them. */
/** The legend yields whenever a panel occupies the left column. */
/* One owner for the left column.
 *
 * #modes (AXES/FILTER), #legend, #gravity and #race are all absolutely
 * positioned at the same top-left corner of the stage, so they do not stack --
 * whichever is on top simply covers the others, and the one underneath still
 * takes clicks around its edges. GRAVITY and RACE each own that corner while
 * they run, and the axis controls do the rest of the time.
 *
 * This used to be spread across the callers: RACE hid #modes itself in
 * startRace and restored it in stopRace, gravity never hid it at all (so the
 * GRAVITY panel drew straight over a still-visible AXES), and stopRace's
 * restore was guarded on gravityOn to avoid undoing a state it did not own.
 * Deciding it in one place from the two flags is what keeps them from
 * overlapping -- every caller now just calls this after changing a flag. */
function syncLeftColumn() {
  const busy = gravityOn || raceOn;
  $('legend').style.display = busy ? 'none' : '';
  // The axis controls stay for TIMELINE -- it is still a plotted layout and
  // AXES still describes it -- and only yield to the two modes that take the
  // corner for a panel of their own.
  $('modes').style.display = busy ? 'none' : '';
}

/**
 * Fade the measurement frame without losing it.
 *
 * Gravity rearranges only the fully-measured models; the other 302 keep the
 * positions the axes gave them, so hiding the cage made those positions
 * meaningless and the two populations indistinguishable. Dimming says "these
 * coordinates no longer apply to everything" while keeping the regions legible.
 */
function dimFrame(dim) {
  frame.traverse((o) => {
    if (!o.material) return;
    if (o.userData.baseOpacity === undefined) o.userData.baseOpacity = o.material.opacity;
    o.material.transparent = true;
    o.material.opacity = o.userData.baseOpacity * (dim ? 0.4 : 1);
  });
}

function setAxesVisible(v) {
  frame.visible = v;
  annexGroup.visible = v;
  spineGroup.visible = v;
  $('modes').style.display = v ? '' : 'none';
}

function startGravity() {
  if (missionOn) stopMission();
  if (raceOn) stopRace();
  // Gravity rearranges the SPACE layout and dims that layout's own frame to say
  // so, which only means anything while SPACE is what is on screen. Started
  // from TIMELINE it would leave the spiral up and dim a frame belonging to a
  // view nobody was looking at, so it brings SPACE back first -- the same way
  // RACE takes the timeline it needs rather than refusing to run without it.
  if (view !== 'space') { setView('space'); paintViewCycle?.(); }
  // The frame stays: gravity only rearranges the fully-measured models, and the
  // rest keep their plotted positions, which are only readable against it.
  // Dimmed, because those positions are no longer where the physics put them.
  dimFrame(true);
  annexGroup.visible = true;
  if (!AFF) buildAffinity();
  computeMembership();      // fixed groups, before any body moves
  gravityOn = true; gravityFrozen = false;
  gravAnneal = 0; gravMotion = Infinity; gravSettled = false; gravCalm = 0;
  $('g-start').classList.add('on');
  gravEl.style.display = 'block';
  syncLeftColumn();
  /* Seed from the SPACE layout with a small random kick, so you can see the
     cloud fall out of the axes you already know into whatever it prefers.
     posSpace, not cur: setView above only sets a morph *target* and lets the
     bodies travel there over the next second, so starting from cur meant a
     SIMULATE pressed in TIMELINE began from wherever the spiral happened to
     have each body -- the physics ran on the previous view's positions and the
     cloud never fell out of the axes at all. The morph is also finished here
     rather than raced, since gravity owns cur from this point on. */
  for (let i = 0; i < N; i++) {
    const seed = posSpace(MODELS[i], i);
    cur[i].copy(seed);
    from[i].copy(seed);
    to[i].copy(seed);
    gPos[i].copy(seed);
    gVel[i].set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  }
  morph = 1;
  renderGravityPanel();
}
function stopGravity() {
  gravityOn = false;
  dimFrame(false);
  disposeClusterViz();
  lastClusterSig = '';
  $('g-start').classList.remove('on');
  gravEl.style.display = 'none';
  syncLeftColumn();
  // Fall back to the axes layout.
  for (let i = 0; i < N; i++) { from[i].copy(cur[i]); to[i].copy(view === 'space' ? posSpace(MODELS[i], i) : posTime(MODELS[i], i)); }
  morph = 0;
}
$('g-start').onclick = () => (gravityOn ? stopGravity() : startGravity());

// Cycle how a cluster is shown: its volume, its membership, both, or neither.
const CLUSTER_MODES = ['hull', 'link', 'both', 'off'];
$('g-hull').onclick = () => {
  clusterMode = CLUSTER_MODES[(CLUSTER_MODES.indexOf(clusterMode) + 1) % CLUSTER_MODES.length];
  const btn = $('g-hull');
  btn.textContent = clusterMode.toUpperCase();
  btn.classList.toggle('on', clusterMode !== 'off');
  if (gravityOn) { lastClusterSig = ''; renderGravityPanel(); }
};

/* Scratch reused across steps.
 *
 * This integrator was what made SIMULATE slow: a step cost about 36ms at 643
 * models, so the mode could not hold a frame however little the renderer was
 * asked to draw. Almost none of that was the physics itself.
 *
 * `isOff` and `radiusOf` were the expensive part. Both are per-body properties
 * that cannot change mid-step, but they were being asked inside the pairwise
 * loops -- about both bodies of every pair, three times over across the force
 * loop and the two separation passes -- and `isOff` walks the whole range table
 * (allocating, via Object.entries) on every call. That is over a million
 * table walks a frame, dwarfing every force in the system.
 *
 * So both are resolved once, up front, into a list of the bodies actually
 * taking part. The loops walk that list, which also drops the pairwise work
 * from all 643 models to the ~329 measured ones that gravity moves -- roughly a
 * quarter of the pairs. Positions are mirrored into flat typed arrays over the
 * same pass, so the inner loops read a float instead of chasing a Vector3, and
 * both distance tests compare squared lengths so the majority of pairs, which
 * are out of range, never pay for a square root.
 *
 * Together that is ~36ms -> ~0.5ms a step, measured at 643 models.
 *
 * The buffers are module-level so a step allocates nothing; the centroid
 * accumulators are cleared per step rather than reallocated. */
const gActive = new Int32Array(N);
const gRadius = new Float64Array(N);
const gPosX = new Float64Array(N), gPosY = new Float64Array(N), gPosZ = new Float64Array(N);
const cenX = new Float64Array(64), cenY = new Float64Array(64);
const cenZ = new Float64Array(64), cenN = new Float64Array(64);
function stepGravity(dt) {
  if (gravityFrozen) return;
  const h = Math.min(dt, 0.033);

  // Annealing: the system starts hot enough to rearrange, then cools so it
  // actually comes to rest. Without this the bodies keep orbiting their group
  // indefinitely and the layout never settles into something readable.
  gravAnneal = Math.min(1, gravAnneal + h / GRAV_SETTLE);
  const cool = 1 - gravAnneal;
  const damping = 0.86 - 0.24 * gravAnneal;      // 0.86 hot -> 0.62 cold
  const step = 0.55 + 0.85 * cool;               // large moves early, small late

  // Who is taking part, decided once. Positions are mirrored into flat arrays
  // at the same time: the pairwise loops read them a few million times a step,
  // and a typed array avoids chasing a Vector3 object per access.
  let A = 0;
  for (let i = 0; i < N; i++) {
    if (MEMBER[i] < 0 || isOff(MODELS[i])) continue;
    gActive[A++] = i;
    gRadius[i] = radiusOf(MODELS[i]);
    const p = gPos[i];
    gPosX[i] = p.x; gPosY[i] = p.y; gPosZ[i] = p.z;
  }

  // Group centroids: cohesion pulls each body toward its own group's centre,
  // which is O(n) per step and cannot produce the runaway sums that a spring to
  // every individual member did.
  cenX.fill(0); cenY.fill(0); cenZ.fill(0); cenN.fill(0);
  for (let a = 0; a < A; a++) {
    const i = gActive[a];
    const c = MEMBER[i];
    cenX[c] += gPosX[i]; cenY[c] += gPosY[i]; cenZ[c] += gPosZ[i]; cenN[c]++;
  }
  for (let c = 0; c < 64; c++) {
    if (cenN[c]) { cenX[c] /= cenN[c]; cenY[c] /= cenN[c]; cenZ[c] /= cenN[c]; }
  }

  // Forces are accumulated against the positions held at the start of the step
  // and applied afterwards. Updating in place made each body react to a partly
  // advanced world, which pumps energy in and prevents convergence.
  for (let a = 0; a < A; a++) {
    const i = gActive[a];
    const pix = gPosX[i], piy = gPosY[i], piz = gPosZ[i];
    const mi = MEMBER[i];
    let fx = 0, fy = 0, fz = 0;
    for (let b = 0; b < A; b++) {
      const j = gActive[b];
      if (i === j) continue;
      // Same-group pairs contribute nothing here (cohesion is applied once, to
      // the centroid, below), so reject them before doing any distance work.
      if (mi === MEMBER[j]) continue;
      const dx = gPosX[j] - pix, dy = gPosY[j] - piy, dz = gPosZ[j] - piz;
      // Softening (+12) keeps the 1/r term finite when two bodies coincide.
      // Out-of-range pairs are the overwhelming majority, so the range test is
      // made against the square -- none of them then pay for a square root.
      const r2 = dx * dx + dy * dy + dz * dz + 12;
      if (r2 >= 3600) continue;                     // range 60, squared
      const r = Math.sqrt(r2);
      // Membership is already decided, so the force only has to realise it.
      //
      // Cohesion is a spring, not gravity: a 1/r^2 pull weakens with distance,
      // so a body that drifted out of its group could never be recovered and
      // the groups smeared into long streaks. A spring instead pulls harder the
      // further a member strays, which keeps every group compact.
      //
      // Separation is capped in range for the same reason in reverse: an
      // unbounded push kept accelerating stragglers away from the whole field.
      // Only separation is pairwise now. Cohesion is applied once per body,
      // toward its group's centroid, below: summing a spring to every one of
      // 77 members produced a pull in the thousands that fought the overlap
      // constraint and blew the layout apart.
      //
      // Normalised by the other group's size so a large group does not push
      // harder merely by having more members.
      const f = -(1 - r / 60) * 40 / (r * Math.sqrt(groupSize[MEMBER[j]]));

      fx += dx * f; fy += dy * f; fz += dz * f;
    }
    // Cohesion: a spring toward the group centroid. Radius grows with the
    // group's size so a group of 77 is not asked to occupy the same volume as
    // one of 43, and members that stray are pulled back harder.
    const c = mi;
    if (cenN[c]) {
      const want = 8 + Math.sqrt(cenN[c]) * 2.0;
      let ox = cenX[c] - pix, oy = cenY[c] - piy, oz = cenZ[c] - piz;
      const od = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1e-4;
      const k = (od - want) * 2.2 / od;
      fx += ox * k; fy += oy * k; fz += oz * k;
    }
    // Group-level separation: each body also carries its group away from the
    // other group centroids. Pushing member-to-member was not enough -- the
    // groups stayed piled on one another because the pairwise term only acts
    // at short range, while what needs separating is whole volumes.
    for (let o = 0; o < 64; o++) {
      if (o === c || !cenN[o]) continue;
      let ox = pix - cenX[o], oy = piy - cenY[o], oz = piz - cenZ[o];
      const od = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1e-4;
      const clear = 30 + Math.sqrt(cenN[c]) * 2.0 + Math.sqrt(cenN[o]) * 2.0;
      if (od < clear) {
        // Applied uniformly this acts as outward pressure inside the group
        // and stops it contracting; damping it well inside the group keeps it
        // a translation of the whole cluster instead.
        const k = (clear - od) * 1.1 / od;
        fx += ox * k; fy += oy * k; fz += oz * k;
      }
    }
    // A weak centring spring keeps the whole system on screen.
    fx -= pix * 0.04; fy -= piy * 0.04; fz -= piz * 0.04;
    gForce[i * 3] = fx; gForce[i * 3 + 1] = fy; gForce[i * 3 + 2] = fz;
  }

  let moved = 0;
  const live = A;
  const advance = h * 60 * step;
  for (let a = 0; a < A; a++) {
    const i = gActive[a];
    const vi = gVel[i];
    vi.x = (vi.x + gForce[i * 3] * h) * damping;
    vi.y = (vi.y + gForce[i * 3 + 1] * h) * damping;
    vi.z = (vi.z + gForce[i * 3 + 2] * h) * damping;
    // Cap the per-step move: one body flung across the cloud drags its whole
    // group with it and restarts the settling.
    const sp = Math.hypot(vi.x, vi.y, vi.z);
    if (sp > 90) vi.multiplyScalar(90 / sp);
    const mx = vi.x * advance, my = vi.y * advance, mz = vi.z * advance;
    gPosX[i] += mx; gPosY[i] += my; gPosZ[i] += mz;
    moved += Math.sqrt(mx * mx + my * my + mz * mz);
  }

  // Separation is resolved positionally rather than as a force: attraction can
  // always outrun a spring, but it cannot push a body through a constraint that
  // is applied after the step. Two passes are enough to unpick the stacks that
  // form as a group gathers, and it is what keeps every mark readable.
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < A; a++) {
      const i = gActive[a];
      const ri = gRadius[i];
      const pix = gPosX[i], piy = gPosY[i], piz = gPosZ[i];
      for (let b = a + 1; b < A; b++) {
        const j = gActive[b];
        let dx = gPosX[j] - pix, dy = gPosY[j] - piy, dz = gPosZ[j] - piz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const want = (ri + gRadius[j]) * 1.35;
        // Squared compare first: nearly every pair is already far enough apart,
        // and this way none of them pay for a square root.
        if (d2 >= want * want) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { dx = (i % 3) - 1; dy = (j % 3) - 1; dz = 1; d = Math.sqrt(dx*dx + dy*dy + dz*dz); }
        const push = (want - d) * 0.5 / d;
        const px = dx * push, py = dy * push, pz = dz * push;
        gPosX[i] -= px; gPosY[i] -= py; gPosZ[i] -= pz;
        gPosX[j] += px; gPosY[j] += py; gPosZ[j] += pz;
      }
    }
  }

  // Settling is judged by motion, not by the clock: once the average body is
  // barely moving for a few consecutive steps the layout is final and there is
  // nothing left to integrate. Waiting on elapsed time alone leaves it saying
  // "settling" long after the picture has stopped changing.
  gravMotion = moved / Math.max(1, live);
  // Counted in seconds rather than frames so the result does not depend on
  // how fast the machine happens to render.
  gravCalm = gravMotion < 0.06 ? gravCalm + h : 0;
  if (gravCalm > 0.6) gravSettled = true;

  // The flat arrays were this step's working copy; publish them back to the
  // vectors the rest of the scene reads.
  for (let a = 0; a < A; a++) {
    const i = gActive[a];
    gPos[i].set(gPosX[i], gPosY[i], gPosZ[i]);
    cur[i].copy(gPos[i]);
  }
}
/* ---------- membership: decided once, in capability space ------------------ *
 * Clustering the *positions* was the wrong design. Positions are still moving
 * while the simulation settles, so memberships churned from frame to frame,
 * every change rebuilt the hulls, and the result flickered and never agreed
 * with itself between runs.
 *
 * Membership is a property of the models, not of where the physics happens to
 * have pushed them, so it is computed once from the capability vectors with
 * k-means. That is deterministic (fixed seeds, best-of-N by inertia), assigns
 * every model to a group rather than leaving two thirds as noise, and does not
 * change while the layout settles -- the physics then only has to arrange
 * groups that are already decided.
 *
 * k = 6 was chosen from a sweep: the within/between spread keeps improving to
 * about 0.41 there and flattens after 7, and the six groups it finds are the
 * ones the field actually has -- a frontier tier, a fast-and-capable tier, a
 * mid tier, a cheap-fast tier and two budget tiers.
 */
const K_CLUSTERS = 6;
let MEMBER = new Int16Array(N).fill(-1);   // model index -> cluster id
let memberReady = false;                   // recomputed when the visible set changes

function computeMembership() {
  const pts = FEAT;
  const dim = FEATURES.length;
  const idx = [];
  // Only fully measured models can be clustered: the others would be grouped by
  // the zeros that stand in for their missing fields, which is not a finding.
  for (let i = 0; i < N; i++) if (!isOff(MODELS[i]) && MODELS[i].q === 'A') idx.push(i);
  const k = Math.min(K_CLUSTERS, idx.length);
  MEMBER = new Int16Array(N).fill(-1);
  if (k < 2) { idx.forEach((i) => (MEMBER[i] = 0)); memberReady = true; return; }

  const d2 = (a, b) => {
    let s = 0;
    for (let t = 0; t < dim; t++) { const d = pts[a][t] - b[t]; s += d * d; }
    return s;
  };

  let bestLab = null, bestInertia = Infinity;
  // Fixed seeds and best-of-N: the same field always yields the same grouping,
  // so the picture does not reshuffle every time the simulation is restarted.
  for (let seed = 0; seed < 12; seed++) {
    let r = seed * 9301 + 49297;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);

    const cent = [pts[idx[Math.floor(rnd() * idx.length)]].slice()];
    while (cent.length < k) {
      const dd = idx.map((i) => Math.min(...cent.map((c) => d2(i, c))));
      const tot = dd.reduce((a, b) => a + b, 0) || 1;
      let acc = 0, target = rnd() * tot, pick = idx[idx.length - 1];
      for (let q = 0; q < idx.length; q++) {
        acc += dd[q];
        if (acc >= target) { pick = idx[q]; break; }
      }
      cent.push(pts[pick].slice());
    }

    const lab = new Int16Array(N).fill(-1);
    for (let iter = 0; iter < 60; iter++) {
      let changed = false;
      for (const i of idx) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < k; c++) {
          const dd = d2(i, cent[c]);
          if (dd < bd) { bd = dd; best = c; }
        }
        if (lab[i] !== best) { lab[i] = best; changed = true; }
      }
      for (let c = 0; c < k; c++) {
        const mem = idx.filter((i) => lab[i] === c);
        if (!mem.length) continue;
        for (let t = 0; t < dim; t++) {
          let sum = 0;
          for (const i of mem) sum += pts[i][t];
          cent[c][t] = sum / mem.length;
        }
      }
      if (!changed) break;
    }

    let inertia = 0;
    for (const i of idx) inertia += d2(i, cent[lab[i]]);
    if (inertia < bestInertia) { bestInertia = inertia; bestLab = lab; }
  }
  MEMBER = bestLab;
  memberReady = true;
  // Used to normalise separation so a large group does not push harder simply
  // by having more members.
  groupSize.fill(1);
  for (let i = 0; i < N; i++) {
    const c = MEMBER[i];
    if (c >= 0) groupSize[c] = (groupSize[c] || 0) + 1;
  }
}

/** The fixed groups, largest first, as index lists. */
function clusters() {
  if (!memberReady) computeMembership();
  const groups = new Map();
  for (let i = 0; i < N; i++) {
    if (isOff(MODELS[i])) continue;
    const c = MEMBER[i];
    if (c < 0) continue;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(i);
  }
  return [...groups.values()].filter((g) => g.length >= 3).sort((a, b) => b.length - a.length);
}

let gravPanelAt = 0;
function renderGravityPanel() {
  const cl = clusters();
  const fm = (arr, k, d = 1) => {
    const v = arr.map((i) => MODELS[i][k]).filter((x) => x != null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(d) : '—';
  };
  // Membership is fixed, so the hulls only need rebuilding as the bodies move.
  // Refreshing them on a slow cadence while the layout settles, then once more
  // when it stops, keeps the shapes attached to the groups without the
  // frame-to-frame flicker that rebuilding on every change produced.
  const sig = cl.map((g) => g.length).join('|') + (gravSettled ? '#s' : '');
  const due = performance.now() - lastHullAt > 400;
  if (sig !== lastClusterSig || (due && !gravSettled)) {
    lastClusterSig = sig;
    lastHullAt = performance.now();
    buildClusterViz(cl);
  }

  gravEl.innerHTML = `
    <div class="rhd"><span class="q">GRAVITY</span>
      <span class="m">${gravityFrozen ? 'frozen' : gravSettled ? 'settled' : 'settling'} &middot; ${cl.length} clusters</span></div>
    ${cl.slice(0, 5).map((g, k) => {
      // Name a cluster by the creator that dominates it.
      const tally = new Map();
      g.forEach((i) => tally.set(MODELS[i].c, (tally.get(MODELS[i].c) || 0) + 1));
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
      const tint = CLUSTER_TINTS[k % CLUSTER_TINTS.length];
      return `<div class="gcl" style="border-left:3px solid ${tint}; padding-left:6px">
        <div class="gcl-h"><b style="color:${tint}">#${k + 1}</b> ${g.length} models
          <span style="opacity:.5">&middot; ${top.map(([c, n]) => esc(c) + ' ' + n).join(', ')}</span></div>
        <div class="gcl-m">intel ${fm(g, 'i')} &middot; $${fm(g, 'p', 2)}/1M &middot; ${fm(g, 'sp', 0)} tok/s</div>
      </div>`;
    }).join('')}
    <div class="rhint">mass = intelligence &middot; attraction = capability similarity<br>
      <kbd>F</kbd> freeze / release &middot; click a body to inspect it</div>`;
}


/* ---------- anchored tip bubbles ---------- *
 * A native title attribute is slow to appear, unstyled, and impossible to use
 * on a touch screen. Anything carrying one is made clickable instead and opens
 * a small bubble anchored to it, in the same panel style as the rest of the UI.
 */
const tipEl = document.createElement('div');
tipEl.id = 'tip';
root.appendChild(tipEl);
let tipFor = null;

function showTip(target) {
  const text = target.dataset.tip || target.getAttribute('title');
  if (!text) return;
  // Move the text off `title` so the native tooltip does not also appear.
  if (!target.dataset.tip) { target.dataset.tip = text; target.removeAttribute('title'); }
  tipEl.textContent = target.dataset.tip;
  tipEl.classList.add('show');
  tipFor = target;

  /* The bubble is positioned against the stage, so the anchor's viewport rect
     has to be rebased onto it -- the stage is a panel inset from the window,
     and using viewport coordinates directly offsets every tip by that inset. */
  const vr = target.getBoundingClientRect();
  const sr = root.getBoundingClientRect();
  const r = { left: vr.left - sr.left, top: vr.top - sr.top,
              bottom: vr.bottom - sr.top, width: vr.width };
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  // Prefer below; flip above when there is no room, and keep it inside the stage.
  const below = r.bottom + 8 + th < sr.height;
  const top = below ? r.bottom + 8 : r.top - th - 8;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, sr.width - tw - 8));
  tipEl.style.left = left + 'px';
  tipEl.style.top = top + 'px';
  tipEl.dataset.side = below ? 'below' : 'above';
  // The arrow points at the anchor even when the bubble has been nudged.
  tipEl.style.setProperty('--arrow', Math.max(10, Math.min(r.left + r.width / 2 - left, tw - 10)) + 'px');
}

function hideTip() { tipEl.classList.remove('show'); tipFor = null; }

/* Any element with a title inside the stage becomes a tip anchor, including
   ones created later.

   Scoped to the stage on purpose. Svelte delegates its own click handlers to
   the document root, so a listener here that calls stopPropagation() runs
   before them and swallows clicks on the surrounding chrome -- which is what
   stopped the view's own GUIDE button, itself a titled button, from opening. */
onDoc('click', (e) => {
  const t = e.target.closest('[title], [data-tip]');
  const inStage = t && root.contains(t);
  if (!inStage || (t.tagName === 'BUTTON' && !t.classList.contains('hint-tip') && !t.classList.contains('has-tip'))) {
    if (!e.target.closest('#tip')) hideTip();
    return;
  }
  e.stopPropagation();
  if (tipFor === t) { hideTip(); return; }
  showTip(t);
});
onWin('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
// A bubble anchored to something that has moved is worse than none.
onWin('resize', hideTip);

/* ---------- meta ---------- */
const QN = { A: 0, B: 0, D: 0, X: 0 };
for (const m of MODELS) QN[m.q] = (QN[m.q] || 0) + 1;
$('meta').innerHTML =
  `${N} models &middot; <b style="color:#98c379">${QN.A} measured</b> ` +
  `<span class="hint-tip" title="${QN.B} without a speed figure, ${QN.D} with only an ` +
  `intelligence score, ${QN.X} with nothing measured.">+${QN.B + QN.D + QN.X} partial &#9432;</span> &middot; ` +
  `v${DATA.v} &middot; ` +
  (DATA.fetchedAt
    ? `upstream fetched ${new Date(DATA.fetchedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`
    : 'upstream time unknown');

/* ---------- loop ---------- */
function applySize() {
  if (!measureStage()) return;
  persp.aspect = stageW / stageH;
  persp.updateProjectionMatrix();
  sizeOrtho();
  renderer.setSize(stageW, stageH);
  labelRenderer.setSize(stageW, stageH);
  // Drives the shader's pixel-size LOD, so it has to track the stage too.
  mat.uniforms.uViewH.value = stageH;
}
applySize();

/* The panel resizes without the window doing so -- the sidebar collapses, the
   tab is switched away and back -- so watch the element itself. */
const stageRO = new ResizeObserver(applySize);
stageRO.observe(root);
winOff.push(() => stageRO.disconnect());
onWin('resize', applySize);

let driftClock = 0;
let fpsEl = $('fps');
let fpsFrames = 0, fpsAccum = 0;
const clock = new THREE.Clock();
let rafId = 0;
let running = true;
/* Recording rig, gated behind a URL flag so it never ships to a real visitor.
   A real clock ties frame content to wall-clock render speed, which is
   unusable for a scripted flythrough: a dropped frame under a screenshot
   capture would skip motion rather than just take longer. Freezing the clock
   and stepping it by a fixed amount per capture makes the output identical
   however slow the machine taking the screenshot actually is.
   frameLoop stays requestAnimationFrame's own callback, taking the rAF
   timestamp it's always taken and ignoring it exactly as before; the forced
   step is a second, separate entry point, never the same function called two
   ways, so a real frame can never be mistaken for a scripted one. */
let frozen = false;
const director = /[?&]director=1\b/.test(location.search)
  ? {
      freeze() { frozen = true; },
      step(dt) { runFrame(dt ?? 1 / 60); },
      camera,
      yawPitch,
      vel,
      setMode(id) { const el = $(id); if (el) el.click(); }
    }
  : null;
if (director) window.__lmDirector = director;

function frameLoop() {
  if (!running) return;
  if (!frozen) rafId = requestAnimationFrame(frameLoop);
  if (!frozen) runFrame(Math.min(clock.getDelta(), 0.05));
}

function runFrame(dt) {
  driftClock += dt;
  if (morph < 1) morph = Math.min(1, morph + dt * 0.85);

  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(yawPitch.pitch, yawPitch.yaw, 0, 'YXZ'));
  camera.quaternion.copy(q);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  /* Strafe along the horizon rather than the camera's own right vector: with
     pitch applied, A/D would bank the path while looking up or down, which is
     what made flying feel like it was sliding off course. */
  const right = new THREE.Vector3().crossVectors(fwd, UP);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0).applyQuaternion(q);
  else right.normalize();
  const accel = new THREE.Vector3();
  // RACE holds its fixed, straight-on view -- flying off it would leave the
  // replay's own scrub controls pointed at a track the camera can no longer
  // see square-on.
  if (!raceOn) {
    if (kb.has('w')) accel.add(fwd);
    if (kb.has('s')) accel.sub(fwd);
    if (kb.has('d')) accel.add(right);
    if (kb.has('a')) accel.sub(right);
    if (kb.has('e')) accel.y += 1;
    if (kb.has('q')) accel.y -= 1;
  }
  /* Normalising the whole vector let Q/E steal from the forward component, so
     W+E flew forward more slowly than W alone. Clamping instead keeps each
     axis at full authority while still capping the diagonal. */
  if (accel.lengthSq() > 1) accel.normalize();
  const push = 320 * (kb.has('shift') ? 3.1 : 1);
  vel.addScaledVector(accel, push * dt);
  /* Damping is applied over the step rather than per frame, so the same key
     press covers the same distance whatever the frame rate. */
  vel.multiplyScalar(Math.pow(0.0016, dt));
  camera.position.addScaledVector(vel, dt);
  updateRange();

  // The impostor writes depth with its own copy of the projection, so it must
  // follow whichever camera is live.
  mat.uniforms.uProj.value = camera.projectionMatrix;
  // The backdrop turns about a tilted axis, roughly one revolution every eight
  // minutes -- perceptible if you watch for it, invisible while you work. The
  // glow breathes on a slower cycle still, so the nebulae seem to be lit rather
  // than painted.
  updateDust(driftClock);
  sky.position.copy(camera.position);
  // Under orthographic projection there is no perspective divide, so scaling
  // the sphere changes nothing on screen -- the frustum simply maps a narrower
  // slice of the panorama across the viewport and the texture looks magnified.
  // Repeating the map instead puts the same amount of sky back in frame.
  const rep = projMode === 'ortho'
    ? THREE.MathUtils.clamp(orthoZoom / 190, 1, 6)
    : 1;
  if (Math.abs(skyTex.repeat.x - rep) > 0.01) {
    // Horizontally only: the vertical axis runs pole to pole, and repeating it
    // would stack a second sky on top of the first.
    skyTex.repeat.set(rep, 1);
    skyTex.needsUpdate = true;
  }
  sky.rotation.y += dt * 0.0132;
  sky.rotation.z = 0.16 + Math.sin(driftClock * 0.021) * 0.05;
  const breathe = 0.5 + 0.5 * Math.sin(driftClock * 0.15);
  skyMat.color.setRGB(
    (0x4a + breathe * 14) / 255,
    (0x52 + breathe * 14) / 255,
    (0x5e + breathe * 16) / 255
  );
  updateWalls();
  updateSkins();
  updateShadows();
  updateConstellations();
  if (locked) crosshairHover();
  // Frame rate, averaged over half a second so the reading is steady enough to
  // read while flying. The triangle count comes with it, because the number
  // that explains a slow frame here is nearly always how much geometry the
  // level-of-detail split is letting through.
  fpsFrames++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    if (!fpsEl) fpsEl = $('fps');
    const fps = fpsFrames / fpsAccum;
    const tris = lodN[0] * 704 + lodN[1] * 192 + lodN[2] * 70;
    if (fpsEl) fpsEl.innerHTML =
      `<span class="fps-n" style="color:${fps >= 50 ? '#98c379' : fps >= 28 ? '#e5c07b' : '#e06c75'}">` +
      `${fps.toFixed(0)}</span><span class="fps-l"> fps &middot; ${(tris / 1000).toFixed(0)}k tri &middot; ` +
      `${lodN[0]}/${lodN[1]}/${lodN[2]}</span>`;
    fpsFrames = 0; fpsAccum = 0;
  }

  if (raceOn) updateRace(dt);
  if (gravityOn) {
    if (!gravSettled) stepGravity(dt);
    if (performance.now() - gravPanelAt > 600) { gravPanelAt = performance.now(); renderGravityPanel(); }
  }
  // Rebuilt on the same cadence as the gravity panel rather than every frame:
  // the frontier is a few hundred points compared pairwise, cheap enough for
  // that rate but wasted at 60 of them a second while nothing has moved.
  if (paretoOn) {
    if (morph >= 1 && !paretoGroup.visible) {
      paretoGroup.visible = true; paretoBGroup.visible = true;
      buildParetoViz(); paretoStaleAt = performance.now();
    } else if ((gravityOn || (raceOn && !raceDone)) && performance.now() - paretoStaleAt > 600) {
      // Gravity keeps moving bodies after they settle into their groups; a
      // playing race keeps launching new ones. Both change who belongs on
      // the frontier on their own, without the panel's own controls ever
      // being touched, so both need the same periodic recheck.
      paretoStaleAt = performance.now(); buildParetoViz();
    }
    // Membership on the frontier changes rarely and is worth the O(n^2) scan
    // only occasionally, but quadrant B's bodies wander every frame -- their
    // tubes have to be replaced that often too, or they drift off the
    // spheres they are meant to be connecting the moment the curve's own
    // membership stops changing.
    if (view === 'space') updateParetoTubes();
  }
  dtNow = dt;
  writeInstances();
  declutterLabels();
  if (card.style.display === 'block') placeCard();

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

frameLoop();

  return dispose;
}
