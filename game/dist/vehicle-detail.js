// The articulated and batched exteriors classify the same triangles as glazing.
import * as THREE from './vendor/three.module.min.js';
import { PANEL, doorPanel, hasDriver, vehiclePaneBroken } from './vehicle-damage.js';
import { poseGlass, releaseFracture } from './vehicle-glass.js';
import { EXTERIOR_PARTS } from './vehicle-generator.js';

const exteriors = new WeakMap();
const originalPanels = new WeakMap();
const glass = new THREE.MeshPhysicalMaterial({
  color: 0x769399, transparent: true, opacity: .34, roughness: .09, metalness: .12,
  clearcoat: 1, clearcoatRoughness: .045, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true,
});
function lightenInside(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
    '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.a *= .16;');
}
glass.onBeforeCompile = lightenInside;
glass.name = 'Car glass';
const char = new THREE.MeshStandardMaterial({ color: 0x292727, metalness: .23, roughness: .91, side: THREE.DoubleSide });
export function hasAlteredGlazing(car) {
  return Boolean(car.brokenGlass || car.shotGlass || car.glassDamage || car.missingDoors || car.doorOpen || car.destroyed ||
    (car.dents && Object.values(car.dents).some(depth => depth > .055)));
}

const isGlazing = part => part === 'windshield' || part.endsWith('Glass');

function partition(built, batched = false) {
  if (!batched && exteriors.has(built.body)) return exteriors.get(built.body);
  const source = built.body, { position, normal, aFinish, aGlazing } = source.attributes;
  if (!source.boundingBox) source.computeBoundingBox();
  const bounds = source.boundingBox, length = bounds.max.z - bounds.min.z;
  const layout = built.layout || {
    width: Math.abs(built.wheels?.x || .78) + .13, height: built.roof || bounds.max.y,
    hinge: length * .23, latch: -length * .10, cowl: length * .23,
  };
  const { width, height, hinge, latch, cowl } = layout;
  const buckets = new Map();
  for (let t = 0, end = source.index?.count ?? position.count; t < end; t += 3) {
    const a = source.index?.getX(t) ?? t, b = source.index?.getX(t+1) ?? t+1, c = source.index?.getX(t+2) ?? t+2;
    const pane = aGlazing ? (aGlazing.getX(a)+aGlazing.getX(b)+aGlazing.getX(c)) > 1.5 : Math.abs(aFinish.getX(a)-.06) < .002;
    let part = 'body';
    if (source.userData.panels) {
      part = EXTERIOR_PARTS[source.userData.panels[t/3]];
      if (part === 'body' && pane) part = 'rearGlass';
    } else if (pane || !batched) {
      const x = (position.getX(a)+position.getX(b)+position.getX(c))/3;
      const y = (position.getY(a)+position.getY(b)+position.getY(c))/3;
      const z = (position.getZ(a)+position.getZ(b)+position.getZ(c))/3;
      const side = x > 0 ? 'left' : 'right';
      const sideFacing = Math.abs(normal.getX(a)+normal.getX(b)+normal.getX(c)) > 1.35 && Math.abs(x) > width * .66;
      const door = sideFacing && z > latch && z < hinge && y > height * .19 && y < height * .97;
      if (pane) {
        if (sideFacing) part = door ? side+'Glass' : side+'QuarterGlass';
        else if (y > height*.93 && Math.abs(z) < length*.2) part = 'roofGlass';
        else part = z > latch ? 'windshield' : 'rearGlass';
      } else if (door) part = side;
      else if (z > cowl && Math.abs(x) < width * .94 && normal.getY(a)+normal.getY(b)+normal.getY(c) > 1.7 && y > height * .33) part = 'hood';
    }
    if (batched) part = isGlazing(part) ? 'glass' : 'body';
    if (!buckets.has(part)) buckets.set(part, []);
    buckets.get(part).push(a,b,c);
  }
  const parts = {};
  for (const [name, indices] of buckets) {
    const g = new THREE.BufferGeometry();
    for (const [key, attribute] of Object.entries(source.attributes)) g.setAttribute(key, attribute);
    g.setIndex(indices); g.boundingSphere = source.boundingSphere; g.boundingBox = bounds;
    parts[name] = g;
  }
  const exterior = { parts, layout };
  if (batched) return exterior;
  source.addEventListener('dispose', () => {
    for (const g of Object.values(parts)) g.dispose();
    exteriors.delete(source);
  });
  exteriors.set(source, exterior);
  return exterior;
}

