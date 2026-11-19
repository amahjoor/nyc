import {kitchenWall} from './counter-service.js';
import * as THREE from './vendor/three.module.min.js';
import { CEILING, roomPoint } from './room.js';
import { buildBankFinish } from './bank-finish.js';
import { paintSalonWall, paintServiceMenu } from './shop-prints.js';
import { paintPrescriptionWall } from './pharmacy-display.js';

// The floor and finished walls share one texture and draw call. Paint in
// metres so a tile, plank or line of lettering keeps its size in a small room.
function surface(ctx, type, color, width, from, to, random) {
  if (from >= to) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, from, width, to - from); ctx.clip();
  ctx.fillStyle = color; ctx.fillRect(0, from, width, to - from);
  const wood = type === 'wood', rubber = type === 'rubber';
  const pitch = wood ? .19 : rubber ? 1 : .58, length = wood ? 1.65 : pitch;
  ctx.lineWidth = type==='vinyl' ? .004 : wood ? .009 : .014;
  for (let x = 0, i = 0; x < width; x += pitch, i++) {
    const stagger = wood ? length * (i % 3) / 3 : 0;
    for (let b = from - stagger; b < to; b += length) {
      ctx.fillStyle = `rgba(255,251,236,${random() * (wood ? .13 : .042)})`;
      ctx.fillRect(x, b, pitch, length);
      ctx.strokeStyle = rubber ? '#383a3a' : 'rgba(48,45,42,.23)';
      ctx.strokeRect(x, b, pitch, length);
      if (wood) {
        ctx.fillStyle = 'rgba(85,58,41,.13)';
        for (let k = 0; k < 3; k++) ctx.fillRect(x + .02 + random() * .14, b + random(), .008, .18 + random() * .46);
      }
    }
  }
  if (rubber || type === 'stone') {
    for (let i = 0; i < width * (to - from) * 15; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(246,235,213,.19)' : 'rgba(0,0,0,.15)';
      ctx.fillRect(random() * width, from + random() * (to - from), .015 + random() * .016, .011);
    }
  }
  ctx.restore();
}

function paintFloor(ctx, room, right, random) {
  const { width, depth, finish } = room, entry = Math.min(depth, finish.entryDepth || 0);
  surface(ctx, finish.floor, room.floor, width, entry, depth, random);
  if (entry) {
    const colors = { wood: '#bc9d7c', stone: '#aaa79d', tile: '#a7a59e' };
    surface(ctx, finish.entry, colors[finish.entry], width, 0, entry, random);
    ctx.fillStyle = finish.accent; ctx.fillRect(0, entry - .025, width, .025);
    // Ribbed entrance mat set flush with the reception floor.
    ctx.fillStyle = '#414446'; ctx.fillRect(width / 2 - .7, .09, 1.4, .90);
    ctx.fillStyle = '#525455';
    for (let b = .15; b < .96; b += .075) ctx.fillRect(width / 2 - .66, b, 1.32, .022);
  }
  if (room.style === 'bank') {
    ctx.strokeStyle = '#85765c'; ctx.lineWidth = .055;
    ctx.strokeRect(.37, .38, width - .74, depth - .76);
    ctx.strokeStyle = '#d9c99f'; ctx.lineWidth = .025;
    ctx.strokeRect(.45, .46, width - .90, depth - .92);
  }
  // Pools from the downlights and the broad diffuse daylight at the windows.
  for (let b=1.35; b<depth; b+=2.8) {
    for (const x of [width*.23,width*.77]) {
      const pool=ctx.createRadialGradient(x,b,.1,x,b,1.65);
      pool.addColorStop(0,'rgba(255,237,194,.19)'); pool.addColorStop(1,'rgba(255,237,194,0)');
      ctx.fillStyle=pool;ctx.fillRect(x-1.65,b-1.65,3.3,3.3);
    }
  }
  // Contact shadows stay under the fittings as the front turns or mirrors.
  for (const thing of room.things) {
    if (!thing.solid || thing.y > .5) continue;
    const x = width / 2 + right * thing.a;
    for (let k = 3; k >= 0; k--) {
      const pad = .035 + k * .046;
      ctx.fillStyle = 'rgba(23,21,22,.07)';
      ctx.fillRect(x - thing.w / 2 - pad, thing.b - thing.d / 2 - pad, thing.w + pad * 2, thing.d + pad * 2);
    }
  }
}

