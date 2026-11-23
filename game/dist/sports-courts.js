import * as THREE from './vendor/three.module.min.js';

const LABELS = { basketball: 'Basketball Court', soccer: 'Soccer Field' };

export function addCourtPlaces(data, courts) {
  for (const [sport, label] of Object.entries(LABELS)) {
    const kind = data.kinds.push(label) - 1;
    for (const court of courts) {
      if (court.sport !== sport) continue;
      const name = court.park ? court.park + ' · ' + label : label;
      data.places.push([name, court.x, court.z, kind, court.borough]);
    }
  }
}

// Paint in reference metres. The same markings stretch to each measured footprint.
function surfaceMaterial(basketball) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const length = basketball ? 30 : 105, width = basketball ? 16 : 68;
  ctx.scale(canvas.width / length, canvas.height / width);
  ctx.translate(length / 2, width / 2);
  ctx.fillStyle = basketball ? '#52726f' : '#538050';
  ctx.fillRect(-length / 2, -width / 2, length, width);
  if (!basketball) {
    ctx.fillStyle = '#598656';
    for (let x = -length / 2; x < length / 2; x += length / 5)
      ctx.fillRect(x, -width / 2, length / 10, width);
  }
  const end = length * .47, side = width * .46;
  ctx.strokeStyle = '#f3eee1'; ctx.lineWidth = basketball ? .10 : .18;
  ctx.strokeRect(-end, -side, 2 * end, 2 * side);
  ctx.beginPath(); ctx.moveTo(0, -side); ctx.lineTo(0, side); ctx.stroke();
  const arc = (x, y, r, start, stop) => {
    ctx.beginPath(); ctx.arc(x, y, r, start, stop); ctx.stroke();
  };
  arc(0, 0, basketball ? 1.8 : 9.15, 0, Math.PI * 2);
  for (let i = 0; i < 2; i++) {
    ctx.save(); ctx.scale(i ? -1 : 1, 1);
    if (basketball) {
      ctx.fillStyle = '#a46850';
      ctx.fillRect(-end, -2.35, 5.8, 4.7);
      ctx.strokeRect(-end, -2.35, 5.8, 4.7);
      arc(-end + 5.8, 0, 1.8, -Math.PI / 2, Math.PI / 2);
      arc(-end + 1.1, 0, 6.25, -Math.PI / 2, Math.PI / 2);
      for (const sign of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(-end, sign * 6.25); ctx.lineTo(-end + 1.1, sign * 6.25); ctx.stroke();
      }
    } else {
      ctx.strokeRect(-end, -20, 16.5, 40); ctx.strokeRect(-end, -9, 5.5, 18);
      arc(-end + 11, 0, 9.15, -.92, .92);
    }
    ctx.restore();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

function buildCourt(court, heightAt, assets) {
  const { x, z, angle, length, width } = court;
  const group = new THREE.Group();
  group.position.set(x, 0, z); group.rotation.y = -angle;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const world = (u, v) => [x + u * cos - v * sin, z + u * sin + v * cos];
  const ground = (u, v) => heightAt(...world(u, v)) + .06;
  const floor = new THREE.PlaneGeometry(length, width, Math.ceil(length / 2), Math.ceil(width / 2)).rotateX(-Math.PI / 2);
  const vertices = floor.attributes.position;
  for (let i = 0; i < vertices.count; i++)
    vertices.setY(i, ground(vertices.getX(i), vertices.getZ(i)));
  floor.computeVertexNormals();
  const surface = new THREE.Mesh(floor, assets[court.sport]);
  surface.receiveShadow = true; group.add(surface);

  const boxes = [], hoops = [], bodies = [];
  const bar = (u, y, v, a, b, c, color) => boxes.push({ u, y, v, a, b, c, color });
  const upright = (u, v, h, thickness, color) => {
    const base = ground(u, v), [px, pz] = world(u, v);
    bar(u, base + h / 2, v, thickness, h, thickness, color);
    bodies.push({ id: 'court-post:' + px + ',' + pz, x: px, z: pz, y: base, radius: thickness * .65, height: h, fixed: true });
  };
  for (const sign of [-1, 1]) {
    const end = sign * length * .47, white = '#ecebe0';
    if (court.sport === 'basketball') {
      const post = sign * length * .49, board = end - sign * .45, y = ground(post, 0);
      upright(post, 0, 3.5, .13, '#64706e');
      bar((board + post) / 2, y + 3.38, 0, Math.abs(board - post), .1, .13, '#65706d');
      bar(board, y + 3.48, 0, .08, 1.02, 1.77, white);
      const face = board - sign * .05;
      for (const side of [-1, 1]) {
        bar(face, y + 3.27, side * .29, .015, .43, .035, '#ac5034');
        bar(face, y + 3.27 + side * .20, 0, .015, .035, .61, '#ac5034');
      }
      const rim = face - sign * .245;
      hoops.push({ u: rim, y: y + 3.05, v: 0, a: 1, b: 1, c: 1, color: '#ce552e' });
      for (let j = 0; j < 8; j++) {
        const rad = j * Math.PI / 4;
        bar(rim + .20 * Math.cos(rad), y + 2.92, .20 * Math.sin(rad), .012, .26, .012, white);
      }
    } else {
      const half = Math.min(3.66, width * .19), top = ground(end, 0) + 2.44;
      const back = sign * Math.min(length * .495, Math.abs(end) + 1.6);
      for (const side of [-half, half]) {
        upright(end, side, top - ground(end, side), .10, white);
        bar((end + back) / 2, top, side, Math.abs(back - end), .055, .055, white);
      }
      bar(end, top, 0, .10, .10, half * 2, white);
      const base = ground(back, 0), h = top - base;
      for (let i = 0; i <= 16; i++)
        bar(back, base + h / 2, half * (i / 8 - 1), .018, h, .018, white);
      for (let i = 0; i <= 6; i++) bar(back, base + i * h / 6, 0, .018, .018, half * 2, white);
    }
  }
  const transform = new THREE.Object3D(), tone = new THREE.Color();
  for (const [items, geometry] of [[boxes, assets.box], [hoops, assets.rim]]) {
    if (!items.length) continue;
    const mesh = new THREE.InstancedMesh(geometry, assets.metal, items.length);
    items.forEach(({ u, y, v, a, b, c, color }, i) => {
      transform.position.set(u, y, v); transform.scale.set(a, b, c); transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix); mesh.setColorAt(i, tone.set(color));
    });
    group.add(mesh);
  }
  return { group, bodies, dispose() {
    floor.dispose();
    for (const child of group.children) if (child.isInstancedMesh) child.dispose();
    group.removeFromParent();
  } };
}

