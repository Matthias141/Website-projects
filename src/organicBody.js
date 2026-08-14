import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Builds the sculpture's main body as ONE continuous lofted surface —
// replacing the old stacked-primitives trunk (cylinders + rounded boxes)
// whose hard part-boundaries were what read as "rigid, not an organism."
//
// Construction: a vertical THREE.CatmullRomCurve3 spine (with slight
// lateral jitter in its control points so it isn't machine-straight, and
// so computeFrenetFrames never sees a degenerate straight-line tangent),
// sampled at H rings of M vertices each, ring radius driven by a profile
// function of t: flattened mushroom cap at top → narrow neck (where the
// chrome collar sits) → white/charcoal upper belly → full belly → gentle
// waist → rounder base, per the settled concept images. Rings wrap
// modulo M (no duplicated seam vertices), so computeVertexNormals gives
// a fully welded smooth-shaded surface with no seam and no hard edges.
//
// Tendrils: short secondary lofts grafted at asymmetric points on the
// belly/shoulder, thin at the root, bulbous at the tip. MERGED into the
// same BufferGeometry via mergeGeometries — this was cheap, not
// disproportionate, because the exact same loft routine builds them; the
// roots are tucked ~0.15 units INSIDE the body volume, so the join is a
// smooth-surface-through-smooth-surface intersection with per-vertex
// normals computed after the merge — no visible hard seam, the root
// reads as a growth emerging from the skin.
//
// Two custom float attributes are baked per-vertex for the later stages:
//   aRamp   — position along the body's color/phase ramp (0 base → 1 cap;
//             tendrils blend from their root's body-t toward a contrast
//             tip value, per the concept images' contrast-colored nubs).
//   aBreath — breathing displacement weight: peaks at the belly, near-zero
//             at the cap rim, the base contact point, AND the neck where
//             the rigid chrome ring sits (so the body never swells into
//             the ring).

const lumpNoise = new ImprovedNoise();

