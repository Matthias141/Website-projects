import { memo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

// Reusable scratch objects — same reasoning as everywhere else in this
// codebase: no per-frame allocations in the hot loop.
const sculptureBox = new THREE.Box3();
const sculptureSphere = new THREE.Sphere();
const camDir = new THREE.Vector3();

/**
 * Ported from the vanilla build's animate() camera logic, including the
 * fix for the original bug: the FIRST version of this compared the fitted
 * distance directly against the camera's current distance and pushed the
 * camera out any time it was "closer than an ideal tight fit" — which was
 * true even at the default starting view, making it impossible to ever
 * zoom in. Fixed here (as in the vanilla build) by capturing a BASELINE
 * fit distance on first measurement and only reacting if the sculpture's
 * bounds grow meaningfully past that baseline later.
 */
// Memoized for the same reason as Sculpture.jsx: App.jsx re-renders on
// unrelated state (darkMode/heroFaded/soundOn); all props here are already
// stable (ref object, primitives, useCallback'd handlers in App.jsx), so
// memo lets this component skip re-running on those changes.
const CameraRig = memo(function CameraRig({ targetRef, prefersReducedMotion, autoRotate = true, onInteractionStart, onInteractionEnd, manualRender = false }) {
  const controlsRef = useRef();
  const { camera, gl } = useThree();
  const framingCounter = useRef(0);
  const minSafeDistance = useRef(0);
  const baselineSafeDistance = useRef(null);

  // renderPriority=2 (vs. Sculpture's 1): must run AFTER Sculpture.jsx's
  // useFrame has updated god's rotation/position for this frame, since
  // sculptureBox.setFromObject(god) below reads god's current world
  // transform for auto-framing — reading it before Sculpture updates it
  // would frame against last frame's pose instead of this one's.
  //
  // A NON-OBVIOUS side effect of giving ANY useFrame subscriber a positive
  // priority: @react-three/fiber then skips its own automatic
  // gl.render(scene, camera) call for the WHOLE canvas, on the assumption
  // that something with a priority now renders manually (this is exactly
  // how @react-three/postprocessing's <EffectComposer> already worked —
  // it renders itself at priority 1). That's true on desktop, where
  // Effects.jsx mounts an EffectComposer. But Effects.jsx returns null on
  // mobile — no EffectComposer, nothing else with a priority — so once
  // Sculpture/CameraRig acquire priorities, mobile would go BLANK without
  // this fallback: manualRender (App.jsx passes isMobile) makes this the
  // one manual render call mobile still needs, run last since this is the
  // higher of the two priorities.
  useFrame((state) => {
    const controls = controlsRef.current;
    const god = targetRef.current;
    if (controls && god && !prefersReducedMotion && controls.autoRotate) {
      framingCounter.current++;
      if (framingCounter.current % 6 === 0) {
        sculptureBox.setFromObject(god);
        sculptureBox.getBoundingSphere(sculptureSphere);
        minSafeDistance.current = sculptureSphere.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        if (baselineSafeDistance.current === null) baselineSafeDistance.current = minSafeDistance.current;
      }

      const currentDistance = camera.position.distanceTo(controls.target);
      const growthTriggered = minSafeDistance.current > baselineSafeDistance.current * 1.12;
      if (growthTriggered && currentDistance < minSafeDistance.current) {
        const nextDistance = THREE.MathUtils.lerp(currentDistance, minSafeDistance.current, 0.04);
        camDir.copy(camera.position).sub(controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(camDir, nextDistance);
      }
    }

    if (manualRender) state.gl.render(state.scene, state.camera);
  }, 2);

  return (
    <OrbitControls
      ref={controlsRef}
      // Explicit domElement, pinned to the raw canvas — see the Stage 0
      // pointer-conflict note in App.jsx for why this matters once
      // <ScrollControls> is mounted anywhere in the tree.
      domElement={gl.domElement}
      enableDamping
      dampingFactor={0.08}
      autoRotate={autoRotate && !prefersReducedMotion}
      autoRotateSpeed={0.35}
      enablePan={false}
      minDistance={3.2}
      maxDistance={28}
      zoomSpeed={0.85}
      target={[0, 0.8, 0]}
      onStart={onInteractionStart}
      onEnd={onInteractionEnd}
    />
  );
});

export default CameraRig;
