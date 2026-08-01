import { useRef, useEffect } from 'react';
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
export default function CameraRig({ targetRef, prefersReducedMotion, autoRotate = true }) {
  const controlsRef = useRef();
  const { camera } = useThree();
  const framingCounter = useRef(0);
  const minSafeDistance = useRef(0);
  const baselineSafeDistance = useRef(null);

  useFrame(() => {
    const controls = controlsRef.current;
    const god = targetRef.current;
    if (!controls || !god || prefersReducedMotion || !controls.autoRotate) return;

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
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      autoRotate={autoRotate && !prefersReducedMotion}
      autoRotateSpeed={0.35}
      enablePan={false}
      minDistance={3.2}
      maxDistance={28}
      zoomSpeed={0.85}
      target={[0, 0.8, 0]}
    />
  );
}
