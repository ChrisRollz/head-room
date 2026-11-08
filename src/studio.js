// The same r128 orbit and local-space transformation handles as the Berserk fitting viewer.
// Render only on interaction. The proxy has the shell's pose; neither the head nor the camera is its child.
function createFitStudio(canvas,onPose){
  const T=window.THREE, ren=new T.WebGLRenderer({canvas,alpha:true,antialias:true});
  ren.setPixelRatio(Math.min(devicePixelRatio||1,2));ren.outputEncoding=T.sRGBEncoding;
  const scene=new T.Scene(),cam=new T.OrthographicCamera(-1,1,1,-1,.1,50000);
  cam.up.set(0,0,1);
  const orbit=new T.OrbitControls(cam,canvas);orbit.mouseButtons.MIDDLE=T.MOUSE.PAN;
  orbit.minZoom=.06;orbit.maxZoom=30;orbit.zoomSpeed=.9;
  const pivot=new T.Group(),gizmo=new T.TransformControls(cam,canvas);gizmo.setSpace('local');gizmo.setSize(.85);
  scene.add(pivot,gizmo,new T.HemisphereLight(0xf2fffd,0x828998,.88));
  for(const [x,y,z,power] of [[-2,-3,5,.88],[3,2,2,.38]]){
    const light=new T.DirectionalLight(0xffffff,power);light.position.set(x,y,z);scene.add(light);
  }
  const headMat=new T.MeshStandardMaterial({color:0x92d9c3,roughness:.85,side:T.DoubleSide});
  const shellMat=new T.MeshStandardMaterial({color:0xe0b57c,roughness:.72,side:T.DoubleSide,transparent:true,opacity:.5,depthWrite:false});
  headMat.color.convertSRGBToLinear();shellMat.color.convertSRGBToLinear();
  // Nearest shell surface only, so 50% means one translucent layer even on a thick-walled STL.
  const depthMat=new T.MeshBasicMaterial({colorWrite:false,side:T.DoubleSide});
  let active=null,skull,shell,depthShell,span=300,raf=0;
  let navPress=false;
  canvas.addEventListener('pointerdown',e=>{navPress=e.shiftKey||e.ctrlKey||e.metaKey||e.button!==0;},true);
  const begin=gizmo.pointerDown.bind(gizmo);gizmo.pointerDown=p=>{if(!navPress)begin(p);};
  function draw(){if(!active||raf)return;raf=requestAnimationFrame(()=>{raf=0;if(!active)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    const ratio=w/h;cam.top=span/2*Math.max(1,1/ratio);cam.bottom=-cam.top;cam.right=cam.top*ratio;cam.left=-cam.right;
    cam.updateProjectionMatrix();if(w!==ren.domElement.clientWidth||ren.domElement.width!==Math.floor(w*ren.getPixelRatio())||ren.domElement.height!==Math.floor(h*ren.getPixelRatio()))ren.setSize(w,h,false);ren.render(scene,cam);});}
  new ResizeObserver(draw).observe(canvas);orbit.addEventListener('change',draw);gizmo.addEventListener('change',draw);
  gizmo.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;});
  const R=new T.Matrix4(),S=new T.Matrix4(),V=new T.Vector3();
  function apply(){const f=active;if(!f)return;
    const [a,b,c,d,e,g,h,i,j]=f.rotation;
    R.set(a,b,c,0,d,e,g,0,h,i,j,0,0,0,0,1);
    pivot.quaternion.setFromRotationMatrix(R);pivot.position.fromArray(f.center).add(V.fromArray(f.offset));
    shell.matrix.copy(R).premultiply(S.makeScale(...f.scale)).setPosition(pivot.position);shell.matrixWorldNeedsUpdate=true;depthShell.matrix.copy(shell.matrix);depthShell.matrixWorldNeedsUpdate=true;draw();
  }
  gizmo.addEventListener('objectChange',()=>{if(!active)return;
    const r=R.makeRotationFromQuaternion(pivot.quaternion).elements;
    active.rotation=[r[0],r[4],r[8],r[1],r[5],r[9],r[2],r[6],r[10]];
    active.offset=pivot.position.toArray().map((v,i)=>v-active.center[i]);apply();onPose();});
  function tool(mode){if(mode==='orbit')gizmo.detach();
    else{gizmo.setMode(mode);gizmo.attach(pivot);}draw();}
  function reset(){if(!active)return;const c=active.center;
    orbit.target.fromArray(c);cam.position.fromArray(c).add(V.set(.53,-1,.27).normalize().multiplyScalar(span*3));
    cam.zoom=1;cam.updateProjectionMatrix();orbit.update();draw();}
  function geometry(pos){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.computeVertexNormals();return g;}
  function stop(){gizmo.detach();active=null;for(const m of [skull,shell])if(m){scene.remove(m);m.geometry.dispose();}
    if(depthShell)scene.remove(depthShell);skull=shell=depthShell=null;orbit.enabled=true;}
  function start(f,head,headBytes){stop();active=f;
    let geom;
    if(headBytes)geom=geometry(HeadRoomGeometry.surface(headBytes));
    else{geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(head.vertices.flat(),3));geom.setIndex(head.faces.flat());geom.computeVertexNormals();}
    skull=new T.Mesh(geom,headMat);
    // Keep the full source coordinate array immutable for sections and export.
    geom=geometry(f.positions.slice());geom.translate(...f.origin.map(v=>-v));
    shell=new T.Mesh(geom,shellMat);shell.matrixAutoUpdate=false;shell.renderOrder=1;scene.add(skull,shell);
    depthShell=new T.Mesh(geom,depthMat);depthShell.matrixAutoUpdate=false;depthShell.renderOrder=.5;scene.add(depthShell);
    function radius(pos,origin){let r2=0;for(let i=0;i<pos.length;i+=3)r2=Math.max(r2,(pos[i]-origin[0])**2+(pos[i+1]-origin[1])**2+(pos[i+2]-origin[2])**2);return Math.sqrt(r2);}
    span=2.23*Math.max(radius(geom.attributes.position.array,[0,0,0]),radius(skull.geometry.attributes.position.array,f.center));
    apply();reset();tool('orbit');}
  function opacity(v){if(depthShell)depthShell.visible=v>0&&v<1;shellMat.opacity=v;shellMat.transparent=v<1;shellMat.depthWrite=v>=1;shellMat.needsUpdate=true;draw();}
  return {start,apply,tool,reset,stop,opacity,draw};
}

