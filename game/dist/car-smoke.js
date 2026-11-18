import * as THREE from './vendor/three.module.min.js';

// What a damaged car gives off: grey smoke from under the bonnet, thicker and
// darker the worse it is, and a burst of bits where something has just been
// hit. One set of points for all of it.
const PUFFS = 360;

const VERTEX = /* glsl */`
attribute float aHeat;
attribute vec4 aLife;   // age 0..1, size in metres, darkness 0..1, opacity
varying vec4 vLife;
varying float vHeat;
void main() {
	vLife = aLife; vHeat = aHeat;
	vec4 view = modelViewMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * view;
	gl_PointSize = aLife.y * projectionMatrix[ 1 ][ 1 ] * uHeight / max( 0.1, - view.z );
}`;
const FRAGMENT = /* glsl */`
varying vec4 vLife;
varying float vHeat;
void main() {
	vec2 p = gl_PointCoord * 2.0 - 1.0;
	float soft = 1.0 - smoothstep( 0.25, 1.0, length( p ) );
	// Thin as it starts, thickest a little after, gone by the end.
	float fade = smoothstep( 0.0, 0.12, vLife.x ) * ( 1.0 - vLife.x );
	vec3 colour = mix( vec3( 0.62, 0.62, 0.6 ), vec3( 0.09, 0.09, 0.09 ), vLife.z );
	if (vHeat > 0.0) {
    float tip = clamp(.5-.5*p.y, 0.0, 1.0);
    vec2 tongue = vec2((p.x + .19*tip*sin(p.y*4.5+vLife.x*7.0))*(1.05+1.6*tip),p.y);
    float radius = length(tongue) + .07*sin(p.y*10.0+p.x*8.0+vLife.x*6.0);
    soft = 1.0-smoothstep(.40,1.0,radius);
    float core = max(0.0, 1.0 - radius - vLife.x * .48);
    colour = mix(vec3(.62,.035,.008), vec3(1.7, .44, .027), core);
    colour = mix(colour, vec3(2.5,1.9,.74), smoothstep(.47,.95,core) * vHeat);
  }
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
  const fireLight = new THREE.PointLight(0xff9a37, 0, 10, 2);
  let flicker = 0, flash = 0;
  // Each puff: where it is, how it is moving, how old it is and how long it lasts.
  const puffs = Array.from({ length: PUFFS }, () => ({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, span: 1, size: 1, grow: 0, dark: 0, opacity: 1, falls: false }));
  let next = 0; const owed = new Map();
  const emit = () => { const puff = puffs[next]; next = (next + 1) % PUFFS; puff.live = true; puff.age = 0; puff.heat = 0; return puff; };
  return {
    points,
    explosion(x, y, z) {
      fireLight.position.set(x,y+1.2,z); flash = .35;
      for (let i=0; i<62; i++) {
        const puff = emit(), angle = i * 2.4, speed = 1 + Math.random()*5, hot = i < 40;
        Object.assign(puff, { x, y: y+.75, z, vx: Math.cos(angle)*speed, vz: Math.sin(angle)*speed, vy: 1+Math.random()*4,
          span: hot ? .45 + Math.random()*.45 : 1.7 + Math.random(), size: hot ? .9 : 1.3, grow: hot ? 2.7 : 2,
          heat: hot ? 1 : 0, dark: .93, opacity: .88, falls: false });
      }
    },
    /** Bits thrown off where two things met: at (x, y, z), `force` in metres a second. */
    burst(x, y, z, force = 8) {
      const count = Math.min(26, Math.round(6 + force * 1.4));
      for (let i = 0; i < count; i++) {
        const puff = emit(), turn = Math.random() * Math.PI * 2, out = (.3 + Math.random()) * Math.min(7, force * .45);
        Object.assign(puff, { x, y: y + Math.random() * .5, z, vx: Math.sin(turn) * out, vy: 1 + Math.random() * 3.5, vz: Math.cos(turn) * out, span: .5 + Math.random() * .5, size: .06 + Math.random() * .09, grow: 0, dark: .25 + Math.random() * .6, opacity: 1, falls: true });
      }
      for (let i = 0; i < 5; i++) {
        const puff = emit();
        Object.assign(puff, { x: x + (Math.random() - .5) * .8, y: y + .2, z: z + (Math.random() - .5) * .8, vx: (Math.random() - .5), vy: .6 + Math.random(), vz: (Math.random() - .5), span: 1 + Math.random() * .6, size: .7, grow: 1.6, dark: .15, opacity: .4, falls: false });
      }
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
        const due = (owed.get(source.id) || 0) + dt * (source.burning ? 58 : 5 + source.amount * 20);
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
      if (nearest || flash) {
        if (!flash) fireLight.position.set(nearest.x+Math.sin(nearest.angle)*1.1,nearest.y+1.25,nearest.z+Math.cos(nearest.angle)*1.1);
        fireLight.intensity = flash ? 160*flash/.35 : 16+3*Math.sin(flicker*17)+2*Math.sin(flicker*31);
        if (!fireLight.parent) scene?.add(fireLight);
      } else if (fireLight.parent) fireLight.removeFromParent();
      if (owed.size > 40) owed.clear();
      for (let i = 0; i < PUFFS; i++) {
        const puff = puffs[i];
        if (puff.live) {
          puff.age += dt;
          if (puff.age >= puff.span) puff.live = false;
          else {
            if (puff.falls) puff.vy -= 14 * dt; else { const drag = Math.exp(-dt * .9); puff.vx *= drag; puff.vz *= drag; }
            puff.x += puff.vx * dt; puff.y += puff.vy * dt; puff.z += puff.vz * dt;
            position.setXYZ(i, puff.x, puff.y, puff.z);
            heat.setX(i, puff.heat);
            life.setXYZW(i, puff.age / puff.span, puff.size + puff.grow * puff.age, puff.dark, puff.opacity);
            continue;
          }
        }
        life.setXYZW(i, 1, 0, 0, 0);
      }
      position.needsUpdate = life.needsUpdate = heat.needsUpdate = true;
    },
    dispose() { geometry.dispose(); material.dispose(); points.removeFromParent(); fireLight.removeFromParent(); },
  };
}
