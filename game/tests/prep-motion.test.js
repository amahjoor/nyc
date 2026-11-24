import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMotion,fitPose} from '../dist/body-motion.js';
import {createRig,qrot} from '../dist/body.js';
import {limbFit} from '../dist/limb-fit.js';
import {prepHands,fitPrepHands,techniques} from '../dist/prep-motion.js';
import {prepTool} from '../dist/prep-tools.js';
import {pinchOffset} from '../dist/hand-poses.js';
import {Matrix4,Vector3} from '../dist/vendor/three.module.min.js';
import {recipeFor} from '../dist/recipes.js';
import {isServing} from '../dist/serving-models.js';

const meta=JSON.parse(readFileSync(new URL('../dist/motion.json',import.meta.url)));
const bytes=readFileSync(new URL('../dist/motion.bin',import.meta.url));
const motion=createMotion(meta,new Int16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2));

test('menu items select the actual working sequence even on a shared fixture',()=>{
  const actions=(item,kind)=>recipeFor(item,kind).flatMap(step=>step.actions);
  assert.deepEqual(actions('Latte','coffee'),['dose','tamp','lock','extract','steam','milkArt']);
  assert.deepEqual(actions('Stout','pub'),['tap','settle','topOff']);
  assert.deepEqual(actions('Beer','thai'),['open']);
  assert.deepEqual(actions('Martini','bar'),['barStir','strain','garnish']);
  assert.deepEqual(actions('sushi'),['spread','place','roll','slice','place']);
});

test('both grip centres reach the working area across heights and rotated counters',()=>{
  const instance=new Matrix4().makeRotationY(-1.23).setPosition(8,2,-14);
  const anchor=new Vector3(0,1,.37).applyMatrix4(instance);
  for(const height of [1.57,1.77,1.91]){
    const rig=createRig(meta,{height});
    for(const action of ['slice','shake','steam','tap','milkArt','strain','tamp','press']){
      const work={action,x:anchor.x,y:anchor.y,z:anchor.z,ware:'board',duration:2,task:{time:1},cup:'drink-latte',drink:true};
      const pose=fitPose(motion,rig,motion.sample('idle',1)),hands=prepHands(work);
      fitPrepHands(rig,pose,work,instance);
      for(const side of ['l','r']){
        const h=hands[side],wrist=limbFit(rig,pose).frame(rig.index.get('hand_'+side));
        const knuckle=rig.bones[rig.index.get('middle_01_'+side)].t;
        const offset=h.grip==='pinch'?pinchOffset(rig,side):knuckle.map((v,k)=>v*.73+(k===0 && h.grip==='wrap'?(side==='l'?1:-1)*.025:0));
        const actual=wrist.p.add(new Vector3(...qrot(wrist.q,offset))).applyMatrix4(instance);
        const target=new Vector3(h.x,1+h.y,.37+h.z).applyMatrix4(instance);
        assert.ok(actual.distanceTo(target)<.05,`${height} ${action} ${side} missed by ${actual.distanceTo(target).toFixed(3)} m`);
      }
    }
  }
});

test('all work phases produce finite rig poses and draw available implements',()=>{
  const rig=createRig(meta),checked=new Set(),instance=new Matrix4();
  for(const action of Object.keys(techniques)){
    for(const time of [2,1.92,1,.08,0]){
      const work={action,cup:'drink-beer',pack:'drink-water',x:0,y:1.02,z:.39,task:{time},duration:2,ware:'board',drink:true,station:'draftTaps'};
      const pose=fitPose(motion,rig,motion.sample('idle',time));
      const props=fitPrepHands(rig,pose,work,instance);
      assert.ok(pose.q.every(q=>q.every(Number.isFinite)),action);
      for(const prop of props){
        assert.ok([...prop.point.toArray(),...prop.rotation.toArray()].every(Number.isFinite),action);
        if(checked.has(prop.tool)||isServing(prop.tool))continue;
        const parts=prepTool(prop.tool);
        assert.ok(parts?.length,prop.tool);checked.add(prop.tool);
        for(const [geometry] of parts)geometry.dispose();
      }
    }
  }
});
