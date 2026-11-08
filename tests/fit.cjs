const assert = require('node:assert/strict');
const geometry = require('../src/geometry.js');
const fitting = require('../src/fit.js')(geometry);

function box(half) {
  const vertices = Array.from({length: 8}, (_,n) => half.map((v,i) => n & (1<<i) ? v : -v));
  const faces = [];
  for (let axis=0;axis<3;axis++) for (const end of [0, 1<<axis]) {
    const a = end | 1<<((axis+1)%3), b = end | 1<<((axis+2)%3), c = a|b;
    faces.push([end, a, c], [end, c, b]);
  }
  return {vertices,faces};
}
const inner = box([50,60,70]), outer = box([53,63,73]), head = box([45,51,60]);
const shell = {vertices:[...outer.vertices,...inner.vertices],faces:[...outer.faces,...inner.faces.map(f=>f.map(i=>i+8))]};
const fit = fitting.start(head,geometry.binarySTL(shell));
const close = (a,b) => assert(Math.abs(a-b)<.0001);
const expected = [50/50,56/60,65/70];
fitting.estimate(fit,5,false).forEach((v,i)=>close(v,expected[i]));
assert.deepEqual(fitting.estimate(fit,5,true),[1,1,1]);
assert.throws(()=>fitting.estimate(fitting.start(head,geometry.binarySTL(outer)),5,true),/opening or extra wall/);
fit.scale=[1.1,1.2,1.3];fit.offset=[2,-4,8];fitting.turn(fit,2);
const result=geometry.inspectSTL(fitting.fittedSTL(fit));
assert.deepEqual(result.count,shell.faces.length);
[2*63*1.1,2*53*1.2,2*73*1.3].forEach((v,i)=>close(result.maxs[i]-result.mins[i],v));
for(const axis of [0,1]){
  const cut=fitting.crossSection(fit,head,null,axis);
  assert(cut.headLines.length && cut.shellLines.length);
  for(const line of cut.shellLines)line.forEach(p=>close(p[axis],fit.center[axis]));
}
if(process.argv[2]){
  const bytes=require('node:fs').readFileSync(process.argv[2]);
  const full=fitting.start(geometry.generate(),bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert(full.shell.count>full.shell.faces.length);
  const copy=geometry.inspectSTL(fitting.fittedSTL(full));
  assert.equal(copy.count,full.shell.count);
  full.shell.mins.forEach((n,i)=>close(copy.maxs[i]-copy.mins[i],full.shell.maxs[i]-n));
  assert(fitting.crossSection(full,head,null,0).shellLines.length);
  console.log('Real helmet retained all '+copy.count+' triangles.');
}
console.log('Passed inner-wall sizing, opening detection, padding, cross sections and fitted STL checks.');
