/* Original low-detail headform. Coordinates are millimetres, Z up, nose toward -Y. */
const HeadRoomGeometry = (() => {
  const slices = 64;
  const defaults = { circumference: 560, width: 154, length: 194, height: 228 };
  // Height fraction, half-width fraction, depth fraction, forward shift (fraction of length).
  const profile = [
    [0, .12, .12, -.28], [.035,.38,.32,-.23], [.10,.59,.51,-.18],
    [.17,.71,.67,-.12], [.25,.79,.80,-.07], [.35,.86,.90,-.035],
    [.45,.92,.96,-.013], [.56,.97,.99,0], [.64,1,1,0],
    [.72,.99,.99,.008], [.80,.93,.94,.020], [.87,.80,.83,.027],
    [.93,.61,.64,.031], [.975,.34,.37,.034], [1,0,0,.034]
  ];
  function section(t) {
    const j = profile.findIndex(row => row[0] >= t);
    if (j <= 0) return profile[0].slice(1);
    const a = profile[j-1], b = profile[j], q = (t-a[0])/(b[0]-a[0]);
    return a.slice(1).map((v,k) => v + (b[k+1]-v)*q);
  }
  function oval(angle, w, l, exponent) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [w/2*Math.sign(c)*Math.abs(c)**(2/exponent),
            l/2*Math.sign(s)*Math.abs(s)**(2/exponent)];
  }
  function perimeter(w,l,e) {
    let sum = 0, prev = oval(0,w,l,e);
    for(let i=1;i<=slices;i++) {
      const next = oval(i*2*Math.PI/slices,w,l,e);
      sum += Math.hypot(next[0]-prev[0],next[1]-prev[1]); prev=next;
    }
    return sum;
  }
  function generate(measured={}) {
    const c = measured.circumference ?? defaults.circumference, k=c/defaults.circumference;
    const w=measured.width??defaults.width*k, l=measured.length??defaults.length*k;
    const h=measured.height??defaults.height*k;
    let low=1.4, high=3.8;
    for(let i=0;i<25;i++) {
      const mid=(low+high)/2;
      if(perimeter(w,l,mid)<c) low=mid; else high=mid;
    }
    const e=(low+high)/2, vertices=[], faces=[];
    const eyeZ=measured.eyeDrop==null?.514:1-measured.eyeDrop/h;
    const eyeX=measured.pupilGap==null?.41:measured.pupilGap/w;
    function bump(x,t,cx,ct,wx,wt) {return Math.exp(-(((x-cx)/wx)**2+((t-ct)/wt)**2));}
    const levels=[...new Set([...(Object.keys(measured).some(k=>!(k in defaults))?[.44,.38,Math.max(.02,Math.min(.98,eyeZ))]:[]),...Array.from({length:50},(_,i)=>i/50),.64])].sort((a,b)=>a-b);
    function faceY(xn,t) {
      return .095*bump(xn,t,0,.385,.21,.069)+.043*bump(xn,t,0,.465,.17,.12)
         -.048*bump(Math.abs(xn),t,eyeX,eyeZ,.22,.057)+.019*bump(Math.abs(xn),t,.47,.425,.25,.075)
         +.022*bump(xn,t,0,.227,.36,.036);
    }
    const noseBase=section(.38);
    const naturalTip=l*(noseBase[2]-noseBase[1]/2-faceY(0,.38));
    const noseShift=measured.noseDepth==null?0:l/2-measured.noseDepth-naturalTip;
    for(const t of levels) {
      const [sw,sl,shift]=section(t);
      for(let j=0;j<slices;j++){
        const a=j*2*Math.PI/slices, [x,y]=oval(a,w*sw,l*sl,e);
        const xn=x/(w/2), front=Math.max(0,-Math.sin(a))**5;
        const browFade=Math.max(0,Math.min(1,(.64-t)/.05));
        const relief=faceY(xn,t);
        const protrusion=x>0?measured.earLeft:measured.earRight;
        const ear=protrusion==null?w*browFade*.034*bump(Math.abs(Math.sin(a)),t,.12,.44,.13,.095):
          protrusion*bump(Math.sin(a),t,0,.44,.18,.078);
        vertices.push([x+Math.sign(x)*ear,y+l*(shift-front*browFade*relief)+front*noseShift*bump(xn,t,0,.38,.22,.08),h*t]);
      }
    }
    for(let row=0;row<levels.length-1;row++) for(let j=0;j<slices;j++){
      const a=row*slices+j,b=row*slices+(j+1)%slices;
      faces.push([a,b,a+slices],[b,b+slices,a+slices]);
    }
    const bottom=vertices.push([0,-.28*l,0])-1, top=vertices.push([0,.034*l,h])-1;
    const last=(levels.length-1)*slices;
    for(let j=0;j<slices;j++){const b=(j+1)%slices;faces.push([bottom,b,j],[last+j,last+b,top]);}
    const z=.64*h;
    const loop=vertices.slice(levels.indexOf(.64)*slices,(levels.indexOf(.64)+1)*slices);
    const guides={circumference:[...loop,loop[0]],width:[[-w/2,0,z],[w/2,0,z]],
      length:[[0,-l/2,z],[0,l/2,z]],height:[[0,-.28*l,0],[0,.034*l,h]]};
    const ez=eyeZ*h, gap=(measured.pupilGap??w*.41),sec=section(eyeZ);
    const eyeY=l*(sec[2]-.5*sec[1]*Math.pow(Math.max(0,1-Math.pow(gap/(w*sec[0]),e)),1/e))-2;
    const eyes=[[-gap/2,eyeY,ez],[gap/2,eyeY,ez]];
    guides.eyeDrop=[[0,eyeY,h],[0,eyeY,ez]];guides.pupilGap=eyes;
    guides.noseDepth=[[0,l/2,h*.38],[0,naturalTip+noseShift,h*.38]];
    for(const [key,sign] of [['earLeft',1],['earRight',-1]]){
      const x=w*.5*section(.44)[0],y=l*section(.44)[2];
      guides[key]=[[sign*x,y,h*.44],[sign*(x+(measured[key]??w*.034)),y,h*.44]];
    }
    return {vertices,faces,guides,eyes:measured.eyeDrop!=null||measured.pupilGap!=null?eyes:null,actual:{circumference:perimeter(w,l,e),width:w,length:l,height:h}};
  }
  function binarySTL(mesh) {
    const data=new ArrayBuffer(84+50*mesh.faces.length), v=new DataView(data);
    v.setUint32(80,mesh.faces.length,true);
    mesh.faces.forEach((f,i)=>{
      const p=f.map(j=>mesh.vertices[j]), a=p[1].map((x,k)=>x-p[0][k]), b=p[2].map((x,k)=>x-p[0][k]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const mag=Math.hypot(...n)||1;
      [...n.map(x=>x/mag),...p.flat()].forEach((x,j)=>v.setFloat32(84+50*i+4*j,x,true));
    });
    return data;
  }
  // Stream the full file even when the on-screen preview uses fewer triangles.
  function readSTL(buffer, visit) {
    const v=new DataView(buffer), n=buffer.byteLength>=84?v.getUint32(80,true):0;
    if(n>0&&84+50*n===buffer.byteLength){
      for(let i=0;i<n;i++){
        const points=Array.from({length:3},(_,j)=>Array.from({length:3},(_,k)=>v.getFloat32(96+50*i+12*j+4*k,true)));
        visit(points,i,n);
      }
      return n;
    }
    const s=new TextDecoder().decode(buffer);
    if(!/^\s*solid\b/i.test(s)||!/^\s*endsolid\b/im.test(s))throw Error('Choose a binary or ASCII STL file.');
    const count=(s.match(/\bfacet\s+normal/gi)||[]).length;
    const re=/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
    let m,tri=[],i=0;
    while((m=re.exec(s))){tri.push(m.slice(1).map(Number));if(tri.length===3){visit(tri,i++,count);tri=[];}}
    if(tri.length||i!==count)throw Error('Incomplete ASCII STL.');
    return count;
  }
  function inspectSTL(buffer) {
    const vertices=[],faces=[],mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
    const count=readSTL(buffer,(points,i,n)=>{
      for(const p of points)for(let d=0;d<3;d++){
        if(!Number.isFinite(p[d]))throw Error('Invalid STL coordinate.');
        mins[d]=Math.min(mins[d],p[d]);maxs[d]=Math.max(maxs[d],p[d]);
      }
      if(i%Math.ceil(n/7000)===0){const j=vertices.length;vertices.push(...points);faces.push([j,j+1,j+2]);}
    });
    if(!count||maxs.some((v,i)=>v<=mins[i]))throw Error('This STL has no three-dimensional surface.');
    return {vertices,faces,mins,maxs,count,guides:{}};
  }
  // Contiguous, full-resolution triangles: one allocation, no decimation or STL normals required.
  function surface(buffer){
    let positions;
    const count=readSTL(buffer,(tri,index,n)=>{
      if(!positions)positions=new Float32Array(n*9);
      for(let j=0;j<3;j++)positions.set(tri[j],index*9+j*3);
    });
    if(!count)throw Error('This STL has no triangles.');
    return positions;
  }
  function visitSurface(positions,fn){
    for(let i=0;i<positions.length;i+=9)
      fn([[positions[i],positions[i+1],positions[i+2]],[positions[i+3],positions[i+4],positions[i+5]],[positions[i+6],positions[i+7],positions[i+8]]],i/9);
  }
  return {defaults,generate,binarySTL,inspectSTL,readSTL,surface,visitSurface};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=HeadRoomGeometry;
