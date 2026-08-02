import { MeshReflectorMaterial } from '@react-three/drei';

// TRADEOFF, called out explicitly per instructions: the previous
// <shadowMaterial> rendered fully transparent except where a shadow fell —
// an invisible floor that only ever showed a contact shadow. drei's
// MeshReflectorMaterial can't reproduce that trick; it's a real opaque
// reflective surface (it renders its own reflected scene into a render
// target and blends it with the base material), not a transparent-except-
// shadow one. Kept the reflection and dropped the invisible-floor
// behavior — the ground is now a visible, softly reflective (not
// mirror-clean) plane. It still receives the sculpture's shadow on top of
// the reflection via the normal PBR shadow pipeline (MeshReflectorMaterial
// extends MeshStandardMaterial), so the grounding contact-shadow effect
// isn't lost, just no longer the only thing visible.
export default function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.4, 0]} receiveShadow>
      <circleGeometry args={[14, 64]} />
      <MeshReflectorMaterial
        blur={[300, 100]}
        resolution={512}
        mixBlur={1}
        mixStrength={40}
        roughness={1}
        depthScale={1}
        mirror={0.3}
      />
    </mesh>
  );
}
