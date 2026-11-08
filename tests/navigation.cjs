// Run with Playwright and Chrome installed. All profiles and downloads use an isolated context.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const geometry = require('../src/geometry');
const pageURL = pathToFileURL(path.resolve(__dirname, '../dist/HeadRoom.html')).href;
const mannequin = Buffer.from(geometry.binarySTL(geometry.generate()));
const asFile = (name, buffer) => ({name, buffer, mimeType: 'application/octet-stream'});
const head = asFile('Reference.stl', mannequin);
const shell = asFile('Helmet.stl', mannequin);
const broken = asFile('Broken.stl', Buffer.from('invalid mesh'));
const measures = ['54 cm', '142', '180', '215'];

function controls(page) {
  const button = name => page.getByRole('button', {name:name==='Choose helmet STL'?/Choose helmet STL$/:name, exact:true});
  const click = name => button(name).click();
  const heading = name => page.getByRole('heading', {name, exact:true}).waitFor();
  async function choose(label, file) {
    const picked = page.waitForEvent('filechooser');
    await click(label);
    await (await picked).setFiles(file);
  }
  async function download(label) {
    const ready = page.waitForEvent('download');
    await click(label);
    const file = await ready;
    return {name:file.suggestedFilename(), data:await fs.readFile(await file.path())};
  }
  async function drop(files) {
    await page.evaluate(inputs=>{
      const dataTransfer = new DataTransfer();
      for(const f of inputs) dataTransfer.items.add(new File([Uint8Array.from(atob(f.data), c=>c.charCodeAt(0))], f.name));
      document.querySelector('.scene').dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer}));
    }, files.map(file=>({name:file.name, data:file.buffer.toString('base64')})));
  }
  return {button, click, heading, choose, download, drop};
}

async function walkthrough(page) {
  const {button, click, heading, choose, download, drop} = controls(page);
  const input = page.getByLabel('Your measurement');
  const size = page.getByLabel('Size (%)', {exact:true});
  const status = page.locator('#status');
  await page.goto(pageURL);
  await heading('Choose a head');
  assert(await page.getByRole('heading',{name:'Suggested tools'}).isVisible());
  assert.match(await page.getByRole('link',{name:/Printables/}).getAttribute('href'), /printables.com/);
  await choose('Use my own STL', []);await heading('Choose a head');
  await choose('Use my own STL', broken);await status.filter({hasText:/STL/}).waitFor();
  await click('Make my head');await click('Back');await heading('Choose a head');
  await click('Make my head');
  await input.fill('oops');assert(await button('Next').isDisabled());
  await input.fill('54 cm');await page.getByLabel('Measurement units').selectOption('in');
  assert(Math.abs(Number(await input.inputValue()) - 540/25.4)<.001);
  await input.fill('20 in');await page.getByLabel('Measurement units').selectOption('mm');
  assert.equal(await input.inputValue(),'508');
  for (const [i, value] of measures.entries()) {
    await input.fill(value);
    if(i===1){await click('Back');assert.equal(await input.inputValue(),'540');await click('Next');}
    await input.press('Enter');
  }
  await heading('Review your head');
  const name=page.getByLabel('Head name');
  await name.fill('Workshop');await click('Back');await click('Review my head');
  assert.equal(await name.inputValue(),'Workshop');await name.press('Enter');
  await heading('Try on a helmet');
  await click('Head details');await heading('Workshop');
  const exported=await download('Export head STL');assert(exported.data.length>84);
  await click('Edit measurements as new head');await input.fill('600');await click('Back');await heading('Workshop');
  assert.match(await page.locator('dl.values').innerText(),/540 mm/);
  await click('Edit measurements as new head');await input.fill('550');
  for(let i=0;i<3;i++) await click('Next');
  await click('Review my head');await click('Add to saved heads');await click('Back to heads');
  await button('Try a helmet on Workshop (2)').waitFor();await button('Try a helmet on Workshop').press('Enter');
  await heading('Try on a helmet');await choose('Choose helmet STL', []);await heading('Try on a helmet');
  await drop([shell, shell]);await status.filter({hasText:/one assembled/}).waitFor();
  await drop([shell]);await heading('Fit helmet');
  await size.fill('94');await page.getByLabel(/Helmet opacity/).fill('31');
  await click('Per axis');await page.getByLabel('Width (%)').fill('93');
  await page.getByLabel('Height (%)').fill('95');await click('Uniform');assert.equal(await size.inputValue(),'95');
  await page.getByText('Precise alignment',{exact:true}).click();
  for (const [i,label] of ['Right (mm)','Back (mm)','Up (mm)'].entries()) await page.getByLabel(label,{exact:true}).fill(String(i+1));
  for (const axis of ['Pitch','Roll','Turn']) await click(axis+' 90°');
  for (const mode of ['Front cut','Side cut','3D']) await click(mode);
  await click('Reset view');await click('Move');await click('Rotate');await click('Orbit');
  await page.getByLabel('Padding per side (mm)').fill('3');await click('Estimate helmet scale');
  assert.match(await status.innerText(),/opening|wall|adjust|rays|scale|align|Estimate/i);
  await size.fill('94');await choose('Change helmet',broken);await status.filter({hasText:/STL/}).waitFor();
  assert.equal(await size.inputValue(),'94');
  await click('Back to head');await click('Head details');await click('Resume fitting');
  assert.equal(await size.inputValue(),'94');assert.equal(await page.getByLabel('Right (mm)').inputValue(),'1');
  assert.equal(await page.getByLabel(/Helmet opacity/).inputValue(),'31');
  await click('Back to head');await choose('Change helmet', []);await click('Resume fitting');
  assert.equal(await size.inputValue(),'94');
  await click('Back to head');await click('Back to heads');await click('Try a helmet on Workshop');
  await heading('Fit helmet');assert.equal(await size.inputValue(),'94');
  await size.fill('0');await click('Download fitted helmet STL');assert.equal(await size.evaluate(el=>el.validity.valid),false);
  await size.fill('94');
  for (const [width,height] of [[810,575],[1280,760],[375,700]]) {
    await page.setViewportSize({width,height});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width>720){const box=await button('Download fitted helmet STL').boundingBox();assert(box.y+box.height<=height);}
  }
  const fitted=await download('Download fitted helmet STL');assert.equal(fitted.name,'Helmet-fitted.stl');
  assert.equal(fitted.data.readUInt32LE(80),mannequin.readUInt32LE(80));assert.notDeepEqual(fitted.data,mannequin);
  await choose('Change helmet',shell);await page.waitForFunction(()=>document.querySelector('.fit-fields input')?.value==='100');
  await click('Back to head');await click('Back to heads');await click('Try a helmet on Workshop (2)');
  await heading('Try on a helmet');assert.equal(await button('Resume fitting').count(),0);
  await click('Head details');await click('Try on a helmet');await heading('Try on a helmet');
  await click('Back to heads');await choose('Use my own STL',head);await heading('Review your head');await click('Back');
  await choose('Use my own STL',head);await heading('Review your head');await click('Add to saved heads');await heading('Try on a helmet');
  await click('Head details');const copy=await download('Export head STL');assert.deepEqual(copy.data,mannequin);
  assert.equal(await button('Edit measurements as new head').count(),0);
  await click('Back to heads');await page.reload();await click('Try a helmet on Reference');await heading('Try on a helmet');
  await choose('Choose helmet STL',shell);await heading('Fit helmet');
}

