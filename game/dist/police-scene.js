import * as THREE from './vendor/three.module.min.js';
import { planPolicePosts, createPoliceDetails } from './police-details.js';
import { equipmentFor, placeEquipment, createPoliceHelicopter } from './police-equipment.js';
import { UNIT } from './police-units.js';

// What of the police is drawn apart from their cars and their officers (which
// are drawn with the traffic and the crowd): the helicopter and its
// searchlight, and gunfire.
const FLASH_COUNT = 12, FLASH_LIFE = 0.05;
// The pool the searchlight throws: its radius on the ground in metres, and how bright (a street lamp is about 3).
const SEARCHLIGHT = { radius: 10, glow: [2.9, 3.05, 3.4] };

export function createPoliceScene(scene, heightAt = () => 0) {
  const details = createPoliceDetails(), equipment = new Map(), field = new THREE.Group();
  field.name = 'Police field details';
  scene.add(field);
  let previousPlan;
  const visibleActors=[], deployedIds=new Set();
  function nearestFacing(player,actors,reach){
    let nearest=null;
    for(const actor of actors){
      const dx=actor.x-player.x,dz=actor.z-player.z,d=Math.hypot(dx,dz);
      if(d>=reach || Math.abs(player.y-actor.y)>2.5 ||
        (d>1.4 && dx*Math.sin(player.angle)+dz*Math.cos(player.angle)<d*.3))continue;
      nearest=actor;reach=d;
    }
    return nearest;
  }
  const helicopter = createPoliceHelicopter(); helicopter.visible = false; scene.add(helicopter);
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
  const flashMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  // The flash at a muzzle: a tongue of burning gas thrown forward and a few short spikes out to the sides, white where
  // it is hottest and fading to orange at its tips. It points along +Z, the way the shot goes, and is a hand's length long.
  const flashShape = (() => {
    const position = [], color = [], hot = [1, .95, .8], tip = [.9, .32, .04];
    // A flat diamond from the muzzle out to the point (cx, cy, cz), widest a third of the way along: (ax, ay) is half its width.
    const blade = (ax, ay, cx, cy, cz) => {
      for (const side of [-1, 1]) { position.push(0, 0, 0, ax * side + cx * .34, ay * side + cy * .34, cz * .34, cx, cy, cz); color.push(...hot, ...hot, ...tip); }
    };
    // The tongue, as two diamonds crossed.
    blade(.022, 0, 0, 0, .19); blade(0, .022, 0, 0, .19);
    // The spikes: five, unevenly round the barrel, leaning a little forward.
    for (const [turn, reach] of [[.3, .085], [1.5, .06], [2.7, .075], [3.9, .055], [5.2, .07]]) {
      const x = Math.cos(turn) * reach, y = Math.sin(turn) * reach;
      blade(-Math.sin(turn) * .012, Math.cos(turn) * .012, x, y, .035);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    return geometry;
  })();
  const flashes = [];
  for (let i = 0; i < FLASH_COUNT; i++) {
    const flash = new THREE.Mesh(flashShape, flashMaterial);
    flash.name = 'Muzzle flash';
    flash.visible = false; flash.frustumCulled = false;
    scene.add(flash); flashes.push(flash);
  }
  const down = new THREE.Vector3(0, -1, 0), toward = new THREE.Vector3();
  return {
    helicopter, details,
    plan(context) {
      const last = previousPlan;
      if (last && last.fronts === context.fronts && last.kerbs === context.kerbs &&
          last.entrances === context.entrances && last.park === context.park && last.parkRegions === context.parkRegions &&
          last.junctions===context.junctions && Math.floor((last.time||0)/5)===Math.floor((context.time||0)/5) &&
          Math.hypot(context.focus.x - last.x, context.focus.z - last.z) < 15) return;
      previousPlan = { ...context, x:context.focus.x, z:context.focus.z };
      const previousJunction=details.actors.find(a=>a.post.junction)?.post;
      details.set(planPolicePosts({...context,previousJunction}));
      for (const [id, entry] of equipment) {
        if (details.actors.some(actor => actor.id === id && actor.unit === entry.unit)) continue;
        if (entry.model) field.remove(entry.model);
        equipment.delete(id);
      }
    },
    drawDetails(shown, dt, context, extras, pedestrians, police) {
      field.visible = shown;
      police.fieldOfficers.length = 0;
      visibleActors.length=0;
      if (!shown) return;
      deployedIds.clear();
      for(const officer of police.officers||[])deployedIds.add(officer.id);
      for(const officer of police.downOfficers||[])deployedIds.add(officer.id);
      details.step(dt, context, deployedIds);
      for (const actor of details.actors) {
        const {id, unit, post} = actor;
        const absent=actor.absentUntil>context.time || actor.downUntil>context.time;
        if (!equipment.has(id)) {
          const model = equipmentFor(post.unit.activity);
          if (model) field.add(model);
          equipment.set(id, {unit, model});
        }
        const model = equipment.get(id).model;
        const near = Math.hypot(actor.x - context.player.x, actor.z - context.player.z) < 160;
        if (model) {
          model.visible = near && (!['dog','horse'].includes(post.unit.activity) || Boolean(model.userData.animal));
          if (near) placeEquipment(model, actor, context.waterLevel);
        }
        if (!near || deployedIds.has(id) || absent) continue;
        visibleActors.push(actor);
        extras.push({...actor, contactActor:actor, member:actor.look.member, y:actor.y + actor.rideLift, cycling:Boolean(actor.ride)});
        if (post.unit.activity !== 'boat') pedestrians.push(actor);
        if (post.unit.sworn) police.fieldOfficers.push(actor);
        else context.bystanders?.push(actor);
      }
    },
    postedNear(player,reach=4){
      return nearestFacing(player,visibleActors,reach);
    },
    isPosted(actor){
      return visibleActors.includes(actor);
    },
    identify(player, officers) {
      const actor=nearestFacing(player,[...visibleActors,...officers],5);
      return actor ? (UNIT[actor.unit] || UNIT.patrol).name : null;
    },
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
        const fromX = unit.x + Math.sin(unit.angle) * 1.6, fromY = unit.y - .71, fromZ = unit.z + Math.cos(unit.angle) * 1.6;
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
      for (let i = 0; i < flashes.length; i++) {
        const shot = shots[shots.length - 1 - i], flash = flashes[i];
        const age = shot ? now - shot.at : Infinity;
        // The flash is over in a twentieth of a second: any longer and it reads as a lamp, not a shot.
        flash.visible = age >= 0 && age < FLASH_LIFE;
        if (!flash.visible) continue;
        flash.position.set(shot.x, shot.y, shot.z);
        flash.lookAt(shot.tx, shot.ty, shot.tz);
        // Vary the size and rotation about the barrel for each shot.
        const seed = shot.at * 977.13, size = (.85 + .4 * (seed % 1)) * (1 - .45 * age / FLASH_LIFE);
        flash.rotateZ(seed % 6.283); flash.scale.setScalar(size);
      }
    },
  };
}