// Render each library portrait from the wearer's mesh, even when WebGL is unavailable.
function headPortrait(profile,G,decode){
  const raw=profile.kind==='stl'?decode(profile.data):null;
  return meshPortrait(raw?G.inspectSTL(raw):G.generate(profile.values),G,raw);
}
function meshPortrait(mesh,G,raw=null,helmet=false){
  const W=240,H=200,c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d'),img=ctx.createImageData(W,H),depth=new Float32Array(W*H).fill(Infinity);
  const [lo,hi]=createHelmetFitting(G).bounds(mesh),ctr=lo.map((v,i)=>(v+hi[i])/2);
  const k=H*.83/Math.max(...hi.map((v,i)=>v-lo[i])),yaw=-.48,cy=Math.cos(yaw),sy=Math.sin(yaw);
  function proj(p){const x=p[0]-ctr[0],y=p[1]-ctr[1],z=p[2]-ctr[2],d=x*sy+y*cy;
    return [W/2+k*(x*cy-y*sy),H*.5-k*(z*.993+d*.12),d*.993-z*.12];}
  function tri(points){
    const [a,b,c]=points.map(proj),ux=b[0]-a[0],uy=b[1]-a[1],uz=(b[2]-a[2])*k,vx=c[0]-a[0],vy=c[1]-a[1],vz=(c[2]-a[2])*k;
    const nz=ux*vy-uy*vx;if(Math.abs(nz)<.00001)return;
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,light=Math.max(0,(nx*.35+ny*.55+nz*.66)*Math.sign(nz)/(Math.hypot(nx,ny,nz)||1));
    const rgb=helmet?[146+101*light,119+99*light,79+89*light]:[99+123*light,135+99*light,132+92*light];
    for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])));y<=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1])));y++){
      for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])));x<=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0])));x++){
        const dx=x+.5-a[0],dy=y+.5-a[1],s=(dx*vy-dy*vx)/nz,t=(ux*dy-uy*dx)/nz;if(s<0||t<0||s+t>1)continue;
        const i=y*W+x,d=a[2]+(s*uz+t*vz)/k;if(d>=depth[i])continue;depth[i]=d;
        img.data[i*4]=rgb[0];img.data[i*4+1]=rgb[1];img.data[i*4+2]=rgb[2];img.data[i*4+3]=255;
      }}
  }
  if(raw)G.readSTL(raw,tri);else mesh.faces.forEach(f=>tri(f.map(i=>mesh.vertices[i])));
  ctx.putImageData(img,0,0);return c.toDataURL();
}
