const assert=require('node:assert/strict');
const {generate,binarySTL,inspectSTL}=require('../src/geometry.js');
for(const dims of [
  {width:160,length:200,height:235,circumference:580},
  {width:172,length:185,height:222,circumference:562}
]){
  const m=generate(dims),loop=m.guides.circumference;
  const length=loop.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,k)=>v-loop[i][k])),0);
  assert.ok(Math.abs(length-dims.circumference)<.02);
  assert.equal(Math.max(...loop.map(p=>p[0]))-Math.min(...loop.map(p=>p[0])),dims.width);
  assert.equal(Math.max(...loop.map(p=>p[1]))-Math.min(...loop.map(p=>p[1])),dims.length);
  const imported=inspectSTL(binarySTL(m));
  assert.equal(imported.maxs[2]-imported.mins[2],dims.height);
  assert.equal(imported.faces.length,m.faces.length);
}
assert.ok(Math.abs(generate({circumference:800,width:150,length:185}).actual.circumference-800)>1);
assert.throws(()=>inspectSTL(new Uint8Array(85).buffer));
console.log('Passed physical landmark, circumference limit, STL roundtrip and invalid import checks.');
