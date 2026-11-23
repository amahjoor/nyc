import { brandKey, placeName, signFor } from './places.js';
import { fittingStock } from './shop-stock.js';

import { bankIdentity, furnishBank } from './bank.js';

function bank(r, prop) {
  const identity = bankIdentity(r.place);
  if (identity) return furnishBank(r, prop, identity);
  const name = placeName(r.place), sign = signFor(r.place);
  const classic = !brandKey(name), walnut = classic ? '#896747' : '#907359';
  const feature = classic ? '#294b46' : sign.background === '#ffffff' ? sign.lettering : sign.background;
  const metal = classic ? '#b89b64' : '#a0a8a6';
  r.wall = '#e5dece'; r.floor = '#c2b8a5';
  r.finish = { floor: 'stone', feature, accent: metal, ink: '#fff4dc', title: name, line: 'Teller services', zones: [] };
  r.light = { color: 0xffeed3, power: 68, ceiling: '#e3dcca', strip: '#fff4d9' };

  // One open end connects the customer floor to every teller station.
  const deskB = r.depth - 1.55, left = -r.half + .13, right = r.half - (r.depth < 5 ? 1.84 : 1.40);
  const span = right - left, bays = Math.min(3, Math.max(1, Math.floor(span / 1.54))), pitch = span / bays;
  const deskHeight = 1.03, screenB = deskB - .18;
  for (let i = 0; i < bays; i++) {
    const a = left + pitch * (i + .5), paneW = Math.min(.79, pitch * .41), paneA = left + i * pitch + .07 + paneW / 2;
    prop('serviceDesk', a, deskB, pitch - .012, .76, deskHeight, walnut, { trim: metal, top: '#e1daca' });
    r.staff(a + .14, deskB + .83, 0, -1);
    r.add(paneA, screenB, paneW, .02, .89, '#a9cbd8', deskHeight + .04, false, 'tellerPane', [0, -1]);
    for (const edge of [-1, 1]) r.add(paneA + edge * paneW / 2, screenB, .024, .035, .96, metal, deskHeight, false);
    r.add(paneA, screenB, paneW + .04, .036, .027, metal, deskHeight + .93, false);
    for (const up of [.30, .335]) r.add(paneA, screenB - .012, paneW - .05, .004, .012, '#c9d5cc', deskHeight + up, false);
    r.add(a + .19, deskB - .18, .40, .26, .008, '#485655', deskHeight, false);
    if (i === bays - 1)
      prop('register', a + .18, deskB + .16, .40, .32, .39, '#384649', { y: deskHeight, solid: false, face: [0, 1] });
    else
      prop('deskMonitor', a - .26, deskB + .19, .46, .21, .39, '#394449', { y: deskHeight, solid: false, face: [0, 1] });
  }
  for (const side of [-1, 1]) prop('wallSconce', side * (r.half - .43), r.depth - .10, .18, .15, .73, metal, { y: 1.76, solid: false });

  const atmB = Math.max(.62, Math.min(3.55, deskB - 2.25));
  prop('cashMachine', r.half - .37, atmB, .68, .87, 1.85, '#3e4d50', { accent: '#a4d4b3', face: [-1, 0] });
  if (atmB > 2.85) prop('cashMachine', r.half - .37, atmB - 1.02, .68, .87, 1.85, '#3e4d50', { accent: '#a4d4b3', face: [-1, 0] });
  const seatB = Math.min(2.36, deskB - 1.15);
  const seats = deskB > 3.2 ? 2 : 1;
  for (let i = 0; i < seats; i++)
    r.seat(-r.half + .47, seatB + (i - (seats - 1) / 2) * .82, 1, 0, 0, classic ? '#44645d' : '#566d7b', .69, .80);
  if (deskB > 4.8) prop('writingDesk', -r.half + .40, seatB + 1.80, .65, 1.31, .95, walnut, { face: [1, 0] });
  if (deskB > 4.7 && r.width >= 5.8)
    prop('queueRail', .63, deskB - 1.93, .29, Math.min(2.45, deskB - 3), .91, feature);
  if (r.depth > 6) prop('planter', -r.half + .44, .66, .55, .55, 1.36, '#b3a28c');
}