export function batchExterior(built) {
  const { parts, layout } = partition(built, true);
  return { body: parts.body, windows: [[parts.glass, glass]], layout };
}

export function fitExterior(chassis, built, paint) {
  const { parts, layout } = partition(built);
  const { width, height, hinge, latch, cowl } = layout;
  const doors = [], pieces = {};
  for (const [side, name] of [[1,'left'],[-1,'right']]) {
    const door = new THREE.Group();
    door.name = name + ' front door'; door.position.set(side*width, 0, hinge);
    doors.push(door); chassis.add(door);
  }
  const hood = new THREE.Group(); hood.name = 'Hood hinge';
  hood.position.set(0, height*.62, cowl); chassis.add(hood);
  for (const [name, geometry] of Object.entries(parts)) {
    const pane = isGlazing(name) ? glass : null;
    const mesh = new THREE.Mesh(geometry, pane || paint);
    // Glass shows what it reflects and what is behind it. A shadow laid across it reads as a dark patch on the pane.
    mesh.castShadow = !pane; mesh.receiveShadow = !pane;
    mesh.name = name === 'body' ? 'Car body' : name;
    const parent = name === 'left' || name === 'leftGlass' ? doors[0] : name === 'right' || name === 'rightGlass' ? doors[1] : name === 'hood' ? hood : chassis;
    if (parent !== chassis) mesh.position.copy(parent.position).negate();
    parent.add(mesh); pieces[name] = mesh;
  }
  return { doors, hood, pieces, paint, width, height, bounds: built.body.boundingBox,
    hinge, latch };
}

