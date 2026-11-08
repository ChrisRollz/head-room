const assert=require('node:assert/strict'),G=require('../src/geometry'),C=require('../src/clearance'),F=require('../src/fit')(G),entry=require('../src/ring'),T=require('../src/vendor/three.min.js');
function box(h){const vertices=Array.from({length:8},(_,i)=>h.map((v,j)=>i&(1<<j)?v:-v)),faces=[];
  for(let k=0;k<3;k++)for(const v of [0,1<<k]){const a=v|1<<((k+1)%3),b=v|1<<((k+2)%3);faces.push([v,a,a|b],[v,a|b,b]);}return {vertices,faces};}
const inner=box([51,61,75]),outer=box([54,64,78]),head=box([45,55,67]);
const shell={vertices:outer.vertices.concat(inner.vertices),faces:outer.faces.concat(inner.faces.map(f=>f.map(i=>i+8)))};
const buf=G.binarySTL(shell);module.exports={buf};
if(require.main===module){
  const fit=F.start(head,buf),zones=[0,1,2,3,4],surface=C.headSurface(head,null,G);
  const rows=C.inspect(fit,surface,7,zones);assert.deepEqual(rows.map(r=>r.gap),[6,6,6,6,8]);assert(rows[0].short&&!rows[4].short);
  const before=Buffer.from(F.fittedSTL(fit));const scale=C.suggest(fit,surface,7,zones);assert(Math.abs(scale[0]-52/51)<.0001);assert.deepEqual(Buffer.from(F.fittedSTL(fit)),before);
  fit.offset=[3,0,0];const moved=C.inspect(fit,surface,7,zones);assert.equal(moved[0].gap,9);assert.equal(moved[1].gap,3);
  const cut=F.crossSection(fit,head,null,2,3),ring=entry(cut.shellLines,T);
  assert.equal(ring.width,102);assert.equal(ring.depth,122);assert.equal(G.inspectSTL(G.binarySTL(ring)).maxs[2],4);
  const edges=new Map();for(const tri of ring.faces)for(let j=0;j<3;j++){const edge=[tri[j],tri[(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(edge,1+(edges.get(edge)||0));}
  assert([...edges.values()].every(v=>v===2),'ring must be watertight');assert.throws(()=>entry([],T),/closed entry ring/);
  const refined=G.generate({...G.defaults,eyeDrop:95,pupilGap:62,noseDepth:212,earLeft:15,earRight:8});
  assert(Math.abs(refined.eyes[0][2]-133)<1e-7);assert.equal(refined.eyes[1][0]-refined.eyes[0][0],62);
  for(const [key,target] of [['noseDepth',212],['earLeft',15],['earRight',8]]){const [a,b]=refined.guides[key];assert(Math.abs(Math.hypot(...a.map((v,i)=>v-b[i]))-target)<.001);}
  console.log('Passed measured landmarks, local foam gaps, shell movement, suggestion without mutation, and physical watertight ring dimensions.');
}
