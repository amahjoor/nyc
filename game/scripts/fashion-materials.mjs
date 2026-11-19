// Original cloth artwork, drape adjustments and screen prints for the archive collection.
// Bake in the garment's rest coordinates so stripes and panels continue across UV seams.
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export const fashionPieces=JSON.parse(readFileSync(new URL('../data/fashion-pieces.json',import.meta.url)));
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const rgb=h=>h.slice(1).match(/../g).map(v=>parseInt(v,16));
const band=(v,width)=>clamp(1-Math.abs(v)/width);
const repeat=(v,spacing,width)=>band(v-Math.round(v/spacing)*spacing,width);
const run=(cmd,args,input)=>execFileSync(cmd,args,{input,maxBuffer:48*1024*1024});
const sourcePixels=new Map();
let prints;

export function fashionFolder(root,design){
  if(design.pack==='system')return join(root,'pack/files/clothes',design.source);
  const cache=join(root,'community'), folder=join(cache,design.pack,'clothes',design.source);
  if(!existsSync(join(folder,design.source+'.mhclo'))){
    const zip=join(cache,design.pack+'.zip');
    if(!existsSync(zip))throw Error('Missing '+zip+'. Run node scripts/fetch-fashion.mjs first.');
    run('unzip',['-oq',zip,'clothes/'+design.source+'/*','-d',join(cache,design.pack)]);
  }
  return folder;
}

export function cutFashion(design,coords,offsets){
  const ys=coords.map(p=>p[1]), low=Math.min(...ys), height=Math.max(...ys)-low;
  for(let i=0;i<coords.length;i++){
    const [x,y,z]=coords[i], t=clamp((y-low)/height);
    let dx=0,dy=0,dz=0;
    if(design.ease || design.length){
      // Keep the neckline and armholes anchored, and move the hem with its existing bones.
      const torso=clamp((.34-Math.abs(x))/.11), hem=(1-t)**2*torso;
      dx=x*(design.ease||0)*torso*(1-t);
      dz=(z+.015)*(design.ease||0)*torso*(1-t);
      dy=-hem*((design.length||0)+(design.asymmetry||0)*clamp(x/.25,-1,1));
    }
    if(design.flare){
      const belowKnee=clamp((.58-t)/.58)**1.4;
      dx=(x-Math.sign(x)*.113)*design.flare*belowKnee;
      dz=(z+.015)*design.flare*belowKnee;
    }
    for(const [axis,delta] of [dx,dy,dz].entries()){
      offsets[3*i+axis]+=delta;
      coords[i][axis]+=delta;
    }
  }
}

function sourceImage(path){
  if(!path)return null;
  if(!sourcePixels.has(path))sourcePixels.set(path,run('magick',[path,'-alpha','off','-resize','768x768!','-colorspace','Gray','-depth','8','gray:-']));
  return sourcePixels.get(path);
}

// Older community garments do not all include MakeHuman's delete_verts.
// Project both sides of the fitted shell and mask skin enclosed by it.
export function skinUnderCloth(coords,point,uvFaces,body){
  const scale=500,xMin=Math.min(...coords.map(p=>p[0]))-.002,yMin=Math.min(...coords.map(p=>p[1]))-.002;
  const w=Math.ceil((Math.max(...coords.map(p=>p[0]))-xMin)*scale)+2;
  const h=Math.ceil((Math.max(...coords.map(p=>p[1]))-yMin)*scale)+2;
  const near=new Float32Array(w*h).fill(-Infinity),far=new Float32Array(w*h).fill(Infinity);
  const projected=coords.map(([x,y,z])=>[(x-xMin)*scale,(y-yMin)*scale,z]);
  for(let i=0;i<uvFaces.length;i+=3){
    const [a,b,c]=uvFaces.slice(i,i+3).map(j=>projected[point[j]]);
    const ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx;
    if(Math.abs(det)<1e-8)continue;
    for(let y=Math.floor(Math.min(a[1],b[1],c[1]));y<=Math.ceil(Math.max(a[1],b[1],c[1]));y++){
      for(let x=Math.floor(Math.min(a[0],b[0],c[0]));x<=Math.ceil(Math.max(a[0],b[0],c[0]));x++){
        const s=((x-a[0])*vy-(y-a[1])*vx)/det,t=(ux*(y-a[1])-uy*(x-a[0]))/det;
        if(s<0 || t<0 || s+t>1)continue;
        const z=a[2]+s*(b[2]-a[2])+t*(c[2]-a[2]),n=y*w+x;
        near[n]=Math.max(near[n],z);far[n]=Math.min(far[n],z);
      }
    }
  }
  const hidden=[];
  for(let i=0;i<body.length;i+=3){
    const x=Math.round((body[i]-xMin)*scale),y=Math.round((body[i+1]-yMin)*scale),z=body[i+2];
    if(x<0 || x>=w || y<0 || y>=h)continue;
    const n=y*w+x;
    if(z>=far[n]-.035 && z<=near[n]+.035)hidden.push(i/3);
  }
  return hidden;
}
function printImage(){
  if(!prints){
    const svg=fileURLToPath(new URL('../data/archive-prints.svg',import.meta.url));
    prints=run('magick',['png:-','-depth','8','rgba:-'],run('rsvg-convert',[svg]));
  }
  return prints;
}