const glassPanels = {
  windshield:PANEL.front,rearGlass:PANEL.rear,roofGlass:PANEL.roof,
  leftGlass:PANEL.left,leftQuarterGlass:PANEL.leftQuarter,rightGlass:PANEL.right,rightQuarterGlass:PANEL.rightQuarter,
};
const shotSurface = new THREE.Mesh(undefined,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
const shotRay = new THREE.Raycaster(), shotHits = [];
const localShot = new THREE.Vector3(), chassisShot = new THREE.Matrix4(), shotTilt = new THREE.Matrix4(), shotInverse = new THREE.Matrix4();

/** Query the same exterior panels used by detailed and batched vehicles. */
export function vehicleShotContacts(car, drawn, built, origin, ray, range) {
  const detail = drawn?.userData.detail, batched = !detail && built && partition(built);
  if (!detail && !batched) return null;
  const parts = detail?.pieces ?? batched.parts, width = detail?.width ?? batched.layout.width;
  if (detail) drawn.updateMatrixWorld(true);
  else {
    chassisShot.makeRotationY(car.angle).setPosition(car.x,(car.y||0)+.025,car.z);
    shotTilt.makeRotationFromEuler(new THREE.Euler(car.pitch||0,0,car.roll||0,'YXZ'));
    chassisShot.multiply(shotTilt);
  }
  shotRay.set(origin,ray);
  shotRay.near = .001;
  shotRay.far = range;
  let distance = Infinity;
  const panes = new Map();
  for (const [name,part] of Object.entries(parts)) {
    const panel = glassPanels[name];
    if (detail && (!part.visible || !part.parent.visible) || panel && vehiclePaneBroken(car,panel)) continue;
    shotSurface.geometry = detail ? part.geometry : part;
    shotSurface.matrixWorld.copy(detail ? part.matrixWorld : chassisShot);
    shotHits.length = 0;
    shotSurface.raycast(shotRay,shotHits);
    for (const hit of shotHits) {
      if (!panel) distance = Math.min(distance,hit.distance);
      else if (hit.distance<(panes.get(panel)?.distance??Infinity)) {
        localShot.copy(hit.point).applyMatrix4(shotInverse.copy(shotSurface.matrixWorld).invert());
        const offset = Math.max(.06,Math.min(.94,.5+localShot.x/(2*width)));
        panes.set(panel,{car,panel,distance:hit.distance,offset});
      }
    }
  }
  return {distance,panes:[...panes.values()]};
}

// Identical cars share every intact vertex. Only a damaged car gets a private
// set of positions, shared by its doors, glass and body partitions.
export function releaseCrumple(detail) {
  for (const mesh of Object.values(detail.pieces)) releaseFracture(mesh,glass);
  for (const { mesh, original } of detail.deformed || []) {
    // Three releases attribute buffers on geometry disposal. The material
    // attributes and indices still belong to other vehicles in the scene.
    mesh.geometry.setIndex(null);
    for (const name of Object.keys(original.attributes)) {
      if (mesh.geometry.attributes[name] === original.attributes[name]) mesh.geometry.deleteAttribute(name);
    }
    mesh.geometry.dispose();
    mesh.geometry = original;
  }
  detail.deformed = detail.positions = detail.lastDents = null;
}

function localCrush(zones, panel, offset, fallback) {
  const hits = zones?.[panel];
  if (!hits) return fallback;
  let depth = 0;
  for (const hit of hits) {
    if (!hit) continue;
    const weight = Math.max(0, 1 - Math.abs(offset-hit.offset)/hit.width);
    depth = Math.max(depth, hit.depth*weight*weight*(3-2*weight));
  }
  return depth;
}

function crumple(detail, dents, zones, revision) {
  if (!dents) {
    if (detail.deformed) releaseCrumple(detail);
    return;
  }
  if (detail.lastDents && detail.crushRevision === revision && Object.values(PANEL).every(bit => detail.lastDents[bit] === dents[bit])) return;
  detail.lastDents = { ...dents };
  detail.crushRevision = revision;
  if (!detail.deformed) {
    detail.deformed = [];
    detail.positions = new Map();
    for (const mesh of [...Object.values(detail.pieces), detail.lamps, detail.plates]) {
      const original = mesh.geometry, source = original.attributes.position;
      if (!detail.positions.has(source)) detail.positions.set(source, {
        positions: source.clone(), normals: original.attributes.normal.clone(), restNormal: original.attributes.normal,
      });
      const geometry = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(original.attributes)) geometry.setAttribute(name, attr);
      geometry.setAttribute('position', detail.positions.get(source).positions);
      geometry.setAttribute('normal', detail.positions.get(source).normals);
      geometry.setIndex(original.index);
      geometry.boundingBox = original.boundingBox; geometry.boundingSphere = original.boundingSphere;
      originalPanels.set(geometry, original);
      detail.deformed.push({ mesh, original }); mesh.geometry = geometry;
    }
  }
  const { min, max } = detail.bounds, length = max.z - min.z;
  for (const [source, { positions, normals, restNormal }] of detail.positions) {
    for (let i = 0; i < source.count; i++) {
      const x = source.getX(i), y = source.getY(i), z = source.getZ(i);
      const nose = Math.max(0, 1 - (max.z-z) / (.29*length)) ** 1.4 * localCrush(zones, PANEL.front, x/detail.width, dents[PANEL.front] || 0);
      const tail = Math.max(0, 1 - (z-min.z) / (.24*length)) ** 1.4 * localCrush(zones, PANEL.rear, x/detail.width, dents[PANEL.rear] || 0);
      const side = Math.max(0, Math.abs(x)/detail.width-.56) * Math.max(0, 1-(2*Math.abs(z)/length)**4) * localCrush(zones, doorPanel(x), 2*z/length, dents[doorPanel(x)] || 0);
      positions.setXYZ(i, x - Math.sign(x)*.34*side,
        y + (nose+tail)*(.08 + .085*Math.sin(13*z+2*x)), z + length*(.11*tail-.13*nose));
      const ripple = (nose+tail)*.085*Math.cos(13*z+2*x);
      const ny = restNormal.getY(i);
      const nx = restNormal.getX(i) - 2*ripple*ny, nz = restNormal.getZ(i) - 13*ripple*ny;
      const norm = Math.hypot(nx,ny,nz) || 1;
      normals.setXYZ(i,nx/norm,ny/norm,nz/norm);
    }
    positions.needsUpdate = normals.needsUpdate = true;
  }
}

