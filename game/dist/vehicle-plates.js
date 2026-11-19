import * as THREE from './vendor/three.module.min.js';
import { DESIGNS, PLATE, ACROSS, SHEET, CELL, COLUMNS, paintGlyphs, paintPlates } from './license-plates.js';

// Number plates on cars.
//
// A plate is one flat rectangle, twelve inches by six. Its artwork comes from
// one sheet that holds every design (license-plates.js); its number is laid
// over that in the shader, a character at a time, from a second sheet of
// stamped characters. So every car can carry a number of its own without a
// texture of its own: the number travels with the plate as eight small
// integers. Cars drawn in batches and cars drawn singly use the same material.

/** Metres: a North American plate. */
export const PLATE_SIZE = [.3048, .1524];
// A character's place on the plate, as shares of its width and height, and where the row of them is centred.
const PLACE = [.104, .53], MIDDLE = .485;
const ROWS = Math.ceil(DESIGNS.length / ACROSS);

/** A painted sheet, or a plain one where there is no canvas to paint on (tests, a worker). */
function sheet(width, height, paint, colour, grey) {
  let map;
  try {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    paint(canvas.getContext('2d'));
    map = new THREE.CanvasTexture(canvas);
  } catch {
    map = new THREE.DataTexture(new Uint8Array(grey), 1, 1, THREE.RGBAFormat); map.needsUpdate = true;
  }
  if (colour) map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.anisotropy = 8;
  return map;
}

let shared = null;
/** The one material every plate is drawn with. */
export function plateMaterial() {
  if (shared) return shared;
  const artwork = sheet(PLATE[0] * ACROSS, PLATE[1] * ROWS, paintPlates, true, [236, 236, 230, 255]);
  const glyphs = sheet(SHEET, SHEET, paintGlyphs, false, [0, 0, 0, 255]);
  const material = new THREE.MeshStandardMaterial({ map: artwork, roughness: .42, metalness: .15 });
  material.name = 'Number plates';
  const uniforms = { nycGlyphs: { value: glyphs }, nycInk: { value: DESIGNS.map(design => new THREE.Color(design.ink)) }, nycPlateGlow: { value: 0 } };
  material.userData.uniforms = uniforms;
  const f = n => n.toFixed(6);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute vec4 aPlate;\nattribute vec2 aPlateLook;\nvarying vec4 vPlate;\nvarying vec2 vPlateLook;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlate = aPlate; vPlateLook = aPlateLook;');
    shader.fragmentShader = `uniform sampler2D nycGlyphs;\nuniform vec3 nycInk[${DESIGNS.length}];\nuniform float nycPlateGlow;\nvarying vec4 vPlate;\nvarying vec2 vPlateLook;\n` + shader.fragmentShader
      .replace('#include <map_fragment>', `
        // Which plate of the sheet, then the number over it: each place looks up its own character.
        float nycDesign = floor( vPlateLook.x + .5 ), nycCount = floor( vPlateLook.y + .5 );
        vec2 nycShare = vec2( ${f(1 / ACROSS)}, ${f(1 / ROWS)} );
        vec2 nycArt = ( vec2( mod( nycDesign, ${f(ACROSS)} ), floor( nycDesign / ${f(ACROSS)} ) ) + vec2( vMapUv.x, 1.0 - vMapUv.y ) ) * nycShare;
        vec4 sampledDiffuseColor = textureGrad( map, vec2( nycArt.x, 1.0 - nycArt.y ), dFdx( vMapUv ) * nycShare, dFdy( vMapUv ) * nycShare );
        float nycPlace = ( vMapUv.x - .5 ) / ${f(PLACE[0])} + nycCount * .5, nycSlot = floor( nycPlace );
        float nycDown = ( ${f(MIDDLE + PLACE[1] / 2)} - vMapUv.y ) / ${f(PLACE[1])};
        if ( nycSlot >= 0.0 && nycSlot < nycCount && nycDown > 0.0 && nycDown < 1.0 ) {
          float nycPair = floor( ( nycSlot < 2.0 ? vPlate.x : nycSlot < 4.0 ? vPlate.y : nycSlot < 6.0 ? vPlate.z : vPlate.w ) + .5 );
          float nycCode = mod( nycSlot, 2.0 ) < .5 ? mod( nycPair, 64.0 ) : floor( nycPair / 64.0 );
          vec2 nycCell = ( vec2( mod( nycCode, ${f(COLUMNS)} ), floor( nycCode / ${f(COLUMNS)} ) ) + vec2( fract( nycPlace ), nycDown ) ) * vec2( ${f(CELL[0] / SHEET)}, ${f(CELL[1] / SHEET)} );
          vec2 nycScale = vec2( ${f(CELL[0] / SHEET / PLACE[0])}, ${f(CELL[1] / SHEET / PLACE[1])} );
          vec2 nycAt = vec2( nycCell.x, 1.0 - nycCell.y ), nycDx = dFdx( vMapUv ) * nycScale, nycDy = dFdy( vMapUv ) * nycScale;
          float nycStamp = textureGrad( nycGlyphs, nycAt, nycDx, nycDy ).r;
          // Stamped proud of the plate: a little light on the upper edge of each stroke, a little shade under it.
          float nycAbove = textureGrad( nycGlyphs, nycAt + vec2( 0.0, .0035 ), nycDx, nycDy ).r, nycBelow = textureGrad( nycGlyphs, nycAt - vec2( 0.0, .0035 ), nycDx, nycDy ).r;
          sampledDiffuseColor.rgb *= 1.0 - .22 * clamp( nycAbove - nycStamp, 0.0, 1.0 );
          sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, nycInk[ int( nycDesign ) ] * ( 1.0 + .5 * clamp( nycStamp - nycBelow, 0.0, 1.0 ) ), nycStamp );
        }
        diffuseColor *= sampledDiffuseColor;`)
      // A plate is reflective sheeting under its own small lamp: it stays readable after dark.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * nycPlateGlow;');
  };
  return shared = material;
}

