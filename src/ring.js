// Build a 4-mm tall physical gauge from a closed horizontal section (with its original opening).
function entryGauge(lines,T){
  const key=p=>Math.round(p[0]*1000)+','+Math.round(p[1]*1000), graph=new Map(), points=new Map();
  for(const [p,q] of lines){
    const a=key(p),b=key(q);if(a===b)continue;
    for(const [x,y,v] of [[a,b,p],[b,a,q]]){if(!graph.has(x))graph.set(x,new Set());graph.get(x).add(y);points.set(x,v);}
  }
  const fail=()=>{throw Error('No single closed entry ring at this height. Sweep to a continuous band above the rim.');};
  if(!graph.size||[...graph.values()].some(n=>n.size!==2))fail();
  const loops=[],seen=new Set();
  for(const start of graph.keys()){if(seen.has(start))continue;let cur=start,prev=null;const loop=[];
    do{if(seen.has(cur))fail();seen.add(cur);let p=points.get(cur);loop.push(new T.Vector2(p[0],p[1]));
      const next=[...graph.get(cur)].find(n=>n!==prev);prev=cur;cur=next;
    }while(cur!==start);
    // Adjacent triangles often split a straight edge. Remove those points from both
    // walls and caps so triangulation cannot leave a T junction in the printable STL.
    let changed=true;
    while(changed&&loop.length>3){changed=false;
      for(let j=loop.length-1;j>=0&&loop.length>3;j--){
        const a=loop[(j+loop.length-1)%loop.length],b=loop[j],c=loop[(j+1)%loop.length];
        if(Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))<=1e-7*Math.max(1,a.distanceTo(c))){
          loop.splice(j,1);changed=true;}
      }}
    if(loop.length<3)fail();loops.push(loop);
  }
  if(loops.length<1||loops.length>2)fail();
  loops.sort((a,b)=>Math.abs(T.ShapeUtils.area(b))-Math.abs(T.ShapeUtils.area(a)));
  const outer=loops[0],hole=loops[1]||[];
  function inside(p,loop){let yes=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){
    const a=loop[i],b=loop[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
  let openSpan;
  if(!hole.length){
    // An open-front visor can be a single C-shaped section. Preserve the opening
    // instead of fabricating a bridge or reporting a fictitious closed diameter.
    const bounds=['x','y'].map(k=>outer.reduce(([lo,hi],p)=>[Math.min(lo,p[k]),Math.max(hi,p[k])],[Infinity,-Infinity]));
    const [x,y]=bounds.map(([lo,hi])=>(lo+hi)/2),area=Math.abs(T.ShapeUtils.area(outer));
    if(inside({x,y},outer)||area>(bounds[0][1]-bounds[0][0])*(bounds[1][1]-bounds[1][0])*.45)fail();
    function clear(a,b,m,n){const hits=[];
      for(let i=0;i<outer.length;i++){
        const p=outer[i],q=outer[(i+1)%outer.length];if((p[b]>n)===(q[b]>n))continue;
        hits.push(p[a]+(q[a]-p[a])*(n-p[b])/(q[b]-p[b]));}
      const lo=hits.filter(v=>v<m),hi=hits.filter(v=>v>m);
      return lo.length>=2&&hi.length>=2?Math.min(...hi)-Math.max(...lo):null;
    }
    openSpan=[clear('x','y',x,y),clear('y','x',y,x)];if(!openSpan.some(v=>v>0))fail();
  }else if(!hole.every(p=>inside(p,outer)))fail();
  if(T.ShapeUtils.isClockWise(outer))outer.reverse();if(hole.length&&!T.ShapeUtils.isClockWise(hole))hole.reverse();
  const cap=T.ShapeUtils.triangulateShape(outer,hole.length?[hole]:[]),all=outer.concat(hole),n=all.length;
  const vertices=[0,4].flatMap(z=>all.map(p=>[p.x,p.y,z])),faces=[];
  for(const [a,b,c] of cap)faces.push([a,c,b],[a+n,b+n,c+n]);
  for(const [loop,start] of [[outer,0],[hole,outer.length]])for(let i=0;i<loop.length;i++){
    const a=start+i,b=start+(i+1)%loop.length;faces.push([a,b,b+n],[a,b+n,a+n]);}
  const edgeCounts=new Map();for(const tri of faces)for(let j=0;j<3;j++){
    const a=tri[j],b=tri[(j+1)%3],key=a<b?a+':'+b:b+':'+a;edgeCounts.set(key,(edgeCounts.get(key)||0)+1);}
  if([...edgeCounts.values()].some(v=>v!==2))fail();
  const span=k=>{let lo=Infinity,hi=-Infinity;for(const p of hole){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);}return hi-lo;};
  return {vertices,faces,open:!hole.length,width:openSpan?openSpan[0]:span('x'),depth:openSpan?openSpan[1]:span('y')};
}
if(typeof module!=='undefined'&&module.exports)module.exports=entryGauge;