const RECEPTIONS = {
  clinic:  { upholstery: '#54766e', mural: '#a8bba1', line: 'Patient reception' },
  dentist: { upholstery: '#526e85', mural: '#a8c0c9', line: 'Dental reception' },
  vet:     { upholstery: '#7b694e', mural: '#c2b891', line: 'Animal care' },
  massage: { upholstery: '#796574', mural: '#c8acaa', line: 'Reception' },
  travel:  { upholstery: '#4b7180', mural: '#a1bdcd', line: 'Travel services' },
};

function waiting(r, prop) {
  const design = RECEPTIONS[r.place.kind], wood = '#b19576', deskB = r.depth - 1.5;
  r.wall = '#f1e9db'; r.floor = r.place.kind === 'massage' ? '#b7997a' : '#d0c9b8';
  r.light = { color: 0xfff1de, power: 65, ceiling: '#efeadd' };
  r.finish = { floor: r.place.kind === 'massage' ? 'wood' : 'stone', feature: design.mural,
    ink: '#293e3a', accent: '#b89c76', title: placeName(r.place), line: design.line, zones: [] };
  const span = Math.min(3.15, r.width * .48), deskA = r.half - .20 - span / 2;
  prop('serviceDesk', deskA, deskB, span, .76, .97, wood, { trim: '#cab797', top: '#f2eddf' });
  r.staff(deskA, deskB + .79, 0, -1);
  prop('deskMonitor', deskA - span * .23, deskB + .13, .46, .21, .40, '#45524f', { y: .97, solid: false, face: [0, 1] });
  r.add(r.half - .39, deskB + .88, .38, 1, .91, wood);
  // A standing clipboard on the end leaves the check-in position open.
  const boardA = deskA + span / 2 - .25;
  r.add(boardA, deskB, .23, .16, .026, '#756956', .97, false);
  r.add(boardA, deskB, .21, .046, .28, '#efe9da', .996, false);
  r.add(boardA, deskB - .025, .10, .012, .028, '#898f87', 1.245, false);

  const rowA = -r.half + .49;
  for (let b = Math.min(1.48, deskB - .82), i = 0; b < deskB - .42; b += .92, i++) {
    if (i % 4 === 2) {
      r.add(rowA, b, .53, .56, .42, wood, 0, true, 'table');
      r.add(rowA, b - .07, .27, .19, .025, '#c37f5c', .42, false);
      r.add(rowA, b + .05, .20, .17, .017, '#e7dfbe', .445, false);
    } else {
      r.seat(rowA, b, 1, 0, 0, design.upholstery, .61, .57);
      for (const side of [-1, 1]) {
        r.add(rowA, b + side * .30, .43, .048, .048, wood, .63, false);
        r.add(rowA + .14, b + side * .30, .044, .044, .24, wood, .39, false);
      }
    }
  }
  // The potted tree anchors the quiet side of reception, clear of the staff aisle.
  prop('planter', -r.half + .50, r.depth - .49, .70, .70, 1.59, '#af775c');
  if (deskB > 4.5) {
    r.seat(r.half - .47, 1.65, -1, 0, 0, design.upholstery, .68, 1.25);
    prop('writingDesk', r.half - .35, 3.12, .58, 1.13, .79, wood, { face: [-1, 0] });
  }
}

