import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { QualityPreset } from './quality';

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputClamp;
uniform vec2 uResolution;
uniform vec2 uTexel;

uniform float uTime;
uniform float uRipple;
uniform float uCaustic;
uniform float uAberration;
uniform float uBloom;
uniform float uGrain;

vec3 tap(vec2 uv) {
  return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)).rgb;
}

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 px = uv * uResolution;
  float t = uTime;
  float aspect = uResolution.x / max(uResolution.y, 1.0);

  float w1 = sin(px.x * 0.015 + t * 1.05) * sin(px.y * 0.012 - t * 0.78);
  float w2 = sin((px.x * 0.65 + px.y) * 0.01 + t * 0.57);
  float w3 = sin(length(px - uResolution * 0.5) * 0.018 - t * 0.72);
  vec2 disp = vec2(w1 + w2 * 0.4, w2 * 0.85 + w3 * 0.45) * uRipple * uTexel;

  vec2 fromCenter = uv - 0.5;
  fromCenter.x *= aspect;
  float radial = length(fromCenter);
  vec2 chroma = fromCenter * uAberration * (0.35 + radial);

  vec3 scene = vec3(
    tap(uv + disp + chroma).r,
    tap(uv + disp).g,
    tap(uv + disp - chroma).b
  );

  vec3 bloom = vec3(0.0);
  if (uBloom > 0.001) {
    vec2 o1 = uTexel * 5.0;
    vec2 o2 = uTexel * 12.0;
    bloom += tap(uv + disp + vec2(o1.x, 0.0));
    bloom += tap(uv + disp - vec2(o1.x, 0.0));
    bloom += tap(uv + disp + vec2(0.0, o1.y));
    bloom += tap(uv + disp - vec2(0.0, o1.y));
    bloom += tap(uv + disp + o2);
    bloom += tap(uv + disp - o2);
    bloom += tap(uv + disp + vec2(o2.x, -o2.y));
    bloom += tap(uv + disp + vec2(-o2.x, o2.y));
    bloom *= 0.125;
    float luma = dot(bloom, vec3(0.22, 0.68, 0.1));
    bloom *= smoothstep(0.42, 0.92, luma);
  }

  vec2 cuv = px * 0.007;
  float a = sin(cuv.x * 1.6 + t * 0.42) + sin(cuv.y * 1.35 - t * 0.31);
  float b = sin((cuv.x + cuv.y) * 1.15 + t * 0.24);
  float caustic = smoothstep(0.55, 1.35, a * 0.55 + b);
  caustic *= caustic;
  vec3 causticLight = vec3(0.55, 0.9, 0.84) * caustic * uCaustic * 0.55;

  float shaft = smoothstep(0.62, 1.0, sin(px.x * 0.0036 + px.y * 0.0016 + t * 0.12));
  shaft *= smoothstep(0.45, 1.0, sin(px.x * 0.0024 - t * 0.05 + 1.7));

  scene = scene * vec3(0.84, 0.98, 1.06) + vec3(0.012, 0.03, 0.042);
  scene += vec3(0.18, 0.38, 0.4) * shaft * 0.07 * uCaustic;
  vec3 color = scene + bloom * uBloom * 1.35 + causticLight;

  vec2 vigUv = (uv - 0.5) * vec2(aspect, 1.0);
  float dist = length(vigUv);
  float vignette = smoothstep(0.96, 0.38, dist);
  color *= mix(0.12, 1.0, vignette);
  float ring = smoothstep(0.8, 0.845, dist) * smoothstep(1.02, 0.88, dist);
  color += ring * vec3(0.62, 0.9, 0.86) * 0.38;
  color *= 1.0 - smoothstep(0.92, 1.2, dist) * 0.72;

  float grain = fract(sin(dot(gl_FragCoord.xy + vec2(t * 17.0, t * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
  color += (grain - 0.5) * uGrain;

  finalColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

interface WaterUniforms {
  uTime: number;
  uRipple: number;
  uCaustic: number;
  uAberration: number;
  uBloom: number;
  uGrain: number;
  uResolution: Float32Array;
  uTexel: Float32Array;
}

export class WaterFilter {
  readonly filter: Filter;
  private readonly uniforms: WaterUniforms;

  constructor() {
    const group = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uRipple: { value: 2.2, type: 'f32' },
      uCaustic: { value: 0.5, type: 'f32' },
      uAberration: { value: 0.01, type: 'f32' },
      uBloom: { value: 0.8, type: 'f32' },
      uGrain: { value: 0.03, type: 'f32' },
      uResolution: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      uTexel: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
    });
    this.uniforms = group.uniforms as WaterUniforms;
    this.filter = new Filter({
      glProgram: GlProgram.from({
        vertex: VERTEX,
        fragment: FRAGMENT,
        name: 'primordial-water',
        preferredVertexPrecision: 'highp',
        preferredFragmentPrecision: 'highp',
      }),
      resources: { waterUniforms: group },
      padding: 4,
    });
  }

  set time(value: number) {
    this.uniforms.uTime = value;
  }

  setResolution(width: number, height: number): void {
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);
    this.uniforms.uResolution[0] = safeW;
    this.uniforms.uResolution[1] = safeH;
    this.uniforms.uTexel[0] = 1 / safeW;
    this.uniforms.uTexel[1] = 1 / safeH;
  }

  applyPreset(preset: QualityPreset, reducedMotion: boolean): void {
    const calm = reducedMotion ? 0.4 : 1;
    this.uniforms.uRipple = preset.ripple * calm;
    this.uniforms.uCaustic = preset.caustic * (reducedMotion ? 0.65 : 1);
    this.uniforms.uAberration = preset.aberration;
    this.uniforms.uBloom = preset.bloom;
    this.uniforms.uGrain = preset.grain;
  }
}
