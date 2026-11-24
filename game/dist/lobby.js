import * as THREE from './vendor/three.module.min.js';
import { createPerson } from './world.js';
import { buildCar, createCarMaterial, wheelGeometry, WHEEL } from './vehicle-model.js';
import { bikeGeometry } from './bikes.js';
import { createSkateboard } from './skateboard.js';
import { PROTOCOL, TICK_MS, MAX_NEARBY, COLOURS, MODES, SIGNALS, RENDEZVOUS, SPRINT } from './lobby-protocol.js';

const vehicleTemplates = new Map();
function model(mode, colour) {
  if (mode < 1 || mode > 3) {
    const figure = createPerson(COLOURS[colour]);
    if(mode===4) {
      const bike=new THREE.Mesh(bikeGeometry(true),new THREE.MeshStandardMaterial({vertexColors:true}));
      bike.name='Online bike';figure.add(bike);
      figure.userData.legs.forEach(leg=>leg.rotation.x=-.55);
    } else if(mode===5) {
      const board=createSkateboard();board.visible=true;figure.add(board);
    }
    return figure;
  }
  const key = mode+':'+colour;
  if (!vehicleTemplates.has(key)) {
    const tint=mode===2?0xe9b62c:mode===3?0xcad5d8:COLOURS[colour];
    const body=buildCar({type:MODES[mode],paint:tint});
    const car=new THREE.Group();
    car.add(new THREE.Mesh(body.body,createCarMaterial()),new THREE.Mesh(body.lamps,new THREE.MeshBasicMaterial({vertexColors:true})));
    const {tyre,rim}=wheelGeometry(), rubber=new THREE.MeshStandardMaterial({color:0x282a2b});
    const alloy=new THREE.MeshStandardMaterial({color:0xb5b7b9});
    for (const x of [-WHEEL.x,WHEEL.x]) for(const z of [WHEEL.rear,WHEEL.front]){
      const wheel=new THREE.Mesh(tyre,rubber);wheel.add(new THREE.Mesh(rim,alloy));wheel.position.set(x,WHEEL.radius,z);car.add(wheel);
    }
    vehicleTemplates.set(key,car);
  }
  return vehicleTemplates.get(key).clone();
}
function label(text){
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(16,29,31,.87)';ctx.fillRect(0,0,384,64);
  ctx.fillStyle='#fff4df';ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,32,360);
  const texture=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false}));
  sprite.scale.set(2.2,.37,1);sprite.position.y=2.35;
  return sprite;
}
function createPeer(row,scene,layers){
  const [id,name,x,y,z,angle,mode,tint]=row;
  const group=new THREE.Group(), figure=model(mode,tint), tag=label(name);
  group.name='Online player '+id;group.add(figure,tag);
  group.traverse(object=>layers.forEach(layer=>object.layers.enable(layer)));
  group.position.set(x,y,z);figure.rotation.y=angle;scene.add(group);
  return {group,figure,tag,mode,tint,name,x,y,z,angle,signal:-1,moving:false};
}
function removePeer(peer){
  peer.group.removeFromParent();
  peer.tag.material.map.dispose();peer.tag.material.dispose();
  // Car geometry and materials belong to the bounded shared template cache.
  if(peer.mode>=1 && peer.mode<=3)return;
  const disposable=new Set();
  const board=peer.mode===5?peer.figure.getObjectByName('Skateboard'):null;
  peer.figure.traverse(object=>{
    if(object.geometry)disposable.add(object.geometry);
    // createPerson shares its body material with other pedestrians.
    if(object.isInstancedMesh)disposable.add(object);
    if(object.isMesh && (object.name==='Online bike' || board?.getObjectById(object.id))){
      for(const material of [].concat(object.material))disposable.add(material);
    }
  });
  for(const item of disposable)item.dispose();
}
const validPeer = row => Array.isArray(row) && row.length===9 && Number.isSafeInteger(row[0]) &&
  typeof row[1]==='string' && row[1].length<=32 && row.slice(2,6).every(Number.isFinite) &&
  Number.isInteger(row[6]) && MODES[row[6]] && Number.isInteger(row[7]) && COLOURS[row[7]] &&
  Number.isInteger(row[8]) && row[8]>=-1 && row[8]<SIGNALS.length;