// Materials, equipment and circulation of the club's public floor.
const CLUBS = {
  gym:     { floor: '#444848', wall: '#d4d5ce', feature: '#3a4d50', ink: '#f1efdf', accent: '#de9b54', frame: '#53595a', entry: 'tile', title: '', line: 'STRENGTH   /   CONDITIONING' },
  planet:  { floor: '#424046', wall: '#dad6dd', feature: '#533182', ink: '#ffdd45', accent: '#ffcf27', frame: '#684093', entry: 'tile', title: 'planet fitness', line: 'CARDIO   /   STRENGTH' },
  equinox: { floor: '#333637', wall: '#b5b2aa', feature: '#232727', ink: '#f3f1ec', accent: '#b5a17c', frame: '#363a3b', entry: 'stone', title: 'EQUINOX', line: 'TRAINING FLOOR' },
  lifetime:{ floor: '#494540', wall: '#e0d9c8', feature: '#5d4638', ink: '#fff4e1', accent: '#bea17a', frame: '#514d46', entry: 'wood', title: 'LIFE TIME', line: 'ATHLETIC CLUB' },
  strength:{ floor: '#3e4040', wall: '#b6b9b5', feature: '#283839', ink: '#f6efe0', accent: '#dd8154', frame: '#434f50', entry: 'stone', title: '', line: 'BARBELL CLUB' },
  cycling: { floor: '#393b3e', wall: '#777978', feature: '#2b3337', ink: '#faf5dc', accent: '#e9ae4e', frame: '#41474a', entry: 'tile', title: '', line: 'CYCLE STUDIO' },
  yoga:    { floor: '#c5a180', wall: '#eee6d9', feature: '#737e6e', ink: '#fbf5e7', accent: '#a9b09c', frame: '#7b9083', entry: 'wood', title: '', line: 'YOGA STUDIO' },
  pilates: { floor: '#b29071', wall: '#e9e3d7', feature: '#816e60', ink: '#fff5e4', accent: '#baa07f', frame: '#b18761', entry: 'wood', title: '', line: 'PILATES STUDIO' },
};
const CHAINS = { 'planet-fitness': 'planet', 'equinox-fitness': 'equinox', 'life-time-fitness': 'lifetime' };
function clubOf(name) {
  const chain = CHAINS[brandKey(name)];
  if (chain) return chain;
  if (/barbell|power\s?lifting|weight\s?lifting|strength|powerhouse gym|crossfit/i.test(name)) return 'strength';
  if (/pilates|solidcore|club lagree/i.test(name)) return 'pilates';
  if (/yoga/i.test(name)) return 'yoga';
  if (/soulcycle|cyclebar|\b(?:cycling|spin studio)\b/i.test(name)) return 'cycling';
  return 'gym';
}

