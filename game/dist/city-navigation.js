import * as THREE from './vendor/three.module.min.js';
import { worldToGeographic } from './city-ground.js';
import { searchDestinations } from './geocoder.js';
import { matchPresets } from './local-search.js';

const flatHeight = () => 0;
const finiteHeight = (heightAt, x, z) => { const height=heightAt(x,z);return Number.isFinite(height)?height:0; };

/** Intersect the map's downward view ray with the sampled elevation surface. */
export function intersectTerrainRay(ray, heightAt = flatHeight, maxDistance = 200000) {
  if(ray.direction.y>=-1e-6||!Number.isFinite(maxDistance)||maxDistance<=0)return null;
  const point=new THREE.Vector3();
  let distance=Math.max(0,Math.min(maxDistance,-ray.origin.y/ray.direction.y));
  // Plane projection is just an initial estimate. Re-sample at the resulting
  // X/Z because moving the hit upward also moves it horizontally on a slope.
  for(let i=0;i<12;i++){
    ray.at(distance,point);
    const height=finiteHeight(heightAt,point.x,point.z), residual=point.y-height;
    if(Math.abs(residual)<.005)return point.clone();
    const next=distance-residual/ray.direction.y;
    if(next<0||next>maxDistance)break;
    distance=i?next*.8+distance*.2:next;
  }
  // Steep or changing slopes can make fixed-point iteration oscillate. A
  // bounded bracketed solve keeps map picking stable while terrain streams.
  let low=0, high=maxDistance;
  const residual=t=>{ray.at(t,point);return point.y-finiteHeight(heightAt,point.x,point.z);};
  if(residual(low)<0||residual(high)>0)return null;
  for(let i=0;i<40;i++){
    const mid=(low+high)/2, value=residual(mid);
    if(Math.abs(value)<.005)return point.clone();
    if(value>0)low=mid;else high=mid;
  }
  ray.at((low+high)/2,point);return point.clone();
}

