const {spawn}=require('node:child_process'), fs=require('node:fs'), assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path'), os=require('node:os');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'headroom-viewport-'));
const helmet=process.argv[2];
if(!helmet)throw Error('Usage: node tests/viewport.cjs /path/to/shell.stl (set CHROME_BIN outside macOS)');
const input=fs.readFileSync(helmet);
const n=require('../src/geometry.js').readSTL(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength),()=>{});
const page=path.resolve(__dirname,'../dist/HeadRoom.html');
const chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--disable-background-networking','--disable-extensions','--user-data-dir='+fs.mkdtempSync(tmp+'/chrome-'),'--remote-debugging-pipe','--window-size=1250,800'],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let id=0,pending=new Map(),buf='';const errors=[];
chrome.stderr.on('data',()=>{});
chrome.stdio[4].on('data',chunk=>{buf+=chunk;let cut;while((cut=buf.indexOf('\0'))>=0){const m=JSON.parse(buf.slice(0,cut));buf=buf.slice(cut+1);if(m.id&&pending.has(m.id)){const f=pending.get(m.id);pending.delete(m.id);m.error?f[1](Error(m.error.message)):f[0](m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);}});
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{pending.set(++id,[resolve,reject]);chrome.stdio[3].write(JSON.stringify({id,method,params,sessionId})+'\0');});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
chrome.on('exit',()=>{fs.rmSync(tmp,{recursive:true,force:true,maxRetries:4,retryDelay:75});});
const timer=setTimeout(()=>{console.error('browser check timeout');chrome.kill();process.exit(1);},60000);
(async()=>{
 const {targetId}=await call('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 const send=(m,p)=>call(m,p,sessionId);await send('Runtime.enable');await send('Page.enable');
 const evalJS=async exp=>{const r=await send('Runtime.evaluate',{expression:exp,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;};
 const click=name=>evalJS('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==='+JSON.stringify(name)+').click()');
 const until=async exp=>{for(let i=0;i<100;i++){if(await evalJS(exp))return;await delay(40);}throw Error(exp);};
 await send('Page.navigate',{url:pathToFileURL(page).href});await until('document.querySelector("h2")?.textContent==="Choose a head"');

 await click('Make my head');
 for(const [i,val] of ['565','154','193','225'].entries()){await evalJS('distance.value='+val+';distance.dispatchEvent(new Event("input"));');await click(i===3?'Review my head':'Next');}
 await evalJS('headName.value="Studio reference"');await click('Add to saved heads');await until('document.querySelector("h2")?.textContent==="Try on a helmet"');
 await click('Back to heads');await until('document.querySelector(".head-tile img")?.naturalWidth>0');
 await evalJS('document.querySelector(".head-tile").click()');await until('document.querySelector("h2")?.textContent==="Try on a helmet"');
 await evalJS('THREE.WebGLRenderer=class extends THREE.WebGLRenderer{constructor(...a){super(...a); const original=this.render.bind(this);this.render=(s,c)=>{window.vScene=s;window.vCam=c;original(s,c);};}};true');
 const {root}=await send('DOM.getDocument'); const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#helmetFile'});
 await send('DOM.setFileInputFiles',{nodeId,files:[path.resolve(helmet)]});
 await until('document.querySelector("h2")?.textContent==="Fit helmet"');
 await until('window.vScene && !surface.hidden && vScene.children.some(o=>o.renderOrder===1)');
 const state=()=>evalJS('(()=>{const h=vScene.children.find(o=>o.isMesh&&o.renderOrder===0),s=vScene.children.find(o=>o.isMesh&&o.renderOrder===1);return {head:h.matrixWorld.toArray(),shell:s.matrixWorld.toArray(),camera:vCam.matrixWorld.toArray(),zoom:vCam.zoom,opacity:s.material.opacity,tris:s.geometry.attributes.position.count/3};})()');
 const first=await state();assert.equal(first.tris,n);assert.equal(first.opacity,.5);
 const setValue=async(sel,value)=>{await evalJS('(()=>{const el=document.querySelector('+JSON.stringify(sel)+');el.value='+value+';el.dispatchEvent(new Event("input"));})()');await delay(90);};
 await setValue('.fit-fields input',91);const scaled=await state();assert.deepEqual(scaled.camera,first.camera);assert.deepEqual(scaled.head,first.head);assert.equal(scaled.shell[0],.91);
 await setValue('#opacity',25);assert.equal((await state()).opacity,.25);
 const point=await evalJS('(()=>{const r=surface.getBoundingClientRect();return {x:Math.round(r.x+r.width*.5),y:Math.round(r.y+r.height*.5)};})()');
 const mouse=(type,p)=>send('Input.dispatchMouseEvent',{type,...point,...p});
 await mouse('mouseWheel',{deltaX:0,deltaY:120});await delay(120);assert((await state()).zoom<1);
 async function pan(button,modifiers){const before=await state();await mouse('mousePressed',{button,buttons:button==='left'?1:4,clickCount:1,modifiers});await mouse('mouseMoved',{x:point.x+40,y:point.y+25,buttons:button==='left'?1:4,modifiers});await mouse('mouseReleased',{x:point.x+40,y:point.y+25,button,modifiers});await delay(85);const after=await state();assert.notDeepEqual(after.camera,before.camera);assert.deepEqual(after.shell,before.shell);}
 await pan('middle',0);await pan('left',8);await click('Reset view');await delay(80);
 const drag=async(label)=>{await click(label);await send('Page.captureScreenshot',{format:'png'});
 // Aim at a whole CSS pixel inside the handle, not a fractional pixel on its edge.
 const aim=await evalJS(`(()=>{
   const g=vScene.children.find(o=>o.getMode),r=surface.getBoundingClientRect(),rc=new THREE.Raycaster();
   const hit=(x,y)=>{rc.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),vCam);
     return rc.intersectObject(g.children[0].picker[g.getMode()],true).find(h=>h.object.visible)?.object.name;};
   const p=g.object.position.clone().project(vCam),cx=Math.round(r.x+(1+p.x)*r.width/2),cy=Math.round(r.y+(1-p.y)*r.height/2);
   for(let margin of [1,0])for(let j=-170;j<=170;j+=3)for(let i=-170;i<=170;i+=3){
     const x=cx+i,y=cy+j;if(hit(x,y)==='X'&&hit(x+margin,y)==='X'&&hit(x-margin,y)==='X'&&hit(x,y+margin)==='X'&&hit(x,y-margin)==='X')return {x,y};
   }return null;})()`);
 assert(aim,'visible X handle for '+label);const before=await state();
 await mouse('mouseMoved',aim);await until('vScene.children.find(o=>o.getMode).axis==="X"');
 await mouse('mousePressed',{...aim,button:'left',buttons:1,clickCount:1});await until('vScene.children.find(o=>o.getMode).dragging');
 await mouse('mouseMoved',{x:aim.x+24,y:aim.y-21,buttons:1});await mouse('mouseReleased',{x:aim.x+24,y:aim.y-21,button:'left'});
 await evalJS('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const after=await state();assert.notDeepEqual(after.shell,before.shell,label);assert.deepEqual(after.head,before.head);assert.deepEqual(after.camera,before.camera);};
 await drag('Move');await drag('Rotate');await click('Orbit');
 await click('Front cut');assert(await evalJS('!view.hidden && surface.hidden'));await click('Side cut');await click('3D');await delay(80);
 await send('Emulation.setDeviceMetricsOverride',{width:375,height:700,deviceScaleFactor:1,mobile:false});await delay(100);
 assert(await evalJS('document.documentElement.scrollWidth<=innerWidth'));
 assert.deepEqual(errors,[]);console.log('Passed full-resolution STL, one-click portrait, 50% opacity, unchanged head and camera at 91%, wheel zoom, middle/Shift pan, physical X handle drags for move and rotate, sections and narrow layout.');
 await call('Browser.close');clearTimeout(timer);
})().catch(e=>{console.error(e);clearTimeout(timer);chrome.kill();process.exitCode=1;});