function gym(r, prop) {
  const name = placeName(r.place), club = Object.hasOwn(CLUBS,r.place.discipline) ? r.place.discipline : clubOf(name), design = CLUBS[club];
  const lounge = club === 'lifetime', dark = club === 'equinox', studio = ['yoga', 'pilates', 'cycling'].includes(club);
  const narrow=r.width<4.8;
  const side = lounge ? 1 : -1, desk = side * (r.half - (narrow?.73:.93));
  r.wall = design.wall; r.floor = design.floor;
  r.light = { color: lounge || studio ? 0xffead4 : 0xf2f4ff, power: 72,
    ceiling: dark || club === 'cycling' ? '#383b3b' : '#dedcd4', strip: lounge || club === 'pilates' ? '#fff0ce' : '#fff9ed' };
  r.finish = { floor: studio && club !== 'cycling' ? 'wood' : 'rubber', entry: design.entry, entryDepth: lounge ? 3.2 : 2.3,
    feature: design.feature, ink: design.ink, accent: design.accent, title: design.title || name, line: design.line,
    slats: lounge || club === 'pilates', mirror: dark || studio,
    zones: club === 'strength' ? ['FREE WEIGHTS', 'LIFTING PLATFORMS'] : lounge ? ['CYCLE', 'PILATES'] : studio ? ['CHECK-IN', design.line] : ['STRENGTH', 'CARDIO'] };

  // The check-in desk opens straight onto the central aisle. Its slats and
  // reader face the door, with the staff member on the other side.
  r.add(desk, 1.38, Math.min(narrow?1.12:1.53,2*(Math.abs(desk)-.48)), .69, .99, design.feature);
  r.staff(desk, 2.09, 0, -1);
  for (let i = -3; i <= 3; i++) r.add(desk + i * .18, 1.024, .048, .022, .69, lounge ? '#a38162' : design.frame, .19, false);
  r.add(desk, 1.017, 1.39, .026, .038, design.accent, .87, false);
  r.add(desk - side * .53, 1.27, .16, .19, .045, '#3b4143', 1.0, false);

  // Keep the opposite window active even in the smallest footprint.
  const windowA = -side * (r.half - (narrow && club!=='strength' && !lounge?.65:.89));
  const machine = (shape, a, b) => {
    const [w, d, h] = { treadmill: [.91, 1.88, 1.47], spinBike: [.54, 1.12, 1.17],
      reformer: [.72, 2.02, .72], exerciseMat: [.68, 1.68, .14] }[shape];
    prop(shape, a, b, w, d, h, design.frame, { accent: design.accent, solid: shape !== 'exerciseMat' });
  };
  if (club === 'strength') {
    prop('barbellRack', windowA, 1.34, Math.min(1.6,r.width/2-.52), 1.2, 2.12, design.frame, { accent:design.accent });
    prop('dumbbells', desk, r.depth-.40, 1.46,.60,.94,design.frame);
    for (let b=3.7; b<r.depth-.9; b+=2.35) {
      prop('weightBench',windowA,b,.46,1.42,.67,'#67463c');
      if (b<r.depth-2.4) prop('dumbbells',desk,b,1.44,.62,.94,design.frame);
    }
    return;
  }
  if (lounge) {
    r.seat(windowA, 1.28, 0, 1, 0, '#ad9578', 1.24, .60);
    if (r.depth >= 5) prop('planter', -r.half + .44, 2.22, .60, .60, 1.43, '#998674');
    if (r.depth < 5.2) machine('spinBike', windowA, 2.53);
    prop('towelShelf', r.half - .82, r.depth - .32, 1.36, .52, 1.53, '#967654');
  } else {
    machine(club === 'pilates' ? 'reformer' : club === 'yoga' ? 'exerciseMat' : club === 'cycling' ? 'spinBike' : 'treadmill', windowA, 1.53);
  }

  if (studio) {
    const equipment = { cycling: 'spinBike', yoga: 'exerciseMat', pilates: 'reformer' }[club];
    const pitch = club === 'cycling' ? 1.6 : 2.4;
    for (let b = 3.75; b < r.depth - 1.58; b += pitch) {
      for (const lane of [-1, 1]) machine(equipment, lane * (r.half - 1.0), b);
    }
    prop('towelShelf', -r.half + .80, r.depth - .29, 1.31, .50, 1.53, '#93775e');
    return;
  }

  if (lounge) {
    // The lounge gives way to a wood-framed studio on one side and cardio
    // facing the training floor on the other.
    for (let b = 3.86; b <= r.depth - 1.66; b += 2.65) {
      machine('reformer', r.half - .98, b);
      machine('spinBike', -r.half + .93, b);
    }
  } else if (dark) {
    for (let b = 4.15; b <= r.depth - 1.05; b += 2.35) {
      if (b < r.depth - 2) {
        prop('dumbbells', -r.half + .42, b, .69, 1.78, .99, design.frame, { face: [1, 0] });
        if (r.width >= 6) prop('weightBench', -r.half + 1.62, b, .43, 1.38, .66, '#373b3b');
      }
      machine('treadmill', windowA, b);
    }
    prop('cableStation', -r.half + 1.05, r.depth - .58, 1.68, .94, 2.15, design.frame, { accent: design.accent });
  } else {
    // Cardio in paired lanes at Planet Fitness, a single lane at smaller clubs.
    for (let b = 3.79; b < r.depth - 1.05; b += 2.34) {
      machine('treadmill', windowA, b);
      if (club === 'planet' && r.width >= 6.8) machine('treadmill', windowA - 1.18, b);
    }
    prop('cableStation', -r.half + 1.02, r.depth - .57, 1.64, .94, 2.18, design.frame, { accent: design.accent });
    for (let b = 3.65; b < r.depth - 2.0; b += 2.25)
      prop('dumbbells', -r.half + .44, b, .70, 1.7, 1.02, design.frame, { face: [1, 0] });
  }
}

