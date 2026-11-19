// Time-of-day model for New York. Pure math, no renderer or browser dependencies.
//
// The sun follows the real solar geometry for NYC's latitude on July 12, the
// later Manhattanhenge date: at sunset it lines up with the cross-street grid.
// Clock hours are Eastern Daylight Time, so solar noon is close to 13:00.
// Colours come from a single-scattering atmosphere (Rayleigh, Mie and ozone).
// SKY_GLSL is the same integral for the GPU; keep the two in step.

const DEG = Math.PI / 180;
export const LATITUDE = 40.7128 * DEG;
export const SOLAR_DECLINATION = 21.9 * DEG;
export const SOLAR_NOON = 13;
export const DAY_HOURS = 24;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Unit vector toward a body with the given hour angle and declination. X east, Y up, Z south. */
function celestialDirection(hourAngle, declination) {
  const sinD = Math.sin(declination), cosD = Math.cos(declination), sinL = Math.sin(LATITUDE), cosL = Math.cos(LATITUDE);
  const east = -cosD * Math.sin(hourAngle);
  const north = cosL * sinD - sinL * cosD * Math.cos(hourAngle);
  const up = sinL * sinD + cosL * cosD * Math.cos(hourAngle);
  return [east, up, -north];
}

export function sunDirection(hours) {
  return celestialDirection((hours - SOLAR_NOON) * 15 * DEG, SOLAR_DECLINATION);
}

/** A full moon: opposite the sun, on the low summer arc. */
export function moonDirection(hours) {
  return celestialDirection((hours - SOLAR_NOON) * 15 * DEG + Math.PI, -SOLAR_DECLINATION * .9);
}

export const elevationOf = direction => Math.asin(clamp(direction[1], -1, 1));
/** Compass bearing in degrees clockwise from north. */
export const azimuthOf = direction => (Math.atan2(direction[0], -direction[2]) / DEG + 360) % 360;

// --- Atmosphere, kilometre units -------------------------------------------------
export const ATMOSPHERE = {
  groundRadius: 6360, topRadius: 6440, cameraAltitude: .05,
  rayleigh: [5.802e-3, 13.558e-3, 33.1e-3], rayleighHeight: 8,
  mie: 3.996e-3, mieExtinction: 4.44e-3, mieHeight: 1.2, mieG: .8,
  ozone: [.65e-3, 1.881e-3, .085e-3], ozoneCenter: 25, ozoneWidth: 15,
  viewSteps: 16, lightSteps: 6,
  // Single scattering leaves twilight too dark. This isotropic share of the
  // scattered light stands in for the missing higher orders.
  multipleScattering: .55,
};

function raySphere(origin, direction, radius) {
  const b = origin[0] * direction[0] + origin[1] * direction[1] + origin[2] * direction[2];
  const c = origin[0] * origin[0] + origin[1] * origin[1] + origin[2] * origin[2] - radius * radius;
  const h = b * b - c;
  if (h < 0) return null;
  const root = Math.sqrt(h);
  return [-b - root, -b + root];
}

function densitiesAt(altitude, a) {
  return [Math.exp(-altitude / a.rayleighHeight), Math.exp(-altitude / a.mieHeight),
    Math.max(0, 1 - Math.abs(altitude - a.ozoneCenter) / a.ozoneWidth)];
}

function depthToLight(point, light, a) {
  const ground = raySphere(point, light, a.groundRadius);
  if (ground && ground[0] > 0) return null; // The planet shadows this sample.
  const top = raySphere(point, light, a.topRadius);
  const step = top[1] / a.lightSteps, depth = [0, 0, 0];
  for (let i = 0; i < a.lightSteps; i++) {
    const t = (i + .5) * step;
    const q = [point[0] + light[0] * t, point[1] + light[1] * t, point[2] + light[2] * t];
    const d = densitiesAt(Math.hypot(q[0], q[1], q[2]) - a.groundRadius, a);
    depth[0] += d[0] * step; depth[1] += d[1] * step; depth[2] += d[2] * step;
  }
  return depth;
}

/**
 * In-scattered radiance along `view` for unit irradiance from `light`.
 * Both are unit vectors in world axes. Returns { radiance, transmittance }.
 */
