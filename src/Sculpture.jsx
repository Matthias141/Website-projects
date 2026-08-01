import { useMemo, useRef } from 'react';
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

export default function Sculpture({ isMobile = false, prefersReducedMotion = false }) {
  const godRef = useRef();
  const debrisRefs = useRef([]); // populated via ref callbacks below

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

  // ===== DEBRIS DATA =====
  // Generated once. Each entry carries its own geometry (rbox) + a Box3 +
  // half-size, exactly mirroring the vanilla version's per-chunk userData.
  const debrisCount = isMobile ? 16 : 28;
  const debris = useMemo(() => {
    const palette = [M.green, M.blue, M.yellow, M.cyan, M.magenta, M.red];
    return Array.from({ length: debrisCount }, (_, i) => {
      const s = 0.12 + Math.random() * 0.35;
      const geometry = rbox(s, s * (0.35 + Math.random() * 0.5), s, 2);
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox;
      return {
        geometry,
        material: palette[i % 6],
        position: [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8],
        rotation: [Math.random() * 3, Math.random() * 3, Math.random() * 3],
        phase: Math.random() * 6.28,
        speed: 0.15 + Math.random() * 0.4,
        halfSize: new THREE.Vector3().subVectors(bb.max, bb.min).multiplyScalar(0.5),
        box: new THREE.Box3(),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [M, debrisCount]);

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
    () => [...Object.values(M), ...soulMaterials].filter((m) => m.userData),
    [M, soulMaterials]
  );

  const t = useRef(0);

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

    if (prefersReducedMotion) return;

    // ===== DEBRIS TUMBLE + COLLISION (Box3) =====
    const meshes = debrisRefs.current;
    for (let i = 0; i < debris.length; i++) {
      const d = debris[i];
      const mesh = meshes[i];
      if (!mesh) continue;
      const nt2 = time * d.speed * 0.2 + d.phase;
      mesh.rotation.x += noise.noise(nt2, d.phase, 0) * 0.004;
      mesh.rotation.y += noise.noise(nt2, d.phase + 20, 0) * 0.004;
    }

    god.updateMatrixWorld(true);

    // Ground collision — world-space, since the floor is fixed in world
    // space but debris live in god's local (rotating/bobbing) space.
    for (let i = 0; i < debris.length; i++) {
      const d = debris[i];
      const mesh = meshes[i];
      if (!mesh) continue;
      mesh.getWorldPosition(worldPosTmp);
      const halfY = d.halfSize.y;
      if (worldPosTmp.y - halfY < groundY) {
        worldPosTmp.y = groundY + halfY;
        god.worldToLocal(worldPosTmp);
        mesh.position.y = worldPosTmp.y;
      }
    }

    // Debris-vs-debris collision — local-space AABB approximation, same
    // tradeoff as the vanilla build (ignores per-chunk rotation; visually
    // indistinguishable for small slow-tumbling pieces, ~10x cheaper than
    // a true rotated-box test).
    for (let i = 0; i < debris.length; i++) {
      const mesh = meshes[i];
      if (!mesh) continue;
      debris[i].box.copy(debris[i].geometry.boundingBox).translate(mesh.position);
    }
    for (let i = 0; i < debris.length; i++) {
      const meshA = meshes[i];
      if (!meshA) continue;
      for (let j = i + 1; j < debris.length; j++) {
        const meshB = meshes[j];
        if (!meshB) continue;
        if (debris[i].box.intersectsBox(debris[j].box)) {
          collisionPush.subVectors(meshA.position, meshB.position);
          if (collisionPush.lengthSq() < 1e-6) collisionPush.set(0.01, 0, 0);
          collisionPush.normalize().multiplyScalar(0.012);
          meshA.position.add(collisionPush);
          meshB.position.sub(collisionPush);
        }
      }
    }
  });

  return (
    <group ref={godRef}>
      <mesh position={[0, 3.5, 0]} material={M.red} castShadow={!isMobile} receiveShadow={!isMobile}>
        <cylinderGeometry args={[1.15, 1.15, 0.45, 32]} />
      </mesh>
      <mesh position={[0, 2.95, 0]} material={M.green} castShadow={!isMobile} receiveShadow={!isMobile}>
        <cylinderGeometry args={[1.05, 1.05, 0.5, 32]} />
      </mesh>
      <mesh position={[0, 2.1, 0]} material={M.white} castShadow={!isMobile} receiveShadow={!isMobile}>
        <cylinderGeometry args={[1.35, 1.35, 1.05, 32]} />
      </mesh>
      <mesh position={[0, 1.35, 0]} material={M.black} geometry={rbox(2.4, 0.55, 1.55)} castShadow={!isMobile} receiveShadow={!isMobile} />
      <mesh position={[0.5, 0.65, -0.15]} rotation={[0, 0, -0.28]} material={M.blue} geometry={rbox(1.5, 0.85, 1.05)} castShadow={!isMobile} receiveShadow={!isMobile} />
      <mesh position={[-1.75, -0.45, 0.25]} material={M.yellow} geometry={rbox(2.7, 0.65, 2.1)} castShadow={!isMobile} receiveShadow={!isMobile} />
      <mesh position={[-2.8, 0.2, 0.25]} material={M.yellow} geometry={rbox(0.65, 1.5, 2.1)} castShadow={!isMobile} receiveShadow={!isMobile} />
      <mesh position={[-1.85, -0.8, 0.2]} material={M.red} geometry={rbox(3.2, 0.95, 2.5)} castShadow={!isMobile} receiveShadow={!isMobile} />

      <group position={[0.85, -1.05, 0.85]} rotation={[0.35, 0.65, -0.25]}>
        {soulColors.map((c, i) => (
          <mesh key={i} position={[(i - 2.5) * 0.18, 0, 0]} geometry={rbox(0.17, 1.4, 0.65, 2)} material={soulMaterials[i]} castShadow={!isMobile} receiveShadow={!isMobile} />
        ))}
      </group>

      <mesh position={[0.85, 0.05, 0.95]} rotation={[1.05, 0.35, 0.15]} material={M.chrome} castShadow={!isMobile} receiveShadow={!isMobile}>
        <torusGeometry args={[0.5, 0.11, 16, 32]} />
      </mesh>

      <mesh position={[-0.55, 0.35, -1.2]} rotation={[0.18, 0.45, -0.35]} material={M.black} geometry={rbox(0.22, 1.7, 0.45, 2)} castShadow={!isMobile} receiveShadow={!isMobile} />

      {debris.map((d, i) => (
        <mesh
          key={i}
          ref={(el) => (debrisRefs.current[i] = el)}
          position={d.position}
          rotation={d.rotation}
          geometry={d.geometry}
          material={d.material}
          castShadow={!isMobile}
          receiveShadow={!isMobile}
        />
      ))}
    </group>
  );
}