// Piecewise smoothstep interpolation over [t, value] keys — used for the
// radius profile, the breath-weight profile, and (Stage B) the color
// ramp, so every "profile along the body" speaks the same language.
export function rampInterp(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

// Radius profile of the body by t (0 = base contact, 1 = cap top).
// Neck minimum is at t≈0.72 — the chrome collar's home. Max neck radius
// incl. lump noise (0.42 * 1.05) + Stage C's displacement budget there
// stays under ~0.46, vs. the collar's inner opening of 0.49 (major 0.62
// − tube 0.13) — the body cannot clip through the ring.
const BODY_RADIUS_KEYS = [
  [0.0, 0.3], [0.05, 0.78], [0.16, 1.12], [0.3, 1.3], [0.44, 1.05],
  [0.54, 0.78], [0.64, 0.52], [0.72, 0.42], [0.78, 0.5], [0.84, 0.95],
  [0.9, 1.45], [0.955, 1.05], [1.0, 0.28],
];

// Breathing amplitude weight by t — strongest at the belly, near-zero at
// base contact, the neck/ring (0.72), and the cap rim, so the sculpture
// stays planted and the collar stays visually rigid against a still neck.
const BREATH_KEYS = [
  [0.0, 0.0], [0.08, 0.15], [0.32, 1.0], [0.5, 0.45], [0.62, 0.12],
  [0.72, 0.02], [0.8, 0.08], [0.88, 0.03], [1.0, 0.0],
];

// Color ramp along the body (bottom → top), matching the concept images:
// warm yellow base → cobalt → charcoal → soft white shoulder → green
// neck → coral-red cap. Keys are deliberately spaced with wide gaps and
// intermediate blend tones so rampInterp's smoothstep produces dye-like
// diffusion between zones, never flat banded stripes.
const COLOR_KEYS = [
  [0.0, 0xffbe1c], [0.1, 0xf2a02c], [0.2, 0x2f6ce0], [0.3, 0x1e56c8],
  [0.42, 0x26262a], [0.52, 0x6f6e6a], [0.6, 0xe8e4da], [0.68, 0xa8c493],
  [0.74, 0x2a9d4a], [0.82, 0x63a457], [0.9, 0xe05237], [1.0, 0xe6392b],
];
const COLOR_CHANNEL_KEYS = ['r', 'g', 'b'].map((ch) =>
  COLOR_KEYS.map(([t, hex]) => [t, new THREE.Color(hex)[ch]])
);

function sampleColorRamp(t, out) {
  out.setRGB(
    rampInterp(COLOR_CHANNEL_KEYS[0], t),
    rampInterp(COLOR_CHANNEL_KEYS[1], t),
    rampInterp(COLOR_CHANNEL_KEYS[2], t)
  );
  return out;
}

// One loft: rings of `radialSegments` vertices at `heightSegments + 1`
// stations along the curve, using the curve's parallel-transported
// Frenet frames, closed with center-vertex cap fans at both ends.
// Returns an indexed BufferGeometry with position/uv/aRamp/aBreath
// (normals are computed once on the final merged geometry, not here).
function loftAlongCurve({
  curve, radiusAt, rampAt, breathAt,
  radialSegments, heightSegments,
  lumpAmp = 0, lumpSeed = 0,
}) {
  // lumpAmp may be a number or a function of t — the body passes a
  // function so flesh-lumpiness can vary along the height (strong on the
  // belly, damped at the collar neck where silhouette clearance matters).
  const lumpAmpAt = typeof lumpAmp === 'function' ? lumpAmp : () => lumpAmp;
  const frames = curve.computeFrenetFrames(heightSegments, false);
  const positions = [];
  const uvs = [];
  const ramps = [];
  const breaths = [];
  const indices = [];
  const R = radialSegments;

  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments;
    const p = curve.getPoint(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = radiusAt(t);
    for (let j = 0; j < R; j++) {
      const th = (j / R) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      let rr = r;
      // Organic lumpiness — sampled on the circle's embedding (cos/sin)
      // so the noise field is continuous across the θ = 0 wrap seam.
      // Two octaves: a low-frequency term that pushes the whole
      // silhouette asymmetric (one side fuller than the other, like a
      // grown thing rather than a turned one) plus a finer term for
      // local flesh lumps.
      const la = lumpAmpAt(t);
      if (la) {
        const coarse = lumpNoise.noise(c * 0.55 + lumpSeed, t * 1.2 + lumpSeed * 2.0, s * 0.55);
        const fine = lumpNoise.noise(c * 1.9 + lumpSeed * 3.1, t * 4.2 + lumpSeed, s * 1.9);
        rr *= 1 + (coarse * 1.1 + fine * 0.5) * la;
      }
      positions.push(p.x + (N.x * c + B.x * s) * rr, p.y + (N.y * c + B.y * s) * rr, p.z + (N.z * c + B.z * s) * rr);
      uvs.push(j / R, t);
      ramps.push(rampAt(t));
      breaths.push(breathAt(t));
    }
  }

  // Side quads — j wraps modulo R (welded seam), winding chosen so faces
  // point outward given three's right-handed Frenet frames (B = T×N).
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * R + j;
      const b = i * R + ((j + 1) % R);
      const c = (i + 1) * R + j;
      const d = (i + 1) * R + ((j + 1) % R);
      indices.push(a, b, d, a, d, c);
    }
  }

  // Bottom cap fan (outward = down the curve tangent).
  const bottomCenter = positions.length / 3;
  const p0 = curve.getPoint(0);
  positions.push(p0.x, p0.y, p0.z);
  uvs.push(0.5, 0);
  ramps.push(rampAt(0));
  breaths.push(0);
  for (let j = 0; j < R; j++) {
    indices.push(bottomCenter, ((j + 1) % R), j);
  }

  // Top cap fan (outward = up the curve tangent).
  const topCenter = positions.length / 3;
  const p1 = curve.getPoint(1);
  positions.push(p1.x, p1.y, p1.z);
  uvs.push(0.5, 1);
  ramps.push(rampAt(1));
  breaths.push(0);
  const topRing = heightSegments * R;
  for (let j = 0; j < R; j++) {
    indices.push(topCenter, topRing + j, topRing + ((j + 1) % R));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aRamp', new THREE.Float32BufferAttribute(ramps, 1));
  geometry.setAttribute('aBreath', new THREE.Float32BufferAttribute(breaths, 1));
  geometry.setIndex(indices);
  return geometry;
}

