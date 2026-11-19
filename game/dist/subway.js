// Mapped station entrances and the timetable used inside their platforms.
import * as THREE from './vendor/three.module.min.js';
import { propId } from './street-objects.js';
import { propInstance } from './prop-instance.js';
import { createStairwellOpenings, HALF_WIDTH, HALF_LENGTH } from './stairwell-openings.js';

import { createTimetable, FARE } from './subway-service.js';
import { createPlatformView } from './subway-platform.js';
export { SUBWAY_LAYER } from './subway-platform.js';
import { createSubwayVisit } from './subway-visit.js';
import { raisedStation } from './subway-space.js';
export { FARE };
const CELL = 256;
const STEP_COUNT = 12, STEP_RUN = .32, WELL_DEPTH = 2.1;
const treadHeight = index => index >= STEP_COUNT ? -WELL_DEPTH + .16 : -.08 - index * .165;

/** The stations and their entrances, from transit.json. */
export function createSubway(data = null) {
  const stations = (data?.stations || []).map((station, index) => ({ ...station, index, lines: station.routes.split(' ') }));
  const table=createTimetable(data,stations);
  const grid = new Map();
  for (const station of stations) {
    const entries=new Set(station.entrances.map(e=>e.slice(0,3).join(',')));
    const exitOnly=(station.exits||[]).filter(e=>!entries.has(e.slice(0,3).join(',')));
    for(const [x,z,kind,stop] of [...station.entrances,...exitOnly]) {
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ x, z, kind, stop, station, entry:entries.has([x,z,kind].join(',')) });
    }
  }
  const system={
    stations, table,
    preview:scene=>createPlatformView(scene),
    visit(entrance,now,options){return createSubwayVisit(table,entrance,now,options);},
    /** Entrances within `radius` of (x, z), nearest first: { x, z, kind, station }. */
    entrancesNear(x,z,radius=200){return system.portalsNear(x,z,radius).filter(e=>e.entry);},
    portalsNear(x, z, radius = 200) {
      const found = [];
      for (let gx = Math.floor((x - radius) / CELL); gx <= Math.floor((x + radius) / CELL); gx++) for (let gz = Math.floor((z - radius) / CELL); gz <= Math.floor((z + radius) / CELL); gz++) {
        for (const entrance of grid.get(`${gx},${gz}`) || []) if (Math.hypot(entrance.x - x, entrance.z - z) <= radius) found.push(entrance);
      }
      return found.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    },
    /**
     * Destinations directly reachable on a listed daytime line. Real trips
     * keep branch terminals from appearing as through destinations.
     */
    ridesFrom(station) {
      const downstream=new Map();
      if(data?.patterns){
        for(const pattern of data.patterns){
          const line=data.routes[pattern.route].name;
          if(!station.lines.includes(line))continue;
          const index=pattern.stops.findIndex(stop=>table.stationAt(stop)===station);
          if(index<0)continue;
          for(const stop of pattern.stops.slice(index+1)){
            const destination=table.stationAt(stop);
            if(!downstream.has(destination))downstream.set(destination,new Set());
            downstream.get(destination).add(line);
          }
        }
      }
      const rides=[];
      for(const other of stations){
        if(other===station)continue;
        const lines=data?.patterns ? [...(downstream.get(other)||[])] : other.lines.filter(line=>station.lines.includes(line));
        if(lines.length)rides.push({station:other,lines,distance:Math.hypot(other.x-station.x,other.z-station.z)});
      }
      return rides.sort((a,b)=>a.distance-b.distance);
    },
    /** Where the player comes up at a station: beside its first stair, or failing that any entrance. */
    exitOf(station, near=station) {
      const exits=station.exits || station.entrances;
      const [x,z,kind,stop]=exits.reduce((a,b)=>Math.hypot(b[0]-near.x,b[1]-near.z)<Math.hypot(a[0]-near.x,a[1]-near.z)?b:a);
      return {x,z,kind,stop,station};
    },
  };
  return system;
}

/**
 * Draw the stair entrances around the player. `subway` is createSubway();
 * `facing(x, z)` gives the direction [x, z] the stair should run in, along
 * the kerb it stands beside, or null. A surveyed kerb also gives its outward
 * normal so a rounded entrance coordinate can be set back onto the sidewalk.
 */
