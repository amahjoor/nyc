import * as THREE from './vendor/three.module.min.js';
import { worldToGeographic } from './city-ground.js';
import { searchAddresses } from './geocoder.js';

/** Address and map selections share the game's existing street-safe travel path. */
export function createCityNavigation({ canvas, camera, input, bounds, onTravel, onAddressSelected = () => {} }) {
  const $ = id => document.getElementById(id);
  let visible=false, traveling=false, picking=false, selected=null, dragging=null;
  let searching=false, searchEpoch=0, searchController=null;
  const ray=new THREE.Raycaster(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const pinPoint=new THREE.Vector3();

  function controls() {
    $('address-input').disabled=traveling;
    $('address-search-button').disabled=traveling;
    $('pick-spawn-button').disabled=traveling;
    $('clear-spawn-button').disabled=traveling;
    $('spawn-button').disabled=traveling||!selected;
    $('place-select').disabled=traveling;
    $('address-form').setAttribute('aria-busy',String(searching));
    $('pick-spawn-button').setAttribute('aria-pressed',String(picking));
    $('pick-spawn-button').textContent=picking?'DONE PICKING':'PICK SPAWN LOCATION';
    $('city-navigation').classList.toggle('is-picking',picking);
    $('city-navigation').classList.toggle('has-spawn',Boolean(selected));
    canvas.style.cursor=picking?'crosshair':'';
  }
  function setPicking(value) {
    picking=value;dragging=null;input.clear();input.pointerLookEnabled=!value;
    controls();
  }
  function cancelSearch() {
    if(searching)$('address-status').textContent='';
    searchEpoch++;searchController?.abort();searchController=null;searching=false;
    controls();
  }
  function clearSelection() {
    selected=null;$('spawn-pin').hidden=true;
    $('spawn-note').textContent='Search an address or pick a spot on the map. Arrivals use a nearby street.';
    controls();
  }
  function select(place) {
    if(!Number.isFinite(place.x)||!Number.isFinite(place.z)||place.x<bounds.minX||place.x>bounds.maxX||place.z<bounds.minZ||place.z>bounds.maxZ){
      clearSelection();$('spawn-note').textContent='Choose a location within New York City.';return false;
    }
    selected={...place};
    $('spawn-note').textContent=selectionLabel()+'. Spawn on the nearest mapped street.';
    controls();updatePin();return true;
  }
  function selectionLabel() { return selected.name+(selected.borough?' · '+selected.borough:''); }
  function pointFromPointer(event) {
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    // Use the canvas rectangle and current camera matrices, including before
    // the first render after changing view, so a click matches the visible map.
    camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
    return ray.ray.intersectPlane(plane,new THREE.Vector3());
  }
  function pick(event) {
    const point=pointFromPointer(event);
    if(!point)return false;
    const geo=worldToGeographic(point.x,point.z);
    return select({x:point.x,z:point.z,name:geo.lat.toFixed(5)+'° N, '+Math.abs(geo.lon).toFixed(5)+'° W'});
  }
  function updatePin() {
    const pin=$('spawn-pin');
    if(!visible||!selected){pin.hidden=true;return;}
    camera.updateMatrixWorld();
    pinPoint.set(selected.x,0,selected.z).project(camera);
    const rect=canvas.getBoundingClientRect();
    pin.hidden=pinPoint.z<-1||pinPoint.z>1||Math.abs(pinPoint.x)>1||Math.abs(pinPoint.y)>1;
    pin.style.left=(rect.left+(pinPoint.x+1)*rect.width/2)+'px';
    pin.style.top=(rect.top+(1-pinPoint.y)*rect.height/2)+'px';
  }

  $('address-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!visible||traveling)return;
    cancelSearch();setPicking(false);clearSelection();
    $('address-results').replaceChildren();
    const epoch=searchEpoch, controller=new AbortController();searchController=controller;
    searching=true;controls();$('address-status').textContent='Searching NYC addresses…';
    try{
      const places=await searchAddresses($('address-input').value,{signal:controller.signal});
      // Aborting fetch alone cannot prevent a late or already parsed response
      // from replacing a newer search or a manual map selection.
      if(epoch!==searchEpoch||!visible)return;
      $('address-status').textContent=places.length?'Choose the matching address and borough.':'No NYC address found. Include a building number and borough, or pick on the map.';
      for(const place of places){
        const button=document.createElement('button');button.type='button';button.className='address-result';
        button.textContent=place.name+' · '+place.borough;
        button.addEventListener('click',()=>{
          if(traveling||!visible)return;
          setPicking(false);
          if(!select(place))return;
          onAddressSelected(place);updatePin();
          $('address-results').replaceChildren();$('address-status').textContent='Address selected. Check the pin, then choose SPAWN HERE.';
        });
        $('address-results').append(button);
      }
    }catch(error){
      if(epoch===searchEpoch&&visible)$('address-status').textContent=error.message;
    }finally{
      if(epoch===searchEpoch){searching=false;searchController=null;controls();}
    }
  });
  $('pick-spawn-button').addEventListener('click',()=>{
    if(!visible||traveling)return;
    cancelSearch();$('address-results').replaceChildren();$('address-status').textContent='';
    setPicking(!picking);
    if(picking)$('spawn-note').textContent='Click or drag on the city to place your spawn pin, then choose SPAWN HERE.';
    else $('spawn-note').textContent=selected?selectionLabel()+'. Spawn on the nearest mapped street.':'Drag to orbit. Scroll to zoom. Choose PICK SPAWN LOCATION to place a pin.';
  });
  $('clear-spawn-button').addEventListener('click',()=>{
    if(traveling)return;
    cancelSearch();setPicking(false);clearSelection();
    $('address-results').replaceChildren();$('address-status').textContent='';
  });
  $('spawn-button').addEventListener('click',()=>{
    if(visible&&!traveling&&selected)onTravel({...selected});
  });
  canvas.addEventListener('pointerdown',event=>{
    if(!visible||traveling||!picking||(event.button!==undefined&&event.button!==0))return;
    event.preventDefault();dragging=event.pointerId;canvas.setPointerCapture(event.pointerId);pick(event);
  });
  canvas.addEventListener('pointermove',event=>{
    if(visible&&!traveling&&picking&&dragging!==null&&event.pointerId===dragging)pick(event);
  });
  canvas.addEventListener('pointerup',event=>{
    if(dragging===null||event.pointerId!==dragging)return;
    if(visible&&!traveling&&picking)pick(event);
    dragging=null;
  });
  for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{dragging=null;});
  canvas.addEventListener('dblclick',event=>{
    if(visible&&!traveling&&!picking&&pick(event))onTravel({...selected});
  });
  controls();
  return {
    updatePin,
    setVisible(value){
      visible=value;
      if(!visible){cancelSearch();setPicking(false);}
      updatePin();
    },
    setTraveling(value){
      traveling=value;
      if(value){cancelSearch();setPicking(false);}
      controls();
    },
    getState:()=>({selected:selected?{...selected}:null,picking,searching}),
  };
}
