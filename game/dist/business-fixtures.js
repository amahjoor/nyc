// Equipment drawn into the room's shared mesh. Dimensions are in the fixture's
// own frame, with +v facing the customer and heights measured from its foot.
const steel = '#989fa2', chrome = '#c7cdcb', rubber = '#26282a', alloy = '#52585a';

export const BUSINESS_FIXTURES = {
  cashMachine(t, w, d, h, enamel, { accent }) {
    const face = d * .23;
    t.box(0, -.03, w - .10, d - .08, .11, 0, alloy);
    t.box(0, -d * .12, w, d * .70, h - .11, .11, enamel);
    t.box(0, d * .04, w - .06, d * .89, .78, .12, '#485557');
    for (const side of [-1, 1]) {
      t.box(side * (w / 2 - .035), .02, .065, d - .05, h - .13, .12, enamel);
      t.plate(side * w * .40, face + .007, .021, .38, 1.03, '#e7ebdc', true);
    }
    t.box(0, 0, w, d, .12, h - .12, enamel);
    t.plate(0, face + .005, w * .75, .37, h - .59, '#222d32');
    t.plate(0, face + .009, w * .65, .28, h - .545, '#8ec4c5', true);
    t.plate(-w * .07, face + .012, w * .39, .032, h - .36, '#35585e');
    for (let i = 0; i < 3; i++) t.plate((i - 1) * w * .19, face + .014, w * .15, .05, h - .49, '#e6f1df');
    t.box(0, d * .14, w - .09, d * .69, .055, .9, '#bbc3bf');
    t.box(-.11, d * .33, .23, .15, .018, .955, '#434b4e');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      t.box(-.17 + i * .06, d * .33 + (j - 1) * .043, .044, .028, .009, .974, chrome);
    t.plate(w * .28, face + .012, .14, .036, 1.03, accent, true);
    t.plate(0, d * .485 + .002, w * .47, .064, .67, rubber);
    t.box(0, d * .455, w * .50, d * .09, .022, .658, chrome);
  },

  serviceDesk(t, w, d, h, timber, { trim, top }) {
    t.box(0, -.02, w - .13, d - .10, .13, 0, '#49443d');
    t.box(0, 0, w - .05, d - .04, h - .16, .10, timber);
    const panels = Math.ceil(w / .68), pitch = (w - .10) / panels;
    for (let i = 1; i < panels; i++)
      t.plate(-w / 2 + .05 + i * pitch, d / 2 - .019, .013, h - .24, .14, '#514137');
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++)
      t.box(side * (w / 2 - .07 - .043 * i), d / 2 - .015, .018, .027, h - .25, .14, timber);
    t.box(0, 0, w - .025, d - .015, .025, h - .085, trim);
    t.box(0, 0, w, d, .060, h - .060, top);
  },

  deskMonitor(t, w, d, h, frame) {
    t.box(0, 0, w * .53, d, .023, 0, alloy);
    t.box(0, 0, .052, .043, .13, .023, alloy);
    t.box(0, 0, w, .038, h - .14, .14, frame);
    t.plate(0, .021, w - .032, h - .18, .156, '#729393');
    t.plate(-w * .18, .023, w * .34, .016, h - .08, '#c2d5c8');
    t.box(0, -.023, w * .27, .010, .015, h - .07, alloy);
  },

  writingDesk(t, w, d, h, timber) {
    for (const side of [-1, 1]) t.box(side * (w / 2 - .10), -.025, .065, d - .10, h - .07, .035, timber);
    t.box(0, -d * .29, w - .17, .04, .22, h - .35, timber);
    t.box(0, 0, w, d, .055, h - .055, '#bc9971');
    t.box(-w * .16, .035, .32, .21, .014, h, '#ebe4d2');
    for (let i = 0; i < 3; i++) t.box(-w * .18, .02 + i * .035, .19, .007, .003, h + .014, '#a39d8e');
    t.box(w * .15, .04, .018, .14, .017, h, '#333f42');
    for (let i = 0; i < 3; i++) {
      t.box(w * .28, -d * .30 + i * .038, .17, .019, .22 - i * .036, h, i === 1 ? '#b98c67' : '#f0e8d6');
    }
  },

  queueRail(t, w, d, h, belt) {
    for (const v of [-(d - w) / 2, (d - w) / 2]) {
      t.can(0, v, w / 2, .035, .035, alloy);
      t.post(0, v, .033, h - .09, .07, chrome);
      t.can(0, v, .053, .09, h - .09, alloy);
    }
    t.box(0, 0, .018, d - w, .058, h - .072, belt);
  },

  wallSconce(t, w, d, h, brass) {
    t.box(0, -d * .36, w, d * .24, h, 0, brass);
    t.post(0, .015, w * .29, h - .12, .06, '#fff2d0');
    for (const up of [.045, h - .088]) t.can(0, .015, w * .32, .043, up, brass);
  },

  barbellRack(t,w,d,h,frame,{accent}) {
    for (const side of [-1,1]) {
      const u=side*w*.34;
      t.box(u,0,.086,d,.07,.035,frame);
      t.box(u,-.21,.072,.084,h-.13,.10,frame);
      t.box(u,-.14,.084,.14,.055,1.33,chrome);
      for(let i=0;i<9;i++) t.plate(u,-.165,.019,.021,.65+i*.095,rubber);
      for(let i=0;i<2;i++) t.rodU(side*(w*.39+i*.045),-.12,.039,.18-i*.024,1.41,i ? rubber : accent);
    }
    t.box(0,-.21,w*.73,.07,.063,h-.11,frame);
    t.rodU(0,-.12,w*.97,.017,1.41,chrome);
    t.box(0,.09,w*.80,d*.74,.032,.033,'#a88969');
  },

  treadmill(t, w, d, h, frame, { accent }) {
    const motor = -d * .34;
    t.box(0, .02, w, d - .06, .14, .09, frame);
    t.box(0, d * .09, w - .16, d * .73, .035, .23, rubber);
    for (const side of [-1, 1]) {
      const u = side * (w / 2 - .045);
      t.box(u, .02, .078, d - .04, .055, .23, alloy);
      t.slope(u, motor + .18, .25, motor, 1.12, .078, .08, frame);
      t.rodV(u, motor + .24, .52, .034, 1.03, rubber);
    }
    t.box(0, motor, w - .12, .4, .13, .23, frame);
    t.rodU(0, motor + .02, w - .06, .048, 1.09, frame);
    t.box(0, motor, w * .68, .11, .36, h - .36, frame);
    t.plate(0, motor + .057, w * .51, .20, h - .26, '#42646d', true);
    t.plate(0, motor + .06, w * .35, .018, h - .19, '#a4d2c5', true);
    t.plate(0, motor + .058, .085, .025, h - .32, accent);
  },

  dumbbells(t, w, d, h, frame) {
    for (const u of [-w * .43, w * .43]) {
      t.box(u, 0, .07, d, .06, .04, frame);
      t.slope(u, d * .29, .08, -d * .24, h - .12, .065, .055, frame);
    }
    for (const [height, v] of [[.4, d * .18], [.78, -d * .16]]) {
      const up = h * height, pairs = Math.floor(w / .39);
      t.box(0, v, w, .18, .065, up, alloy);
      for (let i = 0; i < pairs; i++) {
        const u = w * ((i + .5) / pairs - .5), radius = .069 + i * .009;
        t.rodU(u, v, .30, .021, up + radius + .06, chrome);
        for (const end of [-1, 1]) t.rodU(u + end * .11, v, .075, radius, up + radius + .06, rubber);
      }
    }
  },

  weightBench(t, w, d, h, pad) {
    for (const v of [-.42, .45]) {
      t.box(0, v, w, .085, .07, .035, alloy);
      t.box(0, v, .10, .12, .33, .09, alloy);
    }
    t.box(0, 0, .10, d - .17, .08, .31, steel);
    t.box(0, d * .30, w, .40, .09, .40, pad);
    t.slope(0, .18, .45, -d * .44, h - .045, w, .09, pad);
  },

  cableStation(t, w, d, h, frame, { accent }) {
    for (const side of [-1, 1]) {
      const u = side * w * .39;
      t.box(u, 0, .18, d, .09, .02, frame);
      t.box(u, -d * .26, .18, .27, h - .16, .1, frame);
      for (let i = 0; i < 8; i++) t.box(u, -.04, .26, .2, .057, .15 + i * .068, rubber);
      for (const edge of [-1, 1]) t.post(u + edge * .08, -.04, .014, h - .78, .69, chrome);
      t.post(u, d * .13, .012, .65, h - .84, alloy);
      t.ring(u, d * .13, .07, h - .86, rubber);
    }
    t.box(0, -d * .26, w, .22, .14, h - .15, frame);
    t.plate(0, -d * .26 + .115, w * .45, .036, h - .10, accent);
  },

  spinBike(t, w, d, h, frame, { accent }) {
    for (const v of [-d * .34, d * .34]) t.rodU(0, v, w, .036, .065, alloy);
    t.slope(0, -d * .36, .085, d * .32, .085, .09, .07, frame);
    t.rodU(0, -d * .25, .095, .26, .36, alloy);
    t.rodU(0, -d * .25, .108, .18, .36, frame);
    t.slope(0, -d * .28, .11, d * .15, .83, .10, .09, frame);
    t.slope(0, d * .3, .1, -d * .25, .78, .09, .09, frame);
    t.slope(0, d * .12, .70, d * .21, .96, .045, .045, steel);
    t.box(0, d * .2, .22, .26, .065, .94, rubber);
    t.slope(0, -d * .25, .70, -d * .32, h - .07, .05, .05, steel);
    t.rodU(0, -d * .32, .42, .031, h - .07, rubber);
    for (const side of [-1, 1]) {
      t.rodV(side * .18, -d * .32 + .06, .21, .027, h - .07, rubber);
      t.box(side * .14, .12 + side * .08, .12, .09, .035, .32 + side * .09, rubber);
    }
    t.rodU(0, .12, .20, .092, .36, accent);
  },

  reformer(t, w, d, h, wood) {
    for (const side of [-1, 1]) {
      const u = side * (w / 2 - .046);
      for (const v of [-d * .42, d * .42]) t.box(u, v, .075, .12, .25, .035, wood);
      t.box(u, 0, .085, d, .16, .24, wood);
      t.box(u - side * .04, 0, .02, d - .12, .026, .38, chrome);
      t.slope(u, d * .30, .37, d * .4, h - .045, .04, .04, steel);
      t.box(side * .16, -d * .28, .09, .13, .11, .49, rubber);
    }
    t.box(0, -d * .10, w - .18, d * .54, .105, .39, rubber);
    t.box(0, -d * .4, w - .14, d * .14, .075, .39, rubber);
    t.box(0, d * .42, w - .12, .24, .10, .28, wood);
    t.rodU(0, d * .40, w - .05, .033, h - .045, rubber);
    for (let i = -1; i <= 1; i++) t.rodV(i * .07, d * .26, d * .24, .014, .33, steel);
  },

  exerciseMat(t, w, d, h, color) {
    t.box(0, 0, w, d, .018, .035, color);
    for (const side of [-1, 1]) t.box(side * w * .36, .04, .012, d * .76, .004, .054, '#bdc6b4');
    t.box(w * .26, -d * .39, .16, .22, h - .054, .054, '#ac8060');
  },

  towelShelf(t, w, d, h, wood) {
    t.box(0, -d * .46, w, .04, h, 0, wood);
    for (const side of [-1, 1]) t.box(side * (w / 2 - .025), 0, .05, d, h, 0, wood);
    for (let shelf = 0; shelf < 3; shelf++) {
      const up = .15 + shelf * .43;
      t.box(0, 0, w, d, .045, up, wood);
      for (let i = 0; i < 3; i++) {
        const u = (i - 1) * w * .25;
        t.rodV(u, .015, d * .72, .083, up + .127, '#e9e5d8');
        t.rodV(u, d * .37, .018, .042, up + .127, '#c6c4b9');
      }
    }
  },

  laundryMachine(t, w, d, h, casing, { stacked }) {
    const count = stacked ? 2 : 1, unit = h / count, face = d / 2;
    for (let i = 0; i < count; i++) {
      const base = i * unit, center = base + unit * .48, radius = w * .33;
      t.box(0, -.026, w - .025, d - .052, unit - .018, base + .012, casing);
      t.drum(0, face - .032, .055, radius, center, chrome);
      t.drum(0, face - .013, .038, radius * .84, center, '#45565d');
      t.drum(0, face + .001, .018, radius * .69, center, '#61757c');
      t.slope(-w * .13, face + .013, center + .026, face + .013, center + .11, .025, .008, '#a3b3b7');
      t.plate(w * .24, face + .015, .056, .12, center - .055, rubber);
      t.box(0, face - .042, w - .07, .055, .15, base + unit - .18, alloy);
      t.plate(-w * .22, face - .011, .17, .063, base + unit - .14, '#a5d5be', true);
      t.rodV(w * .22, face - .005, .038, .044, base + unit - .102, chrome);
      t.plate(0, face - .01, .062, .018, base + unit - .12, rubber);
    }
  },

  laundryCart(t, w, d, h) {
    for (const u of [-w * .4, w * .4]) for (const v of [-d * .39, d * .39]) {
      t.rodU(u, v, .055, .069, .085, rubber);
      t.post(u, v, .016, h - .16, .13, chrome);
    }
    t.box(0, 0, w * .84, d * .83, .035, .32, alloy);
    for (const up of [.37, .49, .61, h - .035]) {
      for (const side of [-1, 1]) {
        t.rodU(0, side * d * .4, w * .83, .012, up, steel);
        t.rodV(side * w * .4, 0, d * .83, .012, up, steel);
      }
    }
    for (const side of [-1, 1]) for (const along of [-.22, 0, .22]) t.post(side * w * .4, along * d, .009, h - .37, .33, steel);
  },

  soapVendor(t, w, d, h, shell) {
    t.box(0, 0, w, d, h, 0, shell);
    t.plate(0, d / 2 + .003, w - .09, .83, .62, '#374748');
    const packs = ['#dc945c', '#75a9ab', '#e7dab0'];
    for (let col = 0; col < 3; col++) for (let row = 0; row < 2; row++) {
      const u = (col - 1) * w * .22, up = .77 + row * .33;
      t.plate(u, d / 2 + .008, w * .17, .23, up, packs[(col + row) % 3]);
      t.plate(u, d / 2 + .01, w * .13, .043, up + .12, '#f4eedb');
    }
    t.plate(-w * .12, d / 2 + .003, w * .52, .13, .30, rubber);
    t.plate(w * .32, d / 2 + .003, .08, .12, .39, chrome);
  },

  mailSupplies(t, w, d, h, frame) {
    t.box(0, -d * .46, w, .04, h, 0, frame);
    for (const u of [-w / 2 + .025, w / 2 - .025]) t.box(u, 0, .05, d, h, 0, frame);
    for (let shelf = 0; shelf < 3; shelf++) {
      const up = .20 + shelf * .43;
      t.box(0, 0, w, d, .045, up, frame);
      for (let i = 0; i < 3; i++) {
        const u = (i - 1) * w * .28, height = .13 + .045 * ((i + shelf) % 3);
        t.box(u, .015, w * .25, d * .81, height, up + .047, '#ebe7db');
        t.plate(u, .016 + d * .406, w * .25, .028, up + height, '#bd514a');
        t.plate(u + .03, .017 + d * .406, w * .10, .022, up + .11, '#466675');
      }
    }
  },

  planter(t, w, d, h, ceramic) {
    t.cone(0, 0, w * .41, .42, .035, ceramic);
    const greens = ['#586d4e', '#768363', '#3c5947'];
    for (let i = 0; i < 7; i++) {
      const theta = i * 2.4, u = Math.cos(theta) * w * .21, v = Math.sin(theta) * d * .24;
      const top = h - .28 - (i % 3) * .12;
      t.post(u * .66, v * .66, .014, top - .36, .36, greens[0]);
      t.ball(u, v, w * .17, .24, d * .11, top, greens[i % 3]);
    }
  },

  poBoxes(t, w, d, h, frame) {
    t.box(0, 0, w, d, h, 0, frame);
    const columns = Math.max(2, Math.round(w / .27)), rows = 6;
    const step = (w - .1) / columns, rise = (h - .28) / rows;
    for (let col = 0; col < columns; col++) for (let row = 0; row < rows; row++) {
      const u = -.5 * (w - .1) + step * (col + .5), up = .16 + row * rise;
      t.plate(u, d / 2 + .003, step - .012, rise - .014, up, row % 2 ? '#9ba4a3' : '#a4acab');
      t.plate(u - step * .17, d / 2 + .006, .067, .032, up + rise * .58, '#e8e5d8');
      t.plate(u + step * .24, d / 2 + .006, .027, .035, up + rise * .32, rubber);
    }
  },

  parcelDrop(t, w, d, h, blue) {
    t.box(0, 0, w, d, h * .85, .035, blue);
    t.box(0, -.025, w - .025, d - .05, h * .14, h * .85, blue);
    t.plate(0, d / 2 + .004, w * .8, .22, h * .58, rubber);
    t.box(0, d / 2 - .02, w * .76, .07, .14, h * .59, steel);
    t.plate(0, d / 2 + .004, w * .48, .10, h * .35, '#ece9db');
  },
};