function laundromat(r, prop) {
  r.floor = '#c1c9c5'; r.wall = '#e0e9e2';
  r.finish = { floor: 'tile', feature: '#38686c', ink: '#f6f2d9', accent: '#aad5c8', title: placeName(r.place), line: 'WASH   •   DRY   •   FOLD', zones: ['WASHERS', 'DRYERS'] };
  const deskA = r.half - .93;
  r.add(deskA, r.depth - 1.38, 1.55, .66, .96, '#518987');
  r.staff(deskA, r.depth - .66, 0, -1);
  for (let b = .93; b < r.depth - .47; b += 1.0)
    prop('laundryMachine', -r.half + .54, b, .95, .88, 1.12, '#c8d0ce', { face: [1, 0] });
  for (let b = 1.0; b < r.depth - 2.3; b += 1.04)
    prop('laundryMachine', r.half - .55, b, .96, .93, 2.05, '#d6d8cf', { face: [-1, 0], stacked: true });
  if (r.depth > 5.7 && r.width >= 4.8) {
    const a = r.width > 6 ? -.55 : 0, b = r.depth - 2.6;
    r.add(a, b, 1.10, 1.5, .86, '#c3ad91', 0, true, 'table');
    for (let i = 0; i < 3; i++) r.add(a + .21, b + .21, .44, .34, .048, i === 1 ? '#c1d1cf' : '#f1ede1', .86 + i * .05, false);
    prop('laundryCart', a, b - 1.25, .62, .8, .82, '#b7bfbc');
    prop('soapVendor', -r.half + 1.69, r.depth - .35, .75, .56, 1.60, '#578783');
    if (r.width >= 6.8) r.seat(.12, r.depth - .36, 0, -1, 0, '#687f80', 1.45, .50);
  }
}

function postoffice(r, prop) {
  r.floor = '#aaa9a2'; r.wall = '#dddcd3';
  r.finish = { floor: 'tile', feature: '#263e54', ink: '#f4f0e4', accent: '#c86055', title: placeName(r.place), line: 'RETAIL SERVICES', zones: ['PACKING TABLE', 'PO BOXES'] };
  const a = -r.half + 1.15, b = r.depth - 1.46;
  r.add(a, b, 1.98, .78, 1.03, '#687d87');
  r.staff(a, b + .76, 0, -1);
  // Postal scale, weighing pan and two taped cartons at the service window.
  r.add(a - .56, b, .42, .35, .08, '#505b60', 1.04, false);
  r.add(a - .56, b, .39, .33, .022, '#c5c9c8', 1.12, false);
  for (let i = 0; i < 2; i++) {
    const boxA = a + .58, up = 1.04 + i * .20;
    r.add(boxA, b, .42 - i * .06, .32, .20, '#b38f63', up, false);
    r.add(boxA, b, .064, .321, .008, '#e0c295', up + .20, false);
  }
  prop('parcelDrop', r.half - .64, 1.02, .9, .76, 1.32, '#355575');
  for (let depth = 2.45; depth < Math.min(6.4, r.depth - .65); depth += 1.38)
    prop('poBoxes', r.half - .19, depth, .33, 1.34, 1.66, '#53616a', { face: [-1, 0], y: .35 });
  if (b > 3.9) {
    r.add(-r.half + .53, 2.15, .76, 1.65, .95, '#9b8b75', 0, true, 'table');
    prop('mailSupplies', r.half - 1.04, r.depth - .34, 1.58, .55, 1.63, '#71818a');
    r.add(a, b + .30, 1.93, .08, .14, '#536772', 2.05, false);
    for (const side of [-1, 1]) r.add(a + side * .92, b + .30, .06, .07, 1.06, '#71818a', 1.01, false);
  }
}



