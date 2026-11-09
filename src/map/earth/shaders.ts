// SPDX-License-Identifier: GPL-3.0-or-later
// Adapted from three-scope-map EarthView.vue (earth + atmosphere shaders); see third_party/three-scope-map/NOTICE.
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天

export const earthVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldRadial;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;
  varying vec3 vViewDirection;

  void main() {
    vUv = uv;
    vec3 radial = normalize(position);
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), radial) + vec3(0.00001, 0.0, 0.0));
    vec3 north = normalize(cross(radial, east));
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldRadial = normalize(mat3(modelMatrix) * radial);
    vWorldEast = normalize(mat3(modelMatrix) * east);
    vWorldNorth = normalize(mat3(modelMatrix) * north);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const earthFragmentShader = /* glsl */ `
  uniform sampler2D uDayMap;
  uniform sampler2D uNormalMap;
  uniform sampler2D uSpecularMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uRegionMask;
  uniform sampler2D uHoverMask;
  uniform vec3 uLightDirection;
  uniform vec3 uOcean;
  uniform vec3 uOceanMid;
  uniform vec3 uOceanHighlight;
  uniform vec3 uLand;
  uniform vec3 uLandLight;
  uniform vec3 uGrid;
  uniform vec3 uAtmosphere;
  uniform vec3 uCityLight;
  uniform vec3 uRegionFill;
  uniform vec3 uRegionHover;
  uniform float uRegionStrength;
  uniform float uHoverStrength;
  uniform float uSpecular;
  uniform float uFade;
  varying vec2 vUv;
  varying vec3 vWorldRadial;
  varying vec3 vWorldEast;
  varying vec3 vWorldNorth;
  varying vec3 vViewDirection;

  float gridLine(float value, float count) {
    float coordinate = value * count;
    float distanceToLine = abs(fract(coordinate - 0.5) - 0.5);
    float antialiasWidth = max(fwidth(coordinate) * 0.72, 0.0025);
    return 1.0 - smoothstep(0.0, antialiasWidth, distanceToLine);
  }

  void main() {
    vec3 tangentNormal = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    tangentNormal.xy *= 0.5;
    vec3 terrainNormal = normalize(vWorldEast * tangentNormal.x + vWorldNorth * tangentNormal.y + vWorldRadial * tangentNormal.z);
    vec3 lightDirection = normalize(uLightDirection);
    vec3 viewDirection = normalize(vViewDirection);
    float lightFacing = dot(terrainNormal, lightDirection);
    float wrappedLight = smoothstep(-0.4, 0.8, lightFacing);
    float fresnel = pow(1.0 - max(dot(normalize(vWorldRadial), viewDirection), 0.0), 3.4);

    vec3 day = texture2D(uDayMap, vUv).rgb;
    float luma = dot(day, vec3(0.299, 0.587, 0.114));
    float oceanMask = smoothstep(0.35, 0.65, texture2D(uSpecularMap, vUv).r);
    float landMask = 1.0 - oceanMask;

    vec3 landColor = mix(uLand, uLandLight, smoothstep(0.08, 0.7, luma));
    vec3 oceanColor = mix(uOcean, uOceanMid, smoothstep(0.03, 0.22, luma) * 0.6);
    vec3 color = mix(landColor, oceanColor, oceanMask);
    color *= 0.72 + wrappedLight * 0.38;

    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float oceanHighlight = pow(max(dot(terrainNormal, halfDirection), 0.0), 72.0) * oceanMask;
    color += uOceanHighlight * oceanHighlight * 0.22 * uSpecular;

    vec3 night = texture2D(uNightMap, vUv).rgb;
    float nightLight = max(max(night.r, night.g), night.b);
    color += uCityLight * pow(nightLight, 1.6) * 0.09 * landMask;

    float regionMask = texture2D(uRegionMask, vUv).r;
    float hoverMask = texture2D(uHoverMask, vUv).r;
    color = mix(color, uRegionFill * (0.7 + wrappedLight * 0.45), regionMask * landMask * uRegionStrength * 0.7);
    color *= 1.0 - (1.0 - regionMask) * landMask * uRegionStrength * 0.28;
    color += uRegionHover * hoverMask * landMask * uHoverStrength * 0.16;

    float grid = max(gridLine(vUv.x, 24.0), gridLine(vUv.y, 12.0));
    color += uGrid * grid * 0.045 * (0.4 + oceanMask * 0.6);
    color += uAtmosphere * fresnel * 0.14;

    gl_FragColor = vec4(color, uFade);
    #include <colorspace_fragment>
  }
`;

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  uniform float uIntensity;
  uniform vec3 uLightDirection;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vNormal);
    float rim = 1.0 - abs(dot(normal, viewDirection));
    float softHalo = pow(clamp(rim, 0.0, 1.0), 2.6);
    float edgeSoftening = 1.0 - smoothstep(0.975, 1.0, rim) * 0.48;
    float directional = smoothstep(-0.2, 0.9, dot(normal, normalize(uLightDirection)));
    float illuminatedRim = softHalo * edgeSoftening * mix(0.25, 1.0, directional);
    vec3 haloColor = mix(uColor * 0.55, uColor, directional);
    gl_FragColor = vec4(haloColor, illuminatedRim * uIntensity * uFade);
    #include <colorspace_fragment>
  }
`;
