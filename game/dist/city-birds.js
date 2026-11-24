import * as THREE from './vendor/three.module.min.js';
import { along } from './crowd.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const materialColor = new THREE.Color();

// Shapes face +Z. Each wing pivots at its shoulder so it can tuck along
// the back on the pavement and show its full span in flight.
function plumage(gull) {
  const parts = {};
  let positions, colors;
  const start = () => { positions = []; colors = []; };
  const finish = name => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    parts[name] = geometry;
  };
  const vertex = (x, y, z) => { positions.push(x, y, z); colors.push(materialColor.r, materialColor.g, materialColor.b); };
  const oval = (x, y, z, rx, ry, rz, color) => {
    const sphere = new THREE.SphereGeometry(1, 10, 7);
    const p = sphere.attributes.position;
    materialColor.set(color);
    for (const i of sphere.index.array) vertex(x + rx * p.getX(i), y + ry * p.getY(i), z + rz * p.getZ(i));
    sphere.dispose();
  };
  const triangle = (a, b, c, color) => { materialColor.set(color); vertex(...a); vertex(...b); vertex(...c); };
  const pale = gull ? 0xe6e5dc : 0x9397a4;
  const dark = gull ? 0x353b43 : 0x474755;
  start();
  oval(0, .016, -.02, .069, .077, .151, pale);
  oval(0, .036, -.143, .049, .016, .092, dark);
  if (!gull) for (const sign of [-1, 1]) {
    oval(.029 * sign, -.072, .02, .005, .028, .005, 0xaf6667);
    oval(.029 * sign, -.096, .032, .014, .004, .022, 0xaf6667);
  }
  finish('body');
  start();
  oval(0, .036, .011, .049, .068, .052, gull ? pale : 0x516d66);
  oval(0, .087, .035, .046, .047, .054, gull ? 0xf1efe5 : 0x64717c);
  oval(0, .081, .092, .014, .012, gull ? .052 : .025, gull ? 0xd5a340 : 0x524c51);
  for (const sign of [-1, 1]) oval(sign * .040, .095, .051, .007, .007, .008, 0x242126);
  finish('head');
  for (const side of [-1, 1]) {
    start();
    const wing = (x, y, z) => [x * side, y, z];
    const root = wing(0, .009, .033), back = wing(0, 0, -.078);
    const wrist = wing(.132, .022, .031), elbow = wing(.124, .008, -.080);
    const tip = wing(gull ? .385 : .265, -.014, gull ? -.084 : -.117);
    const band = wing(.173, .006, -.002);
    triangle(root, wrist, elbow, gull ? 0xadb3b8 : 0x89919b);
    triangle(root, elbow, back, pale);
    triangle(wrist, band, elbow, gull ? 0xc0c2bf : 0x444856);
    triangle(wrist, tip, band, dark);
    triangle(band, tip, elbow, gull ? 0x414851 : 0x575967);
    finish(side < 0 ? 'left' : 'right');
  }
  return parts;
}

function createFlock(group, gull, count, material) {
  const meshes = {};
  const base = new THREE.Object3D(), joint = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  for (const [part, geometry] of Object.entries(plumage(gull))) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = (gull ? 'Harbor gull ' : 'Rock pigeon ') + part;
    mesh.castShadow = !gull; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh); meshes[part] = mesh;
  }
  return {
    count,
    visible(show) { for (const mesh of Object.values(meshes)) mesh.visible = show; },
    pose(i, x, y, z, yaw, bank, flight, flap, peck) {
      base.position.set(x, y, z);
      base.rotation.set(0, yaw, bank, 'YXZ');
      base.scale.setScalar((gull ? 1.6 : 1) * (.92 + .04 * ((i * 3) % 5)));
      base.updateMatrix();
      meshes.body.setMatrixAt(i, base.matrix);
      joint.position.set(0, .045 - peck * .050, .068 + peck * .018); joint.rotation.set(peck * 1.23, 0, 0);
      joint.updateMatrix();
      meshes.head.setMatrixAt(i, matrix.multiplyMatrices(base.matrix, joint.matrix));
      for (const side of [-1, 1]) {
        joint.position.set(side * .043, .040, .016);
        joint.rotation.set(0, side * 1.32 * (1 - flight), side * (flap * flight - .28 * (1 - flight)), 'YZX');
        joint.updateMatrix();
        meshes[side < 0 ? 'left' : 'right'].setMatrixAt(i, matrix.multiplyMatrices(base.matrix, joint.matrix));
      }
    },
    flush() { for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true; },
  };
}

function findWalk(walks, focus, forward) {
  let nearest = 40, choice = null;
  // Look a little way along the street so the player can see the birds before reaching them.
  const x = focus.x + forward.x * 13, z = focus.z + forward.z * 13;
  for (const run of walks) {
    if (run.length < 18) continue;
    for (let i = 1; i < run.points.length; i++) {
      const a = run.points[i-1], b = run.points[i];
      const dx = b[0]-a[0], dz = b[1]-a[1];
      const span = run.lengths[i] - run.lengths[i-1];
      if (span < .01) continue;
      const t = clamp(((x-a[0])*dx + (z-a[1])*dz) / (span*span), 0, 1);
      const d = Math.hypot(a[0]+dx*t-x, a[1]+dz*t-z);
      if (d < nearest) {
        nearest = d;
        choice = {run, distance:clamp(run.lengths[i-1] + span*t, 3, run.length-3)};
      }
    }
  }
  return choice;
}