export function poseExterior(detail, car) {
  const { doors, hood, pieces } = detail;
  crumple(detail, car.dents, car.crushZones, car.crushRevision);
  const dents = car.dents || {};
  for (const [i, side] of [1,-1].entries()) {
    const door = doors[i], flag = doorPanel(side), crush = dents[flag] || 0;
    door.rotation.y = side === car.doorSide ? -side * (car.doorOpen || 0) * 1.08 : 0;
    const doorCrush = localCrush(car.crushZones,flag,.12,crush);
    door.rotation.z = side * .075 * doorCrush;
    door.position.x = side * (detail.width - .14 * doorCrush);
    door.visible = !(car.missingDoors & flag);
    const pane = pieces[side > 0 ? 'leftGlass' : 'rightGlass'];
    const origin = car.fractureOrigin?.[flag] ?? .5;
    poseGlass(pane, glass, !vehiclePaneBroken(car,flag), crush, origin, true);
    const quarter = side > 0 ? 'leftQuarterGlass' : 'rightQuarterGlass';
    poseGlass(pieces[quarter], glass, !vehiclePaneBroken(car,glassPanels[quarter]), crush, origin, true);
  }
  const frontCrush = dents[PANEL.front] || 0;
  detail.bay.visible = frontCrush > .18;
  detail.bay.position.z = hood.position.z + detail.bay.scale.z*.40 - (detail.bounds.max.z-detail.bounds.min.z)*.065*frontCrush;
  hood.rotation.x = -.17 * (dents[PANEL.front] || 0);
  const frontOrigin = car.fractureOrigin?.[PANEL.front] ?? .5;
  hood.rotation.z = (frontOrigin-.5) * .19 * frontCrush;
  poseGlass(pieces.windshield, glass, !vehiclePaneBroken(car,PANEL.front), Math.max(frontCrush,car.glassDamage||0), frontOrigin, false, car.secondFracture);
  poseGlass(pieces.rearGlass, glass, !vehiclePaneBroken(car,PANEL.rear), dents[PANEL.rear] || 0, car.fractureOrigin?.[PANEL.rear] ?? .5, false);
  if (pieces.roofGlass) pieces.roofGlass.visible = !car.destroyed && !vehiclePaneBroken(car,PANEL.roof);
  if (detail.charred !== !!car.destroyed) {
    detail.charred = !!car.destroyed;
    for (const key of ['body','hood','left','right']) if (pieces[key]) pieces[key].material = car.destroyed ? char : detail.paint;
  }
  detail.driver.visible = hasDriver(car);
}

// Detached panels share the car's meshes. Only their short-lived world poses
// belong to the debris pool, so removing debris never disposes a car's paint.
export function createDoorDebris(scene) {
  const pieces = [];
  return {
    detach(door, car, side) {
      door.updateWorldMatrix(true,false);
      const shell = door.clone();
      shell.visible = true;
      shell.traverse(mesh => { if (originalPanels.has(mesh.geometry)) mesh.geometry = originalPanels.get(mesh.geometry); });
      const panel = new THREE.Group(), center = new THREE.Vector3(0, .73, -.51);
      door.matrixWorld.decompose(panel.position,panel.quaternion,panel.scale);
      panel.position.copy(door.localToWorld(center.clone()));
      shell.position.copy(center).negate(); shell.quaternion.identity(); shell.scale.setScalar(1);
      panel.add(shell);
      scene.add(panel);
      if (pieces.length >= 12) pieces.shift().panel.removeFromParent();
      pieces.push({ panel, age: 0, vx: (car.velocityX || 0) + Math.cos(car.angle)*side,
        vz: (car.velocityZ || 0) - Math.sin(car.angle)*side, vy: 1.3, side, ground: (car.y || 0) + .10,
        resting: new THREE.Quaternion().setFromEuler(new THREE.Euler(0,car.angle,side*Math.PI/2,'YXZ')) });
    },
    update(dt) {
      for (let i=pieces.length-1; i>=0; i--) {
        const piece = pieces[i], {panel} = piece;
        piece.age += dt;
        if (piece.age > 8) { panel.removeFromParent(); pieces.splice(i,1); continue; }
        if (panel.position.y <= piece.ground && piece.vy <= 0) {
          panel.position.y = piece.ground; piece.vy = 0;
          piece.vx *= Math.exp(-dt*7); piece.vz *= Math.exp(-dt*7);
          panel.quaternion.slerp(piece.resting, 1 - Math.exp(-dt*8));
        } else {
          piece.vy -= 9.81*dt; panel.rotateZ(piece.side*2.2*dt); panel.rotateY(dt);
        }
        panel.position.x += piece.vx*dt; panel.position.y += piece.vy*dt; panel.position.z += piece.vz*dt;
      }
    },
  };
}