// Keep the preparation and pickup ends of a side counter even in a shallow
// room. The barista works from the wall side and customers approach the aisle.
function coffee(r, prop) {
  const bar = -r.half + 1.23, start = .59, end = Math.min(r.depth - .72, 6.45);
  const top = 1.01, length = end - start, short = length < 3.15, machine = start + (short ? .92 : 1.58);
  const juice = r.place.kind === 'juice';
  r.floor = '#b7a68f'; r.wall = '#eae3d4';
  r.light = { color:0xffe4bd, power:58, ceiling:'#ded7c8' };
  r.finish = { floor:'stone', feature:'#4d625b', ink:'#fff2de', accent:'#be9567', title:'', line:'', zones:[juice?'JUICE BAR':'ESPRESSO BAR','WINDOW SEATS'] };
  r.add(bar,(start+end)/2,.64,length,top,'#856a50');
  r.add(bar,(start+end)/2,.69,length,.035,'#ded5c2',top,false);
  r.staff(bar-.73,machine,1,0);
  prop('showcase',bar,start+(short?.28:.52),.57,short?.48:.96,.40,'#766451',{y:top+.035, face:[1,0], solid:false, items:juice?'fruit':'pastry',felt:'#e9dbbb'});
  prop(juice?'blenders':'espresso',bar,machine,.49,short?.63:.92,.56,'#b9c2b9',{y:top+.035,solid:false,face:[-1,0]});
  const pickup = short ? start+1.46 : end-.26;
  prop('cup',bar+.12,pickup,.18,.18,.095,'#f4edde',{y:top+.035,solid:false,pickup:true});
  r.add(bar+.12,pickup+(short?.115:-.27),.13,.055,.17,'#40504c',top+.035,false);
  prop('register',bar,short?end-.27:Math.min(end-.53,machine+.77),.38,.36,.38,'#41494a',{y:top+.035,solid:false});
  r.add(r.half-.26,1.48,.45,1.72,.065,'#967556',.94);
  for (let b=.98;b<Math.min(r.depth-.42,2.18);b+=.81) r.seat(r.half-.81,b,1,0,.28,'#59665c',.36,.36,.73);
  for (let b=3.2;b<r.depth-.73;b+=1.88) {
    const a=r.half-.69;
    r.add(a,b,.78,.64,.74,'#ad8967',0,true,'table');
    for(const side of [-1,1]) r.seat(a,b+side*.62,0,-side,0,'#51645c');
    if (b<4)prop('cup',a+.12,b,.18,.18,.095,'#f4edde',{y:.74,solid:false});
  }
  // Coffee retail below the menu, with folded bags, labels and a lower shelf.
  const merchWidth=Math.min(r.width-1.2,2.8), back=r.depth-.17;
  for(const up of [.94,1.46]){
    r.add(0,back,merchWidth,.30,.048,'#947053',up,false);
    for(let i=0;i<5;i++){
      const a=(i-2)*merchWidth*.178, pack=juice?'#8f9e72':i%2?'#af7955':'#c19c70';
      r.add(a,back,.16,.095,.22,pack,up+.048,false);
      r.add(a,back+.012,.166,.062,.026,pack,up+.267,false);
      r.add(a,back-.049,.094,.004,.092,i%2?'#e0d8b9':'#495a53',up+.115,false);
    }
  }
  for(let b=start+.19;b<end-.14;b+=.15)r.add(bar+.323,b,.026,.037,.70,'#715540',.16,false);
}

