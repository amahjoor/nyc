import { UNIFORMS } from './police-units.js';

// Fitted in the same bind pose as the garments so both the live skeleton and the
// street pose atlas can draw the equipment. Units are metres before posing.
// The source artwork is game/data/patrol-jacket.svg, baked to WebP for both renderers.
const MAP = 'patrol-jacket.webp';
const SWATCH = { navy: 396, band: 436, leather: 476, edge: 516, silver: 556, pouch: 596 };
const TAU = 2 * Math.PI;

// Intersect a horizontal plane with a fitted mesh. The width limit excludes sleeves.
function section(piece, y, halfWidth = Infinity) {
  const segments = [], p = piece.position, indices = piece.index;
  for (let i = 0; i < indices.length; i += 3) {
    const hits = [];
    for (let j = 0; j < 3; j++) {
      const a = indices[i+j]*3, b = indices[i+(j+1)%3]*3;
      if ((p[a+1] > y) === (p[b+1] > y)) continue;
      const t = (y-p[a+1]) / (p[b+1]-p[a+1]);
      hits.push([p[a]+t*(p[b]-p[a]), p[a+2]+t*(p[b+2]-p[a+2])]);
    }
    if (hits.length === 2 && hits.every(([x]) => Math.abs(x) < halfWidth)) segments.push(hits);
  }
  return segments;
}