// All dimensions below are metres on the unposed garment. The original weave
// and pocket shading remain visible through the new dye.
function artwork(style,x,y,z,t,front) {
  switch(style){
    case 'pocket': {
      const px=x-.085,py=t-.59;
      if(Math.abs(px)>.046 || py>0 || py<-.15)return 0;
      return .18*Math.max(band(Math.abs(px)-.044,.002),band(py+.145-Math.abs(px)*.28,.008),band(py+.014,.006))*front;
    }
    case 'stripe':return (.68*band(t-.64,.027)+.45*band(t-.595,.009));
    case 'relay':return (.78*band(t-.61+x*.77,.025)+.63*band(t-.56+x*.77,.013));
    case 'ringer':{
      const collar=Math.hypot(x/.094,(t-.997)/.13);
      const cuff=clamp((Math.abs(x)-.17)*28)*band(t-.59,.018);
      return .85*Math.max(clamp((1.16-collar)*8),cuff);
    }
    case 'cable':return .13*repeat(x+.006*Math.sin(y*92),.035,.003);
    case 'ladder':return (.31*repeat(y,.089,.009)+.16*repeat(y+.013,.089,.002))*(.65+.35*Math.sin(x*29+y*47));
    case 'offset':return .43*band(x-.08+(t-.5)*.18,.003)*front+.3*band(t-.06,.015);
    case 'bias':return .13*repeat(x*.85+y*.58+z*.38,.048,.004);
    case 'binding':return .48*band(t-.065,.018)+.32*band(t-.10,.006);
    case 'chalk':return .52*repeat(x+.22*z,.024,.00095);
    case 'vent':return .28*band(Math.abs(x)-.115-(.5-t)*.044,.002)*front;
    case 'field':return .38*band(t-.43,.011)*clamp((Math.abs(x)-.125)*25);
    case 'wax':return .32*band(t-.44+Math.abs(x)*.4,.011)+.19*band(t-.40+Math.abs(x)*.4,.004);
    case 'gusset':return .30*band(Math.abs(x)-.035-.16*t,.003);
    case 'twill':return .055*repeat(x+y,.008,.002);
    case 'repair':{
      if(!front || x<.065 || x>.162 || t<.27 || t>.56)return 0;
      return .22+.53*repeat(y,.012,.0017)*repeat(x+(Math.floor(y/.012)%2)*.004,.017,.006);
    }
    case 'check':return .47*repeat(y,.062,.004)+.37*repeat(x+.3*z,.062,.003)+.22*repeat(x+.3*z+.01,.062,.0015);
    case 'wrap':return .55*band(t-.17-x*1.35,.012)+.29*band(t-.135-x*1.35,.006);
    case 'sole':return .77*clamp((.17-t)*22)+.3*band(t-.2,.013);
    case 'welt':return .48*band(t-.14,.025);
    default:return 0;
  }
}

