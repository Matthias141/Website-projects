import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ScrollControls, Scroll } from '@react-three/drei';
import { NeutralToneMapping } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Sculpture from './Sculpture.jsx';
import Particles from './Particles.jsx';
import Ground from './Ground.jsx';
import CameraRig from './CameraRig.jsx';
import Effects from './Effects.jsx';
import Hero from './Hero.jsx';
import Loader from './ui/Loader.jsx';
import UIOverlay from './ui/UIOverlay.jsx';
import { useAmbientAudio } from './hooks/useAmbientAudio.js';

const LIGHT_BG = '#f0f0f0';
// Desktop-only: the canvas <color>/fog background, not the UI chrome's
// #f0f0f0 (topbar/panels/loader stay as-is — they're translucent blurred
// overlays, not the thing being reported as "too white"). On a wide
// laptop viewport the sculpture fills a small fraction of the frame, so
// this flat background color dominates the visual field far more than on
// a phone screen where the object fills much more of it — which is why
// four rounds of cutting LIGHT intensity (which only affects the object's
// shading, not this empty-space color at all) never visibly moved the
// needle: the actual dominant "white" was always this, not the object.
const LIGHT_BG_DESKTOP = '#c7c7c3';
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

  const bg = darkMode ? DARK_BG : (isMobile ? LIGHT_BG : LIGHT_BG_DESKTOP);

  return (
    <>
      <a href="#panel-nav" className="skip-link">Skip to navigation</a>
      <p className="sr-only">
        This page features an interactive 3D sculpture in the background. It
        is decorative — all content is available through the navigation
        links.
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
        gl={{
          antialias: !isMobile,
          powerPreference: 'high-performance',
          // 2a of the color/exposure pass: R3F defaults to
          // ACESFilmicToneMapping when unset (verified in
          // @react-three/fiber's source) — swapped for NeutralToneMapping
          // (three@0.185.1 has it — checked node_modules before using it),
          // which is designed to preserve saturation better than ACES's
          // filmic roll-off. Needs on-device confirmation, not visually
          // verifiable in this sandbox.
          toneMapping: NeutralToneMapping,
          // Uniformly dims the LIT scene (lights + env reflections) without
          // touching the flat <color attach="background"> below, which
          // three.js doesn't run through tone mapping — so this adds
          // contrast between the object and the page instead of just
          // darkening the whole canvas evenly the way another light/env
          // cut would. Desktop-only (see the brightness-pass comment
          // below) — mobile keeps the default 1.0, its brightness was
          // already validated separately via on-device phone screenshots
          // earlier in this project and this round of cuts is specifically
          // about how it reads on a laptop screen.
          toneMappingExposure: isMobile ? 1 : 0.85,
        }}
      >
        <color attach="background" args={[bg]} />
        <fogExp2 attach="fog" args={[bg, 0.02]} />

        {/* Procedural IBL — same PMREMGenerator + RoomEnvironment approach as
            the vanilla build, no HDRI file to fetch. drei's <Environment>
            does the PMREM baking for you when given a scene as children.
            RoomEnvironment is a THREE.Scene subclass, not a component — it
            must be constructed with `new` and handed over via <primitive>,
            not rendered as <RoomEnvironment />.

            environmentIntensity cut on desktop only: RoomEnvironment is a
            bright white studio by default, and with metalness 0.45-1.0
            across every material (Sculpture.jsx), its reflection was very
            likely the actual dominant source of the "washed out in white
            light" look — but explicitly reported as a laptop/PC issue,
            not a mobile one, so mobile keeps the original 1.0 (its
            brightness was already validated via on-device phone
            screenshots earlier in this project) and only the desktop path
            gets cut. Scales the whole IBL contribution down in one place
            instead of re-tuning envMapIntensity per material. */}
        <Environment resolution={256} environmentIntensity={isMobile ? 1 : 0.35}>
          <primitive object={roomEnvironment} />
        </Environment>

        {/* Ongoing brightness pass — desktop/laptop only (isMobile keeps
            the original, already on-device-validated values below), each
            round per feedback that the scene still reads too bright/
            washed-out on a laptop screen specifically:
              ambient:       0.3  -> 0.18 -> 0.12 -> 0.08
              key light:     0.9  -> 0.75 -> 0.55
              fill light:    0.3  -> 0.22 -> 0.15
              env intensity: 1.0  -> 0.5  -> 0.35
            Cutting all four levers together (not just ambient) since the
            first round of cuts alone wasn't enough — direct light,
            environment reflection, AND flat ambient fill all read as
            "white" independently, so all three need to come down. */}
        <ambientLight intensity={isMobile ? 0.18 : 0.08} />
        <directionalLight
          position={[10, 14, 8]}
          intensity={isMobile ? 0.9 : 0.55}
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
        <directionalLight position={[-8, 5, -6]} intensity={isMobile ? 0.3 : 0.15} />

        <group ref={sculptureGroupRef}>
          <Sculpture
            isMobile={isMobile}
            prefersReducedMotion={prefersReducedMotion}
            onFrame={setModulation}
          />
        </group>
        <Particles isMobile={isMobile} prefersReducedMotion={prefersReducedMotion} />
        <Ground isMobile={isMobile} color={bg} />

        {/* STAGE 0 pointer-conflict fix, see CameraRig.jsx's domElement note:
            constrained to a left-anchored strip (not full-viewport) so its
            scroll-capture div never overlaps the region users drag in to
            orbit the sculpture.

            pages=2, distance=1 (distance's default, kept explicit here):
            2 viewport-heights of scroll room for Hero's fade-out
            (scroll.range(0, 1/scroll.pages)) to read as a deliberate
            reveal rather than feeling instant, without a second empty
            page of scroll after it finishes.

            prefersReducedMotion doesn't disable scrolling itself — the
            scroll mechanism stays intact — it disables what scroll DOES
            to Hero: it short-circuits to its final resting opacity/
            position regardless of scroll offset when prefersReducedMotion
            is true (see the early-return at the top of its useFrame), so
            a reduced-motion user gets the finished state immediately,
            never the animated reveal. */}
        <ScrollControls pages={2} distance={1} damping={0.2} style={{ width: 'min(600px, 60vw)', left: 0 }}>
          {/* BUGFIX: <Scroll html>'s own wrapper div has no explicit
              height, and its only child (.kinetic-hero) is `position:
              absolute` — out of normal flow, so it doesn't establish the
              wrapper's auto-height either. That collapsed the wrapper to
              ~0px tall, which broke .kinetic-hero's `bottom: 80px`
              positioning (no real containing-block height to anchor
              against) and pushed it somewhere near the top of the
              screen instead — reading as "the hero text is gone"
              rather than literally being removed. Explicit width/height
              here gives it a real containing block. */}
          <Scroll html style={{ width: '100%', height: '100%' }}>
            <Hero prefersReducedMotion={prefersReducedMotion} heroFaded={heroFaded} />
          </Scroll>
        </ScrollControls>

        <CameraRig
          targetRef={sculptureGroupRef}
          prefersReducedMotion={prefersReducedMotion}
          onInteractionStart={handleInteractionStart}
          onInteractionEnd={handleInteractionEnd}
          manualRender={isMobile}
        />
        <Effects isMobile={isMobile} />
      </Canvas>

      <UIOverlay
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((v) => !v)}
        soundOn={soundOn}
        onToggleSound={toggleSound}
      />
    </>
  );
}
