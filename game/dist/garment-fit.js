// Fit an untucked hem to the actual trousers or skirt underneath it. At hip
// level the two layers also need to follow the same bones when a leg lifts.
const ROWS=21, SECTORS=48;
const directions=Array.from({length:SECTORS},(_,i)=>[Math.sin(i*2*Math.PI/SECTORS),Math.cos(i*2*Math.PI/SECTORS)]);

function sampleWaist(lower,part,base,step,center){
  const surface=new Array(ROWS*SECTORS), p=lower.at;
  for(let i=0;i<part.triangles.length;i+=3){
    const vertices=[0,1,2].map(j=>part.corners[part.triangles[i+j]]);
    const heights=vertices.map(v=>p[3*v+1]);
    const start=Math.max(0,Math.ceil((Math.min(...heights)-base)/step));
    const end=Math.min(ROWS-1,Math.floor((Math.max(...heights)-base)/step));
    for(let row=start;row<=end;row++){
      const y=base+step*row,hits=[];
      for(let j=0;j<3;j++){
        const a=vertices[j]*3,b=vertices[(j+1)%3]*3;
        if((p[a+1]>y)===(p[b+1]>y))continue;
        const t=(y-p[a+1])/(p[b+1]-p[a+1]);
        const weights=[0,0,0];weights[j]=1-t;weights[(j+1)%3]=t;
        hits.push({x:p[a]+t*(p[b]-p[a]),z:p[a+2]-center+t*(p[b+2]-p[a+2]),weights});
      }
      if(hits.length!==2)continue;
      const [a,b]=hits,ex=b.x-a.x,ez=b.z-a.z;
      for(let k=0;k<SECTORS;k++){
        const [dx,dz]=directions[k],det=dx*ez-dz*ex;
        if(Math.abs(det)<1e-8)continue;
        const t=(a.x*dz-a.z*dx)/det,radius=(a.x*ez-a.z*ex)/det,cell=row*SECTORS+k;
        if(t<0 || t>1 || radius<=(surface[cell]?.radius||0))continue;
        surface[cell]={radius,vertices,weights:a.weights.map((w,j)=>w+t*(b.weights[j]-w))};
      }
    }
  }
  return surface;
}

// Interpolate the lower garment's skinning at the contact triangle. Preserve
// the shoulder and spine weights higher up the shirt.
function followCloth(upper,vertex,lower,cell,mix){
  const total=new Map(),u=vertex*4;
  const add=(bone,weight)=>{if(weight>0)total.set(bone,(total.get(bone)||0)+weight);};
  for(let k=0;k<4;k++)add(upper.bone[u+k],upper.pull[u+k]*(1-mix));
  for(let j=0;j<3;j++){
    const v=cell.vertices[j]*4;
    for(let k=0;k<4;k++)add(lower.bone[v+k],lower.pull[v+k]*mix*cell.weights[j]);
  }
  const ranked=[...total].sort((a,b)=>b[1]-a[1]).slice(0,4);
  const sum=ranked.reduce((s,e)=>s+e[1],0);
  for(let k=0;k<4;k++){
    upper.bone[u+k]=ranked[k]?.[0]||0;
    upper.pull[u+k]=(ranked[k]?.[1]||0)/sum;
  }
}

export function easeOverWaist(upper,lower,part,rig){
  const scale=rig.height/1.76,step=.018*scale,pelvis=rig.bind[rig.index.get('pelvis')].p;
  let waist=-Infinity;
  for(let i=1;i<lower.at.length;i+=3)waist=Math.max(waist,lower.at[i]);
  const base=waist-step*(ROWS-1)-.001*scale;
  const surface=sampleWaist(lower,part,base,step,pelvis[2]);
  for(let i=0;i<upper.at.length;i+=3){
    const x=upper.at[i],y=upper.at[i+1],z=upper.at[i+2]-pelvis[2],radius=Math.hypot(x,z);
    if(y<base || y>waist+.080*scale || radius<.02*scale)continue;
    if(/arm|hand|thumb|finger/.test(rig.bones[upper.bone[i/3*4]].name))continue;
    const row=Math.min(ROWS-1,Math.round((y-base)/step)),angle=(Math.atan2(x,z)/(Math.PI*2)+1)*SECTORS;
    const sector=Math.round(angle)%SECTORS;
    let outer=0,closest;
    for(let j=Math.max(0,row-2);j<=Math.min(ROWS-1,row+1);j++){
      const a=surface[j*SECTORS+Math.floor(angle)%SECTORS]?.radius||0;
      const b=surface[j*SECTORS+Math.ceil(angle)%SECTORS]?.radius||0;
      outer=Math.max(outer,a+(b-a)*(angle%1));
      const point=surface[j*SECTORS+sector];
      if(point && (!closest||Math.abs(j-row)<closest.distance))closest={point,distance:Math.abs(j-row)};
    }
    if(!outer)continue;
    const falloff=Math.max(0,1-Math.max(0,y-waist)/(.080*scale));
    const ease=Math.min(.105*scale,Math.max(0,outer+.016*scale-radius))*falloff;
    upper.at[i]+=x/radius*ease;
    upper.at[i+2]+=z/radius*ease;
    const mix=Math.min(1,(pelvis[1]+.085*scale-y)/(.08*scale));
    if(mix>0 && closest)followCloth(upper,i/3,lower,closest.point,mix);
  }
}

// Remove the part of a boot shaft enclosed by a full trouser leg. Leave a
// small overlap below each cuff so the ankle stays covered during a step.
export function coveredShaft(boot,trousers,height){
  const hem=[Infinity,Infinity];
  for(let i=0;i<trousers.at.length;i+=3){
    const side=Number(trousers.at[i]>0);
    hem[side]=Math.min(hem[side],trousers.at[i+1]);
  }
  const hidden=new Uint8Array(boot.at.length/3), overlap=.048*height/1.76;
  for(let v=0;v<hidden.length;v++){
    const side=Number(boot.at[v*3]>0);
    if(boot.at[v*3+1]>hem[side]+overlap)hidden[v]=1;
  }
  return hidden;
}
