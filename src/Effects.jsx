import { Component, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing';
import { SSREffect } from 'screen-space-reflections';

// Catches SSR construction/render failures so a bad GPU/driver combo drops
// only the SSR pass instead of crashing the whole canvas — see the SSR
// component docstring below for why this pass is unverified in a browser.
class SSRBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn('SSR effect failed, falling back to N8AO + Bloom only:', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * `screen-space-reflections` predates @react-three/postprocessing's
 * `wrapEffect` convention — its constructor takes (scene, camera, options)
 * instead of the single-options-object pattern wrapEffect expects, so
 * wrapEffect can't be used directly here. This mirrors the exact pattern
 * @react-three/postprocessing's OWN N8AO component uses internally
 * (visible in its compiled source): build the effect instance in a
 * useMemo, hand it to the composer via <primitive>.
 *
 * ⚠️ DEPENDENCY PATCHED — this package was last published in 2022 and its
 * build literally failed against three@0.185: it imported
 * `WebGLMultipleRenderTargets`, a class three.js has since removed in
 * favor of `new WebGLRenderTarget(w, h, { count: N })` with a plural
 * `.textures[]` array. Fixed via patch-package — see
 * patches/screen-space-reflections+2.5.0.patch, applied automatically on
 * every `npm install` via the postinstall script in package.json.
 * The patch fixes the BUILD. It does NOT fix the runtime: verified live
 * (headless Chromium, `npm run dev`) that `TemporalResolvePass.render`
 * throws `Cannot read properties of undefined (reading 'width')` inside
 * `WebGLRenderer.copyFramebufferToTexture`, every frame, inside R3F's
 * render loop — a React error boundary around <SSR/> does NOT catch this
 * (it's not in React's render/commit phase), and the repeated throw was
 * enough to lose the WebGL context entirely, which is what produced the
 * blank white page. DISABLED below pending an upstream fix or a rewrite
 * against the current postprocessing/three APIs — N8AO + Bloom alone is
 * a complete, safe fallback.
 */
function SSR() {
  const { scene, camera } = useThree();
  const effect = useMemo(() => new SSREffect(scene, camera, {
    intensity: 1,
    distance: 10,
    thickness: 10,
    blend: 0.9,
    roughnessFade: 1,
    maxRoughness: 0.7, // caps SSR to fairly glossy surfaces — the sculpture's
                        // 0.22–0.38 roughness materials qualify, cuts cost
                        // on rougher ones where reflections wouldn't read anyway
  }), [scene, camera]);
  return <primitive object={effect} />;
}

export default function Effects({ isMobile }) {
  if (isMobile) {
    // No composer at all on mobile — matches the vanilla build's choice to
    // skip postprocessing entirely there rather than run a crippled version.
    return null;
  }
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={1.2} intensity={2} distanceFalloff={1} quality="medium" />
      {/* <SSRBoundary><SSR /></SSRBoundary> — disabled, see docstring above */}
      <Bloom intensity={0.28} luminanceThreshold={0.4} luminanceSmoothing={0.88} mipmapBlur />
    </EffectComposer>
  );
}
