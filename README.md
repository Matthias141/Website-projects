# Sculpture — React Three Fiber build

R3F rewrite of the vanilla Three.js sculpture, with GTAO + SSR postprocessing.

## Setup
```bash
npm install   # postinstall runs patch-package automatically — required,
              # see "Known issues" below before skipping this
npm run dev   # http://localhost:5173
```

## What's in scope in this pass
- Sculpture geometry, materials, fresnel/noise shader (ported from vanilla)
- Noise-driven organic motion (ImprovedNoise, not sine)
- Box3 collision: debris-vs-debris, debris-vs-ground, camera auto-framing
- Camera: OrbitControls with fixed auto-framing (growth-guard, not a floor —
  see comments in CameraRig.jsx for the bug this replaced)
- Postprocessing: N8AO (GTAO-quality ambient occlusion) + SSR + Bloom

## What's NOT in scope — deliberately deferred
- The DOM UI shell: topbar, nav panels, loader sequence, dark-mode toggle,
  generative audio drone. All of that lived in ~800 lines of hand-built
  HTML/CSS/vanilla-JS in the original single-file build and needs its own
  pass to port into React components.
- Hotspot-tap-to-zoom (the feature from the last vanilla-build session).
  The Box3 auto-framing camera logic is ported; the tap-to-focus-and-dolly
  interaction is not yet wired up to pointer events in this R3F version.

## Known issues
- **`screen-space-reflections` is a patched dependency.** The published
  package (last updated 2022) fails to build against modern three.js — it
  references `WebGLMultipleRenderTargets`, a class three.js has since
  removed. Fixed via `patch-package` (see `patches/`), reapplied
  automatically on every `npm install` via the `postinstall` script. If you
  ever see the raw `WebGLMultipleRenderTargets` error again, run
  `npx patch-package` manually.
- **SSR has not been visually verified.** The patch fixes the *build*
  (confirmed working end-to-end, including a from-scratch `npm install`).
  It has not been checked in an actual browser/GPU — this project was built
  in a sandboxed environment with no WebGL context available. Run `npm run
  dev` and look at the chrome eye ring before trusting it. If it renders
  garbage, comment out `<SSR />` in `src/Effects.jsx` — N8AO + Bloom alone
  is a complete, safe fallback.
- Bundle is ~1.4MB minified (~427KB gzipped), unsplit. Fine for a portfolio
  page but worth code-splitting (dynamic `import()`) if it grows further.