export function createSubwayEntrances({ scene = null, heightAt = () => 0, facing = () => null, kerbAt = () => null, range = 220, capacity = 96, physics = null } = {}) {
  const group = new THREE.Group(); group.name = 'Subway entrances'; scene?.add(group);
  const openings = createStairwellOpenings(range, capacity);
  // The open end is at negative Z. The treads, landing and retaining walls
  // meet under a narrow stone lip that conceals the cut edge of the paving.
  const parts = [], add = (w, h, d, x, y, z, tone) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z); parts.push([g, tone]); };
  const GREEN = [.03, .2, .11], DARK = [.02, .02, .022];
  const width = HALF_WIDTH * 2, length = HALF_LENGTH * 2, depth = WELL_DEPTH, run = STEP_RUN;
  const stone = [.27,.26,.23], wall = [.20,.205,.19];
  for (let i = 0; i < STEP_COUNT; i++) {
    const top = treadHeight(i), front = -HALF_LENGTH + i * run, grey = .30 - i * .015;
    add(width, depth + top, run, 0, (top - depth) / 2, front + run / 2, [grey,grey,grey * .95]);
    add(width, .012, .035, 0, top + .004, front + .022, i === 0 ? [.66,.45,.10] : [grey+.065,grey+.065,grey+.055]);
  }
  const landing = length - STEP_COUNT * run;
  add(width, .16, landing, 0, -depth + .08, HALF_LENGTH - landing / 2, [.13,.13,.12]);
  for (const side of [-1,1]) {
    add(.11, depth + .06, length + .12, side * (HALF_WIDTH + .035), (.06 - depth) / 2, 0, wall);
    add(.15, .12, length + .16, side * (HALF_WIDTH + .045), .022, 0, stone);
    if(side<0)add(width, depth + .04, .10, 0, (.04 - depth) / 2, -HALF_LENGTH - .035, wall);
  }
  add(width, .10, .12, 0, -.018, -HALF_LENGTH - .04, stone);
  add(width, .12, .13, 0, .022, HALF_LENGTH + .04, stone);
  add(.08, 2.6, .08, -.78, 1.3, -2.15, GREEN); add(.08, 2.6, .08, .78, 1.3, -2.15, GREEN);
  add(1.7, .32, .06, 0, 2.3, -2.15, DARK);
  const position = [], normal = [], color = [];
  for (const [g, tone] of parts) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { position.push(p.getX(i), p.getY(i), p.getZ(i)); normal.push(n.getX(i), n.getY(i), n.getZ(i)); color.push(...tone); } g.dispose(); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .3 }); paint.name = 'Subway entrance';
  const stairs = new THREE.InstancedMesh(geometry, paint, capacity); stairs.name = 'Subway stairs'; stairs.count = 0; stairs.frustumCulled = false; stairs.castShadow = true;
  const globe = new THREE.SphereGeometry(.17, 10, 8); globe.translate(0, 2.72, -2.15);
  const glow = new THREE.MeshBasicMaterial({ color: 0x35d06a, toneMapped: false }); glow.name = 'Subway globe';
  const globes = new THREE.InstancedMesh(globe, glow, capacity * 2); globes.name = 'Subway globes'; globes.count = 0; globes.frustumCulled = false;
  // Open ironwork preserves the view down the steps from the sidewalk. Each
  // panel remains a single instance so its visible pose follows its collider.
  const railVertices = [], railNormals = [];
  const railBar = (width, height, length, y, z) => {
    const box = new THREE.BoxGeometry(width,height,length).toNonIndexed().translate(0,y,z);
    railVertices.push(...box.attributes.position.array); railNormals.push(...box.attributes.normal.array); box.dispose();
  };
  railBar(.072,.075,1,.97,0); railBar(.055,.06,1,.15,0);
  for (let i = 0; i <= 12; i++) railBar(.048,1,.011,.5,(i / 12 - .5) * .989);
  const railGeometry = new THREE.BufferGeometry();
  railGeometry.setAttribute('position',new THREE.Float32BufferAttribute(railVertices,3));
  railGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(railNormals,3));
  const railPaint = new THREE.MeshStandardMaterial({ color:new THREE.Color(...GREEN), roughness:.55, metalness:.3 });
  const rails = new THREE.InstancedMesh(railGeometry,railPaint,capacity*3);
  rails.name='Subway railing panels'; rails.count=0; rails.frustumCulled=false; rails.castShadow=true;
  group.add(stairs, globes, rails);
  // Street-level station houses, lifts and stairs up to viaducts do not cut holes in the pavement.
  const overhead = new THREE.Group(), portalParts=[];
  group.add(overhead);
  const part=(kind,w,h,d,x,y,z,color)=>{
    const geo=new THREE.BoxGeometry(w,h,d).translate(x,y,z);
    const mat=new THREE.MeshStandardMaterial({color,roughness:.65});
    const mesh=new THREE.InstancedMesh(geo,mat,capacity);mesh.count=0;mesh.frustumCulled=false;
    overhead.add(mesh);portalParts.push({kind,mesh});
  };
  for(let i=0;i<12;i++)part('up',1.48,(i+1)*.165,.32,0,(i+1)*.165/2,-HALF_LENGTH+(i+.5)*.32,0x7a817c);
  part('up',1.48,.18,length-12*run,0,1.89,HALF_LENGTH-(length-12*run)/2,0x7a817c);
  for(const side of [-1,1]){
    for(const z of [-1.8,1.5])part('up',.11,3,.11,side*.76,1.5,z,0x365747);
    part('door',.13,2.6,1.25,side*.87,1.3,0,0x505b53);
    part('lift',.12,2.4,1.4,side*.79,1.2,0,0x52716b);
  }
  part('up',1.85,.15,2.1,0,3.15,-1.1,0x465f53);
  for(const kind of ['door','lift']){
    part(kind,1.85,.20,1.65,0,2.57,0,0x30483e);
    part(kind,1.2,.19,.09,0,2.34,-.76,0x83b598);
  }
  const matrix = new THREE.Matrix4(), frame = new THREE.Matrix4(), local = new THREE.Matrix4(), offset = new THREE.Vector3();
  let at = null, shown = [], frames = [], portals=[], raised=[];
  function resolve(e,subway){
    const edge=kerbAt(e.x,e.z),way=edge?[edge.tx,edge.tz]:facing(e.x,e.z);
    const angle=way?Math.atan2(way[0],way[1]):0;
    const structure=subway?.table?.platforms[e.stop]?.structure;
    const open=raisedStation(structure);
    let {x,z}=e;
    if(!open && e.kind===0 && edge){
      const setback=(edge.x-x)*edge.nx+(edge.z-z)*edge.nz;
      const shift=Math.max(0,HALF_WIDTH+.28-setback);
      x-=shift*edge.nx;z-=shift*edge.nz;
      // Near corners the curb at the far end can turn across the opening.
      for(const end of [-HALF_LENGTH,HALF_LENGTH]){
        const ex=x+edge.tx*end,ez=z+edge.tz*end,corner=kerbAt(ex,ez);
        if(!corner || corner.distance>2.5)continue;
        const inward=(corner.x-ex)*corner.nx+(corner.z-ez)*corner.nz;
        const halfAcross=HALF_WIDTH*Math.abs(edge.tz*corner.nx-edge.tx*corner.nz);
        const move=Math.max(0,halfAcross+.28-inward);
        x-=move*corner.nx;z-=move*corner.nz;
      }
    }
    const s=Math.sin(angle),c=Math.cos(angle);
    const grade=!open && e.kind===0?(heightAt(x+s*HALF_LENGTH,z+c*HALF_LENGTH)-heightAt(x-s*HALF_LENGTH,z-c*HALF_LENGTH))/length:0;
    return {...e,x,z,y:heightAt(x,z),angle,open,grade,source:e};
  }
  return {
    group, openings, resolve,
    /** The entrances drawn, as { x, z, station }. */
    get entrances() { return shown; },
    get portals() { return portals; },
    /** Walking uses the same grade and treads as the rendered well. */
    surfaceAt(x, z) {
      for(const f of raised){
        const dx=x-f.x,dz=z-f.z,along=dx*f.s+dz*f.c;
        if(Math.abs(dx*f.c-dz*f.s)<HALF_WIDTH && along>=-HALF_LENGTH && along<HALF_LENGTH)
          return {elevation:f.y+.165*Math.min(12,1+Math.floor((along+HALF_LENGTH)/STEP_RUN)),kind:'stairs'};
      }
      for (const f of frames) {
        const dx = x - f.x, dz = z - f.z;
        if (Math.abs(dx) > 2.3 || Math.abs(dz) > 2.3) continue;
        const across = dx*f.c - dz*f.s, along = dx*f.s + dz*f.c;
        if (Math.abs(across) >= HALF_WIDTH || Math.abs(along) >= HALF_LENGTH) continue;
        const step = Math.floor((along + HALF_LENGTH) / STEP_RUN);
        return { elevation: f.y + across*f.crossfall + along*f.grade + treadHeight(step), kind: 'stairs' };
      }
      return null;
    },
    update(subway, focus, kerbs = null, terrainRevision = 0) {
      openings.setVisible(group.visible);
      if (at && at.subway === subway && at.kerbs === kerbs && at.terrainRevision === terrainRevision
        && Math.hypot(focus.x - at.x, focus.z - at.z) < 40) return false;
      at = { subway, kerbs, terrainRevision, x: focus.x, z: focus.z };
      const all=subway ? (subway.portalsNear || subway.entrancesNear)(focus.x,focus.z,range).slice(0,capacity).map(e=>resolve(e,subway)) : [];
      const kindOf=e=>e.kind===1?'lift':e.kind===2?'door':e.open?'up':'down';
      const nearby=all.filter(e=>kindOf(e)==='down');
      portals=[];raised=[];
      for(const {mesh} of portalParts)mesh.count=0;
      for(const e of all){
        const kind=kindOf(e);
        if(kind==='down')continue;
        const {angle,y}=e;
        matrix.makeRotationY(angle).setPosition(e.x,y,e.z);
        for(const part of portalParts)if(part.kind===kind){
          part.mesh.setMatrixAt(part.mesh.count++,matrix);part.mesh.instanceMatrix.needsUpdate=true;
        }
        portals.push({...e,angle});
        if(kind==='up')raised.push({x:e.x,z:e.z,y,s:Math.sin(angle),c:Math.cos(angle)});
      }
      shown = []; frames = [];
      const bodies = [], liners = [];
      nearby.forEach((entrance, i) => {
        const {x,z,y,angle,grade}=entrance;
        shown.push(entrance);
        const s=Math.sin(angle),c=Math.cos(angle);
        const sample = (across,along) => heightAt(x + c*across + s*along, z - s*across + c*along);
        const crossfall = (sample(HALF_WIDTH,0) - sample(-HALF_WIDTH,0)) / width;
        frame.set(c,0,s,x, crossfall,1,grade,y, -s,0,c,z, 0,0,0,1);
        stairs.setMatrixAt(i,frame); frames.push({x,y,z,angle,s,c,crossfall,grade});
        for (const side of [-1, 1]) {
          matrix.multiplyMatrices(frame,local.makeTranslation(side * .78,0,0));
          globes.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), matrix);
        }
        for (let panel=0; panel<3; panel++) {
          const end = panel===2, length=end?1.6:4.3, heading=angle+(end?Math.PI/2:0);
          local.makeRotationY(end ? Math.PI/2 : 0).scale(offset.set(1,1,length)).setPosition(end?0:panel===0?-.78:.78,0,end?HALF_LENGTH:0);
          matrix.multiplyMatrices(frame,local); offset.setFromMatrixPosition(matrix);
          const slot=i*3+panel; rails.setMatrixAt(slot,matrix);
          if (physics) {
            const body={ id:propId('rail',entrance.x,entrance.z)+'/'+panel, x:offset.x, y:offset.y, z:offset.z,
              tx:Math.sin(heading), tz:Math.cos(heading), half:length/2, radius:.03, height:1 };
            body.draw=propInstance(rails,slot,body,matrix); bodies.push(body);
            if(!end)liners.push({ id:body.id+'/wall', x:body.x, z:body.z, y:body.y-depth-.10, tx:body.tx, tz:body.tz,
              half:body.half, radius:.045, height:depth-.14, belowGrade:true });
          }
        }
      });
      portals.push(...shown);
      stairs.count = shown.length; globes.count = shown.length * 2; stairs.instanceMatrix.needsUpdate = globes.instanceMatrix.needsUpdate = true;
      rails.count=shown.length*3; rails.instanceMatrix.needsUpdate=true; physics?.replace('rail',bodies);
      physics?.replace('stair-wall',liners);
      openings.update(frames); openings.setVisible(group.visible);
      return true;
    },
    dispose() { for(const {mesh} of portalParts){mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();} physics?.replace('rail',[]); physics?.replace('stair-wall',[]); openings.dispose(); rails.dispose(); railGeometry.dispose(); railPaint.dispose(); geometry.dispose(); globe.dispose(); paint.dispose(); glow.dispose(); stairs.dispose(); globes.dispose(); group.removeFromParent(); },
  };
}
