import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoom, buildRoom, roomKind, roomStyle, STYLE_OF, CEILING } from '../dist/interiors.js';
import { PROP_SHAPES, OWN_STYLE_OF, OWN_STYLES, DRESSED_STYLES } from '../dist/room-props.js';
import { KIND, signFor } from '../dist/places.js';
import { menuFor } from '../dist/menu.js';
import { walkRoom } from '../dist/room.js';
import { counterPath, populateShop } from '../dist/shop-life.js';
import { shopAisle } from '../dist/room-walk.js';

const place = kind => ({ kind, name: 'The ' + kind + ' place', x: 40, z: -30 });
// A front facing either way along either axis, wound either way: the four a block has.
const front = (kind, width, turn = 0, mirror = 1) => { const c = Math.cos(turn), s = Math.sin(turn); return { place: place(kind), x: 40, z: -30, tx: c * mirror, tz: s * mirror, nx: -s, nz: c, width }; };
const building = (f, deep) => (x, z) => { const b = -((x - f.x) * f.nx + (z - f.z) * f.nz); return b >= -1 && b <= deep; };
const plan = (kind, width = 7, deep = 10, turn = 0, mirror = 1) => { const f = front(kind, width, turn, mirror); return planRoom(f, building(f, deep)); };
const shapes = room => new Set(room.things.map(thing => thing.shape).filter(shape => PROP_SHAPES.includes(shape)));
const holds = (room, shape) => room.things.filter(thing => thing.shape === shape);

test('each trade has the fittings that mark it', () => {
  // What a customer would name on walking in.
  const marks = { pizza: ['oven', 'pizza', 'menuboard'], clothes: ['mannequin', 'register'], jewelry: ['showcase', 'bust'], optician: ['frames', 'eyechart', 'examchair', 'showcase'], bodega: ['grill', 'cooler', 'register'],
    shoes: ['shoewall'], pawn: ['showcase', 'guitar', 'tv'], secondhand: ['showcase', 'guitar'], books: ['bookcase'], florist: ['flowers', 'cooler'], bikes: ['bike'], pets: ['tank'], hardware: ['pegboard'],
    electronics: ['tv', 'showcase'], music: ['guitar'], butcher: ['showcase'], fishmarket: ['showcase'], cosmetics: ['showcase'], coffee: ['espresso', 'showcase'], bakery: ['breadrack', 'showcase'],
    mediterranean: ['spit', 'menuboard'], chinese: ['menuboard', 'cooler'], japanese: ['showcase'], pharmacy: ['cooler', 'register', 'careShelves', 'rxCabinet'], salon: ['cuttingChair','stylingStation','shampooBasin'], barber: ['cuttingChair','stylingStation'], smoke: ['showcase'],
    gym: ['treadmill', 'cableStation', 'dumbbells'], laundromat: ['laundryMachine', 'laundryCart', 'soapVendor'], postoffice: ['poBoxes', 'parcelDrop', 'mailSupplies'],
    tailor: ['sewingMachine', 'garmentRail', 'fittingRoom'], copyshop: ['copier', 'mailSupplies'], repair: ['toolChest', 'tyreDisplay'], bodyshop: ['toolChest', 'pegboard'],
    club: ['djDeck', 'clubSpeaker'], bar: ['draftTaps'], pub: ['draftTaps'],
    bank: ['cashMachine', 'serviceDesk', 'writingDesk', 'queueRail'], clinic: ['serviceDesk', 'deskMonitor', 'planter'] };
  for (const [kind, expected] of Object.entries(marks)) {
    const room = plan(kind, 9, 12), found = shapes(room);
    for (const shape of expected) assert.ok(found.has(shape), `a ${kind} place has its ${shape}`);
  }
  // And what lies in the cases is what that trade sells.
  const lying = kind => new Set(holds(plan(kind, 9, 12), 'showcase').map(thing => thing.more.items));
  assert.deepEqual([...lying('optician')], ['glasses']); assert.deepEqual([...lying('butcher')], ['meat']); assert.deepEqual([...lying('fishmarket')], ['fish']);
  assert.ok(lying('jewelry').has('watches') && lying('jewelry').has('rings')); assert.ok(lying('bakery').has('pastry') && lying('japanese').has('sushi') && lying('electronics').has('phones'));
  assert.ok(holds(plan('pizza', 9, 12), 'pizza').length >= 3, 'pies along the counter');
  for (const kind of ['pizza', 'chinese', 'mediterranean']) assert.equal(holds(plan(kind, 9, 12), 'menuboard')[0].more.lines, menuFor(place(kind)).length, `the ${kind} menu has a line for each thing sold`);
  // A plain place is left as interiors.js made it.
  for (const kind of ['hotel']) assert.equal(shapes(plan(kind, 9, 12)).size, 0, kind);
});

