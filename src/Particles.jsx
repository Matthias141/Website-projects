import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

// Same ImprovedNoise instance pattern as Sculpture.jsx — noise-driven drift
// instead of a sine wave, so the motion never falls into a visible repeating
// cycle the way sine-based drift does after a few seconds.
const noise = new ImprovedNoise();

// Same 4-color palette as the vanilla build's ambient particle field.
const PALETTE = [0xff2d9b, 0x00c8ff, 0xffcc00, 0xaa44ff];

// Memoized for the same reason as Sculpture.jsx: avoid re-running this
// component (and its geometry/material lookups) on unrelated App-level
// state changes like darkMode/heroFaded toggles.
const Particles = memo(function Particles({ isMobile = false, prefersReducedMotion = false }) {
  const pointsRef = useRef();
  const t = useRef(0);

  const count = isMobile ? 250 : 500;

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;     // x: roughly ±7
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9;   // y: roughly ±4.5
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;  // z: roughly ±6
      color.set(PALETTE[i % PALETTE.length]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: isMobile ? 0.1 : 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    return { geometry: geo, material: mat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, isMobile]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame((_, delta) => {
    // Consistent with Sculpture.jsx's reduced-motion handling: the vanilla
    // build let this per-particle drift run even under reduced motion and
    // only gated the whole-field rotation — this port gates both, matching
    // the stricter convention already established elsewhere in this app.
    if (prefersReducedMotion) return;

    t.current += delta * 0.55; // same pace convention as Sculpture.jsx
    const time = t.current;
    const points = pointsRef.current;
    if (!points) return;

    const positions = geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const nt = time * 0.25 + i * 0.37;
      positions[i * 3] += noise.noise(nt, i, 0) * 0.002;
      positions[i * 3 + 1] += noise.noise(nt, i + 500, 0) * 0.0015;
    }
    geometry.attributes.position.needsUpdate = true;
    points.rotation.y += 0.0008;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

export default Particles;