export function scatter(view, light, a = ATMOSPHERE) {
  const origin = [0, a.groundRadius + a.cameraAltitude, 0];
  let end = raySphere(origin, view, a.topRadius)[1];
  const ground = raySphere(origin, view, a.groundRadius);
  if (ground && ground[0] > 0) end = ground[0];
  const depth = [0, 0, 0], sumR = [0, 0, 0], sumM = [0, 0, 0];
  let previous = 0;
  for (let i = 0; i < a.viewSteps; i++) {
    // Quadratic spacing puts samples where the air is dense, near the eye.
    const next = end * ((i + 1) / a.viewSteps) ** 2, t = (previous + next) / 2, dt = next - previous;
    previous = next;
    const p = [origin[0] + view[0] * t, origin[1] + view[1] * t, origin[2] + view[2] * t];
    const d = densitiesAt(Math.hypot(p[0], p[1], p[2]) - a.groundRadius, a);
    depth[0] += d[0] * dt * .5; depth[1] += d[1] * dt * .5; depth[2] += d[2] * dt * .5;
    const toLight = depthToLight(p, light, a);
    if (toLight) for (let c = 0; c < 3; c++) {
      const tau = a.rayleigh[c] * (depth[0] + toLight[0]) + a.mieExtinction * (depth[1] + toLight[1]) + a.ozone[c] * (depth[2] + toLight[2]);
      const attenuation = Math.exp(-tau);
      sumR[c] += d[0] * attenuation * dt; sumM[c] += d[1] * attenuation * dt;
    }
    depth[0] += d[0] * dt * .5; depth[1] += d[1] * dt * .5; depth[2] += d[2] * dt * .5;
  }
  const mu = view[0] * light[0] + view[1] * light[1] + view[2] * light[2], g = a.mieG;
  const phaseR = 3 / (16 * Math.PI) * (1 + mu * mu);
  const phaseM = 3 / (8 * Math.PI) * ((1 - g * g) * (1 + mu * mu)) / ((2 + g * g) * (1 + g * g - 2 * g * mu) ** 1.5);
  const isotropic = a.multipleScattering / (4 * Math.PI);
  const radiance = [0, 1, 2].map(c => sumR[c] * a.rayleigh[c] * (phaseR + isotropic) + sumM[c] * a.mie * (phaseM + isotropic));
  const transmittance = [0, 1, 2].map(c => Math.exp(-(a.rayleigh[c] * depth[0] + a.mieExtinction * depth[1] + a.ozone[c] * depth[2])));
  return { radiance, transmittance };
}

/** Fraction of a light's irradiance that survives the path down to the ground. */
export function directTransmittance(light, a = ATMOSPHERE) {
  const origin = [0, a.groundRadius + a.cameraAltitude, 0];
  const depth = depthToLight(origin, light, a);
  if (!depth) return [0, 0, 0];
  return [0, 1, 2].map(c => Math.exp(-(a.rayleigh[c] * depth[0] + a.mieExtinction * depth[1] + a.ozone[c] * depth[2])));
}

// --- Lighting rig ---------------------------------------------------------------
// Scene-referred units. A white wall square to the midday sun reflects about
// 1.7; the clear zenith is about a fifth of that, as outdoors.
export const SUN_IRRADIANCE = 13;      // Drives the sky integral.
// Single scattering under-fills the dome, so image-based ambient light is
// raised to keep open shade near a fifth of direct sun.
/** How much of the direct sunlight reaches shaded surfaces after one bounce off the city. */
export const BOUNCE_SHARE = .06;
export const ENVIRONMENT_INTENSITY = 1.55;
export const SUN_LIGHT = 6.4;          // Directional light intensity at zero air mass.
export const MOON_IRRADIANCE = .028;   // Sky glow from a full moon, heavily flattered.
export const MOON_LIGHT = .2;
// New York never gets dark: sodium and LED glow fills the lower sky.
export const SKYGLOW_ZENITH = [.0036, .0047, .0092];
export const SKYGLOW_HORIZON = [.03, .0215, .0185];

// Twilight is ozone and multiple scattering, which the integral above lacks.
// These are observed dusk colours instead: a blue dome, an orange seam where
// the sun went down, pink above it and a dusty violet band opposite.
const TWILIGHT = { zenith: [.013, .028, .074], mid: [.026, .043, .091], orange: [.48, .22, .06], pink: [.165, .087, .104], anti: [.056, .043, .074] };
export const twilightAmount = sunElevation => smoothstep(4.5, -2.5, sunElevation) * Math.min(1, Math.exp((sunElevation + 3.6) * .37));

