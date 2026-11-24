// Small reusable solids in fixture coordinates. Bake them into the tenant's
// mesh so a shelf of shoes or a counter of crockery still draws in one pass.
import * as THREE from './vendor/three.module.min.js';

function turned(profile, segments) {
  return new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(radius, height)), segments);
}

// Sections from heel to toe: x, half-width, bottom and crown of the last.
function shoeLast(sections) {
  const positions = [], indices = [], sides = 8;
  for (const [x, width, bottom, top] of sections) {
    for (let i = 0; i < sides; i++) {
      const angle = i * Math.PI * 2 / sides;
      positions.push(x, bottom + (.5 + .5 * Math.cos(angle)) * (top - bottom), width * Math.sin(angle));
    }
  }
  for (let section = 1; section < sections.length; section++) for (let i = 0; i < sides; i++) {
    const a = (section - 1) * sides + i, b = (section - 1) * sides + (i + 1) % sides;
    indices.push(a, b, a + sides, b, b + sides, a + sides);
  }
  for (let i = 1; i < sides - 1; i++) {
    const end = (sections.length - 1) * sides;
    indices.push(0, i + 1, i, end, end + i, end + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
  return g;
}

function shirt() {
  const outline = new THREE.Shape();
  const points = [[-.065,.65],[-.21,.61],[-.30,.46],[-.20,.40],[-.16,.46],[-.18,.025],[-.08,0],[.18,.016],[.16,.47],[.20,.40],[.30,.46],[.21,.61],[.065,.65],[.032,.607],[-.035,.607]];
  points.forEach(([x,y], i) => i ? outline.lineTo(x,y) : outline.moveTo(x,y));
  outline.closePath();
  const g = new THREE.ExtrudeGeometry(outline, { depth:.034, bevelEnabled:true, bevelThickness:.009, bevelSize:.009, bevelSegments:1 });
  return g.translate(0,0,-.017);
}

export function guitarBody(close=false) {
  const shape = new THREE.Shape();
  shape.moveTo(0, .014);
  shape.bezierCurveTo(-.215, 0, -.205, .16, -.141, .235);
  shape.bezierCurveTo(-.083, .30, -.198, .34, -.139, .427);
  shape.bezierCurveTo(-.092, .491, .087, .491, .139, .427);
  shape.bezierCurveTo(.195, .342, .084, .297, .142, .235);
  shape.bezierCurveTo(.214, .14, .208, .008, 0, .014);
  if(close){
    const hole=new THREE.Path();hole.absarc(0,.30,.052,0,Math.PI*2,false);shape.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(shape, { depth:.062, curveSegments:close?18:4, bevelSize:close?.004:.006, bevelThickness:.005, bevelSegments:close?3:1 }).translate(0,0,-.034);
}

export function productGeometry() {
  const spaghetti=Array.from({length:26},(_,i)=>{
    const a=i*.59,r=.016+.00050*i;return new THREE.Vector3(r*Math.cos(a),.003+i*.00056,r*Math.sin(a));
  });
  const wedge=new THREE.Shape();
  wedge.moveTo(0,.115);wedge.lineTo(-.073,-.060);wedge.quadraticCurveTo(0,-.098,.073,-.060);wedge.closePath();
  const sections = [[-.145,.031,.001,.029],[-.127,.047,0,.035],[-.060,.052,0,.037],[.012,.047,.003,.038],[.084,.055,.003,.039],[.136,.043,.009,.040],[.154,.018,.020,.042]];
  const upper=[[-.138,.028,.024,.095],[-.110,.046,.024,.118],[-.060,.048,.026,.111],[-.008,.043,.029,.115],[.05,.048,.026,.091],[.108,.049,.030,.067],[.145,.027,.033,.057]];
  const crown=heights=>shoeLast(upper.map(([x,width,bottom],i)=>[x,width,bottom,heights[i]]));
  return {
    noodle:new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spaghetti),52,.0032,5,false),
    bagel:new THREE.TorusGeometry(.043,.015,9,24).rotateX(Math.PI/2),
    slice:new THREE.ExtrudeGeometry(wedge,{depth:.008,bevelThickness:.002,bevelSize:.002,bevelSegments:2,curveSegments:8}).rotateX(-Math.PI/2),
    cup: turned([[.001,0],[.031,0],[.035,.008],[.044,.061],[.045,.072],[.040,.074],[.038,.062],[.029,.014],[.001,.014]], 12),
    saucer: turned([[.001,0],[.048,0],[.073,.008],[.078,.015],[.072,.017],[.046,.008],[.001,.008]], 12),
    sole: shoeLast(sections),
    upper:shoeLast(upper),highUpper:crown([.139,.170,.166,.136,.093,.067,.057]),
    runnerUpper:crown([.092,.112,.100,.091,.078,.060,.050]),
    shirt: shirt(), guitar: guitarBody(),
  };
}

export function chinaCup(t, u, v, up, filled = false) {
  t.model('cup', u, v, up, '#f5ede0');
  t.ring(u + .048, v, .021, up + .043, '#efe6d6');
  if (filled) {
    t.disc(u, v, .038, .002, up + .059, '#855135');
    t.ball(u, v, .020, .002, .014, up + .062, '#e7cba7');
  }
}

export function sneaker(t, u, v, up, upper, trim, profile) {
  const high=profile==='shoes06',runner=profile==='shoes02';
  t.model('sole', u, v, up, '#e7e1d1');
  t.model(high?'highUpper':runner?'runnerUpper':'upper', u, v, up, upper);
  t.ball(u - .08, v, .037, .008, .027, up + (high?.165:runner?.103:.108), '#302e30');
  for (let i = 0; i < 3; i++) t.rodV(u - .014 + i * .020, v, .066, .0038, up + (high?.144:runner?.094:.115) - i*(high?.014:.006), trim);
  t.plate(u - .078, v + .046, .032, .012, up + .052, trim);
}

export function espressoStation(t, w, d) {
  const center = -w * .13, body = w * .65, face = d * .35;
  for (const side of [-1,1]) t.box(center + side * body * .36, 0, .038, d * .7, .045, 0, '#272d2e');
  t.box(center, 0, body, d * .88, .052, .045, '#abb2ae');
  t.box(center, -d * .23, body, d * .36, .29, .097, '#576969');
  for (const side of [-1,1]) t.box(center + side * (body / 2 - .024), 0, .048, d * .84, .32, .095, '#516665');
  t.box(center, 0, body, d * .86, .126, .296, '#cbd0cb');
  t.box(center, face + .016, body * .87, .052, .072, .322, '#293636');
  for (let i = 0; i < 9; i++) t.rodV(center + (i - 4) * body * .085, d * .18, d * .40, .004, .104, '#586268');
  for (const side of [-1,1]) {
    const x = center + side * body * .23;
    t.disc(x, d * .19, .033, .038, .259, '#8b9698');
    if(side>0)t.rodV(x, face, .12, .009, .27, '#302d2c');
    for (let i = -1; i <= 1; i++) t.drum(x + i * .025, face + .046, .013, .008, .357, '#e8d8af');
    chinaCup(t, x, -.015, .424);
    chinaCup(t, x, -.015, .466);
  }
  chinaCup(t, center + body * .23, d * .19, .11, true);
  t.slope(center - body * .36, face, .29, face + .035, .165, .013, .014, '#d4d8cf');
  // A separate burr grinder with a bean hopper, dosing chute and fork.
  const x = w * .365;
  t.box(x, .005, .17, .20, .026, 0, '#353c3b');
  t.box(x, -.03, .128, .133, .205, .026, '#475352');
  t.cone(x, -.03, .069, .055, .228, '#a6aaa0');
  t.post(x, -.03, .063, .121, .282, '#674837');
  t.disc(x, -.03, .071, .014, .402, '#292d2c');
  t.box(x, .053, .046, .055, .061, .13, '#a6aaa0');
}

export function acousticGuitar(t, wood) {
  t.model('guitar', 0, 0, 0, wood);
  t.drum(0, .034, .008, .053, .30, '#e4be80');
  t.drum(0, .041, .007, .044, .30, '#2e231e');
  t.box(0, .018, .052, .046, .46, .384, '#5e3826');
  t.box(0, .042, .049, .008, .454, .38, '#372a24');
  t.box(0, .023, .076, .034, .135, .83, wood);
  t.box(0, .046, .124, .014, .025, .131, '#493326');
  for (let i = 0; i < 15; i++) t.plate(0, .048, .049, .0026, .83 - .48 * (1 - Math.pow(.935, i)), '#b7a484');
  for (let i = 0; i < 6; i++) t.plate((i - 2.5) * .0071, .052, .0015, .711, .145, '#e8d8af');
  for (const side of [-1,1]) for (let i = 0; i < 3; i++) t.rodU(side * .046, .019, .028, .009, .856 + i * .039, '#bec0b6');
}

export function displayPhone(t, color) {
  t.box(0,0,.077,.009,.156,0,color);
  t.plate(0,.0048,.071,.146,.005,'#132a39');
  t.plate(0,.0051,.065,.061,.079,'#729aa7');
  for (let row=0;row<2;row++) for (let col=0;col<4;col++) {
    t.plate((col-1.5)*.016,.0055,.010,.010,.024+row*.023,['#cfaaa0','#b5ccac','#829dbf','#d6c388'][(row+col)%4]);
  }
  t.plate(0,.0055,.019,.004,.144,'#243338');
  for (let i=0;i<2;i++) t.drum(-.021,-.006,.007,.009,.122+i*.021,'#25282b');
}

export function gemstoneRing(t, u, v, up, metal) {
  t.ring(u,v,.023,up+.022,metal);
  t.bud(u,v,.010,up+.047,'#cde6e7');
  for (const side of [-1,1]) t.bud(u+side*.008,v,.0038,up+.045,metal);
}
