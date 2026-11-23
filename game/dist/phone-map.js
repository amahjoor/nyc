// A north-up street map. Everything passed to the viewport uses world metres.
export function drawPhoneMap(canvas,{roads=[],center,places=[],trip=null,approach=[],destination=null,insetTop=0}) {
  const ctx=canvas?.getContext?.('2d');
  if(!ctx || !Number.isFinite(center?.x))return;
  const density=canvas.width/300, width=300, height=canvas.height/density, pickup=trip?.phase==='traveling'?center:trip?.stop.point || center;
  ctx.save();ctx.scale(density,density);
  const fit=trip?.car ? [pickup,trip.car,center,...approach] : [center,...places];
  let left=pickup.x,right=left,top=pickup.z,bottom=top;
  for(const p of fit){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.z);bottom=Math.max(bottom,p.z);}
  const scale=Math.min((width-48)/Math.max(125,right-left),(height-insetTop-42)/Math.max(80,bottom-top));
  const x=v=>width/2+(v-(left+right)/2)*scale, y=v=>(height+insetTop)/2+(v-(top+bottom)/2)*scale;
  ctx.fillStyle='#e2e2d3';ctx.fillRect(0,0,width,height);
  const visible=[], names=new Set(), labels=[];
  for(const road of roads){
    const pts=road.points;
    if(!pts?.length)continue;
    let seen=false;
    for(let i=1;i<pts.length;i++){
      const ax=x(pts[i-1][0]),ay=y(pts[i-1][1]),bx=x(pts[i][0]),by=y(pts[i][1]);
      if(Math.max(ax,bx)<0 || Math.min(ax,bx)>width || Math.max(ay,by)<0 || Math.min(ay,by)>height)continue;
      seen=true;
      const cx=(ax+bx)/2,cy=(ay+by)/2;
      if(road.name && !names.has(road.name) && Math.hypot(ax-bx,ay-by)>42 && cx>35 && cx<width-35 && cy>16 && cy<height-16 && labels.every(label=>Math.hypot(label.x-cx,label.y-cy)>65)){
        labels.push({x:cx,y:cy,name:road.name,angle:Math.atan((by-ay)/(bx-ax))}); names.add(road.name);
      }
    }
    if(seen)visible.push(road);
  }
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const outline of [true,false]){
    ctx.beginPath();
    for(const road of visible)road.points.forEach(([wx,wz],i)=>ctx[i?'lineTo':'moveTo'](x(wx),y(wz)));
    ctx.strokeStyle=outline?'#bebcaf':'#fffdf5';ctx.lineWidth=outline?6:4.5;ctx.stroke();
  }
  ctx.fillStyle='#5c615b';ctx.font='9px Helvetica,Arial,sans-serif';ctx.textAlign='center';
  for(const label of labels){ctx.save();ctx.translate(label.x,label.y);ctx.rotate(label.angle);ctx.fillText(label.name,0,-5);ctx.restore();}
  if(approach.length){
    ctx.beginPath();
    approach.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](x(p.x),y(p.z)));
    ctx.strokeStyle='#226366';ctx.lineWidth=3;ctx.stroke();
  }
  function dot(p,r,fill) {
    ctx.beginPath();ctx.arc(x(p.x),y(p.z),r,0,2*Math.PI);
    ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle='white';ctx.stroke();
  }
  for(const p of places)dot(p,4,'#bc523e');
  if(destination)dot(destination,5,'#b43a37');
  dot(center,5,'#2389dc');
  if(trip && trip.phase!=='traveling')dot(pickup,5,'#238255');
  if(trip?.car){
    const car=trip.car;
    ctx.save();ctx.translate(x(car.x),y(car.z));ctx.rotate(-car.angle);ctx.scale(.77,.77);
    ctx.beginPath();ctx.roundRect(-7,-12,14,24,4);
    ctx.fillStyle='#f4ba39';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#343b38';ctx.stroke();
    ctx.fillStyle='#354247';ctx.fillRect(-4,1,8,4);ctx.fillRect(-4,-7,8,3);ctx.restore();
  }
  ctx.restore();
  return places.map(p=>({left:x(p.x)/width,top:y(p.z)/height}));
}
