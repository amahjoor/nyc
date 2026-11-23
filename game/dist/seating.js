// A furniture anchor is the centre of the load-bearing surface. x/y/z refer
// to the floor beneath it; seatHeight is measured from that floor in metres.
export const SEAT_CLIPS = {
  chair: 'seatChair', bench: 'seatBench', booth: 'seatBooth', lounge: 'seatLounge', stool: 'seatStool',
};
export const seatClip = seat => SEAT_CLIPS[seat.seatKind] || SEAT_CLIPS.chair;
export const FURNITURE_CLIPS = Object.values(SEAT_CLIPS);
export const seatHeight = seat => seat.seatHeight ?? (.45 + (seat.lift || 0));
export const footHeight = seat => seat.footHeight ?? (seat.seatKind === 'stool' ? seatHeight(seat) * .38 + .02 : 0);

// Pose sheets are instanced at the cushion, while the character preview and
// the live player's skeleton are placed at floor level.
export const previewSeats = {}, sheetSeats = {};
for (const [seatKind, clip] of Object.entries(SEAT_CLIPS)) {
  const height = seatKind === 'stool' ? .75 : seatKind === 'lounge' ? .52 : .45;
  const seat = previewSeats[clip] = { seatKind, seatHeight: height };
  sheetSeats[clip] = { seatKind, seatHeight: 0, footHeight: footHeight(seat) - height };
}

const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export function seatApproachEnd(path,seat,fromX,fromZ) {
  const last = path.points.at(-1);
  return Math.hypot(seat.x-(last?.x??fromX),seat.z-(last?.z??fromZ));
}

// Finish the turn beside the cushion. From behind a chair, walk round the
// nearer end of its backrest first. A table or adjacent chair may rule out
// that side, in which case try the other one.
export function seatApproach(player, seat, clear = () => true) {
  const sin = Math.sin(seat.heading), cos = Math.cos(seat.heading);
  const dx = player.x - seat.x, dz = player.z - seat.z;
  const across = dx*cos - dz*sin, front = dx*sin + dz*cos;
  const side = (seat.seatWidth ?? .4)/2 + .17, depth = (seat.seatDepth ?? .4)/2 + .14;
  const point = (a,b) => ({x:seat.x+a*cos+b*sin, z:seat.z-a*sin+b*cos});
  const route = points => {
    let previous = player, length = 0;
    for (const p of points) {
      if (!clear(previous,p)) return null;
      length += Math.hypot(p.x-previous.x,p.z-previous.z);
      p.distance=length; previous=p;
    }
    return clear(previous,seat) ? {points,length} : null;
  };
  if (seat.seatKind !== 'stool' && front < -depth*.65 && Math.abs(across) < side) {
    if (seat.shelter) return null; // The rear wall is glazed.
    for (const sign of [Math.sign(across)||1, -(Math.sign(across)||1)]) {
      const path=route([point(sign*side, Math.min(front,-depth)), point(sign*side,0)]);
      if (path) return path;
    }
    return null;
  }
  const divisor=Math.max(1,Math.abs(across)/side,Math.abs(front)/depth);
  return route([point(across/divisor,front/divisor)]);
}

// Get alongside the cushion and turn before taking weight off the feet.
// Running the same path backwards lets a second press interrupt the descent.
export function stepSeating(player, seat, dt) {
  const direction = seat.leaving ? -1 : 1;
  seat.progress = Math.max(0, Math.min(1, seat.progress + direction * dt / seat.duration));
  const align = ease(seat.progress / .4);
  const weight = seat.weight = ease((seat.progress - .4) / .6);
  const previousX = player.x, previousZ = player.z;
  const {points,length} = seat.path;
  const finalLeg = seat.alignAtSeat ? seatApproachEnd(seat.path,seat,seat.fromX,seat.fromZ) : 0;
  const along = (length + finalLeg) * align;
  let x=seat.fromX, z=seat.fromZ, start=0;
  for (const p of points) {
    const t = p.distance > start ? Math.min(1,(along-start)/(p.distance-start)) : 1;
    x += (p.x-x)*t; z += (p.z-z)*t;
    if (along<=p.distance) break;
    start=p.distance;
  }
  const onCushion = seat.alignAtSeat ? finalLeg ? Math.max(0,Math.min(1,(along-length)/finalLeg)) : Number(align===1) : weight;
  player.x = x + (seat.x-x)*onCushion;
  player.z = z + (seat.z-z)*onCushion;
  player.y = seat.fromY + (seat.y-seat.fromY)*ease(seat.progress);
  player.angle = seat.fromAngle + seat.turn * align;
  seat.stepSpeed = dt > 0 && seat.progress < .4 ? Math.hypot(player.x - previousX, player.z - previousZ) / dt : 0;
}

// Measured from the standing eye to the seat plane. Use the same support
// height and weight as the body, including while getting off a high stool.
export const seatEyeOffset = (seat, height) => seat ? seat.weight * (seatHeight(seat) + .81 * height / 1.76 - (height - .12)) : 0;
