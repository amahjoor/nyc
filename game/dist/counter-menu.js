// Paint the real menu and prices into the lightbox texture the room already uses.
const photos={chinese:0,asian:0,mexican:1,sandwiches:2,caribbean:3,burgers:4,chicken:5};
let photography;

export function counterMenu(canvas,ctx,room,map){
  const {width:w,height:h}=canvas, f=room.finish, lines=room.board.lines;
  const name=room.name.toUpperCase();
  const tile=/TAQUERIA|TACOS/.test(name)?1:/BURGER/.test(name)?4:photos[room.place.kind], picture=tile===undefined?0:Math.min(h*1.22,w*.31);
  function paint(image){
    ctx.fillStyle='#f1e8d4';ctx.fillRect(0,0,w,h);
    if(picture && image){
      const cellW=image.naturalWidth/3, cellH=image.naturalHeight/2;
      const crop=cellW*.94;
      ctx.drawImage(image,(tile%3+.03)*cellW,Math.floor(tile/3)*cellH+(cellH-crop*h/picture)/2,crop,crop*h/picture,0,0,picture,h);
    }
    const left=(image?picture:0)+w*.024, area=w-left-w*.025;
    ctx.textBaseline='middle';ctx.textAlign='left';
    ctx.fillStyle=f.feature;ctx.fillRect(image?picture:0,0,w,h*.27);
    ctx.fillStyle='#fff5de';ctx.font='bold '+Math.round(h*.152)+'px Georgia';
    ctx.fillText(room.name,left,h*.15,area);
    const cols=lines.length>4?2:1, rows=Math.ceil(lines.length/cols), column=area/cols;
    const pitch=Math.min(h*.21,h*.68/rows);
    for(let i=0;i<lines.length;i++){
      const [name,price]=lines[i], x=left+Math.floor(i/rows)*column, cy=h*.34+(i%rows+.5)*pitch;
      ctx.font='bold '+Math.round(Math.min(h*.126,pitch*.58))+'px Arial';ctx.fillStyle='#303e39';ctx.textAlign='left';
      ctx.fillText(name,x,cy,column*.73);
      ctx.textAlign='right';ctx.fillText('$'+price.toFixed(2),x+column*.98,cy,column*.22);
      ctx.fillStyle='#b8ab94';ctx.fillRect(x,cy+pitch*.43,column*.98,1);
    }
    map.needsUpdate=true;
  }
  paint(null);
  let active=true;
  if(picture && typeof Image!=='undefined'){
    photography??=new Promise(resolve=>{const photo=new Image();photo.onload=()=>resolve(photo);photo.onerror=()=>resolve(null);
      photo.src=new URL('./assets/counter-menu.jpg',import.meta.url).href;});
    photography.then(photo=>{if(active&&photo)paint(photo);});
  }
  return ()=>{active=false;};
}