export function twilightRadiance(view, sun, sunElevation) {
  const amount = twilightAmount(sunElevation);
  if (amount <= 0) return [0, 0, 0];
  const h = clamp(view[1], 0, 1);
  const sunLength = Math.hypot(sun[0], sun[2]) || 1, viewLength = Math.hypot(view[0], view[2]) || 1;
  const toward = (sun[0] * view[0] + sun[2] * view[2]) / (sunLength * viewLength) * .5 + .5;
  const deep = smoothstep(-2, -10, sunElevation);
  const low = Math.exp(-h * mix(6.5, 13, deep)), band = Math.exp(-h * 3.2), seam = toward ** 3;
  const base = mix3(TWILIGHT.mid, TWILIGHT.zenith, Math.sqrt(h));
  const orange = low * seam, pink = band * (.25 + .75 * toward * toward) * (1 - .5 * orange), anti = low * (1 - toward) ** 2;
  return [0, 1, 2].map(c => (base[c] + TWILIGHT.orange[c] * orange + TWILIGHT.pink[c] * pink + TWILIGHT.anti[c] * anti) * amount);
}

const directionFromAngles = (azimuthDeg, elevationDeg) => {
  const az = azimuthDeg * DEG, el = elevationDeg * DEG;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
};

/** Sky radiance toward `view`, combining sun, moon and city glow. */
export function skyRadiance(view, state) {
  const sun = scatter(view, state.sunDirection).radiance, moon = scatter(view, state.moonDirection).radiance;
  const glow = mix3(SKYGLOW_HORIZON, SKYGLOW_ZENITH, Math.pow(clamp(view[1], 0, 1), .45));
  const twilight = twilightRadiance(view, state.sunDirection, state.sunElevation);
  return [0, 1, 2].map(c => sun[c] * SUN_IRRADIANCE + moon[c] * MOON_IRRADIANCE + glow[c] * state.night + twilight[c]);
}

/**
 * Everything the renderer needs for one clock time.
 * `hours` wraps, so 25.5 means 01:30.
 */
export function skyState(hours) {
  const clock = ((hours % DAY_HOURS) + DAY_HOURS) % DAY_HOURS;
  const sun = sunDirection(clock), moon = moonDirection(clock);
  const sunElevation = elevationOf(sun) / DEG, moonElevation = elevationOf(moon) / DEG;
  // 0 in daylight, 1 once the sun is 9 degrees under: the end of usable dusk.
  const night = smoothstep(1.5, -9, sunElevation);
  // Windows and street lamps come on through civil twilight.
  const lightsOn = smoothstep(4, -5, sunElevation);
  // Past half ten the city thins out; it stays quiet until first light.
  const late = smoothstep(22.5, 26.5, clock < 12 ? clock + 24 : clock);
  const state = { hours: clock, sunDirection: sun, moonDirection: moon, sunElevation, moonElevation, night, lightsOn, late };

  // The sun's disc is half a degree wide and refraction lifts it, so sunlight
  // lingers slightly past the geometric horizon and fades instead of cutting.
  const sunFade = smoothstep(-1.2, 1.4, sunElevation);
  const sunPath = directTransmittance([sun[0], Math.max(sun[1], .012), sun[2]]);
  state.sunColor = scale3(sunPath, SUN_LIGHT * sunFade);
  const moonFade = smoothstep(-1, 4, moonElevation) * night;
  const moonPath = directTransmittance([moon[0], Math.max(moon[1], .02), moon[2]]);
  // Moonlight is sunlight; the blue cast is how eyes and cameras render it.
  state.moonColor = [moonPath[0] * .62, moonPath[1] * .78, moonPath[2] * 1.05].map(v => v * MOON_LIGHT * moonFade);
  // One shadow-casting key light. Hand over from sun to moon in deep dusk,
  // when neither casts a readable shadow.
  const useMoon = sunFade < .02 && moonFade > 0;
  state.keyDirection = useMoon ? moon : sun;
  state.keyColor = useMoon ? state.moonColor : state.sunColor;
  state.keyIsMoon = useMoon;

  // Ambient light: sample the dome the way a diffuse surface would see it.
  const zenith = skyRadiance([0, 1, 0], state);
  const sunAzimuth = azimuthOf(sun);
  let band = [0, 0, 0], horizon = [0, 0, 0];
  for (const offset of [0, 90, 180, 270]) {
    band = add3(band, scale3(skyRadiance(directionFromAngles(sunAzimuth + offset + 45, 35), state), .25));
    horizon = add3(horizon, scale3(skyRadiance(directionFromAngles(sunAzimuth + offset + 45, 3), state), .25));
  }
  state.zenithColor = zenith;
  state.horizonColor = horizon;
  // Irradiance on an upward surface is roughly pi times the mean radiance.
  state.ambientSky = scale3(add3(scale3(zenith, .35), scale3(band, .65)), Math.PI);
  // Light bounced off streets and facades below. Most of a dense city's
  // ground is in shadow, so only a part of the direct sun reaches it.
  const groundAlbedo = [.2, .19, .175];
  const down = add3(scale3(state.keyColor, Math.max(state.keyDirection[1], 0) * .45), state.ambientSky);
  state.ambientGround = [0, 1, 2].map(c => down[c] * groundAlbedo[c]);
  state.groundRadiance = scale3(state.ambientGround, 1 / Math.PI);
  // City shade is not lit by the sky alone: sunlit walls and pavements throw
  // a share of the sunlight back into the streets beside them. A low sun
  // still strikes the upper walls squarely, so the share never falls to zero.
  state.bounce = scale3(state.sunColor, (.35 + .65 * Math.max(sun[1], 0)) * BOUNCE_SHARE);

  // Haze takes the colour of the horizon it dissolves into. Toward the sun
  // it glows with forward-scattered light.
  state.fogColor = horizon;
  const sunward = skyRadiance(directionFromAngles(sunAzimuth, clamp(sunElevation, 1.5, 12)), state);
  state.fogSunColor = mix3(horizon, sunward, .75);
  state.fogDensity = mix(.000105, .00015, night);

  // Exposure follows the light the way a camera operator would.
  // A low sun leaves most of a street in shade, so the lens stays open until the sun is well up.
  const day = smoothstep(-2, 24, sunElevation);
  state.exposure = mix(mix(5.2, 2.1, smoothstep(-12, -2, sunElevation)), .84, day);
  state.starVisibility = smoothstep(-4, -12, sunElevation);
  return state;
}

