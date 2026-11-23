// Local quads are shared by the drawing and shot collision.
export function fixtureGlazing(t) {
  const {a,b,w,d,h,y,shape} = t;
  const wall = ([a0,b0],[a1,b1],low,high) => [[a0,b0,low],[a1,b1,low],[a1,b1,high],[a0,b0,high]];
  if (shape==='branchPartition' || shape==='tellerPane') {
    const trim = shape==='branchPartition' ? .038 : 0;
    return [wall([a-w/2+trim,b],[a+w/2-trim,b],y+(trim ? .07 : 0),y+h-(trim ? .04 : 0))];
  }
  if (t.glass) {
    if (Math.min(w,d)<=.05) {
      const da = w>d ? w/2 : 0, db = w>d ? 0 : d/2;
      return [wall([a-da,b-db],[a+da,b+db],y,y+h)];
    }
    const corners = [[a-w/2,b-d/2],[a+w/2,b-d/2],[a+w/2,b+d/2],[a-w/2,b+d/2]];
    return [...corners.map((point,i)=>wall(point,corners[(i+1)%4],y,y+h)),corners.map(point=>[...point,y+h])];
  }
  if (shape!=='showcase' && shape!=='hotServery') return [];
  const [da,db] = t.face, width = db ? w : d, depth = db ? d : w;
  const point = (u,v,up) => [a+db*u+da*v,b-da*u+db*v,y+up];
  const left=-width/2+.012, right=-left, top=h-.014;
  const front = shape==='hotServery' ? depth*.43 : depth/2-.011;
  const back = shape==='hotServery' ? -depth*.12 : -front;
  const sill = shape==='hotServery' ? t.more?.countertop ? .15 : 1.01 : t.more?.deck??Math.max(.045,h-.34);
  const panes = [[point(left,front,sill),point(right,front,sill),point(right,front,top),point(left,front,top)],
    [point(left,front,top),point(right,front,top),point(right,back,top),point(left,back,top)]];
  if (shape==='showcase') {
    panes.push([point(right,back,sill),point(left,back,sill),point(left,back,top),point(right,back,top)]);
    for (const side of [left,right]) panes.push([point(side,front,sill),point(side,back,sill),point(side,back,top),point(side,front,top)]);
  }
  return panes;
}

export function fixtureShotCover(t) {
  if (t.glass || t.shape==='tellerPane') return [];
  if (t.shape==='branchPartition') {
    return [...[-1,1].map(side=>({...t,a:t.a+side*(t.w/2-.019),w:.038})),
      ...[.035,t.h-.04].map(up=>({...t,y:t.y+up,h:.036})),
      ...[1.12,1.17].map(up=>({...t,b:t.b+t.d/2,y:t.y+up,w:t.w-.07,d:.018,h:.018}))];
  }
  if (t.shape!=='showcase' && t.shape!=='hotServery') return t.solid ? [t] : [];
  const [da,db] = t.face, w = db ? t.w : t.d, d = db ? t.d : t.w;
  const solid = [];
  const box = (u,v,width,depth,up,h) => solid.push({
    a:t.a+db*u+da*v,b:t.b-da*u+db*v,y:t.y+up,w:db ? width : depth,d:db ? depth : width,h,
  });
  if (t.shape==='hotServery') {
    const deck = t.more?.countertop ? .043 : .88;
    box(0,0,w,d,0,deck+.08);
    for (const side of [-1,1]) box(side*(w/2-.02),d*.43,.028,.035,deck,t.h-deck);
    box(0,d*.43,w,.034,t.h-.029,.029);
    box(0,-d*.12,w,.022,t.h-.025,.018);
  } else {
    const base = t.more?.deck??Math.max(.045,t.h-.34);
    box(0,0,w,d,0,base+.02);
    for (const side of [-1,1]) {
      for (const end of [-1,1]) box(side*(w/2-.012),end*(d/2-.012),.022,.022,base,t.h-base);
      box(0,side*(d/2-.012),w,.022,t.h-.022,.022);
      box(side*(w/2-.012),0,.022,d,t.h-.022,.022);
    }
  }
  return solid;
}

export function roomFixturePanes(room) {
  return room.things.flatMap((thing,i)=>fixtureGlazing(thing).map((quad,j)=>({id:`fixture:${i}:${j}`,quad})));
}
