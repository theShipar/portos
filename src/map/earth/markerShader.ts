import * as THREE from 'three';
import { EARTH_RADIUS } from './camera';

/**
 * Screen-sized, surface-anchored instanced markers. On the globe (`uPlanar` 0) each instance sits on the tangent plane
 * of its sphere point; on planar surfaces (`uPlanar` 1) `aCenter` is the world position, up is +Y and scene north −Z.
 * Models follow the ship contract (bow −Z, up +Y, starboard +X, length 1) and are yawed to `aHeading` (radians
 * clockwise from true north). Size is `aSize × uPx` CSS pixels, or the true length `aLength` metres when that is
 * larger, so ships reach real scale in port views. `uBeam` widens hulls for legibility only while they are drawn
 * above true scale. Far-hemisphere instances are discarded in the vertex stage. With `WAKE` defined the geometry
 * aft of the stern (z > 0.5) is stretched by `aWake` ship lengths and faded by its `fade` attribute.
 */
const vertexShader = /* glsl */ `
  attribute vec3 aCenter;
  attribute float aHeading;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aLength;
  attribute vec3 partColor;
  attribute float tint;
  #ifdef WAKE
  attribute float aWake;
  attribute float fade;
  varying float vFade;
  #endif
  uniform float uRadius;
  uniform float uPx;
  uniform float uPxToWorld;
  uniform float uPlanar;
  uniform float uMetre;
  uniform float uBeam;
  varying vec3 vColor;
  varying float vLight;

  void main() {
    bool planar = uPlanar > 0.5;
    vec3 up = planar ? vec3(0.0, 1.0, 0.0) : normalize(aCenter);
    vec3 east = cross(vec3(0.0, 1.0, 0.0), up);
    float el = length(east);
    east = el > 1e-4 ? east / el : vec3(1.0, 0.0, 0.0);
    vec3 north = planar ? vec3(0.0, 0.0, -1.0) : cross(up, east);
    if (planar) east = vec3(1.0, 0.0, 0.0);
    vec3 forward = north * cos(aHeading) + east * sin(aHeading);
    vec3 right = cross(forward, up);
    vec3 anchor = planar ? aCenter + up * uRadius : up * uRadius;
    vec4 anchorView = viewMatrix * modelMatrix * vec4(anchor, 1.0);
    float screen = aSize * uPx * max(-anchorView.z, 0.0) * uPxToWorld;
    float trueSize = aLength * uMetre;
    float scale = max(screen, trueSize);
    float beam = mix(uBeam, 1.0, smoothstep(0.85, 1.25, trueSize / max(screen, 1e-9)));
    vec3 p = position;
    p.x *= beam;
    #ifdef WAKE
    if (p.z > 0.5) p.z = 0.5 + (p.z - 0.5) * aWake;
    vFade = fade;
    #endif
    vec3 local = right * p.x + up * p.y - forward * p.z;
    vec4 world = modelMatrix * vec4(anchor + local * scale, 1.0);
    vec3 n = normalize(mat3(viewMatrix) * mat3(modelMatrix) * (right * normal.x + up * normal.y - forward * normal.z));
    vLight = 0.58 + 0.42 * max(dot(n, normalize(vec3(-0.3, 0.75, 0.6))), 0.0) + 0.08 * abs(n.z);
    vColor = mix(partColor, aColor, tint);
    float facing = planar ? 1.0 : dot(anchor, cameraPosition) - uRadius * uRadius;
    gl_Position = projectionMatrix * viewMatrix * world;
    if (aSize <= 0.0 || facing < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    #ifdef WAKE
    if (aWake <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    #endif
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vLight;
  #ifdef WAKE
  varying float vFade;
  uniform float uWakeOpacity;
  #endif

  void main() {
    #ifdef WAKE
    gl_FragColor = vec4(vColor, vFade * uWakeOpacity);
    #else
    gl_FragColor = vec4(vColor * min(vLight, 1.08), 1.0);
    #endif
    #include <colorspace_fragment>
  }
`;

export interface MarkerMaterialOptions {
  radius?: number;
  planar?: boolean;
  /** World units per metre on this surface (enables true-scale ships). */
  metre?: number;
  beam?: number;
}

export function createMarkerMaterial(radiusOrOpts: number | MarkerMaterialOptions = {}, planarArg = false): THREE.ShaderMaterial {
  const o: MarkerMaterialOptions = typeof radiusOrOpts === 'number' ? { radius: radiusOrOpts, planar: planarArg } : radiusOrOpts;
  const planar = o.planar ?? false;
  return new THREE.ShaderMaterial({
    uniforms: {
      uRadius: { value: planar ? 0 : (o.radius ?? EARTH_RADIUS * 1.0018) },
      uPx: { value: 10 },
      uPxToWorld: { value: 0.001 },
      uPlanar: { value: planar ? 1 : 0 },
      uMetre: { value: o.metre ?? 0 },
      uBeam: { value: o.beam ?? 1 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
}

/** Material variant sharing `base`'s uniforms (so per-frame updates apply to both) with its own beam boost. */
export function variantWithBeam(base: THREE.ShaderMaterial, beam: number): THREE.ShaderMaterial {
  const m = base.clone();
  m.uniforms = { ...base.uniforms, uBeam: { value: beam } };
  return m;
}

/** Translucent wake sharing `base`'s placement uniforms. */
export function createWakeMaterial(base: THREE.ShaderMaterial, beam: number): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...base.uniforms, uBeam: { value: beam }, uWakeOpacity: { value: 0.55 } },
    vertexShader,
    fragmentShader,
    defines: { WAKE: '' },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return m;
}

export interface InstanceBuffers {
  center: THREE.InstancedBufferAttribute;
  heading: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  size: THREE.InstancedBufferAttribute;
  length: THREE.InstancedBufferAttribute;
  wake: THREE.InstancedBufferAttribute;
}

export function createInstanceBuffers(capacity: number): InstanceBuffers {
  const attr = (n: number) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  return { center: attr(3), heading: attr(1), color: attr(3), size: attr(1), length: attr(1), wake: attr(1) };
}

/** Instanced geometry that shares the cached base geometry and a set of instance buffers. */
export function instancedFrom(base: THREE.BufferGeometry, buffers: InstanceBuffers): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  for (const [name, a] of Object.entries(base.attributes)) g.setAttribute(name, a);
  g.setIndex(base.index);
  g.setAttribute('aCenter', buffers.center);
  g.setAttribute('aHeading', buffers.heading);
  g.setAttribute('aColor', buffers.color);
  g.setAttribute('aSize', buffers.size);
  g.setAttribute('aLength', buffers.length);
  g.setAttribute('aWake', buffers.wake);
  g.instanceCount = 0;
  return g;
}
