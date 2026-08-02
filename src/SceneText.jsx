import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text, useScroll } from '@react-three/drei';
import { attachFresnelNoise } from './shaders/fresnelNoise.js';

/**
 * drei's <Text> (troika-three-text under the hood, SDF glyphs — cheap,
 * one draw call per material regardless of character count, unlike
 * <Text3D>'s real extruded geometry) instead of forcing this codebase's
 * onBeforeCompile fresnel/noise helper onto something it wasn't built
 * for.
 *
 * VERIFIED (not assumed) that the fresnel match is fully achievable, not
 * just approximated: troika's `material` prop takes a real THREE.Material
 * instance as a BASE and derives an SDF-aware version from it. Checked
 * troika-three-utils' createDerivedMaterial source directly — its derived
 * onBeforeCompile calls `baseMaterial.onBeforeCompile.call(this, shader,
 * renderer)` FIRST, then layers its own glyph alpha-clip shader code on
 * top. So attachFresnelNoise() — the exact same helper Sculpture.jsx uses
 * — works unmodified as the base material here; troika composes with it
 * rather than requiring a different customization path.
 */
export default function SceneText({ prefersReducedMotion = false }) {
  const groupRef = useRef();
  const scroll = useScroll();

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.6,
      envMapIntensity: 1.2,
      transparent: true,
    });
    return attachFresnelNoise(mat, { fresnelColor: 0xffffff, fresnelIntensity: 0.4, noiseAmp: 0.015 });
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (prefersReducedMotion) {
      group.visible = true;
      material.opacity = 1;
      group.rotation.y = 0;
      return;
    }

    // Complementary to Hero.jsx's fade-out over the same interval — as the
    // DOM hero recedes, this emerges from behind the sculpture, so the two
    // read as one choreographed reveal rather than unrelated animations
    // that both happen to watch scroll.
    const progress = scroll.range(0, 1 / scroll.pages);
    material.opacity = progress;
    group.visible = progress > 0.001;
    group.rotation.y = (1 - progress) * -0.6;
    // uTime for the shared fresnel/noise shader — same convention as
    // Sculpture.jsx's own clock, kept independent since this text isn't
    // parented under the sculpture's god group.
    if (material.userData.shader) {
      material.userData.shader.uniforms.uTime.value += delta * 0.55;
    }
  });

  return (
    <group ref={groupRef} position={[0, 1.6, -6]}>
      <Text
        material={material}
        fontSize={1.3}
        letterSpacing={0.08}
        anchorX="center"
        anchorY="middle"
        castShadow={false}
        // Legibility against the sculpture behind/around it — this is
        // real SDF glyph geometry, not DOM, so a backdrop-filter scrim
        // isn't applicable here. troika/drei's built-in halo mechanism
        // (outlineWidth/Color/Blur) does the equivalent job: a soft dark
        // halo around each glyph raises contrast regardless of what's
        // moving behind it, without needing a background panel.
        outlineWidth="6%"
        outlineColor="#000000"
        outlineOpacity={0.55}
        outlineBlur="25%"
      >
        GODFORM
      </Text>
    </group>
  );
}
