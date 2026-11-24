// Implements are authored at the handle. Positive Z points toward the food.
import {BoxGeometry,CylinderGeometry,SphereGeometry,TorusGeometry,LatheGeometry,Vector2} from './vendor/three.module.min.js';
const steel=0xb5c3c5,dark=0x3e4341,wood=0x97704b;
const box=(w,h,d,x,y,z,color)=>[new BoxGeometry(w,h,d).translate(x,y,z),color];
const cylinder=(top,base,h,x,y,z,color)=>[new CylinderGeometry(top,base,h,16).translate(x,y,z),color];
const oval=(x,y,z,w,h,d,color)=>[new SphereGeometry(1,14,8).scale(w,h,d).translate(x,y,z),color];
const grip=()=>box(.023,.026,.105,0,0,.016,dark);
const pin=(r,h)=>cylinder(r,r,h,0,-h*.32,0,steel);
const vessel=(r,base,h,x,y,color)=>[new LatheGeometry([[0,0],[base,0],[r,h],[r-.003,h],[base-.003,.004],[0,.004]].map(([a,b])=>new Vector2(a,b)),24).translate(x,y,0),color];
const bottle=color=>[cylinder(.035,.035,.15,0,0,0,color),cylinder(.014,.035,.036,0,.093,0,color),cylinder(.014,.014,.069,0,.145,0,color)];
const spoon=(radius,length)=>[pin(.006,length),oval(0,-length*.82,.008,radius,.012,radius*1.25,steel)];
const tools={
  prepCoffeeFlow:()=>[cylinder(.002,.002,1,0,0,0,0x503020)],
  prepMilkFlow:()=>[cylinder(.003,.003,1,0,0,0,0xe6dfc9)],
  prepWineFlow:()=>[cylinder(.003,.003,1,0,0,0,0x762c36)],
  prepPourFlow:()=>[cylinder(.003,.003,1,0,0,0,0xc5b78b)],
  prepKnife:()=>[grip(),box(.006,.043,.116,0,-.01,.121,steel)],
  prepFork:()=>[pin(.007,.108),...[-1,0,1].map(i=>cylinder(.0025,.001,.057,i*.007,-.097,0,steel))],
  prepTongs:()=>[-1,1].flatMap(s=>[[new BoxGeometry(.009,.009,.145).rotateY(s*.095).translate(s*.012,-.005,.045),steel],oval(s*.019,-.012,.118,.009,.009,.027,steel)]),
  prepTurner:()=>[grip(),box(.019,.007,.073,0,-.014,.092,steel),box(.068,.005,.082,0,-.038,.145,steel)],
  prepSpreader:()=>[grip(),oval(0,-.035,.103,.017,.003,.062,steel)],
  prepBrush:()=>[grip(),box(.043,.038,.05,0,-.023,.092,0xd6b67c)],
  prepPeel:()=>[box(.031,.025,.40,0,0,-.063,wood),box(.227,.008,.237,0,-.018,.22,steel)],
  prepLadle:()=>spoon(.039,.16),prepScoop:()=>spoon(.035,.13),prepSpoon:()=>spoon(.022,.14),prepBarSpoon:()=>spoon(.011,.18),
  prepWhisk:()=>[pin(.011,.105),...[-.7,.7,0].map(angle=>[new TorusGeometry(.027,.0024,5,16).scale(1,1.6,1).rotateY(angle).translate(0,-.089,0),steel])],
  prepGrater:()=>[box(.07,.125,.033,0,-.04,0,steel),...[-1,0,1].map(i=>box(.05,.004,.004,0,-.04+i*.025,-.018,dark))],
  prepPestle:()=>[cylinder(.015,.017,.115,0,-.019,0,wood),oval(0,-.081,0,.028,.035,.028,wood)],
  prepMallet:()=>[pin(.013,.13),box(.065,.039,.051,0,-.093,0,steel)],
  prepMuddler:()=>[cylinder(.013,.016,.156,0,-.044,0,wood),cylinder(.021,.021,.022,0,-.127,0,wood)],
  prepBag:()=>[cylinder(.043,.007,.14,0,-.033,0,0xf0e7d0),cylinder(.008,.003,.025,0,-.112,0,steel)],
  prepSqueeze:()=>[cylinder(.027,.029,.103,0,0,0,0xe2c292),cylinder(.018,.004,.042,0,-.07,0,0xf4e5c8)],
  prepTorch:()=>[cylinder(.023,.023,.108,0,-.01,0,dark),box(.018,.021,.073,0,.045,.032,steel)],
  prepFilter:()=>[grip(),[new CylinderGeometry(.034,.028,.032,18).translate(0,-.002,.097),steel]],
  prepTamper:()=>[pin(.014,.044),cylinder(.03,.03,.012,0,-.031,0,steel)],
  prepPitcher:()=>[vessel(.043,.033,.105,.049,-.049,steel),box(.05,.009,.012,.018,.027,0,steel),box(.05,.009,.012,.018,-.031,0,steel),box(.01,.06,.012,0,0,0,steel)],
  prepJug:()=>[vessel(.054,.049,.147,.046,-.065,0x879e9c),box(.059,.011,.016,.016,.043,0,dark),box(.012,.073,.016,-.008,.009,0,dark)],
  prepTin:()=>[vessel(.041,.028,.148,0,-.067,steel)],
  prepShaker:()=>[vessel(.043,.031,.142,0,-.068,steel),cylinder(.031,.043,.072,0,.106,0,0x87999d)],
  prepBottle:()=>bottle(0x9b7d4e),prepWineBottle:()=>bottle(0x425a42),
  prepJigger:()=>[vessel(.025,.009,.049,0,0,steel),cylinder(.009,.022,.041,0,-.019,0,steel)],
  prepMixGlass:()=>[vessel(.047,.038,.148,0,-.068,0x92aaa9)],
  prepStrainer:()=>[box(.016,.005,.079,0,0,-.015,steel),[new TorusGeometry(.03,.004,8,20).rotateX(Math.PI/2).translate(0,0,.042),steel],
    ...[-1,0,1].map(i=>box(.056,.003,.003,0,0,.042+i*.012,steel))],
  prepPeelZest:()=>[box(.048,.012,.004,.018,0,0,0xe9a039)],
  prepPusher:()=>[cylinder(.028,.026,.118,0,-.035,0,dark)],
};
export const prepTool=id=>tools[id]?.();
