// Distances refer to uncompressed foam at the center of each pad, not a whole-shell fit verdict.
const Clearances=(()=>{
  const zones=['Left temple','Right temple','Forehead','Back','Crown'];
  const axes=[[1,0,0],[-1,0,0],[0,-1,0],[0,1,0],[0,0,1]];
  const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),norm=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
  const plus=(a,b,k=1)=>a.map((n,i)=>n+k*b[i]),sub=(a,b)=>plus(a,b,-1);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function vector(f,v,inverse=false){
    const r=f.rotation,s=f.scale;
    return inverse?[0,1,2].map(i=>r[i]*v[0]/s[0]+r[3+i]*v[1]/s[1]+r[6+i]*v[2]/s[2]):
      [0,1,2].map(i=>s[i]*(r[3*i]*v[0]+r[3*i+1]*v[1]+r[3*i+2]*v[2]));
  }
  // Möller–Trumbore, both signs, no allocation per triangle. Distances use input ray units.
  function hits(p,o,d){
    const out=[],[dx,dy,dz]=d;
    for(let i=0;i<p.length;i+=9){
      const ax=p[i],ay=p[i+1],az=p[i+2],ex=p[i+3]-ax,ey=p[i+4]-ay,ez=p[i+5]-az,fx=p[i+6]-ax,fy=p[i+7]-ay,fz=p[i+8]-az;
      const hx=dy*fz-dz*fy,hy=dz*fx-dx*fz,hz=dx*fy-dy*fx,det=ex*hx+ey*hy+ez*hz;if(Math.abs(det)<1e-10)continue;
      const x=o[0]-ax,y=o[1]-ay,z=o[2]-az,u=(x*hx+y*hy+z*hz)/det;if(u< -1e-8||u>1.00000001)continue;
      const qx=y*ez-z*ey,qy=z*ex-x*ez,qz=x*ey-y*ex,v=(dx*qx+dy*qy+dz*qz)/det;
      if(v< -1e-8||u+v>1.00000001)continue;
      out.push((fx*qx+fy*qy+fz*qz)/det);
    }
    out.sort((a,b)=>a-b);return out.filter((n,i)=>!i||Math.abs(n-out[i-1])>.005);
  }
  function anchors(f){
    const size=f.headBounds[1].map((n,i)=>n-f.headBounds[0][i]);
    return axes.map((axis,i)=>{
      // Crown crests and visor slots often coincide with symmetry axes. Try nearby
      // attachment sites within the same anatomical zone, never bridge an opening.
      const candidates=i===4?[[0,0,0],[.045,0,0],[-.045,0,0],[.09,.035,0],[-.09,.035,0],[0,.10,0]]:
        (i===2?[.16,.22,.28,.30]:[.10,.14,.06]).flatMap(z=>[0,.05,-.05].map(t=>i<2?[0,t,z]:[t,0,z]));
      for(const c of candidates){
        const off=c.map((v,j)=>v*size[j]),local=plus(f.origin,vector(f,off,true)),dir=vector(f,axis,true);
        const positive=hits(f.positions,local,dir).filter(n=>n>0);
        if(positive.length===2)return {p:plus(local,dir,positive[0]),d:norm(dir)};
      }
      return null;
    });
  }
  function headSurface(mesh,raw,G){if(raw)return G.surface(raw);
    const a=new Float32Array(mesh.faces.length*9);
    mesh.faces.forEach((f,i)=>f.forEach((v,j)=>a.set(mesh.vertices[v],i*9+j*3)));return a;
  }
  function sample(f,a,surface){
    const dir=norm(vector(f,a.d)),p=plus(plus(f.center,f.offset),vector(f,sub(a.p,f.origin)));
    const distances=hits(surface,p,dir);
    return {p,dir,gap:distances.length?-distances[distances.length-1]:null};
  }
  function inspect(f,surface,thickness,enabled){
    if(!thickness)return [];
    f.padAnchors??=anchors(f);
    const key=JSON.stringify([f.scale,f.rotation,f.offset,thickness,enabled,f.padAnchors]);
    if(f.padCache?.key===key)return f.padCache.rows;
    const rows=f.padAnchors.map((a,i)=>{
      if(!enabled.includes(i)||!a)return null;
      const s=sample(f,a,surface),u=norm(cross(s.dir,Math.abs(s.dir[2])>.85?[1,0,0]:[0,0,1])),v=cross(s.dir,u);
      const radius=Math.min(14,...f.headBounds[1].map((n,j)=>(n-f.headBounds[0][j])*.085));
      const tris=[],ring=(j,k)=>plus(plus(plus(s.p,s.dir,-k*thickness),u,radius*Math.cos(j*Math.PI/12)),v,radius*Math.sin(j*Math.PI/12));
      for(let j=0;j<24;j++){
        const a=ring(j,0),b=ring(j+1,0),c=ring(j,1),d=ring(j+1,1);
        tris.push(...s.p,...a,...b,...plus(s.p,s.dir,-thickness),...d,...c,...a,...c,...d,...a,...d,...b);
      }
      return {...s,short:s.gap!=null&&s.gap<thickness,positions:new Float32Array(tris)};
    });
    f.padCache={key,rows};return rows;
  }
  function suggest(f,surface,thickness,enabled){
    if(!enabled.length)throw Error('Choose at least one pad location.');
    f.padAnchors??=anchors(f);
    if(enabled.some(i=>!f.padAnchors[i]))throw Error('An opening or extra wall prevents a scale suggestion at a selected pad. Check that location in a cut, or deselect it.');
    const room=k=>{
      const t={...f,scale:f.scale.map(x=>x*k)};
      return enabled.every(i=>{const gap=sample(t,f.padAnchors[i],surface).gap;return gap!==null&&gap>=thickness;});
    };
    let hi=1;while(hi<4&&!room(hi))hi*=1.15;
    if(!room(hi))throw Error('Could not find a supported fit. Align the shell and inspect the cuts.');
    let lo=.05;for(let n=0;n<17;n++){const k=(lo+hi)/2;if(room(k))hi=k;else lo=k;}
    const result=f.scale.map(x=>x*hi);if(result.some(n=>n<.05||n>10))throw Error('Suggested scale is outside the supported range.');return result;
  }
  return {zones,anchors,inspect,headSurface,suggest};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Clearances;
