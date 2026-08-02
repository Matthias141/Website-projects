import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import { attachFresnelNoise } from './shaders/fresnelNoise.js';

// Same helper as the vanilla build: swaps sharp BoxGeometry for beveled
// RoundedBoxGeometry, with bevel radius derived from each box's own
// smallest dimension so thin pieces never get an oversized bevel.
function rbox(w, h, d, segments = 3, radiusFrac = 0.16) {
  const radius = Math.min(w, h, d) * radiusFrac;
  return new RoundedBoxGeometry(w, h, d, segments, radius);
}

const noise = new ImprovedNoise();
const groundY = -3.4;

// Reusable scratch objects — same reasoning as the vanilla build: mutate
// in place every frame instead of allocating inside useFrame, which runs
// at 60fps and would otherwise generate GC churn.
const worldPosTmp = new THREE.Vector3();
const collisionPush = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const ONE_SCALE = new THREE.Vector3(1, 1, 1);

// InstancedMesh requires one shared geometry per mesh — per-chunk random
// dimensions (like the vanilla build's `s = 0.12 + Math.random() * 0.35`)
// can't be preserved on a single InstancedMesh. Falling back to a handful
// of discrete size buckets, each its own InstancedMesh, keeps most of the
// visual variety while still instancing instead of abandoning it entirely.
const BUCKET_DIMS = [
  { s: 0.16, hRatio: 0.42 },
  { s: 0.24, hRatio: 0.55 },
  { s: 0.32, hRatio: 0.65 },
  { s: 0.42, hRatio: 0.78 },
];
const BUCKET_COUNT = BUCKET_DIMS.length;

// ===== HOVER AFFORDANCE (main body parts only, not debris/particles) =====
// MeshStandardMaterial/MeshPhysicalMaterial's `emissive` defaults to black
// (verified in three's source before writing this), so bumping only
// emissiveIntensity — the naive version of this — would multiply zero by a
// bigger number and produce no visible change. Setting `emissive` to the
// material's own base color on hover, then back to black on pointer-out,
// is what actually makes it glow.
//
// NOTE: several main-body parts intentionally SHARE a material (e.g. the
// top cylinder and the shell both use M.red; core and shard both use
// M.black) to keep material/shader count down. Mutating emissive on the
// shared material means hovering one of those parts highlights all parts
// sharing it — a real, visible consequence of reusing materials here, not
// a bug in the hover handlers themselves.
function onHoverStart(material) {
  return (e) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    material.emissive.set(material.color);
    material.emissiveIntensity = 0.35;
  };
}
function onHoverEnd(material) {
  return (e) => {
    e.stopPropagation();
    document.body.style.cursor = 'auto';
    material.emissive.set(0x000000);
    material.emissiveIntensity = 1;
  };
}

// Same 6 debris colors as the vanilla build's `[M.green, M.blue, M.yellow,
// M.cyan, M.magenta, M.red]` palette, as raw hex — instancing needs ONE
// shared (white) material per bucket, with setColorAt() tinting each
// instance, instead of 6 separate pre-colored materials.
const DEBRIS_PALETTE = [0x2a9d4a, 0x1e6fff, 0xffd60a, 0x00c8ff, 0xff2d9b, 0xe6392b];

