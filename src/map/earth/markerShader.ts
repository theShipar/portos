import * as THREE from 'three';
import { EARTH_RADIUS } from './camera';

/**
 * Screen-sized, globe-anchored instanced markers. Each instance is placed on the tangent plane of its sphere point,
 * rotated to its course over ground (clockwise from north) and scaled so its length is `aSize × uPx` CSS pixels at
 * any camera distance. Markers on the far hemisphere are discarded in the vertex stage.
 */
const vertexShader = /* glsl */ `
  attribute vec3 aCenter;
  attribute float aHeading;
  attribute vec3 aColor;
  attribute float aSize;
  attribute vec3 partColor;
  attribute float tint;
  uniform float uRadius;
  uniform float uPx;
  uniform float uPxToWorld;
  varying vec3 vColor;
  varying float vLight;

  void main() {
    vec3 up = normalize(aCenter);
    vec3 east = cross(vec3(0.0, 1.0, 0.0), up);
    float el = length(east);
    east = el > 1e-4 ? east / el : vec3(1.0, 0.0, 0.0);
    vec3 north = cross(up, east);
    vec3 forward = north * cos(aHeading) + east * sin(aHeading);
    vec3 left = cross(up, forward);
    vec3 anchor = up * uRadius;
    vec4 anchorView = viewMatrix * modelMatrix * vec4(anchor, 1.0);
    float scale = aSize * uPx * max(-anchorView.z, 0.0) * uPxToWorld;
    vec3 local = left * position.x + up * position.y + forward * position.z;
    vec4 world = modelMatrix * vec4(anchor + local * scale, 1.0);
    vec3 n = normalize(mat3(viewMatrix) * mat3(modelMatrix) * (left * normal.x + up * normal.y + forward * normal.z));
    vLight = 0.62 + 0.38 * abs(dot(n, normalize(vec3(-0.25, 0.55, 0.8))));
    vColor = mix(partColor, aColor, tint);
    float facing = dot(anchor, cameraPosition) - uRadius * uRadius;
    gl_Position = projectionMatrix * viewMatrix * world;
    if (aSize <= 0.0 || facing < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vLight;

  void main() {
    gl_FragColor = vec4(vColor * vLight, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createMarkerMaterial(radius = EARTH_RADIUS * 1.0018): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uRadius: { value: radius }, uPx: { value: 10 }, uPxToWorld: { value: 0.001 } },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
}

export interface InstanceBuffers {
  center: THREE.InstancedBufferAttribute;
  heading: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  size: THREE.InstancedBufferAttribute;
}

export function createInstanceBuffers(capacity: number): InstanceBuffers {
  const attr = (n: number) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  return { center: attr(3), heading: attr(1), color: attr(3), size: attr(1) };
}

/** Instanced geometry that shares the cached base geometry and a set of instance buffers. */
export function instancedFrom(base: THREE.BufferGeometry, buffers: InstanceBuffers): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  for (const [name, a] of Object.entries(base.attributes)) g.setAttribute(name, a);
  g.setAttribute('aCenter', buffers.center);
  g.setAttribute('aHeading', buffers.heading);
  g.setAttribute('aColor', buffers.color);
  g.setAttribute('aSize', buffers.size);
  g.instanceCount = 0;
  return g;
}