function jewelry(r, prop) {
  r.floor='#afa89f'; r.wall='#eee6db'; r.light={color:0xffedcf,power:68,ceiling:'#e4ded2'};
  r.finish={floor:'stone',feature:'#48433f',accent:'#c5a472',ink:'#fff1cf',title:placeName(r.place),line:'',zones:['COLLECTION','CONSULTATION']};
  const left=-r.half+(r.width>=5?1.14:.91), desk=r.half-.86, b=r.depth-1.14;
  for(let at=1.12,i=0; at<r.depth-.58; at+=1.65,i++)
    prop('showcase',left,at,.65,1.40,1.04,'#695548',{face:[1,0],items:['rings','watches','chains'][i%3],felt:'#c8beb2'});
  prop('showcase',desk,1.02,1.32,.63,1.15,'#51453e',{items:'watches',felt:'#4b5553'});
  r.add(desk,b,1.37,.69,.80,'#796450',0,true,'table');
  r.staff(desk,b+.66,0,-1);
  if (b>2.6) r.seat(desk,b-.66,0,1,0,'#686e62',.46,.48);
  r.add(desk-.26,b,.34,.25,.027,'#464b4c',.80,false);
  prop('ringSample',desk-.26,b,.065,.065,.06,'#dbc485',{y:.828,solid:false});
  r.add(left,r.depth-.22,1.04,.37,.92,'#746457');
  prop('bust',left,r.depth-.24,.21,.19,.36,'#454e4b',{y:.92,solid:false});
}

function shoes(r, prop) {
  r.floor='#a6a098'; r.wall='#f1ede4'; r.light={color:0xfff8ec,power:75};
  r.finish={floor:'stone',feature:'#3c4345',accent:'#bb7953',ink:'#f4f1e9',title:placeName(r.place),line:'',zones:['FOOTWEAR','FITTING']};
  const a=-r.half+.72, stock=fittingStock('shoes');
  r.add(a,1.02,1.10,.67,.75,'#b9a38c');
  for(const [i,item] of stock.entries())
    prop('sneaker',a+(i-1)*.32,1.02+(i%2)*.09,.30,.14,.18,item.design.shoeColour,{y:.75,solid:false,sku:item.sku,profile:item.design.shoes});
  for (let b=2.19,i=0; b<r.depth-1.0; b+=3.13,i++) {
    prop('shoewall',-r.half+.19,b,.34,1.91,1.67,'#c9c1b5',{face:[1,0],y:.38,solid:false});
  }
  r.seat(r.half-.58,1.60,-1,0,0,'#655c55',.58,1.20);
  r.add(r.half-.045,1.60,.035,1.03,1.65,'#a9b9b7',.24,false);
  const desk=r.half-.91;
  r.add(desk,r.depth-1.15,1.52,.59,.99,'#675d56'); r.staff(desk,r.depth-.51,0,-1);
}

function phoneShop(r,prop) {
  r.wall='#ece9e1'; r.floor='#b4afa5'; r.light={color:0xf6f6ef,power:76,strip:'#fff9e7'};
  const verizon=/verizon/i.test(r.place.name);
  r.finish={floor:'stone',feature:verizon?'#402e30':'#31454c',accent:verizon?'#da3c39':'#81aaa9',ink:'#f6f2e8',title:placeName(r.place),line:'',zones:['DEMO PHONES','SERVICE']};
  const tables = Math.max(1,Math.floor((r.depth-1.95)/2.25));
  const stock=fittingStock('phones');
  for(let i=0;i<tables;i++){
    const a=(i%2?1:-1)*(r.half-.76), b=1.19+2.25*i;
    r.add(a,b,1.16,.70,.91,'#bc9c79',0,true,'table');
    for (const side of [-1,1]) {
      r.add(a+side*.29,b,.10,.093,.06,'#626569',.91,false);
      const item=stock[side<0?0:1];
      prop('phone',a+side*.29,b,.08,.026,.16,item.color,{y:.97,solid:false,sku:item.sku});
      r.add(a+side*.29,b-.104,.088,.056,.008,'#f6f2e8',.91,false);
    }
  }
  const desk=r.half-.91;
  r.add(desk,r.depth-1.19,1.48,.62,1,'#ad957e'); r.staff(desk,r.depth-.50,0,-1);
}



