import * as THREE from './vendor/three.module.min.js';
import { worldToGeographic } from './city-ground.js';
import { searchDestinations } from './geocoder.js';

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
export function createCityNavigation({ canvas, camera, input, bounds, onTravel, heightAt = flatHeight, onDestinationSelected = () => {}, getPresets = () => [], searchLocal = () => [] }) {
  const $ = id => document.getElementById(id);
  const addressInput=$('address-input'), results=$('address-results');
  let visible=false, traveling=false, picking=false, selected=null, dragging=null;
  let resultsMode=null, searching=false, searchEpoch=0, searchController=null;
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
    $('spawn-note').textContent='';
    controls();
  }
  function select(place) {
    if(!Number.isFinite(place.x)||!Number.isFinite(place.z)||place.x<bounds.minX||place.x>bounds.maxX||place.z<bounds.minZ||place.z>bounds.maxZ){
      clearSelection();$('spawn-note').textContent='Choose a location within New York City.';return false;
    }
    selected={...place};
    $('spawn-note').textContent=selectionLabel();
    controls();updatePin();return true;
  }
  function selectionLabel() { return selected.name+(selected.borough?' · '+selected.borough:''); }
  function closeResults() {
    resultsMode=null;
    results.replaceChildren();
    results.hidden=true;
    $('address-status').textContent='';
  }
  function showResults(places) {
    results.replaceChildren();
    results.hidden=places.length===0;
    for(const place of places){
      const button=document.createElement('button');button.type='button';button.className='address-result';
      button.textContent=[place.name,place.what,place.detail,place.borough].filter(Boolean).join(' · ');
      button.addEventListener('click',()=>{
        if(traveling||!visible)return;
        setPicking(false);
        if(!select(place))return;
        onDestinationSelected(place);updatePin();
        closeResults();$('travel-note').textContent='';
        $('spawn-button').focus();
      });
      results.append(button);
    }
  }
  function refreshPresets() {
    if(resultsMode!=='presets')return;
    const words=addressInput.value.trim().toLowerCase().split(/\s+/);
    const matches=getPresets().filter(place=>{
      const label=place.name.toLowerCase()+' '+(place.borough||'').toLowerCase();
      return words.every(word=>label.includes(word));
    });
    showResults(matches);
  }
  function openPresets() {
    if(!visible||traveling||resultsMode)return;
    resultsMode='presets';
    refreshPresets();
  }
  function pointFromPointer(event) {
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    // Use the canvas rectangle and current camera matrices, including before
    // the first render after changing view, so a click matches the visible map.
    camera.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
    return intersectTerrainRay(ray.ray,heightAt);
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
    if(event.code==='Escape'&&resultsMode){
      event.stopPropagation();event.preventDefault();
      cancelSearch();closeResults();canvas.focus();
    }
  });
  $('address-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!visible||traveling)return;
    cancelSearch();setPicking(false);clearSelection();
    closeResults();resultsMode='search';
    const epoch=searchEpoch, controller=new AbortController();searchController=controller;
    searching=true;controls();$('address-status').textContent='Searching New York…';
    try{
      const places = await searchDestinations($('address-input').value, { searchLocal, signal: controller.signal });
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
    if(picking)$('spawn-note').textContent='Click or drag on the city to place your spawn pin.';
    else $('spawn-note').textContent=selected?selectionLabel():'';
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
    refreshPresets,
    setVisible(value){
      visible=value;
      if(!visible){cancelSearch();closeResults();setPicking(false);clearSelection();addressInput.value='';}
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