export function createCityBirds({scene, heightAt, openWater, onTakeoff, onCall}) {
  const group = new THREE.Group();
  group.name = 'City birds'; group.visible = false; scene.add(group);
  const material = new THREE.MeshStandardMaterial({vertexColors:true, roughness:.86, side:THREE.DoubleSide});
  const pigeons = createFlock(group, false, 5, material), gulls = createFlock(group, true, 3, material);
  let time = 0, nextSearch = 0, source = null, walk = null, shore = null;
  let from = 0, to = 0, flightStart = -Infinity, duration = 1;
  let nextCoo = 3, nextGull = 7;
  let searchX = Infinity, searchZ = Infinity;

  return {
    group,
    update(dt, {focus, forward, walks, visible}) {
      group.visible = visible;
      if (!visible) { nextSearch = 0; return; }
      time += dt;
      const moved = Math.hypot(focus.x - searchX, focus.z - searchZ);
      if (moved > 48 || source !== walks || (moved > 7 && time >= nextSearch) || !nextSearch) {
        nextSearch = time + 1.5; searchX = focus.x; searchZ = focus.z;
        const perch = walk && along(walk, to);
        if (!walk || (source !== walks && !walks.includes(walk)) ||
            Math.hypot(perch.x-focus.x, perch.z-focus.z) > 56) {
          const site = findWalk(walks, focus, forward);
          walk = site?.run;
          if (walk) { from = to = site.distance; flightStart = -Infinity; }
        }
        source = walks;
        if (!shore || Math.hypot(shore.x-focus.x, shore.z-focus.z) > 100) {
          shore = null;
          for (let i = 0; i < 8; i++) {
            const x = focus.x + 52 * Math.cos(i * TAU / 8), z = focus.z + 52 * Math.sin(i * TAU / 8);
            if (openWater(x,z) && openWater(x-18,z) && openWater(x+18,z) && openWater(x,z-12) && openWater(x,z+12)) {
              shore = {x,z}; break;
            }
          }
        }
      }
      pigeons.visible(Boolean(walk));
      if (walk) {
        const at = along(walk, to);
        if (dt > 0 && time > flightStart + duration + 1.3 && Math.hypot(at.x-focus.x,at.z-focus.z) < 5 &&
            Math.abs(heightAt(at.x,at.z) - focus.y) < 3) {
          onTakeoff?.({x:at.x-at.nx, z:at.z-at.nz, y:heightAt(at.x,at.z)+.2});
          from = to;
          const side = (at.x-focus.x)*at.tx + (at.z-focus.z)*at.tz >= 0 ? 1 : -1;
          to = clamp(from + side * 18, 3, walk.length - 3);
          if (Math.abs(to - from) < 6) to = clamp(from - side * 18, 3, walk.length - 3);
          duration = Math.abs(to - from) / 6;
          flightStart = time;
        }
        for (let i = 0; i < pigeons.count; i++) {
          const phase = time * (1.3 + .07*i) + i * 2.17;
          const t = clamp((time - flightStart - .085*i) / duration, 0, 1);
          const arc = Math.sin(t * Math.PI), flight = Math.min(1, arc * 5);
          const ease = t*t*(3-2*t);
          const at = along(walk, from + (to-from)*ease + (i-2)*.72 + .36*Math.sin(phase*.4));
          const offset = Math.min(walk.depth ?? 1.2, .64 + .48 * ((i*3)%5)/4);
          const x = at.x - offset*at.nx, z = at.z - offset*at.nz;
          const yaw = Math.atan2(at.tx,at.tz) + (to<from ? Math.PI : 0) + (1-flight)*1.5*Math.sin(phase*.4);
          const y = heightAt(x,z)+.1+arc*(2.6+.18*i);
          if (i === 2 && dt > 0 && time >= nextCoo && time > flightStart + duration + 1.5) {
            onCall?.('pigeon', {x,y,z});
            nextCoo = time + 9 + Math.random()*17;
          }
          pigeons.pose(i,x,y,z,yaw,0,flight,
            .94*Math.sin(phase+time*23), (1-flight)*Math.pow(Math.max(0,Math.sin(phase*2)),4));
        }
        pigeons.flush();
      }
      gulls.visible(Boolean(shore));
      if (shore) {
        for (let i = 0; i < gulls.count; i++) {
          const a = time*(.23+.013*i) + i*2.24, rx = 14+1.5*i, rz = 9+i;
          const beating = Math.max(0,Math.sin(time*.7+i));
          const x = shore.x+rx*Math.cos(a), y = 9+i*2+.9*Math.sin(a*2), z = shore.z+rz*Math.sin(a);
          if (i === 1 && dt > 0 && time >= nextGull) {
            onCall?.('gull', {x,y,z});
            nextGull = time + 15 + Math.random()*22;
          }
          gulls.pose(i,x,y,z,
            Math.atan2(-rx*Math.sin(a),rz*Math.cos(a)), -.22,1,.1+beating*.64*Math.sin(time*8+i),0);
        }
        gulls.flush();
      }
    },
    dispose() {
      scene.remove(group);
      for (const mesh of group.children) { mesh.geometry.dispose(); mesh.dispose(); }
      material.dispose();
    },
  };
}
