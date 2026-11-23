import * as THREE from './vendor/three.module.min.js';
import { shared } from './gfx-common.js';
import { SIGN_FRONTS } from './times-square-signs.js';

// The foot and axis of the staircase are taken from the city's 2024 orthophoto.
// TDF gives 27 risers and a total rise of 16 feet.
const STEPS = 27, RISE = 4.88 / STEPS, RUN = 18.8 / STEPS;
const FOOT = { x: 1392.34, z: -3954.54 }, YAW = Math.atan2(7, -17.45);
const sin = Math.sin(YAW), cos = Math.cos(YAW);
const halfWidth = (along) => 4.55 + 2.08 * along / (RUN * STEPS);

// The central walkway approaches through the open foot of the staircase.
export function redStepWalk() {
  const depth = 7, point = (along) => [FOOT.x + along * sin + depth * .5 * cos, FOOT.z + along * cos - depth * .5 * sin];
  return { points: [point(-1.8), point(17.8)], normals: [[cos, -sin]], depth, length: 19.6, stair: true };
}

export function redStepHeight(x, z) {
  const dx = x - FOOT.x, dz = z - FOOT.z, along = dx * sin + dz * cos, across = dx * cos - dz * sin;
  if (along < 0 || along > RUN * STEPS || Math.abs(across) > halfWidth(along)) return null;
  return RISE * Math.min(STEPS, 1 + Math.floor(along / RUN));
}

const ink = [
  [.65, .60, .57],
  [1, .075, .09],
  [.78, .45, .12],
  [.46, .55, .7],
  [.28, .48, .86],
  [.76, .32, .92],
  [.62, .87, .075],
  [1, .37, .11],
  [.2, .42, .7],
];

