import * as THREE from './vendor/three.module.min.js';

// What of the police is drawn apart from their cars and their officers (which
// are drawn with the traffic and the crowd): the helicopter and its
// searchlight, and gunfire.
const TRACERS = 12, TRACER_LIFE = 0.09;
// The pool the searchlight throws: its radius on the ground in metres, and how bright (a street lamp is about 3).
const SEARCHLIGHT = { radius: 10, glow: [2.9, 3.05, 3.4] };

function createHelicopter() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x1c2a4a, metalness: .35, roughness: .5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: .2, roughness: .55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c1218, metalness: .7, roughness: .15 });
  const part = (geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); group.add(mesh); return mesh; };
  // Heading zero faces +Z, as everything in the simulation does.
  part(new THREE.SphereGeometry(1, 16, 12), body, 0, 0, 0, 1.05, 1.1, 2.3);
  part(new THREE.SphereGeometry(1, 14, 10), glass, 0, .12, 1.25, .9, .85, 1.25);
  part(new THREE.BoxGeometry(.32, .36, 4.6), body, 0, .35, -4);
  part(new THREE.BoxGeometry(2.2, .12, .5), trim, 0, 0, -.1);
  part(new THREE.BoxGeometry(.1, 1.3, .7), trim, 0, 1, -6.1);
  part(new THREE.CylinderGeometry(.12, .12, .5, 8), body, 0, 1.3, 0);
  for (const side of [-1, 1]) {
    part(new THREE.BoxGeometry(.1, .1, 3.4), trim, side * .95, -1.45, .1);
    part(new THREE.BoxGeometry(.07, .6, .07), trim, side * .8, -1.15, .9);
    part(new THREE.BoxGeometry(.07, .6, .07), trim, side * .8, -1.15, -.7);
  }
  const rotor = new THREE.Group(); rotor.position.y = 1.58; group.add(rotor);
  const blade = new THREE.MeshBasicMaterial({ color: 0x15181b, transparent: true, opacity: .55 });
  for (const turn of [0, Math.PI / 2]) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(11.5, .05, .34), blade); mesh.rotation.y = turn; rotor.add(mesh); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.05, 1.9, .16), blade); tail.position.set(.24, .55, -6.1); group.add(tail);
  const red = part(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2b2b }), 0, -1.12, -.3);
  const lamp = part(new THREE.SphereGeometry(.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), 0, -1, 1.6);
  group.userData = { rotor, tail, red, lamp };
  return group;
}

export function createPoliceScene(scene, heightAt = () => 0) {
  const helicopter = createHelicopter(); helicopter.visible = false; scene.add(helicopter);
  // The searchlight. What it lights is lit through the city's light map (the
  // caller passes `spots` on to it), so the street, the cars and the people
  // under it are bright and the rest of the block is not; all that is drawn
  // here is the shaft itself, faintly, as light catches the air.
  // It is brightest at the lamp and has thinned to nothing well before the ground, so that
  // somebody standing in the light looks out through clear air and not through a veil.
  const beamMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying float vDown; void main() { vDown = - position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: 'varying float vDown; void main() { float thin = pow( max( 1.0 - vDown / 0.7, 0.0 ), 2.0 ); gl_FragColor = vec4( vec3( 0.92, 0.95, 1.0 ) * 0.085 * thin, 1.0 ); }' });
  const beamShape = new THREE.CylinderGeometry(.4, 1, 1, 24, 1, true); beamShape.translate(0, -.5, 0);
  const beam = new THREE.Mesh(beamShape, beamMaterial); beam.visible = false; beam.frustumCulled = false; scene.add(beam);
  const spots = [], spot = { x: 0, z: 0, y: 0, radius: SEARCHLIGHT.radius, glow: SEARCHLIGHT.glow };
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: .85 });
  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACERS; i++) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMaterial); line.frustumCulled = false; line.visible = false; scene.add(line);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), flashMaterial); flash.visible = false; scene.add(flash);
    tracers.push({ line, flash });
  }
  const down = new THREE.Vector3(0, -1, 0), toward = new THREE.Vector3();
  return {
    helicopter,
    /** What the searchlight is lighting now, for the light map: [] or one { x, z, y, radius, glow }. */
    spots,
    update(police, time, shown = true) {
      const unit = shown ? police.helicopter : null;
      helicopter.visible = beam.visible = Boolean(unit);
      spots.length = 0;
      if (unit) {
        const speed = Math.hypot(unit.vx, unit.vz);
        helicopter.position.set(unit.x, unit.y, unit.z);
        helicopter.rotation.set(Math.min(.3, speed * .009), unit.angle, 0, 'YXZ');
        helicopter.userData.rotor.rotation.y = time * 38;
        helicopter.userData.tail.rotation.x = time * 50;
        helicopter.userData.red.visible = Math.sin(time * 7) > .4;
        // From the lamp under the nose down to where the light lands.
        const fromX = unit.x + Math.sin(unit.angle) * 1.6, fromY = unit.y - 1, fromZ = unit.z + Math.cos(unit.angle) * 1.6;
        const ground = heightAt(unit.light.x, unit.light.z) || 0;
        toward.set(unit.light.x - fromX, ground - fromY, unit.light.z - fromZ);
        const length = toward.length() || 1, spread = unit.leaving ? 0 : 7;
        beam.visible = spread > 0;
        beam.position.set(fromX, fromY, fromZ);
        beam.quaternion.setFromUnitVectors(down, toward.divideScalar(length));
        beam.scale.set(spread, length, spread);
        if (spread > 0) { spot.x = unit.light.x; spot.z = unit.light.z; spot.y = ground; spots.push(spot); }
      }
      const now = police.sim.elapsed, shots = shown ? police.shots : [];
      for (let i = 0; i < TRACERS; i++) {
        const shot = shots[shots.length - 1 - i], tracer = tracers[i], live = Boolean(shot) && now - shot.at < TRACER_LIFE;
        tracer.line.visible = tracer.flash.visible = live;
        if (!live) continue;
        const position = tracer.line.geometry.attributes.position;
        position.setXYZ(0, shot.x, shot.y, shot.z); position.setXYZ(1, shot.tx, shot.ty, shot.tz); position.needsUpdate = true;
        tracer.flash.position.set(shot.x, shot.y, shot.z);
      }
    },
  };
}