test('hot lunch counters keep their food pans, cashier and stove in separate working spaces', () => {
  for(const [width,depth] of [[4,4],[4,7],[7,9],[9,12]]){
    const room=plan('latin',width,depth), till=room.register, desk=holds(room,'checkoutCounter')[0],
      pans=holds(room,'hotServery')[0], stove=holds(room,'gasRange')[0]||holds(room,'flatTop')[0]||holds(room,'fryer')[0];
    assert.ok(till && pans && stove && counterPath(room));
    assert.ok(Math.abs(pans.a-stove.a)>=(pans.w+stove.w)/2 || Math.abs(pans.b-stove.b)>=(pans.d+stove.d)/2);
    assert.ok(Math.abs(till.a-pans.a)>pans.w/2+.18 || Math.abs(till.b-pans.b)>pans.d/2+.18);
    if(width===4){
      assert.equal(pans.y,desk.h);assert.equal(pans.solid,false);
      assert.ok(Math.abs(pans.a-desk.a)+pans.w/2<=desk.w/2);
    }else{
      assert.equal(pans.y,0);assert.equal(pans.solid,true);
      assert.ok(pans.b-pans.d/2>=desk.b+desk.d/2);
    }
  }
});

test('pharmacy pickup, cutting stations and deli displays fit their shops', () => {
  const examples = [
    ['pharmacy','CVS/PHARMACY','CVS pharmacy'], ['pharmacy','DUANE READE','Duane Reade'],
    ['pharmacy','WALGREENS','Walgreens'], ['salon','ARROJO STUDIO'], ['barber','FIRST CLASS BARBER SHOP'],
    ['bodega','HEALTHY & FRESH GOURMET DELI','deli'], ['bodega','172 PRINCE MARKET','produce'],
  ];
  for (const [kind,name,detail] of examples) for (const [width,deep] of [[4,4],[5.4,6],[7,8],[9,12]]) {
    const f=front(kind,width,.63,-1);f.place.name=name;
    const room=planRoom(f,building(f,deep+.001)), label=name+' '+width+' × '+deep;
    assert.ok(room.register && counterPath(room),label);
    if (kind==='pharmacy') {
      assert.equal(room.finish.title,detail);
      assert.ok(holds(room,'careShelves').every(s=>s.more.label && (s.h<=1.5 || Math.abs(s.a)>room.width/2-.5)),label);
      assert.ok(holds(room,'rxCabinet').every(c=>c.b>room.register.b),label);
      assert.ok(room.things.some(t=>t.y>2.8 && t.d>.7),label);
    } else if (kind==='bodega') {
      assert.equal(room.finish.corner,detail);assert.ok(room.grocerySlots.length,label);
      if(detail==='deli'){
        assert.ok(holds(room,'showcase').some(c=>c.more.items==='deliRolls'),label);
        assert.ok(room.finish.specials.length,label);
        if(width>=7)assert.ok(room.staff.some(s=>s.role==='deliCook'),label);
      }else if(width>=7)assert.ok(holds(room,'produceCrate').length,label);
    } else {
      assert.equal(room.staff[room.register.clerk].role,'cashier',label);
      const stations=holds(room,'stylingStation');
      assert.ok(stations.length && stations.length===holds(room,'cuttingChair').length,label);
      assert.ok(stations.every(s=>room.seats.some(c=>c.b===s.b && c.da===-1 && c.seatKind==='lounge')),label);
      for (const sink of holds(room,'shampooBasin')) {
        assert.ok(stations.every(s=>Math.abs(s.a-sink.a)>=(s.w+sink.w)/2 || Math.abs(s.b-sink.b)>=(s.d+sink.d)/2),label);
      }
      const built=buildRoom(room);
      assert.ok(built.getObjectByName('Styling mirrors'),label);built.userData.dispose();
    }
  }
});