// Keep a long branch name in proportion as the frontage narrows.
function inscription(ctx, text, x, y, width, size, font, ink) {
  ctx.save(); ctx.scale(.01, .01);
  ctx.font = size * 100 + 'px ' + font;
  const measured = ctx.measureText(text).width;
  if (measured > width * 100) ctx.font = (size * 100 * width * 100 / measured) + 'px ' + font;
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x * 100, y * 100);
  ctx.restore();
}

function bankWall(ctx, room) {
  const w = room.width, f = room.finish;
  ctx.fillStyle = room.wall; ctx.fillRect(0, 0, w, CEILING);
  // Limestone courses behind a metal-edged enamel frieze.
  for (let i = 0; i < 6; i++) {
    const y = i * .57;
    ctx.fillStyle = '#b9af9e'; ctx.fillRect(0, y, w, .014);
    for (let x = .37 + i % 2 * .71; x < w; x += 1.42) ctx.fillRect(x, y, .012, .57);
  }
  const x = .68, panel = w - x * 2;
  ctx.fillStyle = '#999282'; ctx.fillRect(x + .025, .22, panel, .96);
  ctx.fillStyle = f.accent; ctx.fillRect(x, .18, panel, .96);
  ctx.fillStyle = f.feature; ctx.fillRect(x + .034, .214, panel - .068, .89);
  ctx.fillStyle = 'rgba(16,33,36,.25)'; ctx.fillRect(x + .034, .214, panel - .068, .89);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(w / 2 + side * (panel / 2 - .13), .66); ctx.scale(-side, 1);
    ctx.strokeStyle = f.accent; ctx.lineWidth = .014;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(0, -.29 + i * .09); ctx.lineTo(.18 - i * .045, 0); ctx.lineTo(0, .29 - i * .09); ctx.stroke();
    }
    ctx.restore();
  }
  inscription(ctx, f.title, w / 2, .53, panel - .83, .39, 'Georgia, serif', f.ink);
  inscription(ctx, f.line.toUpperCase(), w / 2, .88, panel - .70, .135, 'Arial, sans-serif', f.ink);
  ctx.fillStyle = '#a69a83'; ctx.fillRect(0, 1.55, w, .04);
}

