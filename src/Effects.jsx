import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing';

/**
 * SSR (screen-space-reflections) was removed from this composer entirely —
 * it's not just commented out, the code is gone. Two independent problems:
 *
 * 1. The published package (last updated 2022) fails to build against
 *    three@0.185: it imports `WebGLMultipleRenderTargets`, a class three.js
 *    has since removed in favor of `new WebGLRenderTarget(w, h, { count: N })`.
 *    A patch-package fix for this still lives in
 *    patches/screen-space-reflections+2.5.0.patch and package.json's
 *    postinstall — harmless to leave in place, but no longer load-bearing
 *    since nothing imports the package anymore.
 * 2. Even patched, it's broken at RUNTIME: verified live (headless
 *    Chromium, `npm run dev`) that `TemporalResolvePass.render` throws
 *    `Cannot read properties of undefined (reading 'width')` inside
 *    `WebGLRenderer.copyFramebufferToTexture`, every frame, inside R3F's
 *    render loop rather than React's render/commit phase — a React error
 *    boundary around the effect does NOT catch this, and the repeated
 *    throw was enough to lose the WebGL context entirely, which is what
 *    produced a blank white page in production.
 *
 * N8AO + Bloom alone is a complete, safe render. Re-adding SSR needs
 * either an upstream fix or a rewrite against the current
 * postprocessing/three APIs — see git history (Effects.jsx before this
 * commit) for the last working-build attempt.
 */
export default function Effects({ isMobile }) {
  if (isMobile) {
    // No composer at all on mobile — matches the vanilla build's choice to
    // skip postprocessing entirely there rather than run a crippled version.
    return null;
  }
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={1.2} intensity={2} distanceFalloff={1} quality="medium" />
      <Bloom intensity={0.28} luminanceThreshold={0.4} luminanceSmoothing={0.88} mipmapBlur />
    </EffectComposer>
  );
}
