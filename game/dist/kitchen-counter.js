import { heatLine } from './kitchen-shift.js';

// Top-down work surface. The same departments can be selected with the buttons.
export function drawKitchen(canvas,view){
  const c=canvas.getContext('2d'), {ticket:t,state:k,station,job}=view, menu=t.menu;
  const grill=job==='kitchen', coffee=job==='barista', pizza=job==='pizza';
  function rect(x,y,w,h,fill,r=0){
    c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();
  }
  function oval(x,y,rx,ry,fill){
    c.fillStyle=fill;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();
  }
  function label(s,x,y,size=13,color='#fff2da'){
    c.font='600 '+size+'px system-ui';c.fillStyle=color;c.fillText(s,x,y);
  }
  function line(x,y,x2,y2,color,width=2){
    c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();
  }
  function burger(x,y,done){
    if(done){oval(x,y+7,33,13,'#b56d32');oval(x,y+4,33,10,'#699747');}
    const hot=k.main>=3 || done;
    const sear=hot?1:Math.min(1,k.heat/4);
    const patty=t.main===1?'#594438':'rgb('+Math.round(201-81*sear)+','+Math.round(126-59*sear)+','+Math.round(106-62*sear)+')';
    oval(x,y,31,13,patty);
    for(let i=0;i<6;i++)line(x-20+i*7,y-6,x-23+i*7,y+5,hot?'#523527':'#a96754',2);
    if(done){
      rect(x-25,y-6,50,9,['#f4bd54','#6d933e','#89ab4a'][t.finish],3);
      oval(x,y-9,33,14,'#e8a65a');
      for(let i=0;i<11;i++)oval(x+Math.sin(i*3.1+.3*i)*23,y-11+Math.cos(i*2)*6,2,1,'#ffe1a0');
    }
  }
  function dish(x,y,done){
    if(grill){burger(x,y,done);return;}
    if(coffee){
      oval(x+19,y,10,9,'#eee7d4');oval(x+20,y,5,5,'#536368');
      rect(x-20,y-10,39,28,'#fbefdb',7);oval(x,y-10,19,6,'#814b31');
      if(done){oval(x,y-11,12,3,'#ebc58f');oval(x,y-11,5,2,'#faf3dc');}
    }else if(pizza){
      oval(x,y,34,17,k.main<3?'#ead0a0':'#c78847');oval(x,y,29,13,'#b54d38');oval(x,y,25,11,'#f1cc70');
      for(let i=0;i<6;i++)oval(x+Math.cos(i)*17,y+Math.sin(i)*6,4,2,done?'#61854f':'#d68443');
    }else{
      oval(x,y,31,16,k.main<3?'#e4cdac':'#b87b45');
      for(let i=-1;i<=1;i++)line(x+i*12-4,y+4,x+i*12+3,y-6,'#f5d399',3);
    }
  }
  function side(x,y,packed){
    if(packed)rect(x-20,y-3,40,25,grill?'#b94b3d':'#c8a582',4);
    if(grill && t.side===0){
      for(let i=0;i<9;i++)rect(x-21+i*5,y-13-Math.sin(i*2)*5,4,22,k.side===1&&k.fry<4?'#eee2ac':'#f1bc4d',1);
    }else if(grill){
      for(let i=0;i<5;i++){const px=x-14+i*7,py=y+Math.cos(i*2)*5;oval(px,py,8,6,'#daa655');oval(px,py,4,2.8,packed?'#ac5140':'#887046');}
    }else if(coffee || job==='bakery'){
      if(t.side===0){
        for(let i=-2;i<=2;i++){const h=1-Math.abs(i)/3;oval(x+i*7,y-5*h,6+h,4+4*h,'#cd8a4a');line(x+i*7-2,y-6*h,x+i*7+1,y-10*h,'#e5b373',2);}
      }else{
        oval(x,y,17,10,'#ce9154');
        c.beginPath();for(let i=0;i<60;i++){const a=i*.22,r=i*.23,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.55;i?c.lineTo(px,py):c.moveTo(px,py);}
        c.strokeStyle='#8a532f';c.lineWidth=2;c.stroke();
      }
    }else{
      for(let i=-1;i<=1;i++){oval(x+i*13,y+Math.cos(i)*4,10,8,'#d3954e');line(x+i*13-4,y+1,x+i*13,y-3,'#f3c987',2);}
    }
    if(packed)rect(x-20,y+8,40,13,grill?'#c65642':'#d6b995',3);
  }
  function cup(x,y,packed){
    rect(x-13,y-18,26,40,'#faf1db',5);
    const h=packed?30:Math.min(33,k.fill*14);
    if(h)rect(x-10,y+15-h,20,h,['#885334','#ebbb46','#b57144'][t.drink],2);
    if(packed)rect(x-15,y-20,30,5,'#fffbec',2);
    else if(k.drink===1)line(x,y-47,x,y+10-h,['#885334','#ebbb46','#b57144'][t.drink],3);
  }
  function gauge(x,y,w,time,goal){
    rect(x,y,w,6,'#465457',3);rect(x+w*goal/9,y,w*3/9,6,'#86b68e',1);
    const px=x+w*Math.min(time,9)/9;rect(Math.min(x+w-3,px),y-3,3,12,'#fff9dc',1);
    label(heatLine(time,goal),x,y-7,12);
  }
  c.clearRect(0,0,640,350);
  const steel=c.createLinearGradient(0,0,0,290);steel.addColorStop(0,'#bac7be');steel.addColorStop(.55,'#839592');steel.addColorStop(1,'#546769');
  rect(0,0,640,350,steel);
  for(let x=0;x<640;x+=53)line(x,0,x,155,'#819391',1);
  const bays=t.drink<0?2:3,w=600/bays;
  for(let i=0;i<bays;i++){
    const bx=14+i*w,key=['main','side','drink'][i];
    rect(bx,12,w-6,155,station===key?'#eec477':'#9ea9a1',9);
    rect(bx+3,15,w-12,149,'#314348',7);
    label([menu.station,menu.sideStation,'Drink fountain'][i],bx+13,39,16);
  }
  const mx=14+w/2,sx=mx+w,dx=sx+w;
  rect(mx-67,52,134,68,coffee?'#9ca6a1':'#242c2c',5);
  if(grill)for(let i=0;i<10;i++)line(mx-57+i*12,60,mx-57+i*12,112,'#4c5350',2);
  if(coffee){rect(mx-50,54,100,18,'#b9c8c2',5);rect(mx-13,67,26,10,'#484e4b',3);}
  if(k.main>0 && k.main<5){
    const dx=k.main===4?20:0;
    if(grill && k.main>=2){
      oval(mx+41,83,20,10,'#db9c50');oval(mx+41,82,17,8,'#edc987');
      if(k.main===4)oval(mx+dx,96,32,13,'#c68a47');
    }
    if(coffee){
      if(k.main===1){
        // Grounds go into the filter basket before it locks into the group.
        oval(mx-11,100,16,8,'#c5cdca');oval(mx-11,99,13,5,'#553d2e');
        rect(mx+4,98,30,5,'#303a38',2);
        rect(mx+28,81,13,5,'#c8d0cd',2);rect(mx+32,70,6,12,'#424846',2);
      }else if(k.main===2){
        rect(mx-2,75,23,4,'#363a36',2);
        rect(mx-15,100,29,15,'#f1e8d5',5);oval(mx,100,15,4,'#79492f');
        for(const i of [-1,1])line(mx+i*2,77,mx+i*2,100,'#a26c40',1.5);
      }else{
        dish(mx-28,96,false);
        const lift=k.main===3?0:8;
        rect(mx+6,90-lift,28,26,'#c1ccc7',6);oval(mx+20,90-lift,14,4,'#f3ead7');
        line(mx+33,92-lift,mx+40,93-lift,'#bec8c2',3);line(mx+40,93-lift,mx+39,106-lift,'#bec8c2',3);
        if(k.main===3){line(mx+37,70,mx+23,76,'#d6dcd8',4);line(mx+23,76,mx+20,92,'#d6dcd8',3);}
      }
    }else{
      if(pizza && k.main>=3){
        rect(mx-42,91,84,14,'#ba9b72',6);rect(mx+34,94,35,5,'#947a54',2);
      }
      if(!pizza && !grill && k.main===4){
        for(let i=-4;i<=4;i++)line(mx+i*9,78,mx+i*9,110,'#b8c3be',2);
      }
      dish(mx+dx,90,false);
    }
    if(grill && (k.main===3 || k.main===4)){
      const lift=Math.sin(Math.min(1,k.heat/.6)*Math.PI)*8;
      rect(mx+17,86-lift,25,13,'#b6c3bd',2);rect(mx+38,90-lift,35,5,'#c99e70',2);
    }
    if((k.main===2 || k.main===3) && (!coffee || k.main===3)){
      for(let i=0;i<3;i++){
        const h=(k.heat*12+i*9)%24,px=mx-16+i*15;
        c.beginPath();c.strokeStyle='rgba(246,240,213,'+(.65-h/42)+')';c.lineWidth=2;
        c.moveTo(px,79-h);c.quadraticCurveTo(px+6,73-h,px+2,69-h);c.stroke();
      }
    }
    if(k.main===2 || k.main===3)gauge(mx-64,149,128,k.heat,3);
  }
  rect(sx-58,54,116,63,'#7e8471',5);rect(sx-50,60,100,48,grill?'#a28a45':'#343b39',5);
  if(k.side===1){
    if(grill)for(let i=0;i<9;i++)line(sx-44+i*11,62,sx-44+i*11,106,'#abb2a3',1);
    if(grill)for(let i=0;i<12;i++){
      const phase=(k.fry*1.8+i*.37)%1;
      oval(sx+Math.cos(i*5)*40,100-phase*31,1+phase*2,1+phase,'rgba(250,224,153,'+(.8-.5*phase)+')');
    }
    side(sx,85,false);rect(sx+41,77,22,7,'#c0c7be',2);gauge(sx-64,149,128,k.fry,4);
  }
  if(t.drink>=0){
    rect(dx-59,54,118,29,'#b5c1b9',4);
    for(let i=0;i<3;i++){rect(dx-46+i*36,57,24,16,['#925849','#e6c463','#a47551'][i],3);rect(dx-39+i*36,76,9,10,'#202c30',1);}
    if(k.drink===1){cup(dx-34+t.drink*36,117,false);gauge(dx-64,149,128,k.fill,2);}
  }
  const requested=[t.wantsMain,t.wantsSide,t.wantsDrink];
  for(let i=0;i<bays;i++)if(!requested[i]){
    rect(17+i*w,45,w-12,117,'rgba(35,48,51,.82)',4);
    label('No item on ticket',28+i*w,101,13,'#c3cbc4');
  }
  rect(14,180,612,98,'#895641',12);rect(21,187,598,84,'#ede0c5',8);
  for(let x=30;x<614;x+=12)for(let y=192;y<268;y+=12)if((x+y)%24===6)rect(x,y,10,10,'#e2cbb4');
  // At the pass, the face and apron belong to the person named on the ticket.
  const skin=['#aa7357','#cb9673','#805443','#dab897'][t.number%4];
  const hair=['#40312b','#27292a','#654733'][t.number%3];
  rect(27,193,139,70,'#e6d3b1',7);
  oval(56,249,25,15,['#74938d','#a2614e','#667888'][t.number%3]);
  oval(56,224,15,17,skin);oval(56,212,16,8,hair);
  oval(50,224,1.5,1.8,hair);oval(62,224,1.5,1.8,hair);
  line(53,232,59,232,'#874e43',1.5);
  label('#'+t.number,85,218,13,'#785949');label(t.customer,85,240,16,'#382e29');
  if(view.ready)label('Serve ↗',86,255,10,'#386a51');
  const slots=t.drink<0?[307,482]:[255,395,531];
  c.save();c.translate(view.slide || 0,view.slide?-4:0);
  if(view.ready){rect(184,195,414,65,'#b57a59',8);rect(190,201,402,53,'#f1dec2',5);}
  for(const x of slots)oval(x,239,43,10,'#d1bda3');
  if(k.main===5)dish(slots[0],231,true);
  if(k.side===2)side(slots[1],224,true);
  if(k.drink===2)cup(slots[2],229,true);
  c.restore();
  rect(0,289,640,61,'#23383b');
  const actions=view.actions;
  if(!actions.length){
    label(view.ready?'Slide the tray to '+t.customer+' to serve.':'Touch a station to work on this order.',22,325,16);
    return;
  }
  const width=610/actions.length;
  for(let i=0;i<actions.length;i++){
    const x=15+i*width;
    rect(x,298,width-5,43,'#415a59',5);
    const words=actions[i].name.split(' ');
    let first='',second='';
    for(const word of words){
      if(!second && (first+' '+word).length<Math.floor((width-22)/8.5))first+=(first?' ':'')+word;
      else second+=(second?' ':'')+word;
    }
    label(first,x+10,second?315:325,14);
    if(second)label(second,x+10,333,14);
  }
}
