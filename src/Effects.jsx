import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, N8AO } from '@react-three/postprocessing';
import { SSREffect } from 'screen-space-reflections';

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
 * The patch fixes the BUILD (verified with `npm run build`). It does NOT
 * prove the shader renders correctly in a live WebGL context — that needs
 * `npm run dev` and an actual look at the chrome eye ring, which this
 * sandbox can't do (no GPU/browser here). If it errors or renders garbage
 * at runtime, N8AO + Bloom alone is still a complete, safe fallback —
 * comment the <SSR /> line out below.
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
      <SSR />
      <Bloom intensity={0.28} luminanceThreshold={0.4} luminanceSmoothing={0.88} mipmapBlur />
    </EffectComposer>
  );
}