function apparel(r,prop) {
  const discount=/t\.?\s*j\.?\s*maxx/i.test(r.place.name), navy=/old navy/i.test(r.place.name);
  r.floor=discount?'#b4aca2':'#ba9e7d'; r.wall='#ebe7dd';
  const accent=navy?'#334763':discount?'#893e48':'#53635b';
  r.finish={floor:discount?'stone':'wood',feature:accent,accent:'#c8b696',ink:'#fff9ea',title:placeName(r.place),line:'',zones:['APPAREL','FITTING ROOM']};
  const local=fittingStock(r.place).filter(item=>item.slot==='top');
  const cloth=local.length?local:fittingStock('clothes').filter(item=>item.slot==='top');
  prop('mannequin',-r.half+.76,1,.54,.46,1.78,cloth[r.seed%cloth.length].design.topColour);
  let index=0;
  const rail=(a,b) => {
    prop('garmentRail',a,b,1.27,.47,1.50,'#807c72');
    for(let j=-1;j<=1;j++){
      const item=cloth[index++%cloth.length];
      prop('shirt',a+j*.34,b+j*.055,.62,.08,.72,item.design.topColour,{y:.82,solid:false,sku:item.sku});
    }
  };
  rail(r.half-.81,1.28);
  for (let b=3.23,i=0;b<r.depth-2.15;b+=1.75,i++) rail((i%2?1:-1)*(r.half-.84),b);
  const desk=r.half-.89;
  r.add(desk,r.depth-1.19,1.43,.63,1,'#93806a');
  prop('register',desk,r.depth-1.19,.4,.4,.35,'#3e4645',{y:1,solid:false});
  r.staff(desk,r.depth-.53,0,-1);
  const fitting=-r.half+.70, b=r.depth-.67;
  prop('fittingRoom',fitting,b,1.24,1.16,2.24,'#635952',{solid:false});
  // The back wall and the side partition enclose a real changing space.
  r.add(fitting+.59,b,.055,1.16,2.24,'#635952');
  r.add(fitting,b+.55,1.24,.055,2.24,'#635952');
}

function diningRoom(r,prop,fine) {
  const walnut=fine?'#655045':'#99816a', fabric=fine?'#596959':'#954c43';
  r.floor=fine?'#927961':'#aca79b'; r.wall=fine?'#e4d8c8':'#e7dfce';
  r.finish={floor:fine?'wood':'tile',feature:fine?'#46514a':'#79433d',accent:'#c4a476',ink:'#fff2d6',title:'',line:'',zones:['DINING ROOM','KITCHEN']};
  r.light={color:fine?0xffd5aa:0xffedce,power:fine?42:65,ceiling:'#e1d5c2'};
  // A working line against the rear wall, floor space for a cook, and a
  // plating pass to one side. Servers walk around its open end to the tables.
  const kitchenA=r.half-1.12, back=r.depth-.35, passB=r.depth-1.89;
  prop('cookline',kitchenA,back,1.88,.59,2.06,'#9da8a6');
  r.add(kitchenA,passB,1.65,.58,.95,walnut);
  prop('plates',kitchenA-.51,passB,.28,.28,.12,'#eee7d8',{y:.95,solid:false});
  r.staff(kitchenA,back-.79,0,-1);
  for(let b=1.42;b<r.depth-1.4;b+=2.1) {
    const a=-r.half+.76;
    if (fine) {
      r.add(a,b,.86,.82,.74,'#e5ddd0',0,true,'table');
      for(const side of [-1,1]) r.seat(a,b+side*.68,0,-side,0,fabric,.45,.48);
    } else r.booth(a,b,fabric);
    prop('placeSetting',a,b,.63,.53,.12,'#ede6d3',{y:.74,solid:false});
  }
  if (r.width>6.3) for (let b=1.46;b<passB-1.08;b+=1.95) {
    r.table(r.half-1.42,b,walnut,fabric);
    prop('placeSetting',r.half-1.42,b,.65,.53,.12,'#e8e2d2',{y:.74,solid:false});
  }
}
export const BUSINESS_ROOMS={bank,waiting,gym,laundromat,postoffice,coffee,jewelry,shoes,tech:phoneShop,clothes:apparel,
  diner:(r,p)=>diningRoom(r,p,false),fine:(r,p)=>diningRoom(r,p,true)};