test('bank and reception layouts fit the storefront and leave a route to both sides of the desk', () => {
  for (const kind of ['bank', 'clinic', 'dentist', 'vet', 'massage', 'travel']) {
    for (const [width, deep] of [[4,4], [4.25,6], [4.5,8], [6,6], [7,8], [9,14]]) {
      const room = plan(kind, width, deep), desks = holds(room, 'serviceDesk'), label = `${kind} ${width} × ${deep}`;
      assert.ok(desks.length && room.seats.length && counterPath(room), label);
      const aisle = shopAisle({plan:room});
      for (const staff of room.staff) assert.ok(aisle.route(staff, {a:0,b:.5}), label);
      if (kind === 'bank') {
        assert.equal(desks.length, room.staff.length, label);
        assert.equal(room.things.filter(t => t.glass && t.shape === 'tellerPane').length, desks.length, label);
        assert.ok(holds(room, 'cashMachine').length, label);
        const till = room.register;
        assert.ok(till && desks.some(d => Math.abs(d.a - till.a) < d.w / 2 && Math.abs(d.b - till.b) < d.d / 2), label);
      }
    }
  }
});

test('chain bank lobbies keep their signs, clear approaches and staffed counters in narrow and deep branches', () => {
  for (const [name, key] of [['Bank of America','bank-of-america'],['Chase Bank','chase-bank'],['Citi','citibank'],
    ['TD Bank','td-bank-n-a'],['Wells Fargo','wells-fargo'],['Capital One','capital-one']]) {
    for (const [width, deep, mirror] of [[4,4,1],[4.5,6,-1],[6,9,1],[7,10,-1],[9,14,1]]) {
      const f=front('bank',width,.51,mirror); f.place.name=name;
      f.returns=[{side:1,length:2.1}];
      const room=planRoom(f,building(f,deep+.001)), label=name+' '+width+' × '+deep;
      assert.equal(room.finish.bank.key,key);
      assert.ok(holds(room,'branchATM').length && room.seats.length && counterPath(room),label);
      const pods=holds(room,'tellerPod'), desk=holds(room,'branchDesk');
      assert.equal(pods.length,room.staff.length,label);
      assert.equal(desk.length,Number(width>=5.8 && room.depth>=8.4),label);
      assert.ok(pods.some(p=>Math.abs(p.a-room.register.a)<p.w/2 && Math.abs(p.b-room.register.b)<p.d/2),label);
      const aisle=shopAisle({plan:room});
      for(const staff of room.staff) assert.ok(aisle.route(staff,{a:0,b:.5}),label);
      const solids=room.things.filter(t=>t.solid);
      for(let i=0;i<solids.length;i++) for(const b of solids.slice(i+1)) {
        const a=solids[i];
        assert.ok(Math.abs(a.a-b.a)>=(a.w+b.w)/2 || Math.abs(a.b-b.b)>=(a.d+b.d)/2,
          label+' overlaps '+a.shape+' and '+b.shape);
      }
      const view={plan:room,floor:0,actors:[],occupied:new Set()};
      populateShop(view);
      assert.ok(view.clerk && view.actors.includes(view.clerk),label);
      const built=buildRoom(room);
      assert.ok(built.children[0].geometry.attributes.position.count/3<9000,label);
      built.userData.dispose();
    }
  }
});

