// Dimensions include the customer terminal and the receipt printer. Metres.
export const CHECKOUT_WIDTH = .46, CHECKOUT_DEPTH = .36;

// A counter running into a skewed footprint follows its side wall. The
// hardware itself stays square. These two unit vectors map its rigid body
// back into the same room coordinates used by the counters.
export function checkoutAxes(room, da, db) {
  const skew=room.skew||0, x=da, z=db-skew*da, length=Math.hypot(x,z)||1;
  const fx=x/length, fz=z/length;
  return {ua:fz+skew*fx,ub:-fx,va:fx-skew*fz,vb:fz};
}

export function drawCheckout(t) {
  const shell='#414746', rubber='#252a2b', alloy='#89918d', glass='#16292e';
  // Rubber feet, powder-coated drawer housing, recessed slot and lock bezel.
  t.box(0,0,.384,.298,.013,0,rubber);
  t.box(0,0,.414,.331,.090,.013,shell);
  t.box(0,0,.420,.335,.012,.103,'#525a58');
  t.box(0,.166,.362,.004,.057,.026,'#151a19');
  // VESA stand and a tilted, thin-bezel operator display.
  t.box(-.038,-.027,.154,.103,.014,.115,rubber);
  t.slope(-.038,-.028,.125,-.081,.237,.064,.034,alloy);
  t.slope(-.038,-.043,.200,-.091,.395,.303,.020,shell);
  t.slope(-.038,-.031,.210,-.075,.383,.279,.004,glass);
  t.slope(-.038,-.066,.227,-.101,.366,.238,.014,'#3c4241');
  for(let i=0;i<6;i++)t.label(-.09+i*.020,-.103,.345,-.106,.357,.010,rubber,true);
  // Smaller customer-facing payment terminal, including a chip slot.
  t.box(.147,-.036,.109,.092,.015,.115,rubber);
  t.slope(.147,-.112,.146,-.051,.235,.105,.023,rubber);
  t.slope(.147,-.084,.193,-.059,.228,.082,.005,'#759da4');
  for(let row=0;row<3;row++)for(let col=-1;col<=1;col++)
    t.label(.147+col*.021,-.124+row*.008,.151+row*.012,-.120+row*.008,.157+row*.012,.015,col===1 && row===0?'#5a927c':'#838985',true);
  // Thermal printer with a curled receipt, visible from the operator side.
  t.box(.143,.083,.118,.114,.079,.115,'#515755');
  t.box(.143,.090,.092,.014,.004,.194,'#181f1f');
  t.slope(.143,.092,.196,.071,.238,.065,.002,'#ede9dc');
  for(let row=0;row<3;row++)t.label(.140,.086-row*.004,.211+row*.008,.085-row*.004,.213+row*.008,.038-row*.004,'#999b8f');
}
