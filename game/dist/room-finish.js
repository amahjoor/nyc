import * as THREE from './vendor/three.module.min.js';
import { CEILING, roomPoint } from './room.js';

// The floor and finished walls share one texture and draw call. Paint in
// metres so a tile, plank or line of lettering keeps its size in a small room.
function surface(ctx, type, color, width, from, to, random) {
  if (from >= to) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, from, width, to - from); ctx.clip();
  ctx.fillStyle = color; ctx.fillRect(0, from, width, to - from);
  const wood = type === 'wood', rubber = type === 'rubber';
  const pitch = wood ? .19 : rubber ? 1 : .58, length = wood ? 1.65 : pitch;
  ctx.lineWidth = wood ? .009 : .014;
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

function paintWall(ctx, room) {
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
  if (laundry) {
    ctx.strokeStyle = 'rgba(74,108,109,.19)'; ctx.lineWidth = .012;
    ctx.beginPath();
    for (let y = .27; y < dado; y += .27) { ctx.moveTo(0, y); ctx.lineTo(span, y); }
    for (let x = .42; x < span; x += .42) { ctx.moveTo(x, 0); ctx.lineTo(x, dado); }
    ctx.stroke();
  }
  if (span < 1.65) return;
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