function screenMaterial() {
  const material = new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    atlas = { value: null },
    ready = { value: false };
  material.name = 'Times Square LED displays';
  material.onBeforeCompile = (shader, renderer) => {
    if (renderer?.isWebGLRenderer && !atlas.value) {
      atlas.value = new THREE.TextureLoader().load(
        new URL('./assets/times-square-campaigns.webp', import.meta.url).href,
        () => {
          ready.value = true;
        },
      );
      atlas.value.colorSpace = THREE.SRGBColorSpace;
      atlas.value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    Object.assign(shader.uniforms, { adAtlas: atlas, adReady: ready, adTime: shared.uNycTime, adNight: shared.uNycNight });
    shader.vertexShader = 'attribute vec4 aSign; varying vec4 vSign; varying vec2 vAdUV;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSign = aSign; vAdUV = uv;');
    shader.fragmentShader = `varying vec4 vSign; varying vec2 vAdUV;
      uniform sampler2D adAtlas; uniform bool adReady; uniform float adTime; uniform float adNight;
      vec3 campaign(float id, vec2 uv, float aspect){
        bool wide = aspect > 1.55;
        float imageRatio = wide ? 418.0/174.0 : 1.0;
        // Preserve the proportions of the photography. Very long ribbons repeat a complete campaign.
        float repeats = max(1.0, floor(aspect/imageRatio + .5));
        vec2 tile = vec2(fract(uv.x*repeats),uv.y);
        float ratio = aspect / (imageRatio*repeats);
        tile = (tile-.5)*vec2(min(1.0,ratio),min(1.0,1.0/ratio))+.5;
        vec2 extent = vec2(418.0,wide?174.0:418.0);
        vec2 origin = vec2(mod(id,3.0)*418.0,(2.0-floor(id/3.0))*592.0 + (wide?0.0:174.0));
        vec2 at = (origin + 2.0 + tile*(extent-4.0))/vec2(1254.0,1776.0);
        // Derive the mip level before wrapping repeated content or changing campaigns.
        vec2 slope = vec2(repeats,1.0)*vec2(min(1.0,ratio),min(1.0,1.0/ratio))*(extent-4.0)/vec2(1254.0,1776.0);
        return textureGrad(adAtlas,at,dFdx(uv)*slope,dFdy(uv)*slope).rgb;
      }
      ` + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
        float sequence = adTime*vSign.z + vSign.w;
        // Interpolation can put an integer campaign just below an atlas row boundary.
        float id = mod(floor(vSign.x+.5) + floor(sequence)*4.0,9.0);
        vec3 picture = vec3(.13,.16,.2);
        if(adReady){
          picture = campaign(id,vAdUV,vSign.y);
          float fade = smoothstep(.94,1.0,fract(sequence));
          if(fade>0.0) picture=mix(picture,campaign(mod(id+4.0,9.0),vAdUV,vSign.y),fade);
        }
        vec2 cabinet=vAdUV*vec2(vSign.y,1.0)*12.0;
        vec2 edge=min(fract(cabinet),1.0-fract(cabinet));
        vec2 px=max(fwidth(cabinet),vec2(.001));
        vec2 joint=(1.0-smoothstep(vec2(.001),px+.002,edge))*(1.0-smoothstep(vec2(.015),vec2(.12),px));
        diffuseColor.rgb=picture*(1.0-.18*max(joint.x,joint.y))*mix(1.58,1.13,adNight);
      `,
    );
  };
  material.addEventListener('dispose', () => atlas.value?.dispose());
  return material;
}

function writer() {
  const pos = [], indices = [], uv = [], signs = [];
  return {
    quad(a, b, c, d, uvs, sign) {
      const i = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
      if (uvs) {
        uv.push(...uvs);
        for (let j = 0; j < 4; j++) signs.push(...sign);
      }
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(indices);
      if (uv.length) {
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setAttribute('aSign', new THREE.Float32BufferAttribute(signs, 4));
      } else g.computeVertexNormals();
      return g;
    },
  };
}

function signBank(parent, anchor, rows, materials, lights) {
  const display = writer(), housing = writer(), group = new THREE.Group(), emitters = [];
  group.name = 'Times Square sign bank';
  group.position.y = anchor.elevation;
  for (const [x, z, yaw, w, bottom, h, campaign, bow = 0] of rows) {
    const angle = yaw * Math.PI / 180, nx = Math.sin(angle), nz = Math.cos(angle);
    const segments = bow ? 18 : 1, height = bottom + h;
    const seed = Math.abs(Math.sin(x * 3.61 + bottom) * 921.32) % 1, rate = seed < .24 ? 0 : 1 / (12 + 10 * seed);
    const sign = [campaign, w / h, rate, seed * .88];
    const point = (u, y, offset) => {
      const along = (u - .5) * w, out = offset + 4 * bow * u * (1 - u);
      return [x + nz * along + nx * out, y, z - nx * along + nz * out];
    };
    // Deep cabinets with a dark reveal all around the luminous face.
    for (let j = 0; j < segments; j++) {
      const a = j / segments, b = (j + 1) / segments;
      const A = point(a, bottom, .66), B = point(b, bottom, .66), C = point(b, height, .66), D = point(a, height, .66);
      const left = j ? a : .13 / w, right = j < segments - 1 ? b : 1 - .13 / w;
      // The bezel surrounds a real aperture. An overlapping front plate would
      // fight the image for depth on devices with a short depth buffer.
      housing.quad(A, B, point(b, bottom + .13, .66), point(a, bottom + .13, .66));
      housing.quad(point(a, height - .13, .66), point(b, height - .13, .66), C, D);
      if (!j) housing.quad(A, point(left, bottom, .66), point(left, height, .66), D);
      if (j === segments - 1) housing.quad(point(right, bottom, .66), B, C, point(right, height, .66));
      housing.quad(point(a, bottom, -.12), point(b, bottom, -.12), B, A);
      housing.quad(D, C, point(b, height, -.12), point(a, height, -.12));
      if (!j) housing.quad(point(a, bottom, -.12), A, D, point(a, height, -.12));
      if (j === segments - 1) housing.quad(B, point(b, bottom, -.12), point(b, height, -.12), C);
      const l = left, r = right;
      display.quad(
        point(l, bottom + .13, .685),
        point(r, bottom + .13, .685),
        point(r, height - .13, .685),
        point(l, height - .13, .685),
        [l, 0, r, 0, r, 1, l, 1],
        sign,
      );
    }
    if (bottom < 31) {
      const radius = Math.min(36, 12 + .31 * w + .22 * h), reach = radius * .31;
      const e = {
        x: x + nx * (reach + bow),
        z: z + nz * (reach + bow),
        radius,
        glow: [0, 0, 0],
        y: 0,
        campaign,
        rate,
        phase: sign[3],
        anchor,
        parent,
      };
      emitters.push(e);
      lights.add(e);
    }
  }
  const faces = new THREE.Mesh(display.geometry(), materials.screen),
    cases = new THREE.Mesh(housing.geometry(), materials.metal);
  faces.name = 'LED campaign faces';
  cases.name = 'Display cabinets';
  cases.castShadow = cases.receiveShadow = true;
  group.add(cases, faces);
  parent.add(group);
  return {
    update() {
      group.position.y = anchor.elevation;
    },
    dispose() {
      for (const e of emitters) lights.delete(e);
      group.removeFromParent();
      faces.geometry.dispose();
      cases.geometry.dispose();
    },
  };
}

function redSteps() {
  const group = new THREE.Group();
  group.name = 'TKTS red steps';
  group.rotation.y = YAW;
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xb80e22,
    emissive: 0x920817,
    emissiveIntensity: .35,
    roughness: .24,
    clearcoat: .82,
  });
  const steel = new THREE.MeshStandardMaterial({ color: 0xa7abb0, metalness: .78, roughness: .32 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x313f48, metalness: .6, roughness: .24 });
  const unit = new THREE.BoxGeometry();
  function batch(name, material, parts) {
    const mesh = new THREE.InstancedMesh(unit, material, parts.length), pose = new THREE.Object3D();
    parts.forEach(([x, y, z, w, h, d, tilt = 0, turn = 0], i) => {
      pose.position.set(x, y, z);
      pose.rotation.set(tilt, turn, 0, 'YXZ');
      pose.scale.set(w, h, d);
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
    });
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  const treads = [], sides = [], rails = [];
  for (let i = 0; i < STEPS; i++) {
    const z = (i + .5) * RUN, y = (i + 1) * RISE, width = halfWidth(z) * 2;
    treads.push([0, y - .075, z, width, .15, RUN + .008]);
    for (const side of [-1, 1]) sides.push([side * (width / 2 - .065), y * .5 - .05, z, .12, y - .1, RUN + .025]);
  }
  for (const side of [-1, 1]) {
    const x0 = side * halfWidth(0), x1 = side * halfWidth(RUN * STEPS);
    const length = RUN * STEPS, planLength = Math.hypot(x1 - x0, length);
    rails.push([
      (x0 + x1) / 2,
      4.88 / 2 + .92,
      length / 2,
      .069,
      .069,
      Math.hypot(planLength, 4.88),
      -Math.atan2(4.88, planLength),
      Math.atan2(x1 - x0, length),
    ]);
    for (let i = 0; i <= 9; i++) {
      const z = i * length / 9;
      rails.push([side * halfWidth(z), z / length * 4.88 + .43, z, .052, .99, .052]);
    }
  }
  const back = RUN * STEPS, width = 2 * halfWidth(back);
  sides.push([0, 2.43, back - .08, width, 4.82, .18]);
  for (let i = -2; i <= 2; i++) rails.push([i * 2.15, 1.75, back + .02, 1.85, .095, .48]);
  rails.push([0, 5.81, back, width, .065, .065]);
  for (let i = -3; i <= 3; i++) rails.push([i * (width - .12) / 6, 5.31, back, .05, .98, .05]);
  batch('Laminated ruby glass treads', glass, treads);
  batch('Ticket pavilion', wall, sides);
  batch('Brushed steel rails and counters', steel, rails);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#242d36';
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#fe233b';
      ctx.font = 'bold 110px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('tkts', 256, 100);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 1.32), new THREE.MeshBasicMaterial({ map: texture }));
      logo.position.set(0, 3.66, back + .026);
      group.add(logo);
    }
  }
  return {
    group,
    glass,
    dispose() {
      const geometries = new Set(), materials = new Set();
      for (const m of group.children) {
        geometries.add(m.geometry);
        materials.add(m.material);
        if (m.isInstancedMesh) m.dispose();
      }
      for (const g of geometries) g.dispose();
      for (const m of materials) {
        m.map?.dispose();
        m.dispose();
      }
      group.removeFromParent();
    },
  };
}

// Furniture is fitted within the mapped pedestrian islands. Ground is sampled
// per item because the plazas span several blocks of sloping terrain.
function plazaFurniture(parent) {
  const group = new THREE.Group();
  group.name = 'Broadway plaza furniture';
  parent.add(group);
  const parts = { box: [], round: [] }, sites = [];
  function site(x, z, yaw) {
    const item = { x, z, yaw, elevation: NaN };
    sites.push(item);
    return item;
  }
  function part(shape, item, x, y, z, w, h, d, color, tilt = 0) {
    parts[shape].push({ item, x, y, z, w, h, d, color, tilt });
  }
  const avenue = Math.atan2(.27, -.96);
  for (
    const [x, z] of [[1375, -3965.5], [1358.5, -3889.5], [1340.5, -3868.5], [1338.5, -3792.5], [1308.5, -3725], [
      1282.5,
      -3649,
    ]]
  ) {
    const b = site(x, z, avenue);
    b.half = 7.35;
    b.radius = .54;
    b.height = .48;
    part('box', b, 0, .185, 0, .89, .37, 14.64, 0x424248);
    part('box', b, 0, .43, 0, 1.08, .15, 14.7, 0x62646b);
  }
  for (
    const [x, z] of [[1370, -3945], [1368.8, -3940.5], [1375, -3978], [1346.5, -3901.5], [1340, -3854], [1326.5, -3776], [
      1310,
      -3708.5,
    ], [1288.5, -3629.5]]
  ) {
    const t = site(x, z, avenue + Math.sin(x) * .6);
    t.radius = .45;
    t.height = .78;
    part('round', t, 0, .74, 0, .8, .045, .8, 0xac2930);
    part('round', t, 0, .38, 0, .06, .72, .06, 0x4d5053);
    part('round', t, 0, .045, 0, .47, .08, .47, 0x46484a);
    for (const side of [-1, 1]) {
      part('box', t, 0, .45, side * .73, .39, .035, .36, 0xc23539);
      for (const y of [.66, .77]) part('box', t, 0, y, side * .91, .4, .075, .025, 0xc23539);
      for (const dx of [-.16, .16]) {
        part('box', t, dx, .24, side * .72, .025, .52, .026, 0x4a4444, .59);
        part('box', t, dx, .39, side * .79, .025, .83, .026, 0x4a4444, -.34 * side);
      }
    }
  }
  for (const [cx, cz, n] of [[1381, -3922.5, 4], [1398, -3974.2, 5], [1346, -3850.5, 4]]) {
    for (let k = 0; k < n; k++) {
      const offset = (k - (n - 1) / 2) * 1.56;
      const b = site(cx + cos * offset, cz - sin * offset, 0);
      b.radius = .14;
      b.height = .94;
      part('round', b, 0, .44, 0, .27, .88, .27, 0x9ca0a3);
      part('round', b, 0, .92, 0, .265, .055, .265, 0xb7bbbd);
      part('round', b, 0, .865, 0, .275, .032, .275, 0x4d4f50);
    }
  }
  const material = new THREE.MeshStandardMaterial({ roughness: .62, metalness: .23 });
  const meshes = {};
  for (const [shape, rows] of Object.entries(parts)) {
    const geometry = shape === 'box' ? new THREE.BoxGeometry() : new THREE.CylinderGeometry(.5, .5, 1, 16);
    const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    meshes[shape] = mesh;
    rows.forEach((p, i) => mesh.setColorAt(i, new THREE.Color(p.color)));
  }
  const pose = new THREE.Object3D();
  return {
    group,
    update(ground) {
      let changed = false;
      for (const s of sites) {
        const y = ground(s.x, s.z);
        if (s.elevation !== y) {
          s.elevation = y;
          changed = true;
        }
      }
      if (!changed) return null;
      for (const [shape, rows] of Object.entries(parts)) {
        rows.forEach((p, i) => {
          const s = p.item, c = Math.cos(s.yaw), n = Math.sin(s.yaw);
          pose.position.set(s.x + c * p.x + n * p.z, s.elevation + p.y, s.z - n * p.x + c * p.z);
          pose.rotation.set(p.tilt, s.yaw, 0, 'YXZ');
          pose.scale.set(p.w, p.h, p.d);
          pose.updateMatrix();
          meshes[shape].setMatrixAt(i, pose.matrix);
        });
        meshes[shape].instanceMatrix.needsUpdate = true;
        meshes[shape].computeBoundingSphere();
      }
      return sites.map((s) => ({
        kind: s.half ? 'rail' : 'plaza furniture',
        fixed: true,
        x: s.x,
        z: s.z,
        y: s.elevation,
        radius: s.radius,
        height: s.height,
        half: s.half || 0,
        tx: Math.sin(s.yaw),
        tz: Math.cos(s.yaw),
      }));
    },
    dispose() {
      group.removeFromParent();
      for (const mesh of group.children) {
        mesh.dispose();
        mesh.geometry.dispose();
      }
      material.dispose();
    },
  };
}

export function createTimesSquare(parent) {
  const lights = new Set(), spots = [], empty = [];
  let materials = null, steps = null, furniture = null, base = 0, physics = null, registeredBase = null;
  let nextGroundCheck = 0, furnitureBodies = [];
  return {
    attach(mesh, anchors) {
      const banks = [];
      for (const a of anchors) {
        const rows = SIGN_FRONTS[a.featureId];
        if (!rows) continue;
        materials ||= {
          screen: screenMaterial(),
          metal: new THREE.MeshStandardMaterial({ color: 0x242931, roughness: .59, metalness: .58 }),
        };
        banks.push(signBank(mesh, a, rows, materials, lights));
      }
      return banks.length
        ? {
          update() {
            banks.forEach((b) => b.update());
          },
          dispose() {
            banks.forEach((b) => b.dispose());
          },
        }
        : null;
    },
    update(focus, ground, bodies, visible, night, time) {
      const near = visible && Math.hypot(focus.x - 1362, focus.z + 3862) < 650;
      if (steps) steps.group.visible = furniture.group.visible = near;
      if (!near) {
        if (registeredBase !== null) {
          physics?.replace('tkts-rail', []);
          physics?.replace('broadway-furniture', []);
          registeredBase = null;
        }
        return empty;
      }
      if (!steps) {
        steps = redSteps();
        parent.add(steps.group);
        furniture = plazaFurniture(parent);
      }
      if (time >= nextGroundCheck || !furnitureBodies.length) {
        const changed = furniture.update(ground);
        if (changed) {
          furnitureBodies = changed;
          bodies?.replace('broadway-furniture', changed);
        }
        nextGroundCheck = time + .5;
      }
      base = ground(FOOT.x, FOOT.z);
      steps.group.position.set(FOOT.x, base, FOOT.z);
      steps.glass.emissiveIntensity = .16 + .76 * night;
      if (bodies && (physics !== bodies || registeredBase !== base)) {
        physics = bodies;
        registeredBase = base;
        bodies.replace('broadway-furniture', furnitureBodies);
        const pt = (s, t) => [FOOT.x + s * sin + t * cos, FOOT.z + s * cos - t * sin];
        const barriers = [];
        function barrier(s, t, s1, t1) {
          const [x, z] = pt(s, t), [x1, z1] = pt(s1, t1), dx = x1 - x, dz = z1 - z, len = Math.hypot(dx, dz);
          barriers.push({
            kind: 'rail',
            fixed: true,
            x: (x + x1) / 2,
            z: (z + z1) / 2,
            tx: dx / len,
            tz: dz / len,
            half: len / 2,
            radius: .055,
            y: base - .1,
            height: 6,
          });
        }
        for (const side of [-1, 1]) barrier(0, side * halfWidth(0), RUN * STEPS, side * halfWidth(RUN * STEPS));
        barrier(RUN * STEPS, -halfWidth(RUN * STEPS), RUN * STEPS, halfWidth(RUN * STEPS));
        bodies.replace('tkts-rail', barriers);
      }
      spots.length = 0;
      if (night < .015) return spots;
      for (const e of lights) {
        if (!e.parent.visible || Math.hypot(focus.x - e.x, focus.z - e.z) > 180) continue;
        const seq = time * e.rate + e.phase, id = (e.campaign + Math.floor(seq) * 4) % 9;
        let blend = Math.max(0, ((seq % 1) - .94) / .06);
        blend = blend * blend * (3 - 2 * blend);
        for (let j = 0; j < 3; j++) e.glow[j] = night * .98 * (ink[id][j] * (1 - blend) + ink[(id + 4) % 9][j] * blend);
        e.y = ground(e.x, e.z);
        spots.push(e);
      }
      return spots;
    },
    stepAt(x, z) {
      if (!steps?.group.visible) return null;
      const rise = redStepHeight(x, z);
      return rise === null ? null : base + rise;
    },
    dispose() {
      if (registeredBase !== null) {
        physics?.replace('tkts-rail', []);
        physics?.replace('broadway-furniture', []);
      }
      furniture?.dispose();
      steps?.dispose();
      materials?.screen.dispose();
      materials?.metal.dispose();
      lights.clear();
    },
  };
}