export const TIME_PRESETS = [
  { id: 'morning', label: 'MORNING', hours: 8.25 },
  { id: 'midday', label: 'MIDDAY', hours: 13.5 },
  { id: 'golden', label: 'GOLDEN HOUR', hours: 19.55 },
  { id: 'dusk', label: 'DUSK', hours: 20.72 },
  { id: 'night', label: 'NIGHT', hours: 23.25 },
];

export function formatClock(hours, twentyFourHour = false) {
  const clock = ((hours % DAY_HOURS) + DAY_HOURS) % DAY_HOURS;
  let h = Math.floor(clock), m = Math.round((clock - h) * 60);
  if (m === 60) { m = 0; h = (h + 1) % 24; }
  if (twentyFourHour) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// --- The same atmosphere for the GPU ---------------------------------------------
const vec3 = values => `vec3(${values.map(value => value.toExponential(6)).join(', ')})`;
const float = value => value.toExponential(6);
export const SKY_GLSL = /* glsl */`
const float ATMO_RG = ${float(ATMOSPHERE.groundRadius)};
const float ATMO_RT = ${float(ATMOSPHERE.topRadius)};
const float ATMO_ALT = ${float(ATMOSPHERE.cameraAltitude)};
const vec3 ATMO_BR = ${vec3(ATMOSPHERE.rayleigh)};
const float ATMO_BM = ${float(ATMOSPHERE.mie)};
const float ATMO_BME = ${float(ATMOSPHERE.mieExtinction)};
const vec3 ATMO_BO = ${vec3(ATMOSPHERE.ozone)};
const float ATMO_HR = ${float(ATMOSPHERE.rayleighHeight)};
const float ATMO_HM = ${float(ATMOSPHERE.mieHeight)};
const float ATMO_G = ${float(ATMOSPHERE.mieG)};
const float ATMO_MS = ${float(ATMOSPHERE.multipleScattering)};
const int ATMO_VIEW_STEPS = ${ATMOSPHERE.viewSteps};
const int ATMO_LIGHT_STEPS = ${ATMOSPHERE.lightSteps};

vec2 atmoRaySphere(vec3 origin, vec3 direction, float radius) {
  float b = dot(origin, direction), c = dot(origin, origin) - radius * radius, h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
vec3 atmoDensities(float altitude) {
  return vec3(exp(-altitude / ATMO_HR), exp(-altitude / ATMO_HM),
    max(0.0, 1.0 - abs(altitude - ${float(ATMOSPHERE.ozoneCenter)}) / ${float(ATMOSPHERE.ozoneWidth)}));
}
// Returns w < 0 when the planet shadows the sample.
vec4 atmoDepthToLight(vec3 point, vec3 light) {
  vec2 ground = atmoRaySphere(point, light, ATMO_RG);
  if (ground.x > 0.0) return vec4(0.0, 0.0, 0.0, -1.0);
  float stepLength = atmoRaySphere(point, light, ATMO_RT).y / float(ATMO_LIGHT_STEPS);
  vec3 depth = vec3(0.0);
  for (int i = 0; i < ATMO_LIGHT_STEPS; i++) {
    vec3 q = point + light * ((float(i) + 0.5) * stepLength);
    depth += atmoDensities(length(q) - ATMO_RG) * stepLength;
  }
  return vec4(depth, 1.0);
}
vec3 atmoScatter(vec3 view, vec3 light) {
  vec3 origin = vec3(0.0, ATMO_RG + ATMO_ALT, 0.0);
  float end = atmoRaySphere(origin, view, ATMO_RT).y;
  vec2 ground = atmoRaySphere(origin, view, ATMO_RG);
  if (ground.x > 0.0) end = ground.x;
  vec3 depth = vec3(0.0), sumR = vec3(0.0), sumM = vec3(0.0);
  float previous = 0.0;
  for (int i = 0; i < ATMO_VIEW_STEPS; i++) {
    float fraction = float(i + 1) / float(ATMO_VIEW_STEPS);
    float next = end * fraction * fraction, t = (previous + next) * 0.5, dt = next - previous;
    previous = next;
    vec3 p = origin + view * t;
    vec3 d = atmoDensities(length(p) - ATMO_RG);
    depth += d * dt * 0.5;
    vec4 toLight = atmoDepthToLight(p, light);
    if (toLight.w > 0.0) {
      vec3 tau = ATMO_BR * (depth.x + toLight.x) + ATMO_BME * (depth.y + toLight.y) + ATMO_BO * (depth.z + toLight.z);
      vec3 attenuation = exp(-tau);
      sumR += d.x * attenuation * dt; sumM += d.y * attenuation * dt;
    }
    depth += d * dt * 0.5;
  }
  float mu = dot(view, light);
  float phaseR = 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu);
  float phaseM = 3.0 / (8.0 * 3.14159265) * ((1.0 - ATMO_G * ATMO_G) * (1.0 + mu * mu))
    / ((2.0 + ATMO_G * ATMO_G) * pow(1.0 + ATMO_G * ATMO_G - 2.0 * ATMO_G * mu, 1.5));
  float isotropic = ATMO_MS / (4.0 * 3.14159265);
  return sumR * ATMO_BR * (phaseR + isotropic) + sumM * ATMO_BM * (phaseM + isotropic);
}
vec3 atmoCityGlow(vec3 view) {
  return mix(${vec3(SKYGLOW_HORIZON)}, ${vec3(SKYGLOW_ZENITH)}, pow(clamp(view.y, 0.0, 1.0), 0.45));
}
vec3 atmoTwilight(vec3 view, vec3 sun, float sunElevation) {
  // GLSL leaves smoothstep undefined unless its first edge is the lower one.
  float amount = (1.0 - smoothstep(-2.5, 4.5, sunElevation)) * min(1.0, exp((sunElevation + 3.6) * 0.37));
  if (amount <= 0.0) return vec3(0.0);
  float h = clamp(view.y, 0.0, 1.0);
  float toward = dot(sun.xz, view.xz) / max(length(sun.xz) * length(view.xz), 1e-5) * 0.5 + 0.5;
  float deep = 1.0 - smoothstep(-10.0, -2.0, sunElevation);
  float low = exp(-h * mix(6.5, 13.0, deep)), band = exp(-h * 3.2), seam = toward * toward * toward;
  vec3 base = mix(${vec3(TWILIGHT.mid)}, ${vec3(TWILIGHT.zenith)}, sqrt(h));
  float orange = low * seam, pink = band * (0.25 + 0.75 * toward * toward) * (1.0 - 0.5 * orange), anti = low * (1.0 - toward) * (1.0 - toward);
  return (base + ${vec3(TWILIGHT.orange)} * orange + ${vec3(TWILIGHT.pink)} * pink + ${vec3(TWILIGHT.anti)} * anti) * amount;
}
`;