export function fitPatrolUniform(pieces, rig, marks, wardrobe = 'patrol') {
  const style=UNIFORMS[wardrobe];
  if (!style) return;
  const jacket = pieces.find(p => p.slot === 'top'), trousers = pieces.find(p => p.slot === 'bottom');
  if (!jacket || !trousers) return;
  Object.assign(jacket, { id: wardrobe==='patrol'?'patrol-jacket':'patrol-'+wardrobe, map: wardrobe==='patrol'?MAP:'patrol-'+wardrobe+'.webp', normalMap: 'patrol-cloth-normal.webp', fixedColour: true });
  const s = rig.height / 1.76, bind = name => rig.bind[rig.index.get(name)].p;
  const shoulder = bind('upperarm_l')[0];
  let waistTop = 0;
  for (let i=1; i<trousers.position.length; i+=3) waistTop = Math.max(waistTop,trousers.position[i]);
  const hem = waistTop - .035*s;
  // Shorten the front and back to meet the trouser waistband without shortening the sleeves.
  const jp = jacket.position, waistWidth = shoulder + .064*s, start = hem + .12*s;
  let lowest = start;
  for (let i=0; i<jp.length; i+=3) if (Math.abs(jp[i]) < waistWidth) lowest = Math.min(lowest, jp[i+1]);
  for (let i=0; i<jp.length; i+=3) if (Math.abs(jp[i]) < waistWidth && jp[i+1] < start) {
    const tuck = (start-jp[i+1])/(start-lowest);
    jp[i+1] = start - tuck * (start-hem+.038*s);
    // Match the belt's pelvis/spine weights at the hem. A thigh must not pull
    // one side of the shirt down as the other knee rises.
    if (jp[i+1] <= hem+.025*s) {
      const b = i/3*4;
      jacket.skinIndex.set([rig.index.get('pelvis'),rig.index.get('spine_01'),0,0],b);
      jacket.skinWeight.set([.55,.45,0,0],b);
    }
  }
  // The proxy's coarse waist triangles can extend outside the shirt when seated.
  // This area of skin is completely covered by both garments in every pose.
  const skin = pieces[0], visible = [];
  for (let i=0; i<skin.index.length; i+=3) {
    const face=skin.index.subarray(i,i+3);
    if (face.every(v => Math.abs(skin.position[v*3]) < waistWidth &&
      Math.abs(skin.position[v*3+1]-hem) < .16*s)) continue;
    visible.push(...face);
  }
  skin.index = skin.index.constructor.from(visible);

  const position=[], normal=[], uv=[], skinIndex=[], skinWeight=[], index=[];
  const head = rig.index.get('Head'), pelvis = rig.index.get('pelvis'), spine = rig.index.get('spine_01');
  // One material, including the small shield on the cap. Quads are specified outside first.
  function unit(v) {
    const length=Math.hypot(...v) || 1;
    return v.map(n=>n/length);
  }
  function faceNormal(points) {
    const [a,b,,d] = points, u = b.map((v,i)=>v-a[i]), v = d.map((n,i)=>n-a[i]);
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    return unit(n);
  }
  // Texture rectangle in artwork pixels, measured from the top left.
  function quad(points, swatch, onHead, rect=null, corners=null) {
    const flat=corners ? null : faceNormal(points), at=position.length/3;
    for (const [i,p] of points.entries()) {
      position.push(...p); normal.push(...(corners ? corners[i] : flat));
      if (rect) uv.push(rect[i===0 || i===3 ? 0 : 2]/1000, 1-rect[i<2 ? 3 : 1]/1000);
      else uv.push(SWATCH[swatch]/1000,.224);
      skinIndex.push(onHead==='chest' ? rig.index.get('spine_03') : onHead ? head : pelvis, onHead ? 0 : spine, 0, 0);
      skinWeight.push(onHead ? 1 : .55, onHead ? 0 : .45, 0, 0);
    }
    index.push(at,at+1,at+2,at,at+2,at+3);
  }
  function loft(rows, colours, onHead, sides) {
    const rings=rows.map(row=>Array.from({length:sides},(_,j)=>row(j*TAU/sides)));
    const panel=(r,j)=>[rings[r][j],rings[r][(j+1)%sides],rings[r+1][(j+1)%sides],rings[r+1][j]];
    const faces=colours.map((_,r)=>rings[r].map((_,j)=>faceNormal(panel(r,j))));
    // Share lighting around a crown and across its domed panels. The rim,
    // band and peak keep distinct edges where their materials meet.
    function corner(r,j,other) {
      const left=(j+sides-1)%sides, n=faces[r][j].map((v,i)=>v+faces[r][left][i]);
      if (colours[r]===colours[other]) for (let i=0;i<3;i++) n[i]+=faces[other][j][i]+faces[other][left][i];
      return unit(n);
    }
    for (let r=0; r<rows.length-1; r++) for (let j=0; j<sides; j++) {
      const k=(j+1)%sides;
      quad(panel(r,j),colours[r],onHead,null,[corner(r,j,r-1),corner(r,k,r-1),corner(r,k,r+1),corner(r,j,r+1)]);
    }
  }
  if (style.cap!=='none') {
    const eye = marks.eye_l, bandY = eye[1]+(marks.crown[1]-eye[1])*.3;
    const rim = section(pieces[0], bandY).flat();
    const zMin = Math.min(...rim.map(p=>p[1])), zMax = Math.max(...rim.map(p=>p[1]));
    const cz = (zMin+zMax)/2, rx = Math.max(...rim.map(p=>Math.abs(p[0])))+.005*s, rz = (zMax-zMin)/2+.006*s;
    // Comb the hair beneath the band, keeping the hairline and the hanging tail.
    const hair = pieces.find(p=>p.kind==='hair')?.position;
    if (hair) for (let i=0; i<hair.length; i+=3) {
      if (hair[i+1] < bandY-.013*s) continue;
      const dz=hair[i+2]-cz, radial=Math.hypot(hair[i]/(rx-.008*s),dz/(rz-.008*s));
      if (radial>1) { hair[i]/=radial; hair[i+2]=cz+dz/radial; }
      hair[i+1]=Math.min(hair[i+1],bandY+.048*s);
    }
    function crown(width, depth, height, rake=0) {
      return a => [Math.sin(a)*rx*width, bandY+s*(height+rake*Math.cos(a)), cz+Math.cos(a)*rz*depth];
    }
    if (['helmet','rescue','flight','riding','motor'].includes(style.cap)) {
      const shell=style.cap==='rescue'||style.cap==='motor' ? 'silver' : 'navy';
      if(style.cap==='helmet'){
        const skirt=a=>[Math.sin(a)*rx*1.17,bandY+s*(-.052+.054*Math.max(0,Math.cos(a))),cz+Math.cos(a)*rz*1.17];
        loft([skirt,crown(1.20,1.21,.015),crown(1.20,1.20,.054),crown(1.07,1.08,.093),
          crown(.70,.72,.113),crown(.001,.001,.121)],['band','pouch','pouch','pouch','pouch'],true,28);
        for(const side of [-1,1]){
          const x=side*rx*1.18;
          quad([[x,bandY-.03*s,cz-.052*s],[x,bandY-.019*s,cz+.052*s],
            [x,bandY+.002*s,cz+.046*s],[x,bandY-.009*s,cz-.054*s]],'edge',true);
          quad([[x,bandY-.024*s,cz+.021*s],[side*rx*.70,bandY-.114*s,cz+.060*s],
            [side*rx*.65,bandY-.110*s,cz+.064*s],[x,bandY-.024*s,cz+.031*s]],'band',true);
        }
      }else loft([crown(1.08,1.08,-.009,.012),crown(1.13,1.14,.009,.010),crown(1.16,1.14,.042),
        crown(1.03,1.03,.079),crown(.68,.68,.099),crown(.001,.001,.105)],
        ['leather',shell,shell,shell,shell],true,24);
    } else {
      loft([crown(.99,.99,0),crown(1.015,1.01,.008),crown(1.015,1.01,.032),
        crown(style.cap==='soft'?1.02:1.18,1.12,.062,.016),crown(1.12,1.07,.080,.014),crown(.001,.001,.087)],
        ['leather','band',style.cap==='white'?'silver':'navy',style.cap==='white'?'silver':'navy',style.cap==='white'?'silver':'navy'],true,24);
      // A sloping hard peak protrudes only in front of the band.
      const visor = (width,depth,lift) => a => [Math.sin(a)*rx*width,
        bandY+s*lift-.012*s*Math.cos(a), cz+rz*(.68+depth*Math.cos(a))];
      loft([visor(.01,.01,.003),visor(.98,.8,.003),visor(.98,.8,.008),visor(.01,.01,.01)],
        ['leather','edge','leather'],true,24);
    }
    const pin = crown(1.14,1.13,.055,.015)(0);
    if(style.cap!=='helmet'){
      // Trace the metal shield so no rectangular piece of jacket fabric
      // shows around it, especially on the white and silver caps.
      const outline=[[0,-16],[-6,-13],[-12,-14],[-13,-2],[-12,4],[-8,10],[0,16],
        [8,10],[12,4],[13,-2],[12,-14],[6,-13]];
      const centre=position.length/3;
      for(const [x,y] of [[0,0],...outline]){
        position.push(x*.00093*s,pin[1]-y*.00093*s,pin[2]+(x===0 && y===0?.0018:.001)*s);
        normal.push(...unit([x*.022,-y*.007,1]));
        uv.push((644+x)/1000,1-(775+y)/1000);
        skinIndex.push(head,0,0,0); skinWeight.push(1,0,0,0);
      }
      for(let i=0;i<outline.length;i++)index.push(centre,centre+1+i,centre+1+(i+1)%outline.length);
    }
  }

  const waist = section(jacket,hem,waistWidth), waistZ = bind('pelvis')[2];
  // Follow the actual jacket outline, including its flatter back.
  const beltAt = a => {
    const dx=Math.sin(a), dz=Math.cos(a);
    let radius=0;
    for (const [[x,z],[x2,z2]] of waist) {
      const ex=x2-x, ez=z2-z, det=dx*ez-dz*ex;
      if (Math.abs(det)<1e-9) continue;
      const t=(x*dz-(z-waistZ)*dx)/det;
      if (t>=0 && t<=1) radius=Math.max(radius,(x*ez-(z-waistZ)*ex)/det);
    }
    return [dx*(radius+.008*s),waistZ+dz*(radius+.008*s)];
  };
  const belt = (offset,lift) => a => {
    const [x,z]=beltAt(a);
    return [x+Math.sin(a)*s*offset,hem+s*lift,z+Math.cos(a)*s*offset];
  };
  loft([belt(-.006,-.022),belt(.004,-.020),belt(.004,.020),belt(-.005,.022)],
    ['edge','leather','edge'],false,32);

  // Pouches, radio, and buckle sit tangent to the belt at their own attachment point.
  function fitting(angle,width,height,depth,lift,offset,colour) {
    const sn=Math.sin(angle), cs=Math.cos(angle), [x,z]=beltAt(angle);
    const face=(u,v,w)=>[x+s*(cs*u+sn*(w+offset)),hem+s*(lift+v),z+s*(-sn*u+cs*(w+offset))];
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
    const plane=(w,scale)=>corners.map(([u,v])=>face(u*width*scale/2,v*height*scale/2,w));
    const base=plane(0,1), outer=plane(depth*.85,1), front=plane(depth,.88);
    for(let j=0;j<4;j++) {
      const k=(j+1)%4;
      quad([base[j],base[k],outer[k],outer[j]],colour,false);
      quad([outer[j],outer[k],front[k],front[j]],colour,false);
    }
    quad(front,colour,false);
  }
  fitting(0,.064,.039,.012,0,.004,'silver');
  for(const angle of style.lightBelt ? [.88] : [.88,2.25,-2.45]) {
    fitting(angle,.065,.082,.039,-.014,0,'leather');
    fitting(angle,.067,.032,.009,.005,.037,'pouch');
  }
  fitting(-1.12,.064,.108,.041,.002,0,'pouch');
  fitting(-1.12,.010,.048,.012,.075,.014,'leather');
  let vestFront;
  if(style.vest){
    const high=bind('upperarm_l')[1]-.056*s;
    const low=Math.max(hem+.062*s,high-.30*s);
    const profile=[[low,.78],[low+.045*s,.97],[high-.105*s,1],[high,.74]];
    const rows=profile.map(([y,k])=>{
      const ring=section(jacket,y,waistWidth).flat(), front=Math.max(...ring.map(p=>p[1]))+.018*s;
      const back=Math.min(...ring.map(p=>p[1]))-.014*s;
      const x=shoulder*.93*k;
      return {y,x,front,back,ring:[[-x,y,front-.058*s],[-x*.62,y,front],[x*.62,y,front],[x,y,front-.058*s],
        [x,y,back+.035*s],[x*.70,y,back],[-x*.70,y,back],[-x,y,back+.035*s]]};
    });
    const fabricY=row=>720-240*(row.y-low)/(high-low);
    for(let r=1;r<rows.length;r++)for(let j=0;j<8;j++){
      const k=(j+1)%8;
      const panel=j===1 || j===5 ? [380,fabricY(rows[r]),640,fabricY(rows[r-1])] : null;
      quad([rows[r-1].ring[j],rows[r-1].ring[k],rows[r].ring[k],rows[r].ring[j]],r===1?'leather':'pouch','chest',panel);
    }
    const panel=rows[2], y=panel.y+.036*s, z=Math.max(panel.front,rows[3].front)+.002*s;
    const badgeWidth=.108*s;
    quad([[-badgeWidth,y-.017*s,z],[badgeWidth,y-.017*s,z],[badgeWidth,y+.017*s,z],[-badgeWidth,y+.017*s,z]],'pouch','chest',[380,832,524,868]);
    for(const side of [-1,1]){
      const x=side*.062*s,w=.049*s,h=.045*s, z=rows[1].front+.019*s,y=rows[1].y+.008*s;
      quad([[x-w,y-h,z],[x+w,y-h,z],[x+w,y+h,z],[x-w,y+h,z]],'band','chest');
      quad([[x-w,y+.017*s,z+.002*s],[x+w,y+.017*s,z+.002*s],[x+w,y+h,z+.002*s],[x-w,y+h,z+.002*s]],'edge','chest');
    }
    vestFront=Math.max(...rows.map(row=>row.front));
  }
  if (style.carbine) {
    // A slung prop belongs to the chest skin. It has no gameplay actions of its own.
    const chest=bind('upperarm_l')[1]-.22*s;
    const front=vestFront ?? Math.max(...section(jacket,chest,waistWidth).flat().map(p=>p[1]));
    const onVest=(u,v,depth)=>[s*(u*.74-v*.67),chest+s*(u*.67+v*.74),front+s*depth];
    const strip=(a,b,c,d,shade)=>quad([a,b,c,d].map(([u,v])=>onVest(u,v,.024)),shade,'chest');
    strip([-.28,-.057],[-.12,-.022],[-.12,.014],[-.28,-.006],'pouch');
    strip([-.15,-.03],[.20,-.03],[.20,.014],[-.15,.014],'leather');
    strip([.18,-.014],[.31,-.014],[.31,.003],[.18,.003],'edge');
    strip([-.014,-.081],[.015,-.087],[.027,-.029],[-.011,-.029],'band');
  }
  pieces.push({kind:'uniform',id:'patrol-equipment',map:jacket.map,fixedColour:true,twoSided:true,
    position:Float32Array.from(position),normal:Float32Array.from(normal),uv:Float32Array.from(uv),
    skinIndex:Uint8Array.from(skinIndex),skinWeight:Float32Array.from(skinWeight),index:Uint16Array.from(index)});
}