export default function Sculpture({ isMobile = false, prefersReducedMotion = false, onFrame }) {
  const godRef = useRef();
  const bucketRefs = useRef([]); // one InstancedMesh ref per size bucket

  // ===== MATERIALS =====
  // useMemo so materials (and their compiled shaders) are created exactly
  // once, not on every re-render. envMapIntensity works automatically off
  // scene.environment (set in App.jsx via drei's <Environment>) — no need
  // to assign material.envMap by hand.
  const M = useMemo(() => {
    const mk = (color, opts, fresnel) => {
      const material = new THREE.MeshPhysicalMaterial({ color, envMapIntensity: 0.85, ...opts });
      return isMobile ? material : attachFresnelNoise(material, fresnel);
    };
    return {
      red:     mk(0xe6392b, { roughness: 0.32, metalness: 0.25 }, { fresnelColor: 0xff8877 }),
      green:   mk(0x2a9d4a, { roughness: 0.32, metalness: 0.25 }, { fresnelColor: 0x88ffaa }),
      white:   mk(0xf8f8f8, { roughness: 0.22, metalness: 0.35, envMapIntensity: 1.0 }, { fresnelColor: 0xffffff, fresnelIntensity: 0.25 }),
      black:   mk(0x1a1a1a, { roughness: 0.38, metalness: 0.4 }, { fresnelColor: 0x6688ff, fresnelIntensity: 0.5 }),
      blue:    mk(0x1e6fff, { roughness: 0.28, metalness: 0.3 }, { fresnelColor: 0x99ccff }),
      yellow:  mk(0xffd60a, { roughness: 0.28, metalness: 0.2 }, { fresnelColor: 0xffee88 }),
      magenta: mk(0xff2d9b, { roughness: 0.28, metalness: 0.3 }, { fresnelColor: 0xff99dd }),
      cyan:    mk(0x00c8ff, { roughness: 0.28, metalness: 0.35 }, { fresnelColor: 0x99f0ff }),
      chrome:  mk(0xffffff, { roughness: 0.05, metalness: 1.0, envMapIntensity: 1.6, clearcoat: 1.0, clearcoatRoughness: 0.05 }, { fresnelColor: 0xffffff, fresnelIntensity: 0.15, noiseAmp: 0.012 }),
    };
  }, [isMobile]);

  // ===== DEBRIS SIZE BUCKETS =====
  // Built once — geometry (and its bounding box) never depends on isMobile,
  // only the debris COUNT does.
  const buckets = useMemo(() => BUCKET_DIMS.map(({ s, hRatio }) => {
    const geometry = rbox(s, s * hRatio, s, 2);
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    return {
      geometry,
      halfSize: new THREE.Vector3().subVectors(bb.max, bb.min).multiplyScalar(0.5),
    };
  }), []);

  useEffect(() => () => {
    buckets.forEach((b) => b.geometry.dispose());
  }, [buckets]);

  // One shared white material per instanced bucket — setColorAt() tints
  // each instance to its palette color; instancing multiplies the
  // instance color into this material's (white) base color automatically.
  const debrisMaterial = useMemo(() => {
    const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.28, envMapIntensity: 0.85 });
    return isMobile ? material : attachFresnelNoise(material, { fresnelColor: 0xffffff, fresnelIntensity: 0.3 });
  }, [isMobile]);

  // ===== DEBRIS DATA =====
  // Generated once per debrisCount/bucket change. Each entry carries which
  // bucket's InstancedMesh it lives in and its instance slot within that
  // mesh, plus the same halfSize/box bookkeeping the vanilla build used —
  // only what those are APPLIED to (an instance slot vs. a real mesh ref)
  // has changed.
  const debrisCount = isMobile ? 16 : 28;
  const debris = useMemo(() => {
    const bucketCounters = new Array(BUCKET_COUNT).fill(0);
    return Array.from({ length: debrisCount }, (_, i) => {
      const bucketIndex = i % BUCKET_COUNT;
      const localIndex = bucketCounters[bucketIndex]++;
      return {
        bucketIndex,
        localIndex,
        colorIndex: i % DEBRIS_PALETTE.length,
        position: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8),
        rotation: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        phase: Math.random() * 6.28,
        speed: 0.15 + Math.random() * 0.4,
        halfSize: buckets[bucketIndex].halfSize,
        box: new THREE.Box3(),
      };
    });
  }, [debrisCount, buckets]);

  // Instance count actually used per bucket (round-robin assignment above
  // keeps buckets within 1 of each other even when debrisCount isn't a
  // multiple of BUCKET_COUNT).
  const bucketCounts = useMemo(() => {
    const counts = new Array(BUCKET_COUNT).fill(0);
    debris.forEach((d) => { counts[d.bucketIndex] = Math.max(counts[d.bucketIndex], d.localIndex + 1); });
    return counts;
  }, [debris]);

  // Write each debris item's initial transform + color into its bucket's
  // InstancedMesh once, after mount (or after debris/buckets regenerate).
  useEffect(() => {
    for (const d of debris) {
      const im = bucketRefs.current[d.bucketIndex];
      if (!im) continue;
      tmpQuat.setFromEuler(d.rotation);
      tmpMatrix.compose(d.position, tmpQuat, ONE_SCALE);
      im.setMatrixAt(d.localIndex, tmpMatrix);
      im.setColorAt(d.localIndex, new THREE.Color(DEBRIS_PALETTE[d.colorIndex]));
    }
    for (const im of bucketRefs.current) {
      if (!im) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }, [debris]);

  const soulColors = [0xff0044, 0xff6600, 0xffee00, 0x00cc44, 0x0088ff, 0xaa22ff];
  const soulMaterials = useMemo(
    () => soulColors.map((c) => {
      const material = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, metalness: 0.35, envMapIntensity: 0.9 });
      return isMobile ? material : attachFresnelNoise(material, { fresnelColor: c, fresnelIntensity: 0.3 });
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMobile]
  );

  const shaderMaterials = useMemo(
    () => [...Object.values(M), ...soulMaterials, debrisMaterial].filter((m) => m.userData),
    [M, soulMaterials, debrisMaterial]
  );

  // ===== STATIC BODY GEOMETRIES =====
  // Built once via rbox() and disposed on unmount, instead of calling rbox()
  // inline in JSX (which would allocate + upload new GPU buffers every render).
  const G = useMemo(() => ({
    torso: rbox(2.4, 0.55, 1.55),
    arm: rbox(1.5, 0.85, 1.05),
    hipA: rbox(2.7, 0.65, 2.1),
    hipB: rbox(0.65, 1.5, 2.1),
    base: rbox(3.2, 0.95, 2.5),
    soul: rbox(0.17, 1.4, 0.65, 2),
    spine: rbox(0.22, 1.7, 0.45, 2),
  }), []);

  useEffect(() => () => {
    Object.values(G).forEach((g) => g.dispose());
  }, [G]);

  const t = useRef(0);

  // renderPriority=1 (vs. CameraRig's 2): @react-three/fiber sorts useFrame
  // subscribers ascending by priority and runs them in that order, so this
  // callback — which sets god.rotation/position for this frame — is
  // guaranteed to run before CameraRig's auto-framing reads god's bounds,
  // regardless of component mount order.
  useFrame((_, delta) => {
    t.current += delta * 0.55; // matches the vanilla build's ~0.009/frame @60fps pace
    const time = t.current;
    const god = godRef.current;
    if (!god) return;

    // Push the clock into every fresnel/noise shader (no-op on mobile —
    // shaderMaterials is filtered to only those that got onBeforeCompile).
    for (const mat of shaderMaterials) {
      if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = time;
    }

    if (!prefersReducedMotion) {
      const nt = time * 0.12;
      god.rotation.y = 0.35 + noise.noise(nt, 0, 0) * 0.4;
      god.rotation.x = -0.18 + noise.noise(nt, 50, 0) * 0.18;
      god.position.y = noise.noise(nt, 100, 0) * 0.45;
    } else {
      god.rotation.y = 0.35;
      god.rotation.x = -0.18;
    }

    onFrame?.(god.rotation.y, time);

    if (prefersReducedMotion) return;

    // ===== DEBRIS TUMBLE + COLLISION (Box3, InstancedMesh) =====
    // One get + one set per instance per frame: read the current transform
    // via getMatrixAt(), mutate the plain position/rotation scratch on each
    // debris entry through tumble + ground + pairwise collision, then
    // write every instance's final transform back via setMatrixAt() and
    // flag instanceMatrix dirty once per bucket.
    for (const d of debris) {
      const im = bucketRefs.current[d.bucketIndex];
      if (!im) continue;
      im.getMatrixAt(d.localIndex, tmpMatrix);
      tmpMatrix.decompose(d.position, tmpQuat, tmpScale);
      d.rotation.setFromQuaternion(tmpQuat);
      const nt2 = time * d.speed * 0.2 + d.phase;
      d.rotation.x += noise.noise(nt2, d.phase, 0) * 0.004;
      d.rotation.y += noise.noise(nt2, d.phase + 20, 0) * 0.004;
    }

    god.updateMatrixWorld(true);

    // Ground collision — world-space, since the floor is fixed in world
    // space but debris live in god's local (rotating/bobbing) space.
    for (const d of debris) {
      const im = bucketRefs.current[d.bucketIndex];
      if (!im) continue;
      worldPosTmp.copy(d.position);
      im.localToWorld(worldPosTmp);
      const halfY = d.halfSize.y;
      if (worldPosTmp.y - halfY < groundY) {
        worldPosTmp.y = groundY + halfY;
        im.worldToLocal(worldPosTmp);
        d.position.y = worldPosTmp.y;
      }
    }

    // Debris-vs-debris collision — local-space AABB approximation, same
    // tradeoff as the vanilla build (ignores per-chunk rotation; visually
    // indistinguishable for small slow-tumbling pieces, ~10x cheaper than
    // a true rotated-box test).
    for (const d of debris) {
      const bucket = buckets[d.bucketIndex];
      d.box.copy(bucket.geometry.boundingBox).translate(d.position);
    }
    for (let i = 0; i < debris.length; i++) {
      for (let j = i + 1; j < debris.length; j++) {
        const a = debris[i];
        const b = debris[j];
        if (a.box.intersectsBox(b.box)) {
          collisionPush.subVectors(a.position, b.position);
          if (collisionPush.lengthSq() < 1e-6) collisionPush.set(0.01, 0, 0);
          collisionPush.normalize().multiplyScalar(0.012);
          a.position.add(collisionPush);
          b.position.sub(collisionPush);
        }
      }
    }

    // Write every debris instance's final transform back and flag each
    // bucket's InstancedMesh dirty exactly once.
    for (const d of debris) {
      const im = bucketRefs.current[d.bucketIndex];
      if (!im) continue;
      tmpQuat.setFromEuler(d.rotation);
      tmpMatrix.compose(d.position, tmpQuat, ONE_SCALE);
      im.setMatrixAt(d.localIndex, tmpMatrix);
    }
    for (const im of bucketRefs.current) {
      if (im) im.instanceMatrix.needsUpdate = true;
    }
  }, 1);

  return (
    <group ref={godRef}>
      <mesh position={[0, 3.5, 0]} material={M.red} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.red)} onPointerOut={onHoverEnd(M.red)}>
        <cylinderGeometry args={[1.15, 1.15, 0.45, 32]} />
      </mesh>
      <mesh position={[0, 2.95, 0]} material={M.green} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.green)} onPointerOut={onHoverEnd(M.green)}>
        <cylinderGeometry args={[1.05, 1.05, 0.5, 32]} />
      </mesh>
      <mesh position={[0, 2.1, 0]} material={M.white} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.white)} onPointerOut={onHoverEnd(M.white)}>
        <cylinderGeometry args={[1.35, 1.35, 1.05, 32]} />
      </mesh>
      <mesh position={[0, 1.35, 0]} material={M.black} geometry={G.torso} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.black)} onPointerOut={onHoverEnd(M.black)} />
      <mesh position={[0.5, 0.65, -0.15]} rotation={[0, 0, -0.28]} material={M.blue} geometry={G.arm} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.blue)} onPointerOut={onHoverEnd(M.blue)} />
      <mesh position={[-1.75, -0.45, 0.25]} material={M.yellow} geometry={G.hipA} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.yellow)} onPointerOut={onHoverEnd(M.yellow)} />
      <mesh position={[-2.8, 0.2, 0.25]} material={M.yellow} geometry={G.hipB} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.yellow)} onPointerOut={onHoverEnd(M.yellow)} />
      <mesh position={[-1.85, -0.8, 0.2]} material={M.red} geometry={G.base} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.red)} onPointerOut={onHoverEnd(M.red)} />

      <group position={[0.85, -1.05, 0.85]} rotation={[0.35, 0.65, -0.25]}>
        {soulColors.map((c, i) => (
          <mesh key={i} position={[(i - 2.5) * 0.18, 0, 0]} geometry={G.soul} material={soulMaterials[i]} castShadow={!isMobile} receiveShadow={!isMobile} />
        ))}
      </group>

      <mesh position={[0.85, 0.05, 0.95]} rotation={[1.05, 0.35, 0.15]} material={M.chrome} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.chrome)} onPointerOut={onHoverEnd(M.chrome)}>
        <torusGeometry args={[0.5, 0.11, 16, 32]} />
      </mesh>

      <mesh position={[-0.55, 0.35, -1.2]} rotation={[0.18, 0.45, -0.35]} material={M.black} geometry={G.spine} castShadow={!isMobile} receiveShadow={!isMobile} onPointerOver={onHoverStart(M.black)} onPointerOut={onHoverEnd(M.black)} />

      {buckets.map((bucket, bIdx) => bucketCounts[bIdx] > 0 && (
        <instancedMesh
          key={bIdx}
          ref={(el) => { bucketRefs.current[bIdx] = el; }}
          args={[bucket.geometry, debrisMaterial, bucketCounts[bIdx]]}
          castShadow={!isMobile}
          receiveShadow={!isMobile}
        />
      ))}
    </group>
  );
}