test('fitness chains and studios keep their equipment and a route from the door at every size', () => {
  const examples = [
    ['Planet Fitness', 'treadmill'], ['Equinox', 'treadmill'], ['LIFE TIME FITNESS', 'spinBike'],
    ['LIFETIME', 'spinBike'], ['SOULCYCLE', 'spinBike'], ['CorePower Yoga', 'exerciseMat'], ['Club Pilates', 'reformer'],
  ];
  for (const [name, equipment] of examples) for (const width of [5, 7, 9]) for (const deep of [4, 5, 6, 8, 10, 14]) {
    const f = front('gym', width); f.place.name = name;
    const room = planRoom(f, building(f, deep)), label = `${name} at ${width} × ${deep}`;
    assert.ok(holds(room, equipment).length, label);
    assert.ok(room.register && counterPath(room), label);
    for (let b = .5; b < room.depth - .4; b += .20) {
      const next = walkRoom(room, 0, b, 0, .05);
      assert.ok(Math.abs(next.a) < .001 && Math.abs(next.b - b - .05) < .001, `clear central aisle: ${label}`);
    }
    const view = { plan: room, floor: 3, actors: [], occupied: new Set() };
    populateShop(view);
    assert.ok(view.clerk && !view.clerk.spot.treadmill);
    const runners = view.actors.filter(actor => actor.spot.treadmill);
    assert.equal(Boolean(runners.length), Boolean(holds(room, 'treadmill').length));
    for (const { spot } of runners) assert.ok(holds(room, 'treadmill').some(t => spot.a === t.a && Math.abs(spot.b - t.b) < .2 && spot.db === -t.face[1]));
    if (deep >= 10) {
      if (name === 'Planet Fitness' && width >= 7) assert.ok(holds(room, 'treadmill').some((t,i,all) => all.some(other => t.b === other.b && t.a !== other.a)));
      if (name === 'Equinox' && width >= 7) assert.ok(holds(room, 'weightBench').length);
      if (room.finish.title === 'LIFE TIME') assert.ok(holds(room, 'reformer').length && room.seats.length && holds(room, 'towelShelf').length);
    }
    const built = buildRoom(room);
    assert.ok(built.children[0].geometry.attributes.position.count / 3 < 9000, label);
    built.userData.dispose();
  }
  const nonGym = front('clothes', 7); nonGym.place.name = 'EQUINOX';
  assert.equal(planRoom(nonGym).style, 'clothes');
  for (const name of ['LIFETIME', 'Life Time Fitness']) assert.equal(signFor({ kind: 'gym', name }).background, '#292724');
});

test('trades that shared a room have their own, and the commonest keep the manner they had', () => {
  for (const [kind, style] of Object.entries(OWN_STYLE_OF)) { assert.ok(KIND[kind] && roomKind(place(kind)), kind); assert.equal(roomStyle(place(kind)), style); assert.equal(STYLE_OF[kind], style); assert.ok(OWN_STYLES.includes(style)); }
  assert.notEqual(roomStyle(place('jewelry')), roomStyle(place('pawn'))); assert.notEqual(roomStyle(place('optician')), roomStyle(place('jewelry'))); assert.notEqual(roomStyle(place('butcher')), roomStyle(place('supermarket')));
  assert.deepEqual(['secondhand', 'clothes', 'pizza', 'bodega', 'coffee', 'supermarket', 'phones'].map(kind => roomStyle(place(kind))), ['cases', 'clothes', 'pizza', 'bodega', 'coffee', 'market', 'tech']);
  for (const style of DRESSED_STYLES) assert.ok(Object.values(STYLE_OF).includes(style), style);
  // The same place is the same room every time.
  assert.deepEqual(plan('jewelry').things, plan('jewelry').things);
});