// A screen-printed river landscape in four inks for the reception rooms.
function landscape(ctx, x, y, w, h, f) {
  ctx.save(); ctx.translate(x, y); ctx.scale(w, h);
  ctx.fillStyle = '#eee1c9'; ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = '#d99d70'; ctx.beginPath();
  ctx.ellipse(.67, .27, .108 * h / w, .108, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = f.feature; ctx.beginPath(); ctx.moveTo(0, .43);
  ctx.bezierCurveTo(.26, .29, .38, .63, .62, .52); ctx.quadraticCurveTo(.85, .34, 1, .45);
  ctx.lineTo(1, 1); ctx.lineTo(0, 1); ctx.fill();
  ctx.fillStyle = '#758d80'; ctx.beginPath(); ctx.moveTo(0, .69);
  ctx.bezierCurveTo(.23, .76, .53, .42, .77, .57); ctx.quadraticCurveTo(.88, .62, 1, .55);
  ctx.lineTo(1, 1); ctx.lineTo(0, 1); ctx.fill();
  ctx.fillStyle = '#425d59'; ctx.beginPath(); ctx.moveTo(0, .85);
  ctx.bezierCurveTo(.30, .65, .45, .95, .71, .82); ctx.quadraticCurveTo(.89, .72, 1, .77);
  ctx.lineTo(1, 1); ctx.lineTo(0, 1); ctx.fill();
  ctx.restore();
}

function receptionWall(ctx, room) {
  const w = room.width, f = room.finish, right = room.tx * room.nz - room.tz * room.nx > 0;
  ctx.fillStyle = room.wall; ctx.fillRect(0, 0, w, CEILING);
  // An arched mural on the seating side and lettering above the receptionist.
  const artW = Math.min(w * .37, 2.85), x = right ? .22 : w - artW - .22;
  ctx.save(); ctx.beginPath(); ctx.moveTo(x, CEILING);
  ctx.lineTo(x, 1.29); ctx.bezierCurveTo(x, -.07, x + artW, -.07, x + artW, 1.29);
  ctx.lineTo(x + artW, CEILING); ctx.clip(); landscape(ctx, x, .25, artW, CEILING - .25, f); ctx.restore();
  const cx = right ? (w + artW) / 2 : (w - artW) / 2, lineW = w - artW - .73;
  inscription(ctx, f.title, cx, .68, lineW, .32, 'Georgia, serif', f.ink);
  inscription(ctx, f.line.toUpperCase(), cx, 1.05, lineW, .13, 'Arial, sans-serif', f.ink);
  ctx.fillStyle = f.accent; ctx.fillRect(cx - .21, 1.24, .42, .021);
}

function skylinePrint(ctx, x, width) {
  ctx.save(); ctx.translate(x, .65);
  ctx.fillStyle = '#8f795c'; ctx.fillRect(-.035, -.035, width + .07, .91);
  ctx.fillStyle = '#e8deca'; ctx.fillRect(0, 0, width, .84);
  // Two layers of waterfront buildings, with stepped cornices and a spire.
  ctx.translate(.07, .07); ctx.scale((width - .14) / 2.6, 1);
  ctx.fillStyle = '#c0af91'; ctx.fillRect(0, 0, 2.6, .69);
  ctx.fillStyle = '#ded2b9'; ctx.beginPath(); ctx.arc(1.84, .19, .125, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 18; i++) {
    const h = [.22,.31,.19,.34,.21,.25,.37][i % 7];
    ctx.fillStyle = '#89928a'; ctx.fillRect(i * .146, .57 - h, .142, h);
  }
  ctx.fillStyle = '#485b58';
  for (let i = 0; i < 12; i++) {
    const x = i * .216, h = [.15,.28,.18,.20,.36,.22,.30][i % 7];
    ctx.fillRect(x, .59 - h, .204, h);
    if (i % 3 === 1) ctx.fillRect(x + .037, .55 - h, .131, .055);
    if (i === 4) { ctx.fillRect(x + .066, .50 - h, .074, .08); ctx.fillRect(x + .096, .42 - h, .012, .10); }
  }
  ctx.fillStyle = '#768981'; ctx.fillRect(0, .59, 2.6, .10);
  ctx.restore();
}

function botanicalPrints(ctx, span, f) {
  const w = .49, gap = .12;
  for (let i = 0; i < 3; i++) {
    ctx.save(); ctx.translate(span / 2 + (i - 1) * (w + gap), 1.04);
    ctx.fillStyle = '#9f876b'; ctx.fillRect(-w / 2, -.37, w, .74);
    ctx.fillStyle = i === 1 ? f.feature : '#ece5d3'; ctx.fillRect(-w / 2 + .025, -.345, w - .05, .69);
    ctx.rotate((i - 1) * .16);
    ctx.strokeStyle = '#4b6657'; ctx.lineWidth = .012;
    ctx.beginPath(); ctx.moveTo(-.05, .26); ctx.quadraticCurveTo(.07, .03, .015, -.23); ctx.stroke();
    for (let j = 0; j < 5; j++) {
      const side = j % 2 ? 1 : -1;
      ctx.fillStyle = j % 2 ? '#718879' : '#4f6d5f';
      ctx.beginPath(); ctx.ellipse(.015 + side * .043, .13 - j * .076, .075, .034, side * -.65, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
  }
}

function paintWall(ctx, room) {
  if(room.finish.counterService)return kitchenWall(ctx,room,room.width);
  if(room.finish.portrait)return paintSalonWall(ctx,room);
  if(room.finish.pharmacy)return paintPrescriptionWall(ctx,room);
  if (room.style === 'bank') return bankWall(ctx, room);
  if (room.style === 'waiting') return receptionWall(ctx, room);
  const f = room.finish, w = room.width;
  ctx.fillStyle = f.feature; ctx.fillRect(0, 0, w, CEILING);
  if (f.slats) {
    for (let x = .02; x < w; x += .102) {
      ctx.fillStyle = 'rgba(24,18,15,.36)'; ctx.fillRect(x, 0, .022, CEILING);
      ctx.fillStyle = 'rgba(255,229,185,.16)'; ctx.fillRect(x + .023, 0, .012, CEILING);
    }
  }
  const wash = ctx.createLinearGradient(0, 0, 0, CEILING);
  wash.addColorStop(0, 'rgba(248,238,210,.16)'); wash.addColorStop(.56, 'rgba(23,24,24,.01)'); wash.addColorStop(1, 'rgba(23,24,24,.30)');
  ctx.fillStyle = wash; ctx.fillRect(0, 0, w, CEILING);
  if (f.mirror) {
    const silver = ctx.createLinearGradient(w * .4, 1.16, w * .6, CEILING);
    for (const [at, tint] of [[0, '#aab8b8'], [.32, '#d1d9d6'], [.55, '#a7b7b7'], [1, '#6e7877']]) silver.addColorStop(at, tint);
    ctx.fillStyle = silver; ctx.fillRect(.09, 1.23, w - .18, 1.52);
    for (let x = w / 2 % 1.25; x < w - .1; x += 1.25) {
      ctx.fillStyle = '#788786'; ctx.fillRect(x, 1.23, .016, 1.52);
      ctx.fillStyle = '#dce1dc'; ctx.fillRect(x + .016, 1.23, .011, 1.52);
    }
  }
  ctx.fillStyle = f.accent; ctx.fillRect(0, 1.125, w, .028);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = f.ink;
  // Draw at pixel-sized font metrics. This also keeps browser text layout
  // consistent for small point sizes under a scaled canvas transform.
  ctx.save(); ctx.scale(.01, .01);
  ctx.font = (f.slats ? '500 44px Georgia, serif' : '700 45px Arial, sans-serif');
  ctx.fillText(f.title, w * 50, 46, (w - .65) * 100);
  ctx.font = '600 14px Arial, sans-serif'; ctx.fillText(f.line, w * 50, 87, (w - .5) * 100);
  ctx.restore();
}

// The side walls carry the wayfinding seen at eye level. At a corner the
// painted wall starts after the last pane of the shop window.
function paintSide(ctx, room, side, span) {
  if(room.finish.counterService)return kitchenWall(ctx,room,span,side);
  const f = room.finish, gym = room.style === 'gym', laundry = room.style === 'laundromat';
  ctx.fillStyle = room.wall; ctx.fillRect(0, 0, span, CEILING);
  const wash = ctx.createLinearGradient(0, 0, 0, CEILING);
  wash.addColorStop(0, 'rgba(38,38,35,.21)'); wash.addColorStop(.21, 'rgba(255,244,219,.05)');
  wash.addColorStop(1, 'rgba(31,32,32,.28)');
  ctx.fillStyle = wash; ctx.fillRect(0, 0, span, CEILING);
  const dado = gym ? 2.26 : 1.95;
  ctx.fillStyle = f.feature; ctx.fillRect(0, dado, span, CEILING - dado);
  ctx.fillStyle = f.accent; ctx.fillRect(0, dado - .047, span, .032);
  ctx.fillStyle = 'rgba(25,26,25,.44)'; ctx.fillRect(0, CEILING - .12, span, .12);
  if (room.style === 'bank') {
    ctx.fillStyle = '#8b7259'; ctx.fillRect(0, dado, span, CEILING - dado - .12);
    const panels = Math.max(1, Math.round(span / .87)), step = span / panels;
    ctx.lineWidth = .014; ctx.strokeStyle = '#675740';
    for (let i = 0; i < panels; i++) ctx.strokeRect(i * step + .055, dado + .085, step - .11, CEILING - dado - .29);
    if (side < 0 && span > 2.1) {
      const width = Math.min(2.35, span - .7);
      skylinePrint(ctx, (span - width) / 2, width);
    }
    const machines = room.things.filter(t => t.shape === 'cashMachine' && Math.sign(t.a) === side && t.b >= room.depth - span);
    if (machines.length && span > 1.2) {
      const center = machines.reduce((b, t) => b + t.b, 0) / machines.length;
      const forward = side * (room.tx * room.nz - room.tz * room.nx) > 0;
      const x = Math.max(.57, Math.min(span - .57, forward ? room.depth - center : center - room.depth + span));
      ctx.fillStyle = '#e1d9c7'; ctx.fillRect(x - .49, .69, .98, .35);
      inscription(ctx, 'ATM', x, .865, .80, .19, 'Arial, sans-serif', '#36484a');
    }
  }
  if (room.style === 'waiting' && side < 0 && span > 2.3) botanicalPrints(ctx, span, f);
  if (laundry) {
    ctx.strokeStyle = 'rgba(74,108,109,.19)'; ctx.lineWidth = .012;
    ctx.beginPath();
    for (let y = .27; y < dado; y += .27) { ctx.moveTo(0, y); ctx.lineTo(span, y); }
    for (let x = .42; x < span; x += .42) { ctx.moveTo(x, 0); ctx.lineTo(x, dado); }
    ctx.stroke();
  }
  if((f.corner==='deli' && side===-1) || (f.portrait && side===1)){paintServiceMenu(ctx,room,side,span);return;}
  if (span < 1.65 || !f.zones.length) return;
  const w = Math.min(3.3, span - .46), x = (span - w) * .5;
  const zone = f.zones[side < 0 ? 0 : 1];
  // One band above each bank of equipment. Keep it above the stacked
  // dryers and PO boxes so it can be read from the opposite aisle.
  const up = gym ? .78 : .27, high = gym ? .92 : .64;
  ctx.fillStyle = 'rgba(35,33,31,.18)'; ctx.fillRect(x + .035, up + .038, w, high);
  ctx.fillStyle = f.feature; ctx.fillRect(x, up, w, high);
  ctx.fillStyle = f.accent; ctx.fillRect(x, up, .055, high);
  ctx.save(); ctx.scale(.01, .01);
  ctx.fillStyle = f.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = gym ? '600 26px Arial, sans-serif' : '700 23px Arial, sans-serif';
  ctx.fillText(zone, (x + .17) * 100, (up + high / 2) * 100, (w - .36) * 100);
  ctx.restore();
  if (span < 6.5 || !gym) return;
  // Vertical timber strips or acoustic panels break up the lengths of
  // painted plaster on either side of the sign.
  for (const center of [x / 2, span - x / 2]) {
    const wide = Math.min(x - .35, 1.65);
    ctx.fillStyle = f.slats ? '#947456' : f.feature;
    ctx.fillRect(center - wide / 2, .37, wide, dado - .37);
    for (let i = .045; i < wide; i += .085) {
      ctx.fillStyle = 'rgba(30,26,24,.33)'; ctx.fillRect(center - wide / 2 + i, .37, .018, dado - .37);
    }
  }
}

export function buildRoomFinish(room, y) {
  if (!room.finish || typeof document === 'undefined') return null;
  if (room.finish.bank) return buildBankFinish(room,y);
  const { width, depth } = room, scale = 72, wallTop = Math.ceil(depth * scale) + 4;
  const canvas = document.createElement('canvas'), floorPixels = Math.ceil(width * scale), sidePixels = Math.ceil(CEILING * scale);
  canvas.width = floorPixels + 2 * (sidePixels + 4); canvas.height = wallTop + sidePixels;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const right = room.tx * room.nz - room.tz * room.nx > 0 ? 1 : -1;
  let seed = room.finish.seed;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.setTransform(floorPixels / width, 0, 0, scale, 0, 0);
  paintFloor(ctx, room, right, random);
  ctx.setTransform(floorPixels / width, 0, 0, scale, 0, wallTop);
  paintWall(ctx, room);

  const positions = [], uv = [], indices = [], h = canvas.height;
  function corner(a, b, up, u, v) {
    const [x, z] = roomPoint(room, a, b);
    positions.push(x, y + up, z); uv.push(u / canvas.width, 1 - v / h);
  }
  const floorY = .033, leftA = -right * width / 2, rightA = -leftA;
  corner(leftA, .06, floorY, 0, .06 * scale); corner(rightA, .06, floorY, floorPixels, .06 * scale);
  corner(rightA, depth, floorY, floorPixels, depth * scale); corner(leftA, depth, floorY, 0, depth * scale);
  corner(leftA, depth - .01, 0, 0, h); corner(rightA, depth - .01, 0, floorPixels, h);
  corner(rightA, depth - .01, CEILING, floorPixels, wallTop); corner(leftA, depth - .01, CEILING, 0, wallTop);
  for (const side of [-1, 1]) {
    const start = Math.max(.06, room.returns?.find(edge => edge.side === side)?.length || 0), span = depth - start;
    if (span < .025) continue;
    const u = floorPixels + 4 + (side > 0 ? sidePixels + 4 : 0), a = side * (width / 2 - .01);
    ctx.setTransform(0, scale, scale, 0, u, 2);
    paintSide(ctx, room, side, span);
    const [left, rightB] = side * right > 0 ? [depth, start] : [start, depth];
    corner(a, left, 0, u + sidePixels, 2); corner(a, rightB, 0, u + sidePixels, 2 + span * scale);
    corner(a, rightB, CEILING, u, 2 + span * scale); corner(a, left, CEILING, u, 2);
  }
  for (let i = 0; i < positions.length / 3; i += 4) indices.push(i, i+1, i+2, i, i+2, i+3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Floor finish and feature wall';
  return mesh;
}

// Shade the batched architecture and props in room coordinates. Direct light
// falls off from the shop window and the two rows of ceiling fixtures. Keeping
// this local also works when a street has several open rooms in one city tile.
let surfaceAtlas;
function shopMaterials(){
  if(!surfaceAtlas && typeof Image!=='undefined'){
    surfaceAtlas=new THREE.TextureLoader().load(new URL('./assets/shop-materials.jpg',import.meta.url).href);
    surfaceAtlas.anisotropy=4;
  }
  return surfaceAtlas;
}
export function lightRoomSurface(material,room,y,textured=false) {
  const compile=material.onBeforeCompile, previous=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>previous+'|shop-material-'+Number(textured);
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    shader.uniforms.surfaceAtlas={value:shopMaterials()};
    shader.uniforms.floorTile={value:room.finish?.bank ? 0 : ({wood:1,stone:2,tile:2,rubber:4})[room.finish?.floor]||0};
    shader.uniforms.roomOrigin={value:new THREE.Vector3(room.x,y,room.z)};
    shader.uniforms.roomBasis={value:new THREE.Vector4(room.tx,room.tz,room.nx,room.nz)};
    shader.uniforms.roomSize={value:new THREE.Vector2(room.width,room.depth)};
    shader.uniforms.roomTint={value:new THREE.Color(room.light?.color??0xffecda)};
    const tileAttribute=textured?'':'attribute float surfaceTile; varying float shopTile;\n';
    shader.vertexShader=tileAttribute+'uniform vec3 roomOrigin; uniform vec4 roomBasis; varying vec3 roomPos;\n'+shader.vertexShader.replace(
      '#include <project_vertex>',`vec3 rel=position-roomOrigin;
      roomPos=vec3(dot(rel.xz,roomBasis.xy),rel.y,-dot(rel.xz,roomBasis.zw));
      ${textured?'':'shopTile=surfaceTile;'}
      #include <project_vertex>`);
    shader.fragmentShader=`${textured?'':'varying float shopTile;'} uniform float floorTile; uniform sampler2D surfaceAtlas;
      varying vec3 roomPos; uniform vec3 roomOrigin; uniform vec4 roomBasis; uniform vec2 roomSize; uniform vec3 roomTint;
      `+shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 p=roomPos;
      vec3 N=normalize(cross(dFdx(p),dFdy(p)));
      N*=sign(roomBasis.y*roomBasis.z-roomBasis.x*roomBasis.w);
      float lampZ=clamp(1.5+3.*floor((p.z+.01)/3.),1.5,max(1.5,roomSize.y-.55));
      vec3 lamp=vec3((p.x<0.?-1.:1.)*roomSize.x*.24,2.95,lampZ)-p;
      float bounce=.12*smoothstep(0.,1.45,p.y);
      float beam=max(0.,dot(N,normalize(lamp)))/(1.+.30*dot(lamp,lamp));
      vec3 windowDir=vec3(0.,1.85,-.4)-p;
      float windowLight=max(0.,dot(N,normalize(windowDir)))/(1.+.12*dot(windowDir,windowDir));
      float edge=min(roomSize.x*.5-abs(p.x),roomSize.y-p.z);
      float occlusion=.85+.15*smoothstep(-.03,.70,max(edge,.02)+max(p.y-.2,0.)*.75);
      vec3 illumination=vec3(.61+bounce)+mix(vec3(1.),roomTint,.45)*beam*1.35+vec3(.82,.92,1.)*windowLight*.84;
      outgoingLight*=illumination*occlusion;
      float tile=${textured?'(N.y>.70 && p.y<.1 ? floorTile : 0.)':'shopTile'};
      vec2 uv=abs(N.y)>.58 ? p.xz : vec2(abs(N.x)>.57?p.z:p.x,p.y);
      if(tile>.5 && tile<4.5){
        vec2 atlasOrigin=tile<1.5?vec2(0.,.5):tile<2.5?vec2(.5,.5):tile<3.5?vec2(0.):vec2(.5,0.);
        vec2 coords=uv*(tile<1.5?vec2(.92,1.6):vec2(tile<2.5?1.1:tile<3.5?8.:2.5));
        // A mirrored repeat and explicit gradients keep quarter-atlas edges out of the mip footprint.
        vec2 wrapped=1.-abs(mod(coords,2.)-1.);
        vec3 fiber=textureGrad(surfaceAtlas,atlasOrigin+.006+.488*wrapped,.488*dFdx(coords),.488*dFdy(coords)).rgb;
        float mean=tile<1.5?.64:tile<2.5?.67:tile<3.5?.52:.205;
        float detail=clamp(dot(fiber,vec3(.27,.63,.10))/mean,.48,1.76);
        outgoingLight*=mix(1.,detail,tile<1.5?.69:.52);
      }
      // Brushed steel and glazed surfaces catch the ceiling fixture as the viewer moves.
      if(tile>4.5){
        vec3 eye=cameraPosition-roomOrigin;
        vec3 viewDir=normalize(vec3(dot(eye.xz,roomBasis.xy),eye.y,-dot(eye.xz,roomBasis.zw))-p);
        float gloss=tile>5.5?65.:32.;
        float gleam=pow(max(0.,dot(N,normalize(viewDir+normalize(lamp)))),gloss);
        float sky=pow(max(0.,dot(N,normalize(viewDir+normalize(windowDir)))),gloss*.45);
        outgoingLight+=roomTint*gleam*.42/(1.+.13*dot(lamp,lamp))+vec3(.82,.90,1.)*sky*.15;
      }
      #include <opaque_fragment>`);
  };
}
