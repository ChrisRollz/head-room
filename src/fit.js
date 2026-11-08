/* Helmet coordinates are centered on the STL bounds before rotation and scaling. */
function createHelmetFitting(geometry) {
  function bounds(mesh) {
    if (mesh.mins) return [mesh.mins, mesh.maxs];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of mesh.vertices) for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]);
    }
    return [lo, hi];
  }
  const midpoint = ([lo, hi]) => lo.map((n, i) => (n + hi[i]) / 2);
  function start(head, bytes) {
    const shell = geometry.inspectSTL(bytes), headBounds = bounds(head);
    return {shell, bytes, headBounds, center: midpoint(headBounds), origin: midpoint(bounds(shell)),
      positions: geometry.surface(bytes), rotation: [1,0,0, 0,1,0, 0,0,1], offset: [0, 0, 0], scale: [1, 1, 1]};
  }
  function turn(fit, axis) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    const r=fit.rotation.slice();
    for(let j=0;j<3;j++){fit.rotation[a*3+j]=-r[b*3+j];fit.rotation[b*3+j]=r[a*3+j];}
  }
  function local(p, fit) {
    const x=p[0]-fit.origin[0],y=p[1]-fit.origin[1],z=p[2]-fit.origin[2],r=fit.rotation;
    return [r[0]*x+r[1]*y+r[2]*z,r[3]*x+r[4]*y+r[5]*z,r[6]*x+r[7]*y+r[8]*z];
  }
  function place(p, fit) {
    return local(p, fit).map((v, i) => v * fit.scale[i] + fit.center[i] + fit.offset[i]);
  }
  function preview(fit) {
    return {vertices: fit.shell.vertices.map(p => place(p, fit)), faces: fit.shell.faces};
  }
  // Intersection of the triangle with an axis through the shell pivot.
  function crossing(tri, axis) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3, [p,q,r] = tri;
    const qa = q[a]-p[a], qb = q[b]-p[b], ra = r[a]-p[a], rb = r[b]-p[b];
    const det = qa*rb-qb*ra;
    if (Math.abs(det) < 1e-9) return null;
    const u = (ra*p[b]-rb*p[a])/det, v = (qb*p[a]-qa*p[b])/det;
    if (u < -1e-8 || v < -1e-8 || u+v > 1+1e-8) return null;
    return p[axis]+u*(q[axis]-p[axis])+v*(r[axis]-p[axis]);
  }
  function estimate(fit, padding, uniform) {
    if (!Number.isFinite(padding) || padding < 0) throw Error('Enter a padding thickness of zero or more.');
    const hits = [[], [], []];
    geometry.visitSurface(fit.positions, tri => {
      const points = tri.map(p => local(p, fit));
      hits.forEach((values, axis) => {
        const x = crossing(points, axis);
        if (x !== null) values.push(x);
      });
    });
    const [lo, hi] = fit.headBounds;
    const scale = hits.map((vals, axis) => {
      function inside(sign) {
        const sorted = vals.map(x => x*sign).filter(x => x>0).sort((a,b) => a-b);
        const distinct = sorted.filter((x,i) => i===0 || x-sorted[i-1]>.001);
        if (distinct.length!==2) throw Error('An opening or extra wall crosses the measurement line. Adjust the scale by eye and check the shell from several angles.');
        return distinct[0];
      }
      const pivot = fit.center[axis] + fit.offset[axis];
      if (pivot <= lo[axis] || pivot >= hi[axis]) throw Error('Position the helmet around the head before estimating scale.');
      const plus = (hi[axis]-pivot+padding)/inside(1);
      // Many helmets are open at the neck; use the inner crown for height.
      return axis===2 ? plus : Math.max(plus,(pivot-lo[axis]+padding)/inside(-1));
    });
    if (scale.some(n => !Number.isFinite(n)||n<.05||n>10)) throw Error('Check the STL units and alignment before scaling.');
    return uniform ? Array(3).fill(Math.max(...scale)) : scale;
  }
  function fittedSTL(fit) {
    const bytes = new ArrayBuffer(84+50*fit.shell.count), out = new DataView(bytes);
    out.setUint32(80,fit.shell.count,true);
    geometry.visitSurface(fit.positions,(tri,index) => {
      const [p,q,r] = tri.map(point => place(point,fit));
      const a = q.map((v,i)=>v-p[i]), b = r.map((v,i)=>v-p[i]);
      const n = [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const length = Math.hypot(...n)||1;
      [...n.map(v=>v/length),...p,...q,...r].forEach((v,i)=>out.setFloat32(84+index*50+i*4,v,true));
    });
    return bytes;
  }
  // Test the plane against source vertices. Only crossing edges need a world transform.
  function sliceSurface(positions, normal, level, toWorld) {
    const lines = [], [nx, ny, nz] = normal;
    function distance(i) {
      return positions[i]*nx + positions[i+1]*ny + positions[i+2]*nz - level;
    }
    function intersection(i, j, da, db) {
      const t = da/(da-db);
      const p = [0,1,2].map(k => positions[i+k] + t*(positions[j+k]-positions[i+k]));
      return toWorld ? toWorld(p) : p;
    }
    for (let i=0; i<positions.length; i+=9) {
      const a=distance(i), b=distance(i+3), c=distance(i+6);
      if ((a>0)===(b>0) && (b>0)===(c>0)) continue;
      const segment=[];
      if ((a>0)!==(b>0)) segment.push(intersection(i,i+3,a,b));
      if ((b>0)!==(c>0)) segment.push(intersection(i+3,i+6,b,c));
      if ((c>0)!==(a>0)) segment.push(intersection(i+6,i,c,a));
      lines.push(segment);
    }
    return lines;
  }
  // Combined head and shell limits, relative to the head center, in millimetres.
  function sliceRange(fit, axis) {
    const row=fit.rotation.slice(axis*3,axis*3+3);
    const cache=fit.sliceBounds || (fit.sliceBounds=[]);
    if(!cache[axis] || row.some((v,i)=>v!==cache[axis].row[i])) {
      const p=fit.positions, [x,y,z]=row;
      let lo=Infinity,hi=-Infinity;
      for(let i=0;i<p.length;i+=3){
        const value=x*p[i]+y*p[i+1]+z*p[i+2];
        lo=Math.min(lo,value);hi=Math.max(hi,value);
      }
      const origin=row.reduce((v,n,i)=>v+n*fit.origin[i],0);
      cache[axis]={row,lo:lo-origin,hi:hi-origin};
    }
    const {lo,hi}=cache[axis], scale=fit.scale[axis],offset=fit.offset[axis];
    return [Math.floor(Math.min(fit.headBounds[0][axis]-fit.center[axis],lo*scale+offset)),
      Math.ceil(Math.max(fit.headBounds[1][axis]-fit.center[axis],hi*scale+offset))];
  }
  function crossSection(fit, head, headBytes, axis, plane=fit.center[axis]) {
    if (fit.cutHead?.mesh!==head || fit.cutHead.bytes!==headBytes) {
      let positions;
      if(headBytes) positions=geometry.surface(headBytes);
      else {
        positions=new Float32Array(head.faces.length*9);
        head.faces.forEach((f,i)=>f.forEach((v,j)=>positions.set(head.vertices[v],9*i+3*j)));
      }
      fit.cutHead={mesh:head,bytes:headBytes,positions};
    }
    const cut=fit.cutHead;
    if(cut.axis!==axis || cut.plane!==plane) {
      const normal=[0,0,0]; normal[axis]=1;
      cut.lines=sliceSurface(cut.positions,normal,plane);
      cut.axis=axis; cut.plane=plane;
    }
    const row=fit.rotation.slice(3*axis,3*axis+3);
    const level=row.reduce((n,v,i)=>n+v*fit.origin[i],0)+(plane-fit.center[axis]-fit.offset[axis])/fit.scale[axis];
    return {headLines:cut.lines,shellLines:sliceSurface(fit.positions,row,level,p=>place(p,fit))};
  }
  return {start, turn, preview, estimate, fittedSTL, bounds, crossSection, sliceRange};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createHelmetFitting;
