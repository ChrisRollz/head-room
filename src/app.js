(() => {
  const G=HeadRoomGeometry, $=id=>document.getElementById(id);
  const view=createHeadView($('view')), panel=$('content'), status=$('status');
  const steps=[
    ['circumference','Around your head','Measure around the gold line with a soft tape, just above your eyebrows and ears.'],
    ['width','Width above your ears','Measure straight across the widest part of your skull above the ears. Use calipers or measure the gap between two parallel books.'],
    ['length','Brow to back','Measure straight from the brow between your eyebrows to the farthest point at the back of your skull.'],
    ['height','Chin to crown','Look straight ahead. Measure the vertical distance from the underside of your chin to the top of your head.']
  ];
  let heads=[], selectedId=null, saved=null, draftId=null, profile=null, mesh, raw=null, step=0, unit='mm', pending=false;
  const unitSize={mm:1,cm:10,in:25.4};
  const native=window.orca&&typeof window.orca.postMessage==='function';
  const fitter=createHelmetFitting(G);
  let fit=null, helmetName='', sectionMode='3D', uniform=true, padding=0, transfer=null;
  const tools=$('tools');
  if(native) $('caliperLink').addEventListener('click',e=>{
    e.preventDefault();
    let url=$('caliperUrl');
    if(!url){url=document.createElement('input');url.id='caliperUrl';url.readOnly=true;url.setAttribute('aria-label','Printables link');url.value=e.currentTarget.href;e.currentTarget.after(url);}
    url.focus();url.select();
    note(document.execCommand('copy')?'Printables link copied. Open it in your browser.':'Copy the selected Printables link into your browser.');
  });
  function note(message=''){status.textContent=message;}
  function button(text,fn,primary=false){const b=document.createElement('button');b.textContent=text;if(primary)b.className='primary';b.addEventListener('click',fn);return b;}
  function buttons(...items){const bar=document.createElement('div');bar.className='actions';bar.append(...items);panel.append(bar);}
  function field(tag,text){const el=document.createElement(tag);el.textContent=text;panel.append(el);return el;}
  function base64(buffer){const a=new Uint8Array(buffer);let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);}
  function from64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;}
  function selectHead(id){
    selectedId=id;saved=null;note();
    $('useHead').disabled=true;view.show(G.generate(),null,true);
    if(native)window.orca.postMessage({type:'getHead',id});
    else browserRead('profiles',store=>store.get(id)).then(p=>headLoaded(id,p)).catch(failed);
  }
  function headLoaded(id,p){
    if(id!==selectedId||!$('useHead'))return;
    try{
      const preview=p.kind==='stl'?G.inspectSTL(from64(p.data)):G.generate(p.values);
      view.show(preview,null,true);saved=p;$('useHead').disabled=false;
    }catch(err){note('Could not open this saved head. '+err.message);}
  }
  function home(){
    panel.replaceChildren();tools.hidden=false;fit=null;note();
    field('h2',heads.length?'Your saved heads':'Choose a head');
    if(heads.length){
      const label=field('label','Saved head'), picker=document.createElement('select');label.htmlFor=picker.id='headPicker';
      const counts=new Map(), labels=new Map();
      for(const h of [...heads].reverse()){
        const n=(counts.get(h.name)||0)+1;counts.set(h.name,n);
        labels.set(h.id,n===1?h.name:h.name+' ('+n+')');
      }
      for(const h of heads)picker.add(new Option(labels.get(h.id),h.id));
      picker.value=heads.some(h=>h.id===selectedId)?selectedId:heads[0].id;
      panel.append(picker);const use=button('Use saved head',()=>openProfile(saved),true);use.id='useHead';buttons(use);
      picker.onchange=()=>selectHead(picker.value);selectHead(picker.value);
    }else view.show(G.generate(),null,true);
    buttons(button('Make my head',()=>{draftId=null;profile={kind:'measured',name:'My head',values:{}};raw=null;step=0;wizard();},!heads.length),
      button('Use my own STL',()=>$('file').click()));
  }
  function openProfile(p){
    try{
      if(p.kind==='stl'){raw=from64(p.data);mesh=G.inspectSTL(raw);}
      else{raw=null;mesh=G.generate(p.values);}
      profile={...p,values:p.values?{...p.values}:undefined};tryOn();
    }catch(e){note('Could not open this profile. '+e.message);}
  }
  function parseValue(s){
    const match=s.trim().match(/^(\d+(?:[.,]\d*)?|[.,]\d+)\s*(mm|cm|in|")?$/i);
    if(!match)return NaN;
    return Number(match[1].replace(',','.'))*unitSize[(match[2]==='"'?'in':match[2]?.toLowerCase())||unit];
  }
  function wizard(){
    tools.hidden=true;
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
    const go=button(step===3?'Review my head':'Next',()=>{if(!update())return;if(step===3)review(false);else{step++;wizard();}},true);
    function update(){
      const mm=parseValue(input.value);
      if(!Number.isFinite(mm)||mm<10||mm>1500){go.disabled=true;note(input.value?'Check the number and units. You can type 58 cm or 22.8 in.':'');return false;}
      profile.values[key]=mm;mesh=G.generate(profile.values);view.show(mesh,key);go.disabled=false;note();return true;
    }
    units.onchange=()=>{const wasEmpty=!input.value.trim();unit=units.value;if(!wasEmpty&&profile.values[key]!==undefined){display();update();}};
    input.oninput=update;input.onkeydown=e=>{if(e.key==='Enter'&&!go.disabled)go.click();};
    buttons(button('Back',()=>{if(step===0)home();else{step--;wizard();}}),go);
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
    pending=false;selectedId=id;saved=structuredCopy(profile);
    if(!heads.some(h=>h.id===id))heads.unshift({id,name:saved.name});
    tryOn();note('Added to your saved heads.');
  }
  function failed(e){pending=false;transfer=null;if($('save')||fit)panel.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);note(String(e.message||e));}
  function structuredCopy(p){return {...p,...(p.values?{values:{...p.values}}:{})};}
  function review(isSaved){
    tools.hidden=true;panel.replaceChildren();note();view.show(mesh,null,true);field('h2',isSaved?profile.name:'Review your head');
    if(profile.kind==='measured'){
      const list=document.createElement('dl');list.className='values';
      for(const [key,title] of steps){const d=document.createElement('div'),t=document.createElement('dt'),v=document.createElement('dd');
        t.textContent=title;v.textContent=Number(mesh.actual[key].toFixed(1))+' mm';d.append(t,v);list.append(d);}
      panel.append(list);
      if(Math.abs(mesh.actual.circumference-profile.values.circumference)>1)
        field('p','You entered '+Number(profile.values.circumference.toFixed(1))+' mm around the brow. This head shape reaches '+mesh.actual.circumference.toFixed(1)+' mm at the entered width and length.').className='hint';
    }else{const size=mesh.maxs.map((v,i)=>(v-mesh.mins[i]).toFixed(1));field('p','STL dimensions (X × Y × Z) '+size.join(' × ')+' mm. Coordinates are interpreted in millimetres.');}
    if(isSaved){
      buttons(button('Try on a helmet',tryOn,true),button('Export head STL',exportMesh),button('Back to heads',home));return;
    }
    const l=field('label','Head name');l.htmlFor='headName';const name=document.createElement('input');name.id='headName';name.maxLength=80;name.value=profile.name;panel.append(name);
    const b=button('Add to saved heads',save,true);b.id='save';
    buttons(button('Back',()=>{if(profile.kind==='measured'){step=3;wizard();}else home();}),b);
  }
  $('file').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    try{
      if(f.size>32*1024*1024)throw Error('Choose an STL smaller than 32 MiB for this first build.');
      note('Reading STL…');const bytes=await f.arrayBuffer();const m=G.inspectSTL(bytes);
      mesh=m;raw=bytes;draftId=null;profile={kind:'stl',name:f.name.replace(/\.stl$/i,''),data:base64(bytes)};review(false);
    }catch(err){note(err.message);}
  };
  function tryOn(){
    tools.hidden=true;fit=null;sectionMode='3D';uniform=true;padding=0;
    panel.replaceChildren();note();view.show(mesh,null,true);
    field('p',profile.name).className='step';field('h2','Try on a helmet');
    field('p','Choose a helmet STL in millimetres to see it around your saved head.');
    buttons(button('Choose helmet STL',()=>$('helmetFile').click(),true));
    buttons(button('Head details',()=>review(true)),button('Back to heads',home));
  }
  $('helmetFile').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    try{
      if(f.size>96*1024*1024)throw Error('Choose a helmet STL under 96 MiB.');
      note('Reading helmet…');
      const next=fitter.start(mesh,await f.arrayBuffer());
      fit=next;helmetName=f.name;sectionMode='3D';uniform=true;padding=0;fitPanel();
    }catch(err){note(err.message);}
  };
  function redrawFit(){
    const axis=sectionMode==='Side section'?0:1;
    const cut=sectionMode==='3D'?null:{axis,...fitter.crossSection(fit,mesh,raw,axis)};
    view.fit(cut?null:fitter.preview(fit),cut);
    document.querySelector('.hud span').textContent=cut?'Mint: head · Gold: helmet':'Drag to rotate';
  }
  function fitPanel(){
    panel.replaceChildren();note();field('p',profile.name+' · '+helmetName).className='step';
    field('h2','Helmet fit');
    function select(text,options,value,onChange){
      const label=field('label',text), el=document.createElement('select');label.htmlFor=el.id='fit-'+text.replaceAll(' ','-');
      for(const option of options)el.add(new Option(option,option));el.value=value;el.onchange=()=>onChange(el.value);panel.append(el);
    }
    function numbers(parent,labels,values,low,high,apply){
      const row=document.createElement('div');row.className='fit-fields';
      labels.forEach((name,i)=>{
        const label=document.createElement('label'), el=document.createElement('input');
        label.textContent=name;el.type='number';el.step='any';el.min=low;el.max=high;el.value=Number(values[i].toFixed(2));el.required=true;
        el.onchange=()=>{if(el.reportValidity()){apply(i,el.valueAsNumber);note();redrawFit();}};
        label.append(el);row.append(label);
      });parent.append(row);
    }
    select('View',['3D','Side section','Front section'],sectionMode,v=>{sectionMode=v;redrawFit();});
    const alignment=document.createElement('details'), title=document.createElement('summary');title.textContent='Align helmet';alignment.append(title);
    const rot=document.createElement('div');rot.className='actions';
    ['Pitch','Roll','Turn'].forEach((name,i)=>rot.append(button(name+' 90°',()=>{fitter.turn(fit,i);note();redrawFit();})));
    alignment.append(rot);numbers(alignment,['Right (mm)','Back (mm)','Up (mm)'],fit.offset,-1000,1000,(i,x)=>fit.offset[i]=x);panel.append(alignment);
    select('Scale',['Uniform','Per axis'],uniform?'Uniform':'Per axis',v=>{
      uniform=v==='Uniform';if(uniform)fit.scale.fill(Math.max(...fit.scale));fitPanel();
    });
    numbers(panel,uniform?['Scale (%)']:['Width (%)','Depth (%)','Height (%)'],fit.scale.map(x=>100*x),5,1000,(i,x)=>{
      if(uniform)fit.scale.fill(x/100);else fit.scale[i]=x/100;
    });
    const l=field('label','Padding per side (mm)'), pad=document.createElement('input');
    l.htmlFor=pad.id='padding';pad.type='number';pad.min=0;pad.max=100;pad.step='any';pad.value=padding;panel.append(pad);
    buttons(button('Estimate scale',()=>{
      if(!pad.reportValidity()||!Number.isFinite(pad.valueAsNumber)){note('Enter a padding thickness in millimetres.');return;}
      padding=pad.valueAsNumber;
      try{fit.scale=fitter.estimate(fit,padding,uniform);fitPanel();note('Estimated using the inner walls at the helmet center and crown. Check the visor, jaw and neck opening in the sections.');}
      catch(err){note(err.message);}
    }));
    field('p','Estimate uses the padding above. Inspect the fit before accepting the scale.').className='hint';
    buttons(button(native?'Open fitted helmet in OrcaSlicer':'Download fitted helmet STL',acceptHelmet,true),button('Change helmet',()=>$('helmetFile').click()));
    buttons(button('Back to head',tryOn));redrawFit();
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
      panel.querySelectorAll('button,select,input').forEach(el=>el.disabled=true);
      note('Preparing the fitted helmet…');window.orca.postMessage({type:'helmetBegin',name,size:bytes.byteLength});
    }catch(err){failed(err);}
  }
  function nextChunk(offset){
    if(!transfer)return;
    if(offset!==transfer.offset){failed(Error('Transfer interrupted. Try opening the helmet again.'));return;}
    if(offset===transfer.bytes.byteLength){window.orca.postMessage({type:'helmetOpen'});return;}
    const chunk=transfer.bytes.slice(offset,offset+384*1024);transfer.offset+=chunk.byteLength;
    window.orca.postMessage({type:'helmetChunk',offset,data:base64(chunk)});
  }
  $('resetView').onclick=()=>view.reset();
  if(native){
    window.orca.onMessage(msg=>{
      if(msg.type==='loaded'){heads=msg.heads;home();}
      if(msg.type==='head')headLoaded(msg.id,msg.profile);
      if(msg.type==='saved')savedOK(msg.id);
      if(msg.type==='exported')note('STL saved to '+msg.path);
      if(msg.type==='helmetReady')nextChunk(msg.offset);
      if(msg.type==='helmetResult'){transfer=null;fitPanel();note(msg.message);}
      if(msg.type==='error')failed(Error(msg.message));
    });
    window.orca.postMessage({type:'load'});
  }else browserRead('headNames',s=>s.getAll()).then(items=>{heads=items.sort((a,b)=>b.created-a.created);home();}).catch(failed);
})();
