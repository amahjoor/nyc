import test from 'node:test';
import assert from 'node:assert/strict';
import {packActor,packCar,unpackActor,validScene} from '../dist/shared-scene.js';
import {StreetObjects} from '../dist/street-objects.js';

test('scene records preserve actor outfits, patrol identity, vehicle glazing and collision geometry',()=>{
  const police={id:'unit',type:'police',unit:'esu',color:'#223344',x:11.123,y:3,z:20,
    speed:2,angle:.6,identity:{make:'Ford',model:'F-350',year:2023},siren:true,shotGlass:2};
  const actor=packActor({look:{height:1.73,skin:123},x:9,y:3,z:20,dead:true},22057,42,true);
  const city={cars:[packCar(police)],actors:[actor],doors:[],bikes:[],air:null,equipment:[],glass:[],props:[]};
  assert.equal(validScene(city),true);assert.equal(unpackActor(actor).member,22057);
  assert.equal(unpackActor(actor).dead,true);assert.equal(unpackActor(actor).pedestrian,true);
  assert.equal(validScene({...city,extra:'invalid'}),false);
  assert.equal(validScene({...city,cars:[[...city.cars[0],null]]}),false);
  assert.equal(validScene({...city,glass:[['shop','unknown-pane']]}),false);
  const props=new StreetObjects();
  props.replace('basket',[{id:'bin',x:0,z:0,y:0,radius:.4,height:1}]);
  props.applyPose('bin',[32,0,0,0,1,0,0,0,0,0,0,1,1]);
  assert.equal(props.contact(0,0,.3,0),null);assert.equal(props.contact(32,0,.3,0).body.id,'bin');
  assert.equal(props.moving.size,0);
});