test('every room builds whole, inside its walls, at a size a street of them can afford', () => {
  let most = 0, propped = 0;
  for (const kind of Object.keys(KIND).filter(kind => roomKind(place(kind)))) for (const [width, deep] of [[5, 5], [7, 9], [9, 14]]) for (const [turn, mirror] of [[0, 1], [Math.PI / 2, -1], [2.2, 1], [-1.1, -1]]) {
    const room = plan(kind, width, deep, turn, mirror), label = `${kind} ${width} x ${deep}`;
    if (shapes(room).size) propped++;
    for (const thing of room.things.filter(thing => PROP_SHAPES.includes(thing.shape))) {
      assert.ok(Array.isArray(thing.face) && Math.abs(thing.face[0]) + Math.abs(thing.face[1]) === 1 && /^#[0-9a-f]{6}$/.test(thing.color) && thing.more, `${label}: a ${thing.shape} faces one way`);
      assert.ok(Math.abs(thing.a) + thing.w / 2 <= room.width / 2 + .01 && thing.b - thing.d / 2 >= -.01 && thing.b + thing.d / 2 <= room.depth + .01 && thing.y >= 0 && thing.y + thing.h <= CEILING, `${label}: its ${thing.shape} is inside the room`);
    }
    const whole = buildRoom(room, 3).children[0].geometry.getAttribute('position');
    assert.equal(whole.count % 3, 0); most = Math.max(most, whole.count / 3);
    // The fittings alone, after the bare shell: back in the room's own frame, along the front wall, in from it, and up from the floor.
    const shell = buildRoom({ ...room, things: [] }, 3).children[0].geometry.getAttribute('position').count;
    const geometry = buildRoom({ ...room, things: room.things.filter(thing => PROP_SHAPES.includes(thing.shape)) }, 3).children[0].geometry, position = geometry.getAttribute('position'), colour = geometry.getAttribute('color');
    assert.equal(colour.count, position.count);
    for (let i = shell; i < position.count; i++) {
      const x = position.getX(i) - room.x, z = position.getZ(i) - room.z, a = x * room.tx + z * room.tz, b = -(x * room.nx + z * room.nz), up = position.getY(i) - 3;
      assert.ok(Number.isFinite(a + b + up) && Math.abs(a) <= room.width / 2 + .08 && b >= -.08 && b <= room.depth + .08 && up >= -.01 && up <= CEILING + .01, `${label}: a corner at ${a.toFixed(2)}, ${b.toFixed(2)}, ${up.toFixed(2)} is outside the room`);
      assert.ok(colour.getX(i) >= 0 && colour.getX(i) <= 1.1 && colour.getY(i) >= 0 && colour.getZ(i) >= 0);
    }
  }
  // A dining room with a whole kitchen line behind its pass is the fullest.
  assert.ok(most < 16000, `the fullest room is ${most} triangles`);
  assert.ok(propped > 300, 'most rooms have something of their trade in them');
});

test('fittings face out of the room\'s walls whichever way its front is wound, and stand in the way like anything else', () => {
  // A triangle faces whoever is inside the room when its normal points toward the middle of the floor or up.
  const facing = (kind, turn, mirror) => {
    const room = plan(kind, 9, 12, turn, mirror), only = { ...room, things: room.things.filter(thing => thing.shape === 'oven') };
    assert.equal(only.things.length, 1);
    const withOven = buildRoom(only, 0).children[0].geometry.getAttribute('position'), bare = buildRoom({ ...room, things: [] }, 0).children[0].geometry.getAttribute('position');
    let out = 0, total = 0;
    const oven = only.things[0], cx = room.x + room.tx * oven.a - room.nx * oven.b, cz = room.z + room.tz * oven.a - room.nz * oven.b;
    for (let i = bare.count; i < withOven.count; i += 3) {
      const p = k => [withOven.getX(i + k), withOven.getY(i + k), withOven.getZ(i + k)], [a, b, c] = [p(0), p(1), p(2)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const size = Math.hypot(...n); if (size < 1e-7) continue;
      // Away from the oven's own middle is outward.
      const mid = [(a[0] + b[0] + c[0]) / 3 - cx, (a[1] + b[1] + c[1]) / 3 - 1.1, (a[2] + b[2] + c[2]) / 3 - cz];
      if (Math.abs(n[1]) / size < .5) { total++; if (n[0] * mid[0] + n[2] * mid[2] > 0) out++; }
    }
    return out / total;
  };
  // An oven has legs and a mouth whose inner faces look back at its middle, so not every side faces away from it:
  // but most do, and as many whichever way the room is wound. Wound wrong, most would face in.
  for (const turn of [0, 1.3]) { const [one, other] = [facing('pizza', turn, 1), facing('pizza', turn, -1)]; assert.ok(one > .6 && other > .6 && Math.abs(one - other) < .03, `an oven's sides face outward (turn ${turn}: ${one.toFixed(2)}, ${other.toFixed(2)})`); }
  // A dressed figure is in the way; a pie on the counter is not.
  const room = plan('clothes', 9, 12), figure = holds(room, 'mannequin')[0];
  assert.ok(figure.solid && figure.h > 1.6);
  const walked = walkRoom(room, figure.a, figure.b + 1.2, 0, -1.2);
  assert.ok(Math.abs(walked.a - figure.a) >= figure.w / 2 + .34 || Math.abs(walked.b - figure.b) >= figure.d / 2 + .34, 'walking into a mannequin is turned aside');
  assert.ok(holds(plan('pizza', 9, 12), 'pizza').every(pie => !pie.solid && pie.y > 1));
});
