import { useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Sculpture from './Sculpture.jsx';
import Ground from './Ground.jsx';
import CameraRig from './CameraRig.jsx';
import Effects from './Effects.jsx';

const LIGHT_BG = '#f0f0f0';

export default function App() {
  const isMobile = useMemo(
    () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768,
    []
  );
  const prefersReducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const sculptureGroupRef = useRef();

  return (
    <Canvas
      shadows={!isMobile}
      dpr={[1, isMobile ? 1.75 : 2]}
      camera={{
        fov: 45,
        position: isMobile ? [11, 7, 16] : [8.5, 5.5, 13],
        near: 0.1,
        far: 100,
      }}
      gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[LIGHT_BG]} />
      <fogExp2 attach="fog" args={[LIGHT_BG, 0.02]} />

      {/* Procedural IBL — same PMREMGenerator + RoomEnvironment approach as
          the vanilla build, no HDRI file to fetch. drei's <Environment>
          does the PMREM baking for you when given a scene as children. */}
      <Environment resolution={256}>
        <RoomEnvironment />
      </Environment>

      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 14, 8]}
        intensity={0.9}
        castShadow={!isMobile}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={4}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0015}
        shadow-radius={3}
      />
      <directionalLight position={[-8, 5, -6]} intensity={0.3} />

      <group ref={sculptureGroupRef}>
        <Sculpture isMobile={isMobile} prefersReducedMotion={prefersReducedMotion} />
      </group>
      <Ground />

      <CameraRig targetRef={sculptureGroupRef} prefersReducedMotion={prefersReducedMotion} />
      <Effects isMobile={isMobile} />
    </Canvas>
  );
}
