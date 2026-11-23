import * as THREE from './vendor/three.module.min.js';
import { shared } from './gfx-common.js';

// What a damaged car gives off: grey smoke from under the bonnet, thicker and
// darker the worse it is, and a burst of bits where something has just been
// hit. One set of points for all of it.
const PUFFS = 560;

const VERTEX = /* glsl */`
attribute float aHeat;
attribute vec4 aLife;   // age 0..1, size in metres, darkness 0..1, opacity
varying vec4 vLife;
varying float vHeat;
void main() {
	vLife = aLife; vHeat = aHeat;
	vec4 view = modelViewMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * view;
	// Limit overdraw when the driver or the chase camera is inside a plume.
  float diameter = aLife.y * projectionMatrix[ 1 ][ 1 ] * uHeight / max( .1, -view.z );
  gl_PointSize = min( diameter, min( 144.0, uHeight * .36 ) );
  vLife.w *= smoothstep( .12, .65, -view.z );
}`;
const FRAGMENT = /* glsl */`
varying vec4 vLife;
varying float vHeat;
void main() {
	vec2 p = gl_PointCoord * 2.0 - 1.0;
	float radius2 = dot( p, p );
  if ( radius2 > 1.0 || vLife.w < .005 ) discard;
  float soft = 1.0 - smoothstep( .25, 1.0, sqrt( radius2 ) );
	// Thin as it starts, thickest a little after, gone by the end.
	float fade = smoothstep( 0.0, 0.12, vLife.x ) * ( 1.0 - vLife.x );
	vec3 colour = mix( vec3( 0.62, 0.62, 0.6 ), vec3( 0.09, 0.09, 0.09 ), vLife.z );
	if (vHeat > 1.5) {
    float facet = abs(p.x+.36*p.y)+abs(p.y)*.82;
    soft = 1.0-smoothstep(.64,.91,facet);
    colour = mix(vec3(.32,.50,.54),vec3(1.2,1.28,1.31),.5+.5*cos(vLife.x*16.0+vLife.z*23.0));
  } else if (vHeat > 0.0) {
    float tip = clamp(.5-.5*p.y, 0.0, 1.0);
    vec2 tongue = vec2((p.x + .19*tip*sin(p.y*4.5+vLife.x*7.0))*(1.05+1.6*tip),p.y);
    float radius = length(tongue) + .07*sin(p.y*10.0+p.x*8.0+vLife.x*6.0);
    soft = 1.0-smoothstep(.40,1.0,radius);
    float core = max(0.0, 1.0 - radius - vLife.x * .48);
    colour = mix(vec3(.62,.035,.008), vec3(1.7, .44, .027), core);
    colour = mix(colour, vec3(2.5,1.9,.74), smoothstep(.47,.95,core) * vHeat);
  }
  // Below zero it is not heat but blood: a dark red mist where a bullet went in.
  if (vHeat < 0.0) colour = mix( vec3( 0.36, 0.015, 0.015 ), vec3( 0.10, 0.0, 0.0 ), vLife.z );
  gl_FragColor = vec4( colour, soft * fade * vLife.w );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createCarSmoke(scene) {
  const position = new THREE.BufferAttribute(new Float32Array(PUFFS * 3), 3), life = new THREE.BufferAttribute(new Float32Array(PUFFS * 4), 4);
  const heat = new THREE.BufferAttribute(new Float32Array(PUFFS), 1);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('aHeat', heat); geometry.setAttribute('position', position); geometry.setAttribute('aLife', life);
  const material = new THREE.ShaderMaterial({ vertexShader: 'uniform float uHeight;\n' + VERTEX, fragmentShader: FRAGMENT, uniforms: { uHeight: { value: 500 } }, transparent: true, depthWrite: false });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; points.name = 'Car smoke'; points.renderOrder = 6; scene?.add(points);
  for (const attribute of [position,life,heat]) attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setDrawRange(0,0);
  // Changing the number of scene lights at ignition recompiles every lit material.
  const fireLight = shared.uNycFire.value;
  let flicker = 0, flash = 0;
  // Each puff: where it is, how it is moving, how old it is and how long it lasts.
  const puffs = Array.from({ length: PUFFS }, () => ({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, span: 1, size: 1, grow: 0, dark: 0, opacity: 1, falls: false }));
  let next = 0; const owed = new Map();
  const emit = () => { const puff = puffs[next]; next = (next + 1) % PUFFS; puff.live = true; puff.age = 0; puff.heat = 0; return puff; };
  return {
    points,
    explosion(x, y, z) {
      fireLight.set(x,y+1.2,z,160); flash = .35;
      for (let i=0; i<62; i++) {
        const puff = emit(), angle = i * 2.4, speed = 1 + Math.random()*5, hot = i < 40;
        Object.assign(puff, { x, y: y+.75, z, vx: Math.cos(angle)*speed, vz: Math.sin(angle)*speed, vy: 1+Math.random()*4,
          span: hot ? .45 + Math.random()*.45 : 1.7 + Math.random(), size: hot ? .9 : 1.3, grow: hot ? 2.7 : 2,
          heat: hot ? 1 : 0, dark: .93, opacity: .88, falls: false });
      }
    },
    /** Bits thrown off where two things met: at (x, y, z), `force` in metres a second. */
    burst(x, y, z, force = 8, contact) {
      const count = Math.min(22, Math.round(Math.max(0,force-4) * .8));
      for (let i = 0; i < count; i++) {
        const puff = emit(), turn = Math.random() * Math.PI * 2, out = (.3 + Math.random()) * Math.min(7, force * .45);
        Object.assign(puff, { x, y: y + Math.random() * .5, z, vx: Math.sin(turn) * out, vy: 1 + Math.random() * 3.5, vz: Math.cos(turn) * out, span: .5 + Math.random() * .5, size: .06 + Math.random() * .09, grow: 0, dark: .25 + Math.random() * .6, opacity: 1, falls: true });
      }
      if (contact?.shattered) {
        for (let i=0; i<18; i++) {
          const along=(Math.random()-.5)*.8, outward=Math.random()*1.7;
          Object.assign(emit(), { x:x+along*contact.nz, y:y+.48+Math.random()*.3, z:z-along*contact.nx,
            vx:-contact.nx*outward+(Math.random()-.5)*2, vy:Math.random()*1.8, vz:-contact.nz*outward+(Math.random()-.5)*2,
            span:.32+Math.random()*.22, size:.025+Math.random()*.034, grow:0, dark:Math.random(), opacity:.93, falls:true, heat:2 });
        }
      }
      const dust=contact ? (contact.dusty ? Math.min(5,Math.floor(force/5)) : 0) : 5;
      for (let i = 0; i < dust; i++) {
        const puff = emit();
        Object.assign(puff, { x: x + (Math.random() - .5) * .8, y: y + .2, z: z + (Math.random() - .5) * .8, vx: (Math.random() - .5), vy: .6 + Math.random(), vz: (Math.random() - .5), span: 1 + Math.random() * .6, size: .7, grow: 1.6, dark: .15, opacity: .4, falls: false });
      }
    },
    /**
     * Steam off the street: the city's heating mains run under the avenues and breathe through the manholes. A vent at
     * (x, y, z) gives a slow white plume that leans with the air and thins as it climbs. Call it every frame it is in view.
     */
    steam(x, y, z, dt, id) {
      const due = (owed.get(id) || 0) + dt * 8, whole = Math.floor(due); owed.set(id, due - whole);
      for (let i = 0; i < whole; i++) Object.assign(emit(), { x: x + (Math.random() - .5) * .5, y: y + .05, z: z + (Math.random() - .5) * .5,
        vx: .22 + (Math.random() - .5) * .3, vy: .8 + Math.random() * .8, vz: (Math.random() - .5) * .3,
        span: 2.8 + Math.random() * 1.8, size: .3, grow: .95, dark: 0, opacity: .16 + Math.random() * .1, falls: false });
    },
    /**
     * Where a bullet lands, at (x, y, z); (dx, dy, dz) is the way it was going. `kind` is what it hit: 'body' throws a
     * little dark mist back along the shot and out the far side, 'metal' a few sparks, anything else grit and a puff of dust.
     */
    impact(x, y, z, dx, dy, dz, kind = 'wall') {
      const back = (spread, speed) => ({ vx: -dx * speed + (Math.random() - .5) * spread, vy: -dy * speed + (Math.random() - .3) * spread, vz: -dz * speed + (Math.random() - .5) * spread });
      if (kind === 'glass') {
        for (let i = 0; i < 24; i++) Object.assign(emit(), { x:x+(Math.random()-.5)*.4, y:y+(Math.random()-.5)*.65, z:z+(Math.random()-.5)*.4,
          ...back(4.4,Math.random()*2-.8),span:.38+Math.random()*.35,size:.025+Math.random()*.055,grow:0,dark:0,opacity:1,falls:true,heat:2 });
        return;
      }
      if (kind === 'body') {
        for (let i = 0; i < 9; i++) Object.assign(emit(), { x, y, z, ...back(1.1, .9 + Math.random() * 1.4), span: .28 + Math.random() * .22, size: .05 + Math.random() * .06, grow: .5, dark: Math.random() * .7, opacity: .85, falls: true, heat: -1 });
        for (let i = 0; i < 5; i++) Object.assign(emit(), { x: x + dx * .25, y: y + dy * .25, z: z + dz * .25, vx: dx * (1.5 + Math.random() * 2) + (Math.random() - .5) * .8, vy: dy * 2 + (Math.random() - .4) * .8, vz: dz * (1.5 + Math.random() * 2) + (Math.random() - .5) * .8,
          span: .3 + Math.random() * .25, size: .04 + Math.random() * .05, grow: .6, dark: .2 + Math.random() * .6, opacity: .8, falls: true, heat: -1 });
        return;
      }
      if (kind === 'metal') for (let i = 0; i < 7; i++) Object.assign(emit(), { x, y, z, ...back(3.2, 2 + Math.random() * 4), span: .12 + Math.random() * .2, size: .025 + Math.random() * .03, grow: 0, dark: 0, opacity: 1, falls: true, heat: 1 });
      for (let i = 0; i < (kind === 'metal' ? 3 : 8); i++) Object.assign(emit(), { x, y, z, ...back(1.6, .6 + Math.random() * 2.2), span: .25 + Math.random() * .3, size: .03 + Math.random() * .04, grow: 0, dark: .2 + Math.random() * .5, opacity: 1, falls: true });
      for (let i = 0; i < 3; i++) Object.assign(emit(), { x, y, z, ...back(.5, .5 + Math.random() * .6), span: .7 + Math.random() * .5, size: .16, grow: .9, dark: .1 + Math.random() * .2, opacity: .32, falls: false });
    },
    /**
     * @param {number} dt seconds
     * @param {Array} sources cars giving off smoke: { id, x, y, z, angle, amount } with amount from 0 (a wisp) to 1 (pouring)
     * @param {number} height of the picture in pixels, so that a puff is the size it should be
     */
    update(dt, sources, height, focus = null) {
      material.uniforms.uHeight.value = height * .5;
      let nearest = null, range = Infinity;
      for (const source of sources) {
        if (source.burning) {
          const away = focus ? Math.hypot(source.x-focus.x,source.z-focus.z) : 0;
          if (away < range) { nearest = source; range = away; }
        }
        const due = (owed.get(source.id) || 0) + dt * (source.burning ? 38 : 5 + source.amount * 20);
        const whole = Math.floor(due); owed.set(source.id, due - whole);
        const sin = Math.sin(source.angle), cos = Math.cos(source.angle);
        for (let i = 0; i < whole; i++) {
          const puff = emit(), side = (Math.random() - .5) * .9;
          const flame = source.burning && Math.random() < .68;
          Object.assign(puff, { x: source.x + sin * 1.55 + cos * side, y: source.y + 1, z: source.z + cos * 1.55 - sin * side, vx: (Math.random() - .5) * .5 + (source.vx || 0) * .25, vy: 1.1 + Math.random() * .9, vz: (Math.random() - .5) * .5 + (source.vz || 0) * .25,
            span: 1.6 + Math.random() * 1.2 + source.amount, size: .45, grow: 1.1 + source.amount, dark: Math.min(1, .15 + source.amount * .8 + Math.random() * .15), opacity: .3 + source.amount * .45, falls: false });
          if (flame) Object.assign(puff, { heat: 1, vy: 2.7 + Math.random()*2.2, size: .55+Math.random()*.55,
            span: .35+Math.random()*.48, grow: .22, opacity: .95, y: source.y+.80 });
        }
      }
      flicker += dt; flash = Math.max(0,flash-dt);
      if (flash > 0) fireLight.w = 160*flash/.35;
      else if (nearest) fireLight.set(nearest.x+Math.sin(nearest.angle)*1.1,nearest.y+1.25,nearest.z+Math.cos(nearest.angle)*1.1,
        16+3*Math.sin(flicker*17)+2*Math.sin(flicker*31));
      else fireLight.w = 0;
      if (owed.size > 40) owed.clear();
      let count = 0;
      for (let i = 0; i < PUFFS; i++) {
        const puff = puffs[i];
        if (!puff.live) continue;
        puff.age += dt;
        if (puff.age >= puff.span) { puff.live = false; continue; }
        if (puff.falls) puff.vy -= 14 * dt;
        else { const drag = Math.exp(-dt * .9); puff.vx *= drag; puff.vz *= drag; }
        puff.x += puff.vx * dt; puff.y += puff.vy * dt; puff.z += puff.vz * dt;
        position.setXYZ(count, puff.x, puff.y, puff.z);
        heat.setX(count, puff.heat);
        life.setXYZW(count, puff.age / puff.span, puff.size + puff.grow * puff.age, puff.dark, puff.opacity);
        count++;
      }
      geometry.setDrawRange(0,count);
      if (count) {
        for (const attribute of [position,life,heat]) {
          attribute.clearUpdateRanges();
          attribute.addUpdateRange(0,count*attribute.itemSize);
          attribute.needsUpdate = true;
        }
      }
    },
    dispose() { geometry.dispose(); material.dispose(); points.removeFromParent(); fireLight.w = 0; },
  };
}