export function bakeFashion(design,coords,point,uv,triangles,source,path){
  const size=design.slot==='shoes'?1024:1536, pixels=Buffer.alloc(size*size*3), covered=new Uint8Array(size*size);
  const colour=rgb(design.colour), ink=rgb(({check:'#bc9295',relay:'#cbd4be',wax:'#85868b',sole:'#b8b5a8',ringer:'#5d443f',repair:'#d6caaa',welt:'#cead84'})[design.pattern] || '#d1c8b3');
  const sourceMap=sourceImage(source), vertical=coords.map(p=>p[1]), low=Math.min(...vertical), span=Math.max(...vertical)-low;
  const centers=coords.map(p=>p[2]), midZ=(Math.min(...centers)+Math.max(...centers))/2;
  const print=design.pattern==='moth'||design.pattern==='survey'?printImage():null;
  const sample=(u,v)=>sourceMap[Math.min(767,Math.max(0,Math.floor(v*768)))*768+Math.min(767,Math.max(0,Math.floor(u*768)))];
  let mean=0,area=0;
  for(let i=0;sourceMap && i<triangles.length;i+=3){
    const [a,b,c]=triangles.slice(i,i+3).map(j=>j*2);
    const weight=Math.abs((uv[b]-uv[a])*(uv[c+1]-uv[a+1])-(uv[c]-uv[a])*(uv[b+1]-uv[a+1]));
    mean+=weight*sample((uv[a]+uv[b]+uv[c])/3,1-(uv[a+1]+uv[b+1]+uv[c+1])/3);area+=weight;
  }
  mean=area?mean/area:128;
  for(let i=0;i<pixels.length;i+=3){pixels[i]=colour[0];pixels[i+1]=colour[1];pixels[i+2]=colour[2];}
  for(let i=0;i<triangles.length;i+=3){
    const ids=triangles.slice(i,i+3), [a,b,c]=ids.map(j=>[uv[j*2]*size,(1-uv[j*2+1])*size]);
    const [p,q,r]=ids.map(j=>coords[point[j]]), ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx;
    if(Math.abs(det)<1e-6)continue;
    const x0=clamp(Math.floor(Math.min(a[0],b[0],c[0])),0,size-1),x1=clamp(Math.ceil(Math.max(a[0],b[0],c[0])),0,size-1);
    const y0=clamp(Math.floor(Math.min(a[1],b[1],c[1])),0,size-1),y1=clamp(Math.ceil(Math.max(a[1],b[1],c[1])),0,size-1);
    for(let row=y0;row<=y1;row++)for(let col=x0;col<=x1;col++){
      const dx=col+.5-a[0],dy=row+.5-a[1],s=(dx*vy-dy*vx)/det,w=(ux*dy-uy*dx)/det;
      if(s<-.00002||w<-.00002||s+w>1.00002)continue;
      const x=p[0]+s*(q[0]-p[0])+w*(r[0]-p[0]),y=p[1]+s*(q[1]-p[1])+w*(r[1]-p[1]),z=p[2]+s*(q[2]-p[2])+w*(r[2]-p[2]);
      const t=(y-low)/span,front=z>midZ;
      const photo=sourceMap?sample(col/size,row/size):mean;
      const shade=clamp(1+(photo-mean)/Math.max(72,mean)*(design.contrast??.58),.41,1.56);
      const thread=1+.019*Math.sin((x*1.33+y*.9+z*.22)*2700), mix=clamp(artwork(design.pattern,x,y,z,t,front));
      const offset=(row*size+col)*3;
      let pi=0,alpha=0;
      if(print && front){
        const px=Math.floor((x/.30+.5)*320),py=Math.floor(((.63-t)*span/.30+.5)*320);
        if(px>=0 && px<320 && py>=0 && py<320){
          pi=(py*640+px+(design.pattern==='survey'?320:0))*4;
          alpha=print[pi+3]/255*(.83+.12*Math.sin(col*13+row*17));
        }
      }
      const lining=design.pack==='system' && front && t>.56 ? clamp((photo-95)/85) : 0;
      for(let k=0;k<3;k++){
        const fabric=((colour[k]*(1-mix)+ink[k]*mix)*(1-alpha)+(print?print[pi+k]*alpha:0))*shade*thread;
        pixels[offset+k]=clamp(fabric*(1-lining)+(photo*.89+11)*lining,0,255);
      }
      covered[row*size+col]=1;
    }
  }
  // Bleed each UV island a few pixels for bilinear filtering and mipmaps.
  for(let pass=1;pass<=4;pass++)for(let i=size+1;i<covered.length-size-1;i++){
    if(covered[i])continue;
    const j=[i-1,i+1,i-size,i+size].find(j=>covered[j] && covered[j]<=pass);
    if(j===undefined)continue;
    pixels.copy(pixels,i*3,j*3,j*3+3);covered[i]=pass+1;
  }
  mkdirSync(dirname(path),{recursive:true});
  run('magick',['-size',size+'x'+size,'-depth','8','rgb:-','-quality','92','-define','webp:method=4',path],pixels);
}
