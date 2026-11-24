// Rows carry game data only. Geometry, textures and animation assets come from the installed game.
export const SCENE_INTERVAL = 250;
export const SCENE_RADIUS = 180;
export const MAX_CARS = 220;
export const MAX_ACTORS = 240;
const finite = (n, limit = 100000) => Number.isFinite(n) && Math.abs(n) <= limit;
const text = (s, limit) => typeof s === 'string' && s.length <= limit;
const round = (v, scale = 100) => Math.round((Number.isFinite(v) ? v : 0) * scale) / scale;

export function packCar(car) {
  const id = car.identity;
  return [String(car.id), car.type, round(car.x), round(car.y), round(car.z), round(car.angle,1000),
    round(car.speed), car.color, car.shape || '', id?.make || '', id?.model || '', id?.year || 0,
    car.unit || '', Number(!!car.parked) | Number(!!car._kerb)<<1 | Number(!!car.siren)<<2 |
    Number(!!car.destroyed)<<3 | Number(!!car.driverEjected)<<4, round(car.damage), car.missingDoors || 0,
    round(car.doorOpen), car.doorSide || 0, car.plates || 0, round(car.glassDamage), car.shotGlass || 0, car.brokenGlass || 0, car.rims || '', id?.shape || ''];
}
export function validCar(r) {
  return Array.isArray(r) && r.length === 24 && text(r[0],96) && ['sedan','taxi','police'].includes(r[1]) &&
    r.slice(2,7).every(v => finite(v)) && text(r[7],7) && /^#[0-9a-f]{6}$/i.test(r[7]) && r.slice(8,11).every(v => text(v,96)) &&
    finite(r[11],2100) && text(r[12],32) && r.slice(13,22).every(v => finite(v)) && text(r[22],24) && text(r[23],48);
}

export function packActor(p, member, key, pedestrian=false) {
  const l = p.look;
  return [round(p.x),round(p.y),round(p.z),round(p.heading ?? p.angle,1000),member,
    round(l.height), l.top ?? 0,l.bottom ?? 0,l.skin ?? 0,l.hair ?? 0,l.kit || 0,
    p.reaction?.clip || p.clip || (p.sitting ? 'sit' : (p.walkSpeed || p.stride) ? 'walk' : 'idle'),
    round(p.reaction?.time ?? p.time),round(p.phase), round(p.stride ?? Math.min(1,p.walkSpeed || 0)),
    Number(!!p.sitting) | Number(!!p.cycling)<<1 | Number(!!p.subway)<<2 | Number(pedestrian)<<3,
    typeof p.carry === 'string' ? p.carry : '', key, Number(!!p.dead)];
}
export function validActor(r) {
  return Array.isArray(r) && r.length === 19 && r.slice(0,11).every(v => finite(v,0xffffff)) &&
    Number.isInteger(r[4]) && r[4]>=0 && r[4]<100000 && text(r[11],40) &&
    r.slice(12,16).every(v=>finite(v,1e8)) && text(r[16],40) && Number.isSafeInteger(r[17]) && r[17]>0 && [0,1].includes(r[18]);
}
export function unpackActor(r) {
  const [x,y,z,heading,member,height,top,bottom,skin,hair,kit,clip,time,phase,stride,flags,carry] = r;
  return {sceneId:r[17],pedestrian:!!(flags&8),dead:!!r[18],x,y,z,heading,member,look:{height,top,bottom,skin,hair,kit},clip,time,phase,stride,
    sitting:!!(flags&1),cycling:!!(flags&2),subway:!!(flags&4),carry:carry||null};
}
export function validScene(s) {
  return s && Object.keys(s).every(key=>['cars','actors','air','bikes','doors','glass','equipment','props'].includes(key)) && Array.isArray(s.cars) && s.cars.length<=MAX_CARS && s.cars.every(validCar) &&
    Array.isArray(s.actors) && s.actors.length<=MAX_ACTORS && s.actors.every(validActor) &&
    Array.isArray(s.bikes) && s.bikes.length<=64 && s.bikes.every(r=>Array.isArray(r) && r.length===7 && r.every(v=>finite(v))) &&
    Array.isArray(s.doors) && s.doors.length<=64 && s.doors.every(r=>Array.isArray(r) && r.length===3 && text(r[0],96) && finite(r[1],2) && finite(r[2],12)) &&
    Array.isArray(s.props) && s.props.length<=64 && s.props.every(r=>Array.isArray(r) && r.length===14 &&
      text(r[0],96) && r.slice(1).every(v=>finite(v,100000))) &&
    Array.isArray(s.equipment) && s.equipment.length<=48 && s.equipment.every(r=>Array.isArray(r) && r.length===6 &&
      text(r[0],96) && ['boat','horse','dog','motor','inspect'].includes(r[1]) && r.slice(2).every(v=>finite(v))) &&
    Array.isArray(s.glass) && s.glass.length<=96 && s.glass.every(r=>Array.isArray(r) && r.length===2 && text(r[0],96) && validPane(r[1])) &&
    (s.air===null || Array.isArray(s.air) && s.air.length===9 && s.air.every(v=>finite(v)));
}

export const validPane = value => typeof value==='string' && /^(?:door|fixture:\d{1,4}:\d{1,2}|front:-?1(?::inner)?|side:-?1(?::rear)?)$/.test(value);
