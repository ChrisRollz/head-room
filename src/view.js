function createHeadView(canvas) {
  const ctx=canvas.getContext('2d');
  let mesh, guide, shell=null, section=null, yaw=-.38, pitch=.12, center=[0,0,114], extent=275, headExtent=275, last=null,zoom=1,pan=[0,0],panning=false;
  const poses={circumference:[-.45,.32],width:[0,.02],length:[1.45,.10],height:[1.33,.04]};
  function reset(){zoom=1;pan=[0,0];[yaw,pitch]=section ? [section.axis===0?Math.PI/2:0,0] : poses[guide]||[-.38,.12];draw();}
  function draw(){
    if(!mesh)return;
    const w=canvas.clientWidth,h=canvas.clientHeight, dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const scale=Math.min(w*.82,h*.84)*zoom/extent, cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    function project(p){
      const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2],depth=y*cy+x*sy;
      return [w/2+pan[0]+(x*cy-y*sy)*scale,h*.49+pan[1]-(z*cp+depth*sp)*scale,depth*cp-z*sp];
    }
    function line(points,color,width){
      ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
    }
    const ground=mesh.mins?.[2]??0, unit=extent/10;
    for(let i=-5;i<=5;i++) for(let axis=0;axis<2;axis++){
      const p=axis?[i*unit,-5*unit,ground]:[-5*unit,i*unit,ground],q=axis?[i*unit,5*unit,ground]:[5*unit,i*unit,ground];
      line([p,q].map(a=>project([a[0]+center[0],a[1]+center[1],ground])),'#384950',1);
    }
    if(section){
      for(const segment of section.headLines) line(segment.map(project),'#9de6ce',2);
      for(const segment of section.shellLines) line(segment.map(project),'#ffd084',2);
      return;
    }
    const points=mesh.vertices.map(project);
    const faces=mesh.faces.map(f=>{const [a,b,c]=f.map(i=>points[i]);return {a,b,c,z:a[2]+b[2]+c[2]};});
    faces.sort((a,b)=>b.z-a.z);
    for(const {a,b,c} of faces){
      const u=b.map((v,i)=>v-a[i]),v=c.map((p,i)=>p-a[i]);
      // Camera-space normals account for the different screen and depth units.
      const nx=(u[1]*v[2]-u[2]*v[1])/scale,ny=(u[2]*v[0]-u[0]*v[2])/scale,nz=(u[0]*v[1]-u[1]*v[0])/(scale*scale);
      const mag=Math.hypot(nx,ny,nz)||1, shade=Math.min(1,Math.max(.14,.43+(-.28*nx-.50*ny-.55*nz)/mag));
      const color='rgb('+[64+145*shade,79+137*shade,80+131*shade].map(Math.round).join(',')+')';
      ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.closePath();
      ctx.fillStyle=color;ctx.fill();ctx.lineWidth=.55;ctx.strokeStyle=color;ctx.stroke();
    }
    const g=mesh.guides?.[guide];if(!g)return;
    let overlay=g;
    if(guide==='height'){
      const y=-mesh.actual.length*.74;overlay=[[0,y,0],[0,y,mesh.actual.height]];
      for(let i=0;i<2;i++)line([project(g[i]),project(overlay[i])],'#a4c8be',1);
    }
    if(guide==='circumference'){
      const loop=overlay.map(project),mid=loop.reduce((s,p)=>s+p[2],0)/loop.length;
      for(let i=1;i<loop.length;i++){
        const back=(loop[i-1][2]+loop[i][2])/2>mid;
        if(!back||i%3!==0)line([loop[i-1],loop[i]],back?'#b9ab89':'#ffe099',back?1.4:3);
      }
    }else line(overlay.map(project),'#ffe099',3);
    if(overlay.length===2)for(const p of overlay){const [x,y]=project(p);ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fillStyle='#ffe099';ctx.fill();}
  }
  canvas.addEventListener('pointerdown',e=>{panning=e.shiftKey||e.button===1||e.button===2;if(section&&!panning)return;e.preventDefault();last=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!last)return;const dx=e.clientX-last[0],dy=e.clientY-last[1];
    if(panning){pan[0]+=dx;pan[1]+=dy;}else{yaw+=dx*.012;pitch=Math.max(-1.2,Math.min(1.2,pitch+dy*.008));}
    last=[e.clientX,e.clientY];draw();});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.06,Math.min(30,zoom*Math.exp(-Math.sign(e.deltaY)*.12)));draw();},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('lostpointercapture',()=>{last=null;});
  new ResizeObserver(draw).observe(canvas);
  return {reset,fit(overlay,cut){const previous=section?.axis;shell=overlay;section=cut;
    extent=headExtent*1.4;
    if(previous!==section?.axis)reset();else draw();
  },show(m,g,turn=false){mesh=m;guide=g;shell=null;section=null;
    if(m.mins){center=m.mins.map((v,i)=>(v+m.maxs[i])/2);extent=Math.max(...m.maxs.map((v,i)=>v-m.mins[i]))*1.12;}
    else{center=[0,0,m.actual.height/2];extent=Math.max(m.actual.height*1.08,m.actual.length*1.12,m.actual.width*1.12);}
    headExtent=extent;document.querySelector('.hud span').textContent='Drag to rotate';
    if(turn)reset();else draw();
  }};
}
