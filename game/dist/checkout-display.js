// Shared, printed POS interface and the cash tray's moving geometry.
import * as THREE from './vendor/three.module.min.js';
import {checkoutAxes} from './checkout-model.js';
import {roomPoint} from './room.js';

let screens;
function screenAtlas(receipt=null,texture=null){
  if(!receipt && screens)return screens;
  if(typeof document==='undefined')return null;
  const canvas=texture?.image||document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d');if(!c)return null;
  const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const text=(s,x,y,px,color)=>{c.fillStyle=color;c.font='500 '+px+'px Arial';c.fillText(s,x,y);};
  rect(0,0,512,256,'#243538');rect(5,5,370,246,'#e1e6e2');rect(5,5,370,39,'#234d50');
  text('Checkout',18,31,20,'#f2f4ed');text('REGISTER 01',276,28,13,'#d6e7de');
  text(receipt?(receipt.cash?'Cash sale':'Card sale'):'New sale',18,72,21,'#193c40');text('Order total',19,104,13,'#445353');
  text(receipt?'$'+receipt.amount.toFixed(2):'$0.00',17,150,33,'#203c40');rect(10,194,152,45,'#287268');text(receipt?'Paid':'Ready',23,224,19,'#ffffff');
  for(const [i,key] of ['1','2','3','4','5','6','7','8','9','·','0','⌫'].entries()){
    const x=183+(i%3)*58,y=53+Math.floor(i/3)*48;
    rect(x,y,52,43,'#bdc9c5');text(key,x+20,y+29,20,'#273e3e');
  }
  rect(387,10,115,232,'#c1d7c6');text('WELCOME',395,48,17,'#214c43');
  for(let i=0;i<3;i++){c.beginPath();c.arc(426,105,15+i*9,-.85,.85);c.strokeStyle='#2d6459';c.lineWidth=4;c.stroke();}
  text(receipt?'Paid':'Tap or',399,174,18,'#214c43');text(receipt?'Thank you':'insert card',397,198,17,'#214c43');
  texture??=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true;
  if(!receipt)screens=texture;return texture;
}

export function checkoutScreens(room,till,y){
  const map=screenAtlas();if(!map)return null;
  const axes=checkoutAxes(room,till.da,till.db), right=Math.sign(room.tz*room.nx-room.tx*room.nz)||1;
  const positions=[],uv=[],index=[];
  function screen(u,width,v0,h0,v1,h1,side,x0,x1){
    const start=positions.length/3;
    for(const [sx,sy] of [[0,0],[1,0],[1,1],[0,1]]){
      const dx=u+right*side*(sx-.5)*width, v=sy?v1:v0;
      const [x,z]=roomPoint(room,till.a+axes.ua*dx+axes.va*v,till.b+axes.ub*dx+axes.vb*v);
      positions.push(x,y+till.up+(sy?h1:h0),z);uv.push((sx?x1:x0)/512,sy?.978:.022);
    }
    index.push(start,start+1,start+2,start,start+2,start+3);
  }
  screen(-.038,.272,-.027,.211,-.070,.382,1,5,375);
  screen(.147,.077,-.095,.193,-.071,.228,-1,387,502);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);
  const m=new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide,fog:false});
  const obj=new THREE.Mesh(g,m);obj.name='Checkout screens';
  let previous=null, paid=null;
  obj.userData.receipt=receipt=>{
    if(previous===receipt)return;
    previous=receipt;
    if(receipt)paid=screenAtlas(receipt,paid);
    m.map=receipt?paid:map;
  };
  obj.userData.dispose=()=>{paid?.dispose();m.dispose();g.dispose();};
  return obj;
}

export function checkoutDrawer(){
  const positions=[],colors=[],box=new THREE.BoxGeometry(1,1,1).toNonIndexed(),v=box.attributes.position;
  const col=new THREE.Color();
  function part(x,y,z,w,h,d,hex){
    col.set(hex);
    for(let i=0;i<v.count;i++){positions.push(x+w*v.getX(i),y+h*v.getY(i),z+d*v.getZ(i));colors.push(col.r,col.g,col.b);}
  }
  part(0,-.016,0,.345,.019,.247,'#222a29');
  part(0,.004,.119,.355,.048,.014,'#4e5655');part(0,.006,.128,.135,.010,.005,'#222c2a');
  part(.147,.006,.129,.014,.014,.004,'#9b9f93');
  for(const side of [-1,1])part(side*.167,.003,0,.008,.043,.237,'#343c39');
  for(const x of [-.084,0,.084])part(x,.006,-.025,.005,.034,.172,'#454b45');
  part(0,.005,.061,.337,.035,.006,'#414840');
  for(const x of [-.112,-.055,0,.055,.112])part(x,.002,.090,.005,.027,.052,'#414840');
  const coin=new THREE.CylinderGeometry(1,1,1,10).toNonIndexed(),cv=coin.attributes.position;
  function disc(x,y,z,r,h,hex){
    col.set(hex);
    for(let i=0;i<cv.count;i++){positions.push(x+r*cv.getX(i),y+h*cv.getY(i),z+r*cv.getZ(i));colors.push(col.r,col.g,col.b);}
  }
  // The retaining clips stay in the tray even when it holds no cash.
  for(let i=0;i<4;i++)part((i-1.5)*.083,.009,-.070,.044,.005,.013,'#70786e');
  const empty=positions.length/3, bands=[];
  function band(amount){bands.push({amount,end:positions.length/3});}
  for(let i=0;i<4;i++){
    const cx=(i-1.5)*.056;
    for(let j=0;j<=i;j++)disc(cx+.004*(j%2),-.004+j*.003,.086,.011+i*.001,.003,i===1?'#ab806a':'#a9aea5');
    band([.01,.10,.25,.50][i]);
  }
  for(let i=0;i<4;i++){
    const x=(i-1.5)*.083;
    part(x,-.001,-.025,.071,.012,.137,i%2?'#94a183':'#a9ad8c');
    part(x,.006,-.024,.062,.002,.121,i%2?'#bac1a2':'#c6c7a4');
    disc(x,.0075,-.019,.014,.002,'#828f78');
    part(x-.019,.008,.018,.013,.001,.004,'#748470');
    band([1,55,160,420][i]);
  }
  box.dispose();coin.dispose();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const tray=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,fog:false}));
  tray.name='Register drawer';
  tray.userData.showCash=amount=>{
    let count=empty;
    for(const band of bands){if(amount<band.amount)break;count=band.end;}
    g.setDrawRange(0,count);
  };
  tray.userData.showCash(0);return tray;
}
