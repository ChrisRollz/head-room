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
      axes: [1, 2, 3], offset: [0, 0, 0], scale: [1, 1, 1]};
  }
  function turn(fit, axis) {
    const a = (axis + 1) % 3, b = (axis + 2) % 3;
    [fit.axes[a], fit.axes[b]] = [-fit.axes[b], fit.axes[a]];
  }
  function local(p, fit) {
    return fit.axes.map(axis => {
      const i = Math.abs(axis) - 1;
      return Math.sign(axis) * (p[i] - fit.origin[i]);
    });
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
    geometry.readSTL(fit.bytes, tri => {
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
    geometry.readSTL(fit.bytes,(tri,index) => {
      const [p,q,r] = tri.map(point => place(point,fit));
      const a = q.map((v,i)=>v-p[i]), b = r.map((v,i)=>v-p[i]);
      const n = [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const length = Math.hypot(...n)||1;
      [...n.map(v=>v/length),...p,...q,...r].forEach((v,i)=>out.setFloat32(84+index*50+i*4,v,true));
    });
    return bytes;
  }
  function crossSection(fit, head, headBytes, axis) {
    function cut(tri, lines) {
      const points = [];
      for (let i=0;i<3;i++) {
        const a=tri[i], b=tri[(i+1)%3], da=a[axis]-fit.center[axis], db=b[axis]-fit.center[axis];
        if ((da>0)===(db>0)) continue;
        const t=da/(da-db); points.push(a.map((v,k)=>v+t*(b[k]-v)));
      }
      if(points.length===2) lines.push(points);
    }
    const headLines=[], shellLines=[];
    if(headBytes) geometry.readSTL(headBytes,tri=>cut(tri,headLines));
    else for(const face of head.faces) cut(face.map(i=>head.vertices[i]),headLines);
    geometry.readSTL(fit.bytes,tri=>cut(tri.map(p=>place(p,fit)),shellLines));
    return {headLines,shellLines};
  }
  return {start, turn, preview, estimate, fittedSTL, bounds, crossSection};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createHelmetFitting;
