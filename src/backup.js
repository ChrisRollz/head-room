// Portable archive: header + length-prefixed JSON catalogue + original shell bytes.
const HeadArchive=(()=>{
  const enc=new TextEncoder(),dec=new TextDecoder(),magic='HEADRM01',Max=96*1024*1024;
  const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
  const idOk=s=>typeof s==='string'&&/^(?:[0-9a-f]{32}|[0-9a-f]{64})$/.test(s);
  const headId=s=>s==='current'||(idOk(s)&&s.length===32);
  function validPose(p){
    const numbers=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
    return p&&numbers(p.rotation,9)&&numbers(p.offset,3)&&numbers(p.scale,3)&&p.scale.every(n=>n>=.05&&n<=10)
      &&typeof p.uniform==='boolean'&&Number.isFinite(p.padding)&&p.padding>=0&&p.padding<=100
      &&(!p.zones||Array.isArray(p.zones)&&p.zones.every(n=>Number.isInteger(n)&&n>=0&&n<5))
      &&(!p.anchors||Array.isArray(p.anchors)&&p.anchors.length===5&&p.anchors.every(a=>a===null||a&&numbers(a.p,3)&&numbers(a.d,3)&&Math.hypot(...a.d)>0));
  }
  async function pack(heads,getHead,shelf,progress){
    const catalog={heads:[],shells:[],versions:await shelf.versions()},parts=[];
    for(const {id} of heads)catalog.heads.push({id,profile:await getHead(id)});
    for(const item of await shelf.list()){
      progress('Backing up '+item.name+'…');const {bytes}=await shelf.get(item,null);
      catalog.shells.push({...item,sha:await digest(bytes)});parts.push(bytes);
    }
    const json=enc.encode(JSON.stringify(catalog)),prefix=new Uint8Array(12);prefix.set(enc.encode(magic));
    new DataView(prefix.buffer).setUint32(8,json.length,true);return new Blob([prefix,json,...parts],{type:'application/octet-stream'});
  }
  function profileOK(p){
    if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)return false;
    if(p.kind==='stl')return typeof p.data==='string'&&p.data.length<=44739244;
    const keys=['circumference','width','length','height'],extra=['eyeDrop','pupilGap','noseDepth','earLeft','earRight'];
    return p.kind==='measured'&&p.values&&keys.every(k=>k in p.values)&&Object.entries(p.values).every(([k,v])=>(keys.includes(k)||extra.includes(k))&&Number.isFinite(v)&&v>=(keys.includes(k)?10:0)&&v<=1500);
  }
  async function unpack(file,G,decode){
    const bad=()=>{throw Error('This is not a complete Head Room library backup.');};
    const prefix=await file.slice(0,12).arrayBuffer();if(prefix.byteLength!==12||dec.decode(prefix.slice(0,8))!==magic)bad();
    const end=12+new DataView(prefix).getUint32(8,true);if(end>file.size||end>256*1024*1024)bad();
    const data=JSON.parse(await file.slice(12,end).text());let off=end;
    if(!data||!['heads','shells','versions'].every(k=>Array.isArray(data[k])))bad();
    const heads=new Set(),shells=new Set(),uids=new Set();
    for(const {id,profile:p} of data.heads){if(!headId(id)||heads.has(id)||!profileOK(p))bad();heads.add(id);if(p.kind==='stl')G.inspectSTL(decode(p.data));}
    for(const s of data.shells){
      if(!idOk(s.id)||shells.has(s.id)||!Number.isInteger(s.size)||s.size<=0||s.size>Max||off+s.size>file.size||typeof s.name!=='string'||!s.name.length||s.name.length>255||typeof s.thumb!=='string'||!s.thumb.startsWith('data:image/png;base64,')||s.thumb.length>262144)bad();
      shells.add(s.id);s.blob=file.slice(off,off+s.size);off+=s.size;
      const bytes=await s.blob.arrayBuffer(),sha=await digest(bytes);if(sha!==s.sha||s.id.length===64&&s.id!==sha)bad();
      G.inspectSTL(bytes);
    }
    if(off!==file.size)bad();
    for(const v of data.versions){
      if(!heads.has(v.head)||!shells.has(v.shell)||uids.has(v.uid)||!(idOk(v.uid)&&v.uid.length===32||v.uid==='old:'+v.shell+':'+v.head)||typeof v.name!=='string'||!v.name.trim()||v.name.length>80||typeof v.version!=='string'||!v.version.trim()||v.version.length>30||!validPose(v.pose))bad();
      uids.add(v.uid);
    }
    return data;
  }
  return {pack,unpack,digest};
})();