async function fallback(page) {
  const {click,heading,choose,button}=controls(page);
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args);};
    let receive, offset=0, interrupted=true;
    window.orca={onMessage:fn=>receive=fn,postMessage:msg=>{
      const send=answer=>setTimeout(()=>receive(answer),0);
      if(msg.type==='load')send({type:'loaded',heads:[{id:'one',name:'Sample'}]});
      if(msg.type==='getHead')send({type:'head',id:msg.id,profile:{name:'Sample',kind:'measured',values:{width:150,length:200,height:225,circumference:575}}});
      if(msg.type==='helmetBegin'){offset=0;send({type:'helmetReady',offset:interrupted?1:0});interrupted=false;}
      if(msg.type==='helmetChunk'){offset+=atob(msg.data).length;send({type:'helmetReady',offset});}
      if(msg.type==='helmetOpen')send({type:'helmetResult',path:'/example/Helmet-fitted.stl',message:'Open this file in OrcaSlicer.'});
    }};
  });
  await page.goto(pageURL);await click('Try a helmet on Sample');await choose('Choose helmet STL',shell);
  await heading('Fit helmet');assert.equal(await button('3D').count(),0);
  await click('Side cut');await click('Front cut');
  await click('Open fitted helmet in OrcaSlicer');await page.getByText(/Transfer interrupted/).waitFor();
  await click('Open fitted helmet in OrcaSlicer');await page.getByLabel('Saved STL path').waitFor();
  assert.equal(await page.getByLabel('Saved STL path').inputValue(),'/example/Helmet-fitted.stl');
  assert(await button('Back to head').isEnabled());
}
async function legacyLibrary(page) {
  const {click,heading}=controls(page);
  await page.goto(pageURL.replace(/HeadRoom\.html$/, ''));
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('head-room',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('profiles').add({
      name:'Legacy head',kind:'measured',values:{width:152,length:200,height:220,circumference:560}
    },'current');
    request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);
  }));
  await page.goto(pageURL);await click('Try a helmet on Legacy head');await click('Head details');
  await heading('Legacy head');assert.match(await page.locator('dl.values').innerText(),/560 mm/);
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    for(const test of [walkthrough,fallback,legacyLibrary]) {
      const page=await browser.newPage({viewport:{width:1200,height:770}}),errors=[];
      page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
      await test(page);assert.deepEqual(errors,[]);await page.context().close();console.log('Passed '+test.name);
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
