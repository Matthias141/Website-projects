import * as THREE from 'three';

// Ported directly from the vanilla Three.js build — the onBeforeCompile
// technique is identical in R3F, since R3F materials are still just real
// THREE.Material instances under the hood. Nothing about this needed to
// change for the framework switch.

// Compact Ashima/McEwan 3D simplex noise (public-domain reference GLSL).
export const GLSL_SIMPLEX_NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
           i.z + vec4(0.0, i1.z, i2.z, 1.0))
         + i.y + vec4(0.0, i1.y, i2.y, 1.0))
         + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`;

/**
 * Injects fresnel rim lighting + simplex-noise vertex displacement into a
 * stock MeshPhysicalMaterial via onBeforeCompile. Call once per material
 * (e.g. inside a useMemo), then push shader.uniforms.uTime.value = clock
 * every frame from useFrame — see useShaderClock.js.
 *
 * `breath: true` (used by the organic body only) layers two more
 * displacement terms on top of the noise ripple, reading the geometry's
 * baked aRamp/aBreath attributes (see organicBody.js):
 *   LAYER 1 — breath: slow swell along normals, ~5s real-time cycle
 *     (uTime runs at 0.55× real seconds, so ω=2.28 → 2π/2.28 ≈ 2.75 uTime
 *     units ≈ 5.0s). Phase is offset by -aRamp so the crest TRAVELS UP
 *     the body — belly leads, shoulders follow — instead of the whole
 *     surface swelling in lockstep. Amplitude is aBreath-weighted:
 *     belly-max, near-zero at cap rim, base contact, and the collar neck.
 *   LAYER 2 — heartbeat: small fast double-thump (two gaussian bumps,
 *     lub then softer dub, ~1.2s real period), masked to the belly band
 *     of aRamp only.
 *   LAYER 3 — the pre-existing simplex ripple, whose amplitude the body
 *     passes in reduced (surface life on top of the breath, not
 *     competing with it).
 * All three layers multiply by uMotion (1 normal / 0 reduced-motion), so
 * prefersReducedMotion freezes the body at its exact neutral authored
 * pose. Non-breath materials get uMotion too (constant 1, never written)
 * so the ripple line is uniform — their behavior is unchanged.
 */
export function attachFresnelNoise(material, {
  fresnelColor = 0xffffff,
  fresnelPower = 2.2,
  fresnelIntensity = 0.35,
  noiseAmp = 0.03,
  breath = false,
  breathAmp = 0.055,
  heartAmp = 0.018,
} = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uNoiseAmp = { value: noiseAmp };
    shader.uniforms.uMotion = { value: 1 };
    shader.uniforms.uFresnelColor = { value: new THREE.Color(fresnelColor) };
    shader.uniforms.uFresnelPower = { value: fresnelPower };
    shader.uniforms.uFresnelIntensity = { value: fresnelIntensity };
    if (breath) {
      shader.uniforms.uBreathAmp = { value: breathAmp };
      shader.uniforms.uHeartAmp = { value: heartAmp };
    }

    const breathDeclarations = breath ? `
        attribute float aRamp;
        attribute float aBreath;
        uniform float uBreathAmp;
        uniform float uHeartAmp;
    ` : '';
    const breathDisplacement = breath ? `
        float breathSwell = sin(uTime * 2.28 - aRamp * 1.8) * 0.5 + 0.5;
        float heartPhase = fract(uTime * 1.515);
        float lub = exp(-pow((heartPhase - 0.12) * 14.0, 2.0));
        float dub = exp(-pow((heartPhase - 0.34) * 16.0, 2.0)) * 0.6;
        float bellyMask = smoothstep(0.15, 0.3, aRamp) * (1.0 - smoothstep(0.42, 0.58, aRamp));
        transformed += normal * uMotion * aBreath * (breathSwell * uBreathAmp + (lub + dub) * bellyMask * uHeartAmp);
    ` : '';

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        uniform float uNoiseAmp;
        uniform float uMotion;
        ${breathDeclarations}
        ${GLSL_SIMPLEX_NOISE}
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float n = snoise(position * 1.1 + uTime * 0.15);
        transformed += normal * n * uNoiseAmp * uMotion;
        ${breathDisplacement}
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform vec3 uFresnelColor;
        uniform float uFresnelPower;
        uniform float uFresnelIntensity;
      `)
      .replace('#include <dithering_fragment>', `
        float fresnel = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), uFresnelPower);
        gl_FragColor.rgb += uFresnelColor * fresnel * uFresnelIntensity;
        #include <dithering_fragment>
      `);

    material.userData.shader = shader;
  };
  material.needsUpdate = true;
  return material;
}
