import { geographicToWorld, worldToGeographic } from './city-ground.js';
import { matchBranch } from './place-guide.js';

let library;
async function placesLibrary() {
  const response=await fetch('./api/phone/maps',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)return null;
  const {browserKey}=await response.json();
  if(!browserKey)return null;
  if(!globalThis.google?.maps?.importLibrary){
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      function finish(error){
        clearTimeout(timeout);script.onerror=null;
        delete globalThis.nycPlaceGuideReady;
        if(error){script.remove();reject(error);}else resolve();
      }
      const timeout=setTimeout(()=>finish(Error('Google Maps timed out')),12000);
      globalThis.nycPlaceGuideReady=()=>finish();
      script.onerror=()=>finish(Error('Google Maps unavailable'));
      const params=new URLSearchParams({key:browserKey,v:'weekly',loading:'async',callback:'nycPlaceGuideReady'});
      script.src='https://maps.googleapis.com/maps/api/js?'+params;script.async=true;document.head.append(script);
    });
  }
  return globalThis.google.maps.importLibrary('places');
}

export async function googlePlaceCard(place,signal) {
  if(!place.name)return null;
  library ??= placesLibrary().catch(error=>{library=null;throw error;});
  const api=await library;
  if(!api || signal.aborted)return null;
  const {lat,lon}=worldToGeographic(place.x,place.z);
  const {places}=await api.Place.searchByText({textQuery:place.name,fields:['displayName','location','id'],
    locationRestriction:{north:lat+.0005,south:lat-.0005,east:lon+.0007,west:lon-.0007},maxResultCount:6});
  if(signal.aborted)return null;
  const branch=matchBranch(place,places.filter(p=>p.location).map(p=>({...geographicToWorld(p.location.lng(),p.location.lat()),name:p.displayName,id:p.id})));
  if(!branch)return null;
  const widget=document.createElement('gmp-place-details'),request=document.createElement('gmp-place-details-place-request');
  request.setAttribute('place',branch.id);
  widget.append(request,...['media','name','rating','reviews','attribution'].map(tag=>document.createElement('gmp-place-'+tag)));
  return widget;
}
