import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Sculpture from './Sculpture.jsx';
import Ground from './Ground.jsx';
import CameraRig from './CameraRig.jsx';
import Effects from './Effects.jsx';
import Loader from './ui/Loader.jsx';
import UIOverlay from './ui/UIOverlay.jsx';
import { useAmbientAudio } from './hooks/useAmbientAudio.js';

const LIGHT_BG = '#f0f0f0';
const DARK_BG = '#0e0e0e';

export default function App() {
  const [isMobile] = useState(
    () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setPrefersReducedMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const [darkMode, setDarkMode] = useState(false);
  const [heroFaded, setHeroFaded] = useState(false);
  const heroFadeTimer = useRef(null);

  const sculptureGroupRef = useRef();
  const [roomEnvironment] = useState(() => new RoomEnvironment());
  const { soundOn, toggleSound, setModulation } = useAmbientAudio();

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const handleInteractionStart = useCallback(() => {
    setHeroFaded(true);
    clearTimeout(heroFadeTimer.current);
  }, []);
  const handleInteractionEnd = useCallback(() => {
    clearTimeout(heroFadeTimer.current);
    heroFadeTimer.current = setTimeout(() => setHeroFaded(false), 2500);
  }, []);

  const bg = darkMode ? DARK_BG : LIGHT_BG;

  return (
    <>
      <a href="#panel-nav" className="skip-link">Skip to navigation</a>
      <p className="sr-only">
        This page features an interactive 3D sculpture (Godform) in the
        background. It is decorative — all content is available through the
        navigation links.
      </p>

      <Loader />

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
        <color attach="background" args={[bg]} />
        <fogExp2 attach="fog" args={[bg, 0.02]} />

        {/* Procedural IBL — same PMREMGenerator + RoomEnvironment approach as
            the vanilla build, no HDRI file to fetch. drei's <Environment>
            does the PMREM baking for you when given a scene as children.
            RoomEnvironment is a THREE.Scene subclass, not a component — it
            must be constructed with `new` and handed over via <primitive>,
            not rendered as <RoomEnvironment />. */}
        <Environment resolution={256}>
          <primitive object={roomEnvironment} />
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
          <Sculpture
            isMobile={isMobile}
            prefersReducedMotion={prefersReducedMotion}
            onFrame={setModulation}
          />
        </group>
        <Ground />

        <CameraRig
          targetRef={sculptureGroupRef}
          prefersReducedMotion={prefersReducedMotion}
          onInteractionStart={handleInteractionStart}
          onInteractionEnd={handleInteractionEnd}
        />
        <Effects isMobile={isMobile} />
      </Canvas>

      <UIOverlay
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((v) => !v)}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        heroFaded={heroFaded}
      />
    </>
  );
}
