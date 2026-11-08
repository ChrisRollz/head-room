(() => {
  const G=HeadRoomGeometry, $=id=>document.getElementById(id);
  const view=createHeadView($('view'),moveInCut), panel=$('content'), status=$('status');
  const steps=[
    ['circumference','Around your head','Measure around the gold line with a soft tape, just above your eyebrows and ears.'],
    ['width','Width above your ears','Measure straight across the widest part of your skull above the ears. Use calipers or measure the gap between two parallel books.'],
    ['length','Brow to back','Measure straight from the brow between your eyebrows to the farthest point at the back of your skull.'],
    ['height','Chin to crown','Look straight ahead. Measure the vertical distance from the underside of your chin to the top of your head.']
  ];
  let heads=[], selectedId=null, draftId=null, profile=null, mesh, raw=null, step=0, unit='mm', pending=false;
  const unitSize={mm:1,cm:10,in:25.4};
  const native=window.orca&&typeof window.orca.postMessage==='function';
  const shelf=createHelmetLibrary(native?window.orca:null,base64,from64);
  let queuedHelmet=null,activeHelmetId=null,shelfBusy=false;
  const fitter=createHelmetFitting(G);
  let fit=null, helmetName='', sectionMode='3D', uniform=true, padding=0, transfer=null;
  const cuts={
    'Front section':{axis:1,label:'Slice depth',ends:['Front','Back']},
    'Side section':{axis:0,label:'Slice position',ends:['Left','Right']},
    'Top section':{axis:2,label:'Slice height',ends:['Lower','Higher']}
  };
  let sliceOffsets=[0,0,0], resetUndo=null;
  const tools=$('tools');
  if(native) $('caliperLink').addEventListener('click',e=>{
    e.preventDefault();
    let url=$('caliperUrl');
    if(!url){url=document.createElement('input');url.id='caliperUrl';url.readOnly=true;url.setAttribute('aria-label','Printables link');url.value=e.currentTarget.href;e.currentTarget.after(url);}
    url.focus();url.select();
    note(document.execCommand('copy')?'Printables link copied. Open it in your browser.':'Copy the selected Printables link into your browser.');
  });
  function note(message=''){status.textContent=message;}
  function showFile(message,path){
    note(message);
    if(!path)return;
    const input=document.createElement('input');
    input.readOnly=true;input.value=path;input.setAttribute('aria-label','Saved STL path');
    input.addEventListener('focus',()=>input.select());status.append(input);
  }
  function button(text,fn,primary=false){const b=document.createElement('button');b.textContent=text;if(primary)b.className='primary';b.addEventListener('click',fn);return b;}
  function buttons(...items){const bar=document.createElement('div');bar.className='actions';bar.append(...items);panel.append(bar);}
  function field(tag,text){const el=document.createElement(tag);el.textContent=text;panel.append(el);return el;}
  function base64(buffer){const a=new Uint8Array(buffer);let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);}
  function from64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;}
  let studio=null,studioOK=true,toolMode='orbit',opacity=.5,surfaceFit=null;
  let fitOwner=null, editingOriginal=null, fileRead=0, alignmentOpen=false;
  const footer=$('fitFooter');
  const thumbs=new Map(),looks=new Map();
  const library=()=>$('head-room').classList.contains('library-mode');
  function layout(mode){
    fileRead++;
    delete panel.dataset.helmetDrop;
    $('head-room').classList.remove('drop-active');
    $('head-room').classList.toggle('library-mode',mode==='library');
    $('head-room').classList.toggle('fit-mode',mode==='fit');
    footer.hidden=mode!=='fit';
    if(mode!=='fit'){$('surface').hidden=true;$('view').hidden=false;$('fitTools').hidden=true;document.querySelector('.hud span').textContent='Drag to rotate';}
  }
  function discardFit(){
    studio?.stop();
    fit=null;surfaceFit=null;fitOwner=null;activeHelmetId=null;alignmentOpen=false;
  }
  function fetchHead(id){
    if(!native)return browserRead('profiles',s=>s.get(id));
    if(!looks.has(id)){let resolve,reject;const p=new Promise((a,b)=>{resolve=a;reject=b;});
      looks.set(id,{p,resolve,reject});window.orca.postMessage({type:'getHead',id});}
    return looks.get(id).p;
  }
  let libraryGeneration=0;
  function home(){
    const generation=++libraryGeneration;selectedId=null;
    panel.replaceChildren();tools.hidden=false;editingOriginal=null;note();layout(heads.length?'library':'welcome');
    field('h2',heads.length?'Your heads':'Choose a head');
    if(heads.length||queuedHelmet)field('p',queuedHelmet?'Choose a head for '+queuedHelmet.name+'.':'Choose a head to try on a helmet.').className='library-intro';
    const make=button('Make my head',()=>{draftId=null;profile={kind:'measured',name:'My head',values:{}};raw=null;step=0;wizard();},!heads.length);
    const scan=button('Use my own STL',()=>$('file').click());buttons(make,scan,button(queuedHelmet?'Back to helmets':'Helmets',()=>showHelmets(false)));
    if(!heads.length){view.show(G.generate(),null,true);return;}
    const grid=document.createElement('div');grid.className='portraits';panel.append(grid);
    const counts=new Map(),labels=new Map();
    for(const h of [...heads].reverse()){const n=(counts.get(h.name)||0)+1;counts.set(h.name,n);labels.set(h.id,n===1?h.name:h.name+' ('+n+')');}
    const queue=[];
    for(const h of heads){
      const tile=button('',async()=>{selectedId=h.id;try{const p=await fetchHead(h.id);
        if(library()&&selectedId===h.id&&generation===libraryGeneration)openProfile(p);
      }catch(err){note(err.message);}});
      tile.className='head-tile';tile.setAttribute('aria-label','Try a helmet on '+labels.get(h.id));
      const art=document.createElement('span'),img=document.createElement('img'),name=document.createElement('strong'),arrow=document.createElement('span');
      art.className='portrait-art';img.alt='';name.textContent=labels.get(h.id);arrow.className='tile-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
      art.append(img);tile.append(art,name,arrow);grid.append(tile);
      if(thumbs.has(h.id))img.src=thumbs.get(h.id);else queue.push([h.id,img]);
    }
    (async()=>{for(const [id,img] of queue){if(!img.isConnected||!library())break;
      try{const p=await fetchHead(id);if(!img.isConnected)break;
        const url=headPortrait(p,G,from64);thumbs.set(id,url);img.src=url;
      }catch{img.alt='Preview unavailable';}
      await new Promise(r=>setTimeout(r,0));
    }})();
  }
  function openProfile(p){
    try{
      if(selectedId!==fitOwner)discardFit();
      if(p.kind==='stl'){raw=from64(p.data);mesh=G.inspectSTL(raw);}
      else{raw=null;mesh=G.generate(p.values);}
      profile={...p,values:p.values?{...p.values}:undefined};
      if(queuedHelmet){tryOn();openStored(queuedHelmet);}else if(fit)fitPanel();else tryOn();
    }catch(e){note('Could not open this profile. '+e.message);}
  }
  function parseValue(s){
    const match=s.trim().match(/^(\d+(?:[.,]\d*)?|[.,]\d+)\s*(mm|cm|in|")?$/i);
    if(!match)return NaN;
    return Number(match[1].replace(',','.'))*unitSize[(match[2]==='"'?'in':match[2]?.toLowerCase())||unit];
  }
  function wizard(){
    layout('editor');tools.hidden=true;
    const [key,title,instruction]=steps[step];panel.replaceChildren();note();
    const progress=field('p','Measurement '+(step+1)+' of 4');progress.className='step';
    field('h2',title);field('p',instruction);
    const label=field('label','Your measurement');label.htmlFor='distance';
    const row=document.createElement('div');row.className='row';
    const input=document.createElement('input');input.id='distance';input.inputMode='decimal';input.autocomplete='off';
    const units=document.createElement('select');units.setAttribute('aria-label','Measurement units');
    for(const u of Object.keys(unitSize))units.add(new Option(u,u));units.value=unit;
    function display(){input.value=profile.values[key]===undefined?'':String(Number((profile.values[key]/unitSize[unit]).toFixed(3)));}
    display();row.append(input,units);panel.append(row);
    const go=button(step===3?'Review my head':'Next',()=>{if(go.disabled)return;if(step===3)review(false);else{step++;wizard();}},true);
    function update(){
      const mm=parseValue(input.value);
      if(!Number.isFinite(mm)||mm<10||mm>1500){go.disabled=true;note(input.value?'Check the number and units. You can type 58 cm or 22.8 in.':'');return false;}
      profile.values[key]=mm;mesh=G.generate(profile.values);view.show(mesh,key);go.disabled=false;note();return true;
    }
    units.onchange=()=>{
      const previous=parseValue(input.value);
      unit=units.value;
      if(Number.isFinite(previous)&&previous>=10&&previous<=1500){
        profile.values[key]=previous;display();go.disabled=false;note();
      }else if(input.value.trim())update();
    };
    input.oninput=update;input.onkeydown=e=>{if(e.key==='Enter'&&!go.disabled)go.click();};
    buttons(button('Back',()=>{
      if(step>0){step--;wizard();return;}
      if(editingOriginal){
        profile=editingOriginal;editingOriginal=null;mesh=G.generate(profile.values);review(true);
      }else home();
    }),go);
    go.disabled=profile.values[key]===undefined;
    mesh=G.generate(profile.values);view.show(mesh,key,true);input.focus();
  }
  function exportMesh(){
    try{
      const bytes=raw||G.binarySTL(mesh);
      if(native){window.orca.postMessage({type:'export',data:base64(bytes)});return;}
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
      const a=document.createElement('a');a.href=url;a.download='head-room.stl';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(e){note(e.message);}
  }
  let dbPromise;
  function browserDB(){
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
      const r=indexedDB.open('head-room',2);
      r.onupgradeneeded=()=>{
        const db=r.result, profiles=db.objectStoreNames.contains('profiles')?r.transaction.objectStore('profiles'):db.createObjectStore('profiles');
        const names=db.createObjectStore('headNames',{keyPath:'id'});
        const old=profiles.get('current');
        old.onsuccess=()=>{if(old.result)names.add({id:'current',name:old.result.name,created:0});};
      };
      r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>db.close();resolve(db);};
      r.onerror=()=>{dbPromise=null;reject(r.error);};
    });
    return dbPromise;
  }
  async function browserRead(table,query){
    const db=await browserDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(table),r=query(tx.objectStore(table));
      tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);
    });
  }
  async function browserSave(id,head){
    const db=await browserDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['profiles','headNames'],'readwrite'), profiles=tx.objectStore('profiles');
      const existing=profiles.get(id);
      existing.onsuccess=()=>{
        if(existing.result){if(JSON.stringify(existing.result)!==JSON.stringify(head))tx.abort();return;}
        profiles.add(head,id);
        tx.objectStore('headNames').add({id,name:head.name,created:Date.now()});
      };
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Could not add this head.'));
    });
  }
  function save(){
    profile.name=$('headName').value.trim()||'My head';
    if(pending)return;pending=true;panel.querySelectorAll('input,button').forEach(el=>el.disabled=true);
    try{
      if(!draftId)draftId=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
      if(native)window.orca.postMessage({type:'save',id:draftId,profile});
      else browserSave(draftId,profile).then(()=>savedOK(draftId)).catch(failed);
    }catch(e){failed(e);}
  }
  function savedOK(id){
    if(!pending||id!==draftId)return;
    pending=false;selectedId=id;editingOriginal=null;discardFit();
    if(!heads.some(h=>h.id===id))heads.unshift({id,name:profile.name});
    tryOn();if(queuedHelmet)openStored(queuedHelmet);else note('Added to your saved heads.');
  }
  function failed(e){
    pending=false;transfer=null;lockTransfer(false);
    if($('save'))panel.querySelectorAll('input,button').forEach(el=>el.disabled=false);
    note(String(e.message||e));
  }
  function structuredCopy(p){return {...p,...(p.values?{values:{...p.values}}:{})};}
  function review(isSaved){
    layout('editor');tools.hidden=true;panel.replaceChildren();note();view.show(mesh,null,true);field('h2',isSaved?profile.name:'Review your head');
    if(profile.kind==='measured'){
      const list=document.createElement('dl');list.className='values';
      for(const [key,title] of steps){const d=document.createElement('div'),t=document.createElement('dt'),v=document.createElement('dd');
        t.textContent=title;v.textContent=Number(profile.values[key].toFixed(2))+' mm';d.append(t,v);list.append(d);}
      panel.append(list);
      if(Math.abs(mesh.actual.circumference-profile.values.circumference)>1)
        field('p','You entered '+Number(profile.values.circumference.toFixed(1))+' mm around the brow. This head shape reaches '+mesh.actual.circumference.toFixed(1)+' mm at the entered width and length.').className='hint';
    }else{const size=mesh.maxs.map((v,i)=>(v-mesh.mins[i]).toFixed(1));field('p','STL dimensions (X × Y × Z) '+size.join(' × ')+' mm. Coordinates are interpreted in millimetres.');}
    if(isSaved){
      buttons(button(fit?'Resume fitting':'Try on a helmet',fit?fitPanel:tryOn,true),button('Export head STL',exportMesh));
      if(profile.kind==='measured')buttons(button('Edit measurements as new head',()=>{editingOriginal=profile;profile=structuredCopy(profile);draftId=null;step=0;wizard();}));
      buttons(button('Back to heads',home));return;
    }
    const l=field('label','Head name');l.htmlFor='headName';const name=document.createElement('input');name.id='headName';name.maxLength=80;name.value=profile.name;panel.append(name);
    name.oninput=()=>{profile.name=name.value;};
    name.onkeydown=e=>{if(e.key==='Enter')save();};
    const b=button('Add to saved heads',save,true);b.id='save';
    buttons(button('Back',()=>{if(profile.kind==='measured'){step=3;wizard();}else home();}),b);
  }
  $('file').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    const read=++fileRead;
    try{
      if(f.size>32*1024*1024)throw Error('Choose a head STL of 32 MiB or less.');
      note('Reading head STL…');const bytes=await f.arrayBuffer();if(read!==fileRead)return;const m=G.inspectSTL(bytes);
      mesh=m;raw=bytes;draftId=null;profile={kind:'stl',name:f.name.replace(/\.stl$/i,''),data:base64(bytes)};review(false);
    }catch(err){if(read===fileRead)note(err.message);}
  };
  function tryOn(){
    layout('editor');tools.hidden=true;
    panel.replaceChildren();note();view.show(mesh,null,true);
    field('p',profile.name).className='step';field('h2','Try on a helmet');
    if(fit){
      field('p',helmetName).className='current-shell';
      buttons(button('Resume fitting',fitPanel,true),button('Change helmet',()=>$('helmetFile').click()));
    }else{
      const picker=button('Choose helmet STL',()=>$('helmetFile').click());
      picker.className='helmet-picker';picker.setAttribute('aria-describedby','dropHint');panel.append(picker);
      const hint=field('p','Or drop a helmet STL here · millimetres · up to 96 MiB');hint.id='dropHint';hint.className='hint';
    }
    panel.dataset.helmetDrop='true';
    buttons(button('Saved helmets',()=>showHelmets(true)),button('Head details',()=>review(true)),button('Back to heads',()=>{queuedHelmet=null;home();}));
  }
  async function showHelmets(withHead=false){
    const gen=++libraryGeneration;
    queuedHelmet=null;tools.hidden=true;note();layout('library');panel.replaceChildren();
    field('h2','Helmets');
    field('p',withHead?'Choose a shell for '+profile.name+'.':'Your saved shells, ready for another fitting.').className='library-intro';
    buttons(button('Add helmet STL',()=>$('shelfFile').click(),true),
      button(withHead?'Back to head':'Back to heads',withHead?tryOn:home));
    const grid=document.createElement('div');grid.className='portraits';panel.append(grid);
    $('shelfFile').onchange=async e=>{
      const file=e.target.files[0];e.target.value='';if(!file||shelfBusy)return;
      await shelfWork(async()=>{
        if(file.size>96*1024*1024)throw Error('Choose a helmet STL of 96 MiB or less.');
        const bytes=await file.arrayBuffer(),shell=G.inspectSTL(bytes);
        await shelf.save({name:file.name,bytes,thumb:meshPortrait(shell,G,bytes,true),head:null,pose:null});
        await showHelmets(withHead);note('Helmet saved on this device.');
      });
    };
    try{
      const items=await shelf.list();if(gen!==libraryGeneration||!grid.isConnected)return;
      if(!items.length){
        const empty=document.createElement('p');empty.className='empty-shelf';
        empty.textContent='No saved helmets yet. Add an STL here, or save a helmet while fitting it.';grid.append(empty);return;
      }
      for(const item of items){
        const tile=button('',()=>{
          if(withHead){openStored(item);return;}
          queuedHelmet=item;home();
        });tile.className='head-tile helmet-tile';tile.setAttribute('aria-label','Try on '+item.name);
        const art=document.createElement('span'),img=document.createElement('img'),label=document.createElement('strong'),arrow=document.createElement('span');
        art.className='portrait-art';img.alt='';img.src=item.thumb;art.append(img);
        label.textContent=item.name.replace(/\.stl$/i,'');arrow.textContent='↗';arrow.className='tile-arrow';
        arrow.setAttribute('aria-hidden','true');tile.append(art,label,arrow);grid.append(tile);
      }
    }catch(e){if(grid.isConnected)note('Could not open your helmets. '+e.message);}
  }
  async function shelfWork(work){
    if(shelfBusy||transfer)return;
    shelfBusy=true;lockTransfer(true);note('Opening helmet library…');
    try{await work();}catch(e){note(e.message||'Could not access the helmet library.');}
    finally{shelfBusy=false;lockTransfer(false);}
  }
  async function openStored(item){
    await shelfWork(async()=>{
      const {bytes,pose}=await shelf.get(item,selectedId);
      if(!bytes)throw Error('The saved STL could not be read.');
      startFit(bytes,item.name,item.id,pose);queuedHelmet=null;
      if(pose)note('Restored the saved fit for '+profile.name+'.');
    });
  }
  async function saveFit(){
    await shelfWork(async()=>{
      note('Saving helmet and fit…');
      const pose={offset:fit.offset.slice(),rotation:fit.rotation.slice(),scale:fit.scale.slice(),uniform,padding};
      activeHelmetId=await shelf.save({id:activeHelmetId,name:helmetName,bytes:fit.bytes,
        thumb:activeHelmetId?'':meshPortrait(fit.shell,G,fit.bytes,true),head:selectedId,pose});
      fitPanel();note('Saved to Helmets with this head’s fit.');
    });
  }
  async function loadHelmet(f){
    if(!f||transfer||shelfBusy)return;
    const read=++fileRead;
    try{
      if(f.size>96*1024*1024)throw Error('Choose a helmet STL under 96 MiB.');
      note('Reading helmet…');
      const bytes=await f.arrayBuffer();if(read!==fileRead)return;
      startFit(bytes,f.name,null,null);queuedHelmet=null;
    }catch(err){if(read===fileRead)note(err.message);}
  }
  function startFit(bytes,name,id,pose){
    const next=fitter.start(mesh,bytes);
    if(pose)for(const key of ['rotation','scale','offset'])next[key]=pose[key].slice();
    fit=next;fitOwner=selectedId;activeHelmetId=id;helmetName=name;toolMode='orbit';opacity=.5;alignmentOpen=false;
    uniform=pose?.uniform??true;padding=pose?.padding??0;sliceOffsets=[0,0,0];resetUndo=null;
    try{studio??=createFitStudio($('surface'),syncOffsets);studio.start(fit,mesh,raw);studio.opacity(opacity);surfaceFit=fit;studioOK=true;}
    catch(error){console.warn('3D view unavailable',error);studio?.stop();surfaceFit=null;studioOK=false;}
    sectionMode=studioOK?'3D':'Front section';fitPanel();
  }
  $('helmetFile').onchange=e=>{
    const file=e.target.files[0];e.target.value='';loadHelmet(file);
  };
  const workspace=$('head-room');
  workspace.addEventListener('dragover',event=>{
    if(!event.dataTransfer.types.includes('Files'))return;
    event.preventDefault();
    if(panel.dataset.helmetDrop&&!transfer)workspace.classList.add('drop-active');
  });
  workspace.addEventListener('dragleave',event=>{
    if(!workspace.contains(event.relatedTarget))workspace.classList.remove('drop-active');
  });
  workspace.addEventListener('drop',event=>{
    if(!event.dataTransfer.files.length)return;
    event.preventDefault();workspace.classList.remove('drop-active');
    if(!panel.dataset.helmetDrop||transfer)return;
    if(event.dataTransfer.files.length!==1){note('Drop one assembled helmet STL at a time.');return;}
    loadHelmet(event.dataTransfer.files[0]);
  });
  function syncOffsets(){
    panel.querySelectorAll('[data-offset]').forEach((el,i)=>el.value=Number(fit.offset[i].toFixed(2)));
    syncReset();
  }
  function moveInCut(delta){
    if(!fit||!cuts[sectionMode]||transfer)return;
    fit.offset=fit.offset.map((n,i)=>Math.max(-1000,Math.min(1000,n+delta[i])));
    syncOffsets();redrawFit();
  }
  function syncReset(){
    const b=$('helmetReset');if(!b||!fit)return;
    const initial=fit.scale.every(n=>n===1)&&fit.offset.every(n=>n===0)&&
      fit.rotation.every((n,i)=>Math.abs(n-(i%4===0?1:0))<1e-10);
    if(!initial)resetUndo=null;
    b.disabled=initial&&!resetUndo;b.textContent=resetUndo?'Undo reset':'Reset helmet';
  }
  function resetHelmet(){
    if(transfer)return;
    if(resetUndo){
      fit.offset=resetUndo.offset;fit.rotation=resetUndo.rotation;fit.scale=resetUndo.scale;
      uniform=resetUndo.uniform;resetUndo=null;
    }else{
      resetUndo={offset:fit.offset.slice(),rotation:fit.rotation.slice(),scale:fit.scale.slice(),uniform};
      fit.offset=[0,0,0];fit.rotation=[1,0,0,0,1,0,0,0,1];fit.scale=[1,1,1];uniform=true;
    }
    fitPanel();$('helmetReset').focus({preventScroll:true});
  }
  function sliceControl(cut){
    const label=field('label',cut.label);label.className='range-label';label.htmlFor='slicePosition';
    const out=document.createElement('output');out.id='sliceDistance';label.append(out);
    const slider=document.createElement('input');slider.type='range';slider.id='slicePosition';slider.step=1;
    slider.oninput=()=>{sliceOffsets[cut.axis]=slider.valueAsNumber;redrawFit();};
    const ends=document.createElement('div');ends.className='slice-ends';
    for(const text of cut.ends){const end=document.createElement('span');end.textContent=text;ends.append(end);}
    panel.append(slider,ends);
  }
  function redrawFit(){
    const is3D=sectionMode==='3D'&&surfaceFit===fit;
    $('view').hidden=is3D;$('surface').hidden=!is3D;$('fitTools').hidden=!is3D;
    if(is3D){for(const b of $('fitTools').querySelectorAll('button'))b.setAttribute('aria-pressed',toolMode===b.dataset.tool);studio.apply();studio.tool(toolMode);studio.draw();}
    else{
      const {axis}=cuts[sectionMode], slider=$('slicePosition');
      const [min,max]=fitter.sliceRange(fit,axis);
      const offset=sliceOffsets[axis]=Math.max(min,Math.min(max,sliceOffsets[axis]));
      slider.min=min;slider.max=max;slider.value=offset;
      const distance=offset===0?'Center':(offset>0?'+':'')+offset+' mm';
      $('sliceDistance').textContent=distance;slider.setAttribute('aria-valuetext',distance);
      view.fit({axis,...fitter.crossSection(fit,mesh,raw,axis,fit.center[axis]+offset)});
    }
    syncReset();
    document.querySelector('.hud span').textContent=is3D?'Scroll to zoom · Shift-drag or middle-drag to pan':'Drag to move the helmet · Shift-drag to pan';
  }
  function fitPanel(){
    layout('fit');panel.replaceChildren();note();
    panel.dataset.helmetDrop='true';
    field('p',profile.name+'  /  '+helmetName.replace(/\.stl$/i,'')).className='step';
    const heading=document.createElement('div');heading.className='fit-heading';
    const titleText=document.createElement('h2');titleText.textContent='Fit helmet';
    const reset=button('Reset helmet',resetHelmet);reset.id='helmetReset';
    heading.append(titleText,reset);panel.append(heading);
    function group(parent,labels,current,change){
      const wrap=document.createElement('div');wrap.className='segmented';
      for(const [label,value] of labels){const b=button(label,()=>{
        change(value);
        Array.from(panel.querySelectorAll('.segmented button')).find(el=>el.textContent===label)?.focus({preventScroll:true});
      });b.setAttribute('aria-pressed',value===current);wrap.append(b);}
      parent.append(wrap);return wrap;
    }
    function numbers(parent,labels,values,low,high,apply,offset=false){
      const row=document.createElement('div');row.className='fit-fields';
      labels.forEach((name,i)=>{const label=document.createElement('label'),el=document.createElement('input');label.textContent=name;
        el.type='number';el.step='any';el.min=low;el.max=high;el.value=Number(values[i].toFixed(2));el.required=true;if(offset)el.dataset.offset=i;
        el.oninput=()=>{if(el.value!==''&&el.validity.valid){apply(i,el.valueAsNumber);note();redrawFit();}};
        label.append(el);row.append(label);});parent.append(row);
    }
    const modes=studioOK?[['3D','3D']]:[];modes.push(['Front cut','Front section'],['Side cut','Side section'],['Top cut','Top section']);
    group(panel,modes,sectionMode,v=>{sectionMode=v;fitPanel();});
    if(!studioOK)field('p','3D graphics are unavailable. You can fit the helmet in any cut view.').className='hint';
    if(cuts[sectionMode]){
      sliceControl(cuts[sectionMode]);
      const legend=document.createElement('div');legend.className='cut-legend';
      for(const name of ['Head','Helmet']){const key=document.createElement('span');key.textContent=name;legend.append(key);}
      panel.append(legend);
    }
    if(studioOK&&sectionMode==='3D'){
      const l=field('label','Helmet opacity'),out=document.createElement('output'),el=document.createElement('input');
      l.htmlFor=el.id='opacity';l.className='range-label';out.textContent=Math.round(opacity*100)+'%';l.append(out);
      el.type='range';el.min=0;el.max=100;el.value=Math.round(opacity*100);el.oninput=()=>{opacity=Number(el.value)/100;out.textContent=el.value+'%';studio.opacity(opacity);};panel.append(el);
    }
    field('h3','Helmet scale');
    group(panel,[['Uniform',true],['Per axis',false]],uniform,v=>{uniform=v;if(v)fit.scale.fill(Math.max(...fit.scale));fitPanel();});
    numbers(panel,uniform?['Size (%)']:['Width (%)','Depth (%)','Height (%)'],fit.scale.map(x=>100*x),5,1000,(i,x)=>{if(uniform)fit.scale.fill(x/100);else fit.scale[i]=x/100;});
    const l=field('label','Padding per side (mm)'),pad=document.createElement('input');l.htmlFor=pad.id='padding';
    pad.type='number';pad.min=0;pad.max=100;pad.step='any';pad.required=true;pad.value=padding;pad.oninput=()=>{if(pad.value!==''&&pad.validity.valid)padding=pad.valueAsNumber;};
    const line=document.createElement('div');line.className='row pad';line.append(pad,button('Estimate helmet scale',()=>{
      if(!pad.reportValidity()||!Number.isFinite(pad.valueAsNumber)){note('Enter a padding thickness in millimetres.');return;}
      try{fit.scale=fitter.estimate(fit,padding,uniform);fitPanel();note('Estimated from the inner walls and crown. Check the visor, jaw and entry opening.');}catch(err){note(err.message);}
    }));panel.append(line);
    const alignment=document.createElement('details'),title=document.createElement('summary');title.textContent='Precise alignment';alignment.append(title);
    const rot=document.createElement('div');rot.className='actions';
    ['Pitch','Roll','Turn'].forEach((name,i)=>rot.append(button(name+' 90°',()=>{fitter.turn(fit,i);redrawFit();})));
    alignment.open=alignmentOpen;alignment.ontoggle=()=>{if(alignment.isConnected)alignmentOpen=alignment.open;};
    alignment.append(rot);numbers(alignment,['Right (mm)','Back (mm)','Up (mm)'],fit.offset,-1000,1000,(i,x)=>fit.offset[i]=x,true);panel.append(alignment);
    footer.replaceChildren(button(native?'Open fitted helmet in OrcaSlicer':'Download fitted helmet STL',acceptHelmet,true));
    buttons(button(activeHelmetId?'Save fit':'Save to Helmets',saveFit),button('Change helmet',()=>$('helmetFile').click()),button('Back to head',tryOn));redrawFit();
  }
  for(const b of $('fitTools').querySelectorAll('button'))b.onclick=()=>{toolMode=b.dataset.tool;studio.tool(toolMode);for(const other of $('fitTools').querySelectorAll('button'))other.setAttribute('aria-pressed',other===b);};
  function lockTransfer(locked){
    panel.inert=locked;
    $('fitTools').inert=locked;
    $('surface').inert=locked;
    $('view').inert=locked;
    footer.querySelectorAll('button').forEach(b=>b.disabled=locked);
    footer.setAttribute('aria-busy',String(locked));
  }
  function acceptHelmet(){
    if(transfer||!Array.from(panel.querySelectorAll('input')).every(el=>el.reportValidity()))return;
    try{
      const bytes=fitter.fittedSTL(fit);
      const name=helmetName.replace(/\.stl$/i,'')+'-fitted.stl';
      if(!native){
        const a=document.createElement('a');const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
        a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);return;
      }
      transfer={bytes,offset:0};
      lockTransfer(true);
      note('Preparing the fitted helmet…');window.orca.postMessage({type:'helmetBegin',name,size:bytes.byteLength});
    }catch(err){failed(err);}
  }
  function nextChunk(offset){
    if(!transfer)return;
    if(offset!==transfer.offset){failed(Error('Transfer interrupted. Try opening the helmet again.'));return;}
    if(offset===transfer.bytes.byteLength){window.orca.postMessage({type:'helmetOpen'});return;}
    note('Sending helmet to OrcaSlicer · '+Math.round(offset*100/transfer.bytes.byteLength)+'%');
    const chunk=transfer.bytes.slice(offset,offset+384*1024);transfer.offset+=chunk.byteLength;
    window.orca.postMessage({type:'helmetChunk',offset,data:base64(chunk)});
  }
  $('resetView').onclick=()=>!$('surface').hidden&&studioOK?studio.reset():view.reset();
  if(native){
    window.orca.onMessage(msg=>{
      if(msg.type==='shelfReply'){shelf.receive(msg);return;}
      if(msg.type==='loaded'){heads=msg.heads;home();}
      if(msg.type==='head'){looks.get(msg.id)?.resolve(msg.profile);looks.delete(msg.id);}
      if(msg.type==='saved')savedOK(msg.id);
      if(msg.type==='exported')showFile('Head STL saved. Select the path to copy it.',msg.path);
      if(msg.type==='helmetReady')nextChunk(msg.offset);
      if(msg.type==='helmetResult'){transfer=null;lockTransfer(false);fitPanel();showFile(msg.message,msg.path);}
      if(msg.type==='error'){if(msg.id&&looks.has(msg.id)){looks.get(msg.id).reject(Error(msg.message));looks.delete(msg.id);}else failed(Error(msg.message));}
    });
    window.orca.postMessage({type:'load'});
  }else browserRead('headNames',s=>s.getAll()).then(items=>{heads=items.sort((a,b)=>b.created-a.created);home();}).catch(failed);
})();