export function buildOrganicBody({ isMobile = false } = {}) {
  // Enough segments that the silhouette curves read smooth at hero size;
  // scaled down on mobile like every other density knob in this app.
  const radialSegments = isMobile ? 28 : 44;
  const heightSegments = isMobile ? 88 : 144;

  // Spine, y ≈ -1.7 (base contact) → 3.62 (cap top). Control points
  // bunch together near the top so the wide cap radius plays out over
  // little height — that vertical compression is what makes the cap read
  // as a flattened mushroom crown rather than a bulb. The lateral drift
  // is deliberately larger than jitter: the body leans and recovers like
  // something that grew toward light, then the cap re-centers — a
  // machine-straight axis was a big part of why the first pass still
  // read as "turned on a lathe" rather than grown.
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, -1.7, 0.0),
    new THREE.Vector3(0.1, -1.05, 0.07),
    new THREE.Vector3(-0.16, -0.15, -0.11),
    new THREE.Vector3(0.13, 0.75, 0.12),
    new THREE.Vector3(-0.1, 1.55, -0.12),
    new THREE.Vector3(0.05, 2.25, 0.07),
    new THREE.Vector3(-0.02, 2.85, 0.02),
    // Cap region sits higher than the first pass (3.25/3.5/3.62 →
    // 3.42/3.68/3.8): the flare's underside was grazing the top of the
    // collar tube once the spine leaned and the lumps strengthened —
    // measured, not guessed (see the solid-torus clearance check in the
    // rebuild commits). Extra height restores the gap.
    new THREE.Vector3(0.0, 3.42, 0.0),
    new THREE.Vector3(0.04, 3.68, -0.03),
    new THREE.Vector3(0.06, 3.8, -0.04),
  ]);

  // Lumpiness profile: full flesh on belly/cap, damped hard at the
  // collar neck (t≈0.72) so the silhouette-clearance budget vs the
  // rigid ring's 0.49 inner opening holds even at the raised amplitude.
  const LUMP_KEYS = [
    [0.0, 0.5], [0.15, 1.0], [0.55, 1.0], [0.68, 0.3], [0.76, 0.3],
    [0.84, 0.8], [1.0, 0.7],
  ];

  const body = loftAlongCurve({
    curve: spine,
    radiusAt: (t) => rampInterp(BODY_RADIUS_KEYS, t),
    rampAt: (t) => t,
    breathAt: (t) => rampInterp(BREATH_KEYS, t),
    radialSegments,
    heightSegments,
    lumpAmp: (t) => 0.09 * rampInterp(LUMP_KEYS, t),
    lumpSeed: 2.3,
  });

  // Shared frame data for anchoring tendril roots on the body surface.
  const frames = spine.computeFrenetFrames(heightSegments, false);
  const surfaceAt = (t, theta) => {
    const i = Math.round(t * heightSegments);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const p = spine.getPoint(t);
    const r = rampInterp(BODY_RADIUS_KEYS, t);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const outward = new THREE.Vector3(N.x * c + B.x * s, N.y * c + B.y * s, N.z * c + B.z * s).normalize();
    return {
      point: new THREE.Vector3(p.x + outward.x * r, p.y + outward.y * r, p.z + outward.z * r),
      outward,
    };
  };

  const UP = new THREE.Vector3(0, 1, 0);
  const makeTendril = ({ rootT, theta, len, tipRamp, seed }) => {
    const { point, outward } = surfaceAt(rootT, theta);
    const side = new THREE.Vector3().crossVectors(outward, UP).normalize();
    // Root starts submerged inside the body volume so the graft reads as
    // an outgrowth, not a butt-joint (see file header re: seams).
    const curve = new THREE.CatmullRomCurve3([
      point.clone().addScaledVector(outward, -0.15),
      point.clone().addScaledVector(outward, 0.3 * len),
      point.clone()
        .addScaledVector(outward, 0.55 * len)
        .addScaledVector(UP, 0.3 * len)
        .addScaledVector(side, 0.14 * len * Math.sin(seed * 3.7)),
      point.clone()
        .addScaledVector(outward, 0.62 * len)
        .addScaledVector(UP, 0.62 * len),
    ]);
    // Thin root → thinner stalk → slightly bulbous tip, per the concept.
    const radiusKeys = [[0, 0.13], [0.3, 0.07], [0.62, 0.055], [0.82, 0.12], [1, 0.02]];
    const scale = 0.75 + 0.35 * len;
    return loftAlongCurve({
      curve,
      radiusAt: (t) => rampInterp(radiusKeys, t) * scale,
      // Tendril color runs from the body color at its root toward a
      // contrasting tip (red tip on the green shoulder etc., like the
      // reference images).
      rampAt: (t) => rootT + (tipRamp - rootT) * t,
      // Tendrils ride the swell of the surface they grow from, damped —
      // they're passengers on the breath, not independent breathers.
      breathAt: () => rampInterp(BREATH_KEYS, rootT) * 0.5,
      radialSegments: isMobile ? 10 : 14,
      heightSegments: isMobile ? 16 : 24,
      lumpAmp: 0.06,
      lumpSeed: seed,
    });
  };

  const tendrilSpecs = [
    { rootT: 0.56, theta: 0.6, len: 0.85, tipRamp: 0.95, seed: 1.7 },  // shoulder, red tip
    { rootT: 0.34, theta: 2.9, len: 0.75, tipRamp: 0.03, seed: 4.1 },  // belly, yellow tip
    { rootT: 0.47, theta: 4.6, len: 0.6, tipRamp: 0.74, seed: 7.9 },   // upper belly, green tip
  ];
  const tendrils = (isMobile ? tendrilSpecs.slice(0, 2) : tendrilSpecs).map(makeTendril);

  const merged = mergeGeometries([body, ...tendrils]);
  body.dispose();
  tendrils.forEach((g) => g.dispose());

  // One smooth-shaded surface — welded rings + post-merge normals mean
  // no hard edges anywhere on the body itself.
  merged.computeVertexNormals();

  // ===== VERTEX-COLOR DYE GRADIENT (Stage B) =====
  // One material, per-vertex colors — never multiple materials, so the
  // gradient flows continuously across the whole surface (tendrils
  // included, via their root→tip aRamp blend). Two layers of noise keep
  // the bands from looking mathematically clean: the ramp coordinate is
  // jittered per-vertex (band edges wander like dye diffusion) and each
  // channel gets a small independent brightness wobble (surface mottling).
  const rampAttr = merged.getAttribute('aRamp');
  const posAttr = merged.getAttribute('position');
  const colors = new Float32Array(rampAttr.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < rampAttr.count; i++) {
    const px = posAttr.getX(i);
    const py = posAttr.getY(i);
    const pz = posAttr.getZ(i);
    const jitter = lumpNoise.noise(px * 0.9 + 11.3, py * 0.9, pz * 0.9) * 0.05;
    const t = Math.min(1, Math.max(0, rampAttr.getX(i) + jitter));
    sampleColorRamp(t, c);
    const mottle = 1 + lumpNoise.noise(px * 2.1, py * 2.1 + 5.7, pz * 2.1) * 0.1;
    colors[i * 3] = Math.min(1, c.r * mottle);
    colors[i * 3 + 1] = Math.min(1, c.g * mottle);
    colors[i * 3 + 2] = Math.min(1, c.b * mottle);
  }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  // The collar can't live at a hardcoded position anymore — the spine
  // leans, so the neck's world position is a property of the geometry.
  // Export it (plus the spine's local tilt there) so Sculpture.jsx
  // places the ring exactly around the neck it was budgeted against.
  const neckT = 0.72;
  const neckCenter = spine.getPoint(neckT);
  const neckTangent = spine.getTangent(neckT);
  return { geometry: merged, neckCenter, neckTangent };
}