/** How brightly plates show after dark; 0 is daylight, 1 is night. */
export function setPlateGlow(night) { if (shared) shared.userData.uniforms.nycPlateGlow.value = .32 * Math.max(0, Math.min(1, night)); }

/** A plate's number as the four numbers the shader reads, and its design and length as two more. */
export function packPlate(plate, into = [], look = []) {
  for (let k = 0; k < 4; k++) into[k] = (plate.codes[k * 2] ?? 0) + 64 * (plate.codes[k * 2 + 1] ?? 0);
  look[0] = plate.design; look[1] = Math.min(8, plate.codes.length);
  return [into, look];
}

const AHEAD = new THREE.Vector3(), UP = new THREE.Vector3(), ACROSS_CAR = new THREE.Vector3();
/** Where a plate hangs, as a matrix in the car's own space, from the point `p` and the way the body faces there, `n`. */
function hang({ p, n }) {
  // Upright or nearly: a plate on a sloping nose is bracketed back toward the vertical.
  const tilt = Math.max(-.3, Math.min(.3, n[1])), facing = n[2] < 0 ? -1 : 1;
  AHEAD.set(0, tilt, facing * Math.sqrt(1 - tilt * tilt)); ACROSS_CAR.set(facing, 0, 0); UP.crossVectors(AHEAD, ACROSS_CAR);
  return new THREE.Matrix4().makeBasis(ACROSS_CAR, UP, AHEAD).setPosition(p[0], p[1], p[2]);
}
const anchored = new WeakMap();
/**
 * Where a built car's plates hang: `{ front, rear }` matrices. A body that does not say (an imported
 * exterior) has them at the middle of its nose and its tail.
 */
export function plateAnchors(built) {
  let anchors = anchored.get(built);
  if (anchors) return anchors;
  let places = built.plates;
  if (!places?.front || !places?.rear) {
    if (!built.body.boundingBox) built.body.computeBoundingBox();
    const { min, max } = built.body.boundingBox, height = max.y - min.y;
    places = { front: places?.front || { p: [0, min.y + height * .2, max.z + .012], n: [0, 0, 1] }, rear: places?.rear || { p: [0, min.y + height * .42, min.z - .012], n: [0, 0, -1] } };
  }
  anchors = { front: hang(places.front), rear: hang(places.rear) };
  anchored.set(built, anchors);
  return anchors;
}

const quad = new THREE.PlaneGeometry(PLATE_SIZE[0], PLATE_SIZE[1]);
/**
 * The plates of one car drawn on its own: a mesh to hang on its chassis. `plate` is from plateFor().
 * Its small geometry belongs to it; `dispose()` on the mesh's geometry when the car goes.
 */
export function createPlateMesh(built, plate) {
  const anchors = plateAnchors(built), ends = plate.front ? [anchors.front, anchors.rear] : [anchors.rear];
  const [packed, look] = packPlate(plate), count = ends.length * 4, corner = new THREE.Vector3();
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv = new Float32Array(count * 2), number = new Float32Array(count * 4), looks = new Float32Array(count * 2), index = [];
  ends.forEach((matrix, e) => {
    for (let k = 0; k < 4; k++) {
      const v = e * 4 + k;
      corner.fromBufferAttribute(quad.attributes.position, k).applyMatrix4(matrix).toArray(position, v * 3);
      corner.set(0, 0, 1).transformDirection(matrix).toArray(normal, v * 3);
      uv[v * 2] = quad.attributes.uv.getX(k); uv[v * 2 + 1] = quad.attributes.uv.getY(k);
      number.set(packed, v * 4); looks.set(look, v * 2);
    }
    for (const k of quad.index.array) index.push(e * 4 + k);
  });
  const geometry = new THREE.BufferGeometry();
  for (const [name, array, size] of [['position', position, 3], ['normal', normal, 3], ['uv', uv, 2], ['aPlate', number, 4], ['aPlateLook', looks, 2]]) geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
  geometry.setIndex(index); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, plateMaterial());
  mesh.name = 'Number plates'; mesh.receiveShadow = true; mesh.userData.plate = plate.text;
  return mesh;
}

/**
 * The plates of a batch of cars, as one instanced mesh: `begin()`, then `add(car's matrix, built, plate)`
 * for each car, then `end()`.
 */
export function createPlateBatch(capacity, name = 'Number plates') {
  const geometry = quad.clone();
  const number = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2 * 4), 4), look = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2 * 2), 2);
  geometry.setAttribute('aPlate', number); geometry.setAttribute('aPlateLook', look);
  const mesh = new THREE.InstancedMesh(geometry, plateMaterial(), capacity * 2);
  mesh.name = name; mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true;
  const matrix = new THREE.Matrix4(), packed = [], looks = [];
  return {
    mesh,
    begin() { mesh.count = 0; },
    add(car, built, plate) {
      const anchors = plateAnchors(built);
      packPlate(plate, packed, looks);
      for (const anchor of plate.front ? [anchors.front, anchors.rear] : [anchors.rear]) {
        if (mesh.count >= capacity * 2) return;
        const i = mesh.count++;
        mesh.setMatrixAt(i, matrix.multiplyMatrices(car, anchor));
        number.setXYZW(i, packed[0], packed[1], packed[2], packed[3]); look.setXY(i, looks[0], looks[1]);
      }
    },
    end() { mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = number.needsUpdate = look.needsUpdate = true; },
    dispose() { geometry.dispose(); mesh.dispose(); },
  };
}