export function createSportsCourts(courts, { scene, heightAt, physics }) {
  const active = new Map();
  let assets, lastX = Infinity, lastZ = Infinity, revision;
  function remove(court, view) {
    view.dispose(); physics.replace('court:' + court.x + ',' + court.z, []); active.delete(court);
  }
  return {
    update(focus, visible, terrainRevision) {
      if (!visible && !active.size) { lastX = Infinity; return; }
      if (visible && terrainRevision === revision && Math.hypot(focus.x - lastX, focus.z - lastZ) < 24) return;
      for (const [court, view] of active)
        if (!visible || revision !== terrainRevision || Math.hypot(court.x - focus.x, court.z - focus.z) > 320) remove(court, view);
      revision = terrainRevision; lastX = visible ? focus.x : Infinity; lastZ = focus.z;
      if (!visible) return;
      for (const court of courts) {
        if (active.has(court) || Math.hypot(court.x - focus.x, court.z - focus.z) > 290) continue;
        assets ||= { soccer: surfaceMaterial(false), basketball: surfaceMaterial(true),
          box: new THREE.BoxGeometry(), rim: new THREE.TorusGeometry(.225, .021, 6, 24).rotateX(Math.PI / 2),
          metal: new THREE.MeshLambertMaterial() };
        const view = buildCourt(court, heightAt, assets);
        active.set(court, view); scene.add(view.group);
        physics.replace('court:' + court.x + ',' + court.z, view.bodies);
      }
    },
    dispose() {
      for (const [court, view] of active) remove(court, view);
      if (assets) for (const asset of Object.values(assets)) { asset.map?.dispose(); asset.dispose(); }
    },
  };
}
