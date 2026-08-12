import { MeshReflectorMaterial } from '@react-three/drei';

// TRADEOFF, called out explicitly per instructions (original Item 5): the
// previous <shadowMaterial> rendered fully transparent except where a
// shadow fell — an invisible floor that only ever showed a contact
// shadow. drei's MeshReflectorMaterial can't reproduce that trick; it's a
// real opaque reflective surface (it renders its own reflected scene into
// a render target and blends it with the base material), not a
// transparent-except-shadow one. Kept the reflection and dropped the
// invisible-floor behavior on desktop — the ground is a visible, softly
// reflective plane there.
//
// BUGFIX: this component never got the isMobile treatment every other
// expensive effect in this app has (Effects.jsx's postprocessing, shadow
// casting, particle/debris counts all scale down or skip entirely on
// mobile) — an oversight from when Item 5 first added it. Reported bug:
// a thin bright vertical line rendering through the sculpture on an
// iPhone, with the ground's blurred reflection clearly visible in the
// same screenshot. Leading theory: mixStrength={40} — a very strong
// reflection blend — blowing a bright specular highlight (the key
// directional light, or the chrome material) into a hard streak in the
// reflection, worse on mobile where nothing else was tempering it.
// Two changes: mobile now falls back to the original plain shadow-catcher
// (cheap, matches the "skip it entirely on mobile" pattern elsewhere, and
// side-steps the reflection pipeline as a source of the artifact
// entirely), and desktop's mixStrength is cut from 40 to 8 — still a
// visible reflection, much less likely to blow out a highlight into a
// hard line.
// `color` is MeshReflectorMaterial's diffuse base (its own prop, defaults
// to white if unset — NOT inherited from scene.background). Left at the
// default it was invisible against the old near-white canvas background,
// but reads as a hard white disk now that the desktop canvas background
// is a visibly darker gray (see LIGHT_BG_DESKTOP in App.jsx) — matching
// it here to whatever the scene's actual background color is keeps the
// ground blending into the floor instead of standing out as a shape.
export default function Ground({ isMobile = false, color = '#f0f0f0' }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.4, 0]} receiveShadow>
      <circleGeometry args={[14, 64]} />
      {isMobile ? (
        <shadowMaterial opacity={0.28} />
      ) : (
        <MeshReflectorMaterial
          color={color}
          blur={[300, 100]}
          resolution={512}
          mixBlur={1}
          mixStrength={8}
          roughness={1}
          depthScale={1}
          mirror={0.3}
        />
      )}
    </mesh>
  );
}