/** Presets, address results and map pins share the same travel confirmation. */
export function createCityNavigation({ canvas, camera, input, bounds, onTravel, heightAt = flatHeight, onDestinationSelected = () => {}, onMapPickStart = () => {}, onMapPick = () => {}, getPresets = () => [], getDefaultPlaces = getPresets, searchLocal = () => [] }) {
  const $ = id => document.getElementById(id);
  const addressInput=$('address-input'), results=$('address-results'), pin=$('spawn-pin');
  let visible=false, traveling=false, picking=false, selected=null, dragging=null;
  let resultsMode=null, presetQuery='', searching=false, searchEpoch=0, searchController=null;
  let resultRows=[], transportation=null, lastBoarding=null;
  const ray=new THREE.Raycaster();
  const pinPoint=new THREE.Vector3();

  function controls() {
    addressInput.disabled=traveling;
    $('address-search-button').disabled=traveling;
    $('pick-spawn-button').disabled=traveling;
    $('clear-spawn-button').disabled=traveling;
    $('spawn-button').disabled=traveling||!selected;
    $('address-form').setAttribute('aria-busy',String(searching));
    $('pick-spawn-button').setAttribute('aria-pressed',String(picking));
    $('pick-spawn-button').textContent=picking?'Done picking':'Pick on the map';
    $('city-navigation').classList.toggle('is-picking',picking);
    $('city-navigation').classList.toggle('has-spawn',Boolean(selected));
    canvas.style.cursor=dragging?.fromPin?'grabbing':picking?'crosshair':'';
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
    selected=null;pin.hidden=true;
    $('spawn-note').textContent='';
    controls();
  }
  function select(place) {
    if(!Number.isFinite(place.x)||!Number.isFinite(place.z)||place.x<bounds.minX||place.x>bounds.maxX||place.z<bounds.minZ||place.z>bounds.maxZ){
      if(selected)addressInput.value='';
      clearSelection();$('spawn-note').textContent='Choose a location within New York City.';return false;
    }
    selected={...place};
    addressInput.value=selected.name+(selected.borough?' · '+selected.borough:'');
    $('spawn-note').textContent='';
    controls();updatePin();return true;
  }
  function closeResults() {
    resultsMode=null;
    resultRows=[];transportation=null;
    results.replaceChildren();
    results.hidden=true;
    $('address-status').textContent='';
  }
  function focusedResult() {
    return resultRows.find(row=>row.element.contains(document.activeElement));
  }
  function centerOnSelection() {
    onDestinationSelected(selected);updatePin();
  }
  function previewPlace(place) {
    if(picking)setPicking(false);
    if(!select(place))return false;
    if(place.boarding)lastBoarding=place.boarding;
    centerOnSelection();
    $('travel-note').textContent='';
    return true;
  }
  function chooseResult(place) {
    if(!visible||traveling)return;
    cancelSearch();closeResults();
    if(previewPlace(place))$('spawn-button').focus();
  }
  function transportationRow(stops) {
    const element=document.createElement('div');
    element.className='transportation-result';
    element.setAttribute('role','group');element.setAttribute('aria-label','Transportation');
    const button=document.createElement('button');
    button.type='button';button.className='address-result transportation-choice';
    const title=document.createElement('span');title.textContent='Transportation';
    const detail=document.createElement('span');detail.setAttribute('aria-live','polite');
    button.append(title,detail);
    let index=Math.max(0,stops.findIndex(place=>place.boarding===lastBoarding));
    const render=()=>{
      const place=stops[index];
      detail.textContent=` · ${place.name} · ${index+1} of ${stops.length}`;
    };
    const step=direction=>{
      if(!visible||traveling||stops.length<2)return false;
      index=(index+direction+stops.length)%stops.length;
      render();
      return previewPlace(stops[index]);
    };
    const arrow=(direction,label,shortcut,symbol)=>{
      const control=document.createElement('button');
      control.type='button';control.className='address-result transportation-arrow';control.textContent=symbol;
      control.setAttribute('aria-label',label);control.setAttribute('aria-keyshortcuts',shortcut);
      control.disabled=stops.length<2;
      control.addEventListener('click',()=>step(direction));
      return control;
    };
    button.addEventListener('click',()=>chooseResult(stops[index]));
    element.addEventListener('keydown',event=>{
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      event.preventDefault();event.stopPropagation();
      if(step(event.key==='ArrowLeft'?-1:1))onMapPick('select');
    });
    element.append(button,arrow(-1,'Previous transportation destination','ArrowLeft','‹'),
      arrow(1,'Next transportation destination','ArrowRight','›'));
    render();
    return {element,button,step};
  }
  function showResults(places) {
    const focused=focusedResult();
    const stops=places.filter(place=>place.boarding);
    transportation=stops.length?transportationRow(stops):null;
    resultRows=[];
    for(const place of places){
      if(place.boarding)continue;
      const button=document.createElement('button');button.type='button';button.className='address-result';
      button.textContent=[place.name,place.what,place.detail,place.borough].filter(Boolean).join(' · ');
      button.addEventListener('click',()=>chooseResult(place));
      resultRows.push({element:button,button,key:`${place.name}:${place.x}:${place.z}`});
    }
    if(transportation)resultRows.push(transportation);
    results.replaceChildren(...resultRows.map(row=>row.element));
    results.hidden=resultRows.length===0;
    if(focused)resultRows.find(row=>row.key===focused.key)?.button.focus();
  }
  function refreshPresets() {
    if(resultsMode!=='presets')return;
    showResults(presetQuery?matchPresets(presetQuery,getPresets()):getDefaultPlaces());
  }
  function openPresets() {
    if(!visible||traveling||resultsMode)return;
    presetQuery=selected?'':addressInput.value.trim();
    resultsMode='presets';
    refreshPresets();
  }
  function moveResult(direction) {
    openPresets();
    if(!resultRows.length)return false;
    const index=resultRows.indexOf(focusedResult());
    const next=index<0?(direction<0?resultRows.length-1:0):Math.max(0,Math.min(resultRows.length-1,index+direction));
    resultRows[next].button.focus();
    return true;
  }
  function dismissResults() {
    cancelSearch();closeResults();canvas.focus();
  }
  function handlePad(index) {
    if(!visible)return false;
    if(traveling||picking)return [0,12,13,14,15].includes(index);
    if(index===12||index===13){moveResult(index===12?-1:1);return true;}
    if(index===14||index===15){
      if(transportation&&focusedResult()===transportation&&transportation.step(index===14?-1:1))onMapPick('select');
      return true;
    }
    if(index===1 && resultsMode){dismissResults();return true;}
    if(index!==0)return false;
    if(resultsMode){
      const row=focusedResult();
      if(row)row.button.click();else moveResult(1);
    }else if(selected)$('spawn-button').click();
    else moveResult(1);
    return true;
  }
  function pointFromPointer(clientX,clientY) {
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    const x=(clientX-rect.left)/rect.width,y=(clientY-rect.top)/rect.height;
    if(x<0||x>1||y<0||y>1)return null;
    // Use the canvas rectangle and current camera matrices, including before
    // the first render after changing view, so a click matches the visible map.
    camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),camera);
    return intersectTerrainRay(ray.ray,heightAt);
  }
  function pick(clientX,clientY) {
    const point=pointFromPointer(clientX,clientY);
    if(!point)return false;
    const geo=worldToGeographic(point.x,point.z);
    if(!select({x:point.x,z:point.z,name:geo.lat.toFixed(5)+'° N, '+Math.abs(geo.lon).toFixed(5)+'° W'}))return false;
    $('travel-note').textContent='';
    return true;
  }
  function startMapPick() {
    cancelSearch();closeResults();input.clear();onMapPickStart();
  }
  function startDrag(event,fromPin) {
    if(!visible||traveling||dragging||event.isPrimary===false||(event.button!==undefined&&event.button!==0))return;
    if(fromPin&&(!selected||pin.hidden))return;
    event.preventDefault();startMapPick();
    const {clientX,clientY,pointerId}=event;
    dragging={pointerId,fromPin,clientX,clientY,moved:!fromPin,
      offsetX:fromPin?parseFloat(pin.style.left)-clientX:0,
      offsetY:fromPin?parseFloat(pin.style.top)-clientY:0};
    canvas.setPointerCapture(pointerId);
    if(!fromPin)pick(clientX,clientY);
    controls();
  }
  function movePin(event) {
    const {clientX,clientY}=event;
    if(!dragging.moved&&Math.hypot(clientX-dragging.clientX,clientY-dragging.clientY)<3)return false;
    dragging.moved=true;
    return pick(clientX+dragging.offsetX,clientY+dragging.offsetY);
  }
  function endDrag(event) {
    if(!dragging||dragging.pointerId!==event.pointerId)return;
    dragging=null;controls();
  }
  function updatePin() {
    if(!visible||!selected){pin.hidden=true;return;}
    camera.updateMatrixWorld();
    pinPoint.set(selected.x,finiteHeight(heightAt,selected.x,selected.z),selected.z).project(camera);
    const rect=canvas.getBoundingClientRect();
    pin.hidden=pinPoint.z<-1||pinPoint.z>1||Math.abs(pinPoint.x)>1||Math.abs(pinPoint.y)>1;
    pin.style.left=(rect.left+(pinPoint.x+1)*rect.width/2)+'px';
    pin.style.top=(rect.top+(1-pinPoint.y)*rect.height/2)+'px';
  }

  addressInput.addEventListener('focus',openPresets);
  addressInput.addEventListener('click',openPresets);
  addressInput.addEventListener('input',()=>{
    if(!visible||traveling)return;
    cancelSearch();closeResults();clearSelection();$('travel-note').textContent='';
    openPresets();
  });
  $('destination-search').addEventListener('keydown',event=>{
    const key=event.key||event.code;
    if(key==='Escape'&&resultsMode)dismissResults();
    else if((key!=='ArrowUp'&&key!=='ArrowDown')||!moveResult(key==='ArrowUp'?-1:1))return;
    event.stopPropagation();event.preventDefault();
  });
  $('address-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!visible||traveling)return;
    cancelSearch();setPicking(false);clearSelection();
    closeResults();resultsMode='search';
    const epoch=searchEpoch, controller=new AbortController();searchController=controller;
    searching=true;controls();$('address-status').textContent='Searching New York…';
    try{
      const places = await searchDestinations(addressInput.value, { searchLocal, presets: getPresets(), signal: controller.signal });
      // Aborting fetch alone cannot prevent a late or already parsed response
      // from replacing a newer search or a manual map selection.
      if(epoch!==searchEpoch||!visible)return;
      $('address-status').textContent=places.length?'Choose a result.':'Nothing found. Try a corner (53rd & 6th), a business name, or an address with its borough.';
      showResults(places);
    }catch(error){
      if(epoch===searchEpoch&&visible)$('address-status').textContent=error.message;
    }finally{
      if(epoch===searchEpoch){searching=false;searchController=null;controls();}
    }
  });
  $('pick-spawn-button').addEventListener('click',()=>{
    if(!visible||traveling)return;
    cancelSearch();closeResults();
    setPicking(!picking);
    $('spawn-note').textContent=picking?'Click or drag on the city to place your spawn pin.':'';
  });
  $('clear-spawn-button').addEventListener('click',()=>{
    if(traveling)return;
    cancelSearch();setPicking(false);clearSelection();
    closeResults();addressInput.value='';$('travel-note').textContent='';
  });
  $('spawn-button').addEventListener('click',()=>{
    if(visible&&!traveling&&selected)onTravel({...selected});
  });
  canvas.addEventListener('pointerdown',event=>{
    if(resultsMode==='presets')closeResults();
    if(picking)startDrag(event,false);
  });
  pin.addEventListener('pointerdown',event=>startDrag(event,true));
  canvas.addEventListener('pointermove',event=>{
    if(visible&&!traveling&&dragging&&dragging.pointerId===event.pointerId)movePin(event);
  });
  canvas.addEventListener('pointerup',event=>{
    const placed=visible&&!traveling&&dragging&&dragging.pointerId===event.pointerId&&movePin(event);
    endDrag(event);
    if(placed){centerOnSelection();onMapPick('select');}
  });
  for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,endDrag);
  canvas.addEventListener('dblclick',event=>{
    if(!visible||traveling||picking)return;
    startMapPick();
    if(pick(event.clientX,event.clientY)){centerOnSelection();onMapPick('select');}
  });
  controls();
  return {
    updatePin,
    refreshPresets,
    handlePad,
    setVisible(value){
      visible=value;
      if(!visible){cancelSearch();closeResults();setPicking(false);clearSelection();addressInput.value='';}
      else refreshPresets();
      updatePin();
    },
    setTraveling(value){
      traveling=value;
      if(value){cancelSearch();closeResults();setPicking(false);}
      controls();
    },
    getState:()=>({selected:selected?{...selected}:null,picking,searching}),
  };
}
