// Optional real scan: node tests/imported-head.cjs /path/to/head.stl
// The STL stays local. All browser data lives in isolated temporary contexts.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const G=require('../src/geometry');

function denseHead(){
  const head=G.generate();
  // Subdivision gives a continuous surface large enough to reproduce the old face-skipping bug.
  while(head.faces.length<30000){
    const next=[];
    for(const [a,b,c] of head.faces){
      const midpoint=(i,j)=>{head.vertices.push(head.vertices[i].map((v,k)=>(v+head.vertices[j][k])/2));return head.vertices.length-1;};
      const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
      next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
    }
    head.faces=next;
  }
  return Buffer.from(G.binarySTL(head));
}
(async()=>{
  const bytes=process.argv[2]?await fs.readFile(process.argv[2]):denseHead();
  const raw=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const count=G.readSTL(raw,()=>{});assert(count>7000,'Use a dense scan for this regression');
  const shell=Buffer.from(G.binarySTL(G.generate()));
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    for(const software of [false,true]){
      const context=await browser.newContext({viewport:{width:1250,height:850},acceptDownloads:true});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const click=name=>page.getByRole('button',{name,exact:true}).click();
      const heading=name=>page.getByRole('heading',{name,exact:true}).waitFor();
      const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/HeadRoom.html')).href);
      await heading('Choose a head');
      const instrument=software=>{
        if(software){
          THREE.WebGLRenderer=class{constructor(){throw Error('WebGL disabled for fallback test');}};
          const raster=meshRaster;
          meshRaster=(...args)=>{
            let n=0;const reader=HeadRoomGeometry.readSTL;
            HeadRoomGeometry.readSTL=(raw,cb)=>reader(raw,(...a)=>{n++;cb(...a);});
            try{return raster(...args);}finally{HeadRoomGeometry.readSTL=reader;window.rasterTriangles=n;}
          };
        }else{
          THREE.WebGLRenderer=class extends THREE.WebGLRenderer{constructor(...args){
            super(...args);const render=this.render.bind(this);
            this.render=(scene,camera)=>{window.previewScene=scene;window.previewCamera=camera;render(scene,camera);};
          }};
        }
      };
      await page.evaluate(instrument,software);
      await page.locator('#file').setInputFiles({name:'Dense reference.stl',mimeType:'application/octet-stream',buffer:bytes});
      await heading('Review your head');await frames();
      async function checkHead(){
        if(software){
          assert(await page.locator('#view').isVisible());
          assert.equal(await page.evaluate(()=>window.rasterTriangles),count);
        }else{
          assert(await page.locator('#surface').isVisible());
          const sizes=await page.evaluate(()=>previewScene.children.filter(o=>o.isMesh).map(o=>o.geometry.attributes.position.count/3));
          assert.deepEqual(sizes,[count],'Head-only view must render every face and no leftover helmet');
        }
      }
      await checkHead();
      await page.screenshot({path:path.join(os.tmpdir(),'head-room-0.5.1-'+(software?'software':'full-surface')+'.png')});
      const canvas=page.locator(software?'#view':'#surface'),rect=await canvas.boundingBox();
      await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);
      if(!software){
        const before=await page.evaluate(()=>({camera:previewCamera.position.toArray(),zoom:previewCamera.zoom}));
        await page.mouse.wheel(0,150);await frames();
        assert((await page.evaluate(()=>previewCamera.zoom))<before.zoom,'Wheel zooms out');
        await page.mouse.down({button:'middle'});await page.mouse.move(rect.x+rect.width*.5+40,rect.y+rect.height*.5+20);await page.mouse.up({button:'middle'});await frames();
        assert.notDeepEqual(await page.evaluate(()=>previewCamera.position.toArray()),before.camera,'Middle drag pans');
      }
      await click('Reset view');await click('Add to saved heads');await heading('Try on a helmet');await frames();await checkHead();
      await click('Head details');await heading('Dense reference');await frames();await checkHead();
      const downloading=page.waitForEvent('download');await click('Export head STL');
      assert.deepEqual(await fs.readFile(await (await downloading).path()),bytes,'Original scan must remain byte-for-byte unchanged');
      await click('Try on a helmet');
      await page.locator('#helmetFile').setInputFiles({name:'Shell.stl',mimeType:'application/octet-stream',buffer:shell});
      await heading('Fit helmet');
      await page.getByLabel('Size (%)',{exact:true}).fill('91');
      await click('Back to head');await heading('Try on a helmet');await frames();await checkHead();
      await click('Head details');await heading('Dense reference');await click('Resume fitting');await heading('Fit helmet');await frames();
      assert.equal(await page.getByLabel('Size (%)',{exact:true}).inputValue(),'91');
      if(!software){
        assert(await page.locator('#surface').isVisible());
        const fit=await page.evaluate(()=>{
          const meshes=previewScene.children.filter(o=>o.isMesh);
          const head=meshes.find(o=>o.renderOrder===0),shell=meshes.find(o=>o.renderOrder===1);
          return {count:head.geometry.attributes.position.count/3,head:head.scale.toArray(),shell:shell.matrix.elements[0]};
        });
        assert.equal(fit.count,count);assert.deepEqual(fit.head,[1,1,1]);assert.equal(fit.shell,.91);
        await click('Top cut');await click('3D');
      }else assert(await page.locator('#view').isVisible());
      await click('Back to head');await click('Back to heads');await page.reload();
      await heading('Your heads');await page.evaluate(instrument,software);
      await page.getByRole('button',{name:'Try a helmet on Dense reference',exact:true}).click();
      await heading('Try on a helmet');await frames();await checkHead();
      assert.deepEqual(errors,[]);
      console.log(`Passed ${software?'software fallback':'WebGL'}: ${count} complete head triangles, review, saved-head reopen, unchanged source export, fit resume at 91%, no page errors.`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