export function createLobbyUI({scene,layers,sample,travel,route,showOnMap,announce,animate}){
  const el=id=>document.getElementById('lobby-'+id);
  const peers=new Map(),dialog=el('dialog'),address=el('address');
  let socket=null, joined=false, me='',capacity=0,online=0,lastSent=-Infinity,gate=null,best='',lastList='',space=null;
  let defaultAddress='',assignedTint=0;
  try{address.value=localStorage.getItem('cj-lobby-server')||'';}catch{}
  fetch('./lobby-config.json').then(r=>r.json()).then(data=>{
    defaultAddress=data.url || (location.protocol==='https:'?'wss://'+location.host+'/lobby':location.protocol==='http:'?'ws://'+location.hostname+':8787/lobby':'');if(!address.value)address.value=defaultAddress;
  }).catch(()=>{});
  function controls(){
    el('join').disabled=!!socket;address.disabled=!!socket;el('leave').hidden=!socket;
    el('actions').hidden=!joined;el('badge').textContent=joined?online+' ONLINE':'OFFLINE';
  }
  function clearPeers(){
    for(const p of peers.values())removePeer(p);
    peers.clear();lastList='';showOnMap([]);
  }
  function reset(message){
    if(gate!==null)route(null,SPRINT[gate]);
    clearPeers();joined=false;socket=null;gate=null;best='';space=null;
    el('status').textContent=message;el('near').textContent='';el('race').textContent='Start Broadway sprint';controls();
  }
  function leave(){
    const previous=socket;
    reset('Offline');previous?.close(1000,'Left lobby');
  }
  function join(){
    if(socket)return;
    let url;
    try{
      url=new URL(address.value.trim()||defaultAddress);
      if(!['ws:','wss:'].includes(url.protocol) || url.username || url.password)throw Error();
      if(url.pathname==='/')url.pathname='/lobby';
    }catch{el('status').textContent='Enter a lobby address beginning with wss:// or ws://.';return;}
    try{socket=new WebSocket(url,PROTOCOL);}catch{reset('Connection blocked. Check the address and use a secure public server.');return;}
    const conn=socket;controls();el('status').textContent='Connecting…';
    const timeout=setTimeout(()=>{if(socket===conn&&!joined)conn.close();},10000);
    conn.onmessage=event=>{
      if(conn!==socket)return;
      let m;try{m=JSON.parse(event.data);}catch{return conn.close(1002,'Invalid lobby message');}
      if(!m || typeof m!=='object')return;
      if(m.type==='welcome' && typeof m.name==='string'){
        clearTimeout(timeout);joined=true;me=m.name;assignedTint=(m.id-1)%COLOURS.length;capacity=m.capacity;online=1;lastSent=-Infinity;controls();
        try{localStorage.setItem('cj-lobby-server',url.href);}catch{}
        el('status').textContent='Connected as '+me;
      }else if(joined && m.type==='snapshot' && Array.isArray(m.near)){
        online=m.online;best=m.best?.ms?m.best.name+' · '+(m.best.ms/1000).toFixed(1)+' s':'';
        const active=new Set();
        for(const row of (m.space===undefined || m.space===space ? m.near.slice(0,MAX_NEARBY) : [])){
          if(!validPeer(row))continue;
          const [id,,x,y,z,angle,mode,tint,signal]=row;
          let p=peers.get(id);
          if(!p || p.mode!==mode || p.tint!==tint){
            if(p)removePeer(p);
            p=createPeer(row,scene,layers);peers.set(id,p);
          }
          p.moving=Math.hypot(x-p.x,z-p.z)>.03;
          if(Math.hypot(x-p.x,z-p.z)>16)p.group.position.set(x,y,z);
          if(signal!==p.signal && signal!==-1)announce(p.name+' · '+SIGNALS[signal]);
          Object.assign(p,{x,y,z,angle,signal});active.add(id);
        }
        for(const [id,p] of peers)if(!active.has(id)){removePeer(p);peers.delete(id);}
        showOnMap([...peers.values()].map(p=>({name:p.name,x:p.x,z:p.z,colour:'#'+COLOURS[p.tint].toString(16).padStart(6,'0')})));
        const summary=online+' / '+capacity+' online · '+me+(best?' · Best sprint '+best:'');
        if(el('status').textContent!==summary){el('status').textContent=summary;controls();}
        const list=[...peers.values()].map(p=>p.name).join(', ') || 'Nobody nearby. Meet others at Broadway & Spring.';
        if(list!==lastList){el('near').textContent=list;lastList=list;}
      }else if(joined && m.type==='race'){
        const previous=SPRINT[gate];
        gate=Number.isInteger(m.gate) && SPRINT[m.gate]?m.gate:null;
        el('race').textContent=gate===null?'Start Broadway sprint':'Leave sprint';
        if(gate===null && previous)route(null,previous);
        if(m.interrupted)announce('Sprint ended · keep to the course');
        if(gate!==null){route(SPRINT[gate]);announce('Broadway sprint · '+SPRINT[gate].name);}
      }else if(joined && m.type==='finish' && Number.isFinite(m.ms)){
        if(gate!==null)route(null,SPRINT[gate]);
        gate=null;el('race').textContent='Start Broadway sprint';announce('Sprint finished in '+(m.ms/1000).toFixed(1)+' s');
      }
    };
    conn.onerror=()=>{if(conn===socket)el('status').textContent='Could not reach the lobby.';};
    conn.onclose=()=>{clearTimeout(timeout);if(conn===socket)reset('Disconnected. Check the server address or rejoin.');};
  }
  el('join').onclick=join;el('leave').onclick=leave;
  el('meet').onclick=()=>{dialog.close();travel(RENDEZVOUS);};
  el('race').onclick=()=>{if(joined)socket.send(JSON.stringify([gate===null?'sprint':'cancel']));};
  el('signal').onclick=()=>{if(joined)socket.send(JSON.stringify(['signal',Number(el('message').value)]));};
  for(const [i,name] of SIGNALS.entries())el('message').add(new Option(name,String(i)));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)lastSent=-Infinity;});
  window.addEventListener('pagehide',leave);
  controls();
  function pad(index){
    if(index===1 || index===9){dialog.close();return true;}
    const items=[...dialog.querySelectorAll('button,input,select')].filter(item=>!item.disabled && !item.closest('[hidden]'));
    const focus=document.activeElement,at=items.indexOf(focus);
    if(index===12 || index===13){
      items[(at+(index===13?1:-1)+items.length)%items.length]?.focus();
    }else if(focus===el('message') && (index===14 || index===15)){
      focus.selectedIndex=(focus.selectedIndex+(index===15?1:-1)+SIGNALS.length)%SIGNALS.length;
    }else if(index===0 && at>=0){
      if(focus===el('message'))focus.selectedIndex=(focus.selectedIndex+1)%SIGNALS.length;
      else focus.click();
    }
    return true;
  }
  return {open(){dialog.showModal();el(joined?'meet':'join').focus();},pad,frame(now,dt){
    if(!joined)return;
    const local=sample();
    if(!local)return;
    if(local.space!==space){clearPeers();space=local.space;}
    if(now-lastSent>=TICK_MS && socket.readyState===WebSocket.OPEN && socket.bufferedAmount<8192){
      lastSent=now;
      socket.send(JSON.stringify(['state',local.x,local.y,local.z,local.angle,MODES.indexOf(local.mode),space,assignedTint]));
    }
    const f=1-Math.exp(-dt*17);
    for(const p of peers.values()){
      const pos=p.group.position;
      pos.x+=(p.x-pos.x)*f;pos.y+=(p.y-pos.y)*f;pos.z+=(p.z-pos.z)*f;
      const delta=p.angle-p.figure.rotation.y;p.figure.rotation.y+=Math.atan2(Math.sin(delta),Math.cos(delta))*f;
      p.group.visible=local.visible;
      if(p.mode===0)animate(p.figure,p.moving,now/1000);
      if(p.signal===0 && p.figure.userData.arms)p.figure.userData.arms[1].rotation.z=-2.35+Math.sin(now/180)*.25;
      else if(p.figure.userData.arms)p.figure.userData.arms[1].rotation.z=0;
    }
  }};
}
