// One catalog drives shelf labels, the checkout, the handheld model and the bag.
const rows = [
  ['water','Ridgeline spring water','500 mL',2,'bottle','#9fcfdc','pep'],
  ['cola','Borough cola','355 mL',1.75,'can','#923a32','pep'],
  ['seltzer','Lime seltzer','355 mL',1.5,'can','#497944','pep'],
  ['chips','Sea salt kettle chips','43 g',2.25,'pouch','#deb148','meal'],
  ['pretzels','Twist salted pretzels','57 g',2,'pouch','#394b77','meal'],
  ['milk','Hudson whole milk','473 mL',2.75,'carton','#42749d','pep'],
  ['juice','Orange juice','473 mL',3.25,'carton','#ec9232','pep'],
  ['oats','Morning Oats cereal','340 g',4.75,'box','#dfc59a','meal'],
  ['pasta','Rigatoni','454 g',2.5,'box','#bd4634','pantry'],
  ['apple','Gala apple','1 apple',.85,'apple','#be4431','meal'],
  ['orange','Navel orange','1 orange',1,'orange','#e88a22','meal'],
];
export const groceries=Object.fromEntries(rows.map(([key,name,size,price,shape,color,effect],tile)=>{
  const id='grocery-'+key;return [id,{id,name,size,price,shape,color,effect,tile}];
}));
export const groceryStore=place=>['grocery','supermarket','bodega'].includes(place?.kind);
export const groceryPrice=(place,item)=>place.kind==='supermarket' && item.id==='grocery-water'?1.5:item.price;

// Three facing groups per tier give a small footprint the whole assortment.
// Locations and IDs are deterministic so removed facings survive room streaming.
export function furnishGrocer(r,prop){
  const deli=r.place.kind==='bodega',desk=-r.half+.78,front=deli?1.92:2.08;
  r.floor=deli?'#a29c89':'#bab4a1';r.wall=deli?'#f2e6cb':'#e9eadc';
  r.light={color:0xfff1da,power:72,strip:'#f7f3e7'};
  r.finish={floor:'tile',feature:deli?'#285746':'#445b48',accent:'#cda465',ink:'#fff4db',title:r.place.name,line:'',zones:['COLD DRINKS','GROCERIES']};
  r.add(desk,front,1.25,.70,1,'#917459');r.staff(desk,front-.70,0,1);
  prop('register',desk,front,.40,.33,.34,'#434c4b',{y:1,solid:false,face:[0,-1]});
  if(deli)prop('grill',-r.half+.31,r.depth-.72,.54,1.19,2.18,'#8e9694',{face:[1,0]});
  const assortment=(...names)=>names.map(name=>groceries['grocery-'+name]),stock=[],produce=[];
  function bay(a,b,da,db,length,items,cold){
    const d=cold?.53:.39,side=da!==0;
    const add=(u,v,w,deep,h,color,y=0,solid=false)=>{
      r.add(a+u*db+v*da,b-u*da+v*db,side?deep:w,side?w:deep,h,color,y,solid);
    };
    if(cold)prop('cooler',a,b,side?d:length,side?length:d,1.95,'#ced5cc',{face:[da,db],openRack:true});
    else add(0,-d/2+.04,length,.08,1.82,'#aca89a');
    add(0,0,length,d,.14,'#515851',0,true);
    // The base owns the full footprint for collisions. The shelf faces remain within reach.
    for(const end of [-1,1])add(end*(length/2-.025),0,.04,d,1.73,'#626b60',.14);
    const levels=[.31,.77,1.23];
    for(let tier=0;tier<3;tier++){
      const up=levels[tier];add(0,0,length-.04,d,.03,'#d5d3bd',up-.03);
      add(0,d/2-.012,length-.04,.025,.045,'#665f4b',up-.04);
      const item=items[tier%items.length],pitch=cold?.086:item.shape==='pouch'?.174:.158;
      const copies=Math.max(3,Math.min(34,Math.floor((length-.13)/pitch)));
      for(let i=0;i<copies;i++){
        const u=((i+.5)/copies-.5)*(length-.12);
        for(let row=0;row<2;row++){
          const v=d/2-.065-row*(cold?.094:.078);
          stock.push({index:stock.length,id:item.id,a:a+u*db+v*da,b:b-u*da+v*db,y:up,da,db});
        }
      }
      // A shelf-edge ticket belongs to the same product as the complete row.
      const u=-length*.29,v=d/2+.008;
      r.groceryTickets.push({id:item.id,a:a+u*db+v*da,b:b-u*da+v*db,y:up-.035,da,db});
    }
    if(items[0]===groceries['grocery-chips'] && !side){
      const up=1.54;add(0,0,length-.04,d,.028,'#a1855f',up-.028);
      add(0,d/2-.02,length-.055,.03,.038,'#b78750',up);
      const lanes=Math.max(3,Math.floor((length-.22)/.13));
      for(let lane=0;lane<lanes;lane++)for(let row=0;row<2;row++){
        const u=((lane+.5+row*.20)/lanes-.5)*(length-.20),v=d/2-.088-row*.105;
        produce.push({id:lane<lanes/2?'grocery-apple':'grocery-orange',a:a+u*db+v*da,b:b-u*da+v*db,y:up,da,db});
      }
      for(const [id,u] of [['grocery-apple',-length*.25],['grocery-orange',length*.25]])
        r.groceryTickets.push({id,a:a+u*db+da*(d/2+.006),b:b-u*da+db*(d/2+.006),y:up-.035,da,db});
    }
  }
  r.groceryTickets=[];
  const start=1.53,end=r.depth-.67,span=end-start,pitch=span/2;
  bay(r.half-.29,start+pitch*.5,-1,0,pitch-.07,assortment('water','cola','seltzer'),true);
  bay(r.half-.29,start+pitch*1.5,-1,0,pitch-.07,assortment('milk','juice','water'),true);
  bay(0,r.depth-.23,0,-1,Math.min(r.width-1.72,4.4),assortment('chips','pretzels','oats'),false);
  const long=r.depth>6.5;
  if(long)bay(-r.half+.22,(3+r.depth-1.48)/2,1,0,r.depth-4.50,assortment('pasta','oats','pretzels'),false);
  else bay(r.half-.22,.82,-1,0,.96,assortment('pasta','pretzels','chips'),false);
  if(r.width>=6.7 && r.depth>=7.5){
    const length=Math.min(r.depth-5.3,3.9);
    bay(.25,3.4+length/2,1,0,length,assortment('chips','oats','pasta'),false);
  }
  for(const slot of produce){slot.index=stock.length;stock.push(slot);}
  r.grocerySlots=stock;
}

export function stockProduceCrate(r,crate){
  const {a,b,w,d,h}=crate,da=-Math.sign(a)||1;
  crate.more.looseStock=true;
  for(let row=0;row<3;row++)for(let i=0;i<6;i++){
    const id=row===0 || row===1 && i<3?'grocery-apple':'grocery-orange';
    r.grocerySlots.push({index:r.grocerySlots.length,id,a:a+(i-2.5)*w*.143,b:b+(row-1)*d*.24,
      y:h-.139+.014*((i+row)%2),da,db:0,fixture:crate});
  }
  for(const [id,offset] of [['grocery-apple',-.18],['grocery-orange',.18]])
    r.groceryTickets.push({id,a:a+da*(w/2+.006),b:b+offset,y:h-.18,da,db:0});
}
