// Source geometry is immutable. A pose belongs to one (helmet, head) pair.
function createHelmetLibrary(bridge, encode, decode){
  const CHUNK=384*1024, waiting=new Map();let sequence=0,dbPromise;
  function request(type,fields={}){
    const requestId=++sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{waiting.delete(requestId);reject(Error('The helmet library did not respond. Try again.'));},60000);
      waiting.set(requestId,reply=>{clearTimeout(timer);reply.error?reject(Error(reply.error)):resolve(reply);});
      try{bridge.postMessage({type,requestId,...fields});}catch(err){waiting.delete(requestId);clearTimeout(timer);reject(err);}
    });
  }
  function receive(reply){const done=waiting.get(reply.requestId);waiting.delete(reply.requestId);done?.(reply);}
  async function db(){
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
      const r=indexedDB.open('head-room-helmets',1);
      r.onupgradeneeded=()=>{for(const key of ['files','names','fits'])r.result.createObjectStore(key);};
      r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();dbPromise=null;};resolve(r.result);};
      r.onerror=()=>{dbPromise=null;reject(r.error);};
    });
    return dbPromise;
  }
  async function transaction(stores,mode,fn){
    const connection=await db();return new Promise((resolve,reject)=>{
      const tx=connection.transaction(stores,mode),result=fn(key=>tx.objectStore(key));
      tx.oncomplete=()=>resolve(result?.());tx.onabort=()=>reject(tx.error||Error('Helmet storage is unavailable.'));
    });
  }
  async function save({id,name,bytes,thumb,head,pose}){
    if(!id){
      const key=crypto.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)):crypto.getRandomValues(new Uint8Array(16));
      id=Array.from(key,n=>n.toString(16).padStart(2,'0')).join('');
    }
    const size=bytes.byteLength,meta={id,name,size,thumb,created:Date.now()};
    if(bridge){
      const {exists}=await request('shelfBegin',{id,size});
      if(!exists)for(let offset=0;offset<size;offset+=CHUNK){
        await request('shelfChunk',{id,offset,data:encode(bytes.slice(offset,offset+CHUNK))});
      }
      await request('shelfSave',{...meta,head,pose});return id;
    }
    await transaction(['files','names','fits'],'readwrite',s=>{
      const existing=s('names').getKey(id);existing.onsuccess=()=>{
        if(existing.result===undefined){s('files').add(bytes,id);s('names').add(meta,id);}
        if(head&&pose)s('fits').put(pose,[id,head]);
      };
    });return id;
  }
  async function list(){
    if(bridge)return (await request('shelfList')).items;
    const rows=await transaction('names','readonly',s=>{const r=s('names').getAll();return ()=>r.result;});
    return rows.sort((a,b)=>b.created-a.created);
  }
  async function get(item,head){
    const {id,size}=item;
    if(bridge){
      const result=new Uint8Array(size);let pose=null;
      for(let offset=0;offset<size;){
        const r=await request('shelfRead',{id,head,offset}),chunk=new Uint8Array(decode(r.data));
        if(chunk.length!==Math.min(CHUNK,size-offset))throw Error('The saved helmet is incomplete.');
        if(!offset)pose=r.pose;result.set(chunk,offset);offset+=chunk.length;
      }return {bytes:result.buffer,pose};
    }
    return transaction(['files','fits'],'readonly',s=>{
      const data=s('files').get(id),fit=s('fits').get([id,head]);return ()=>({bytes:data.result,pose:fit.result});
    });
  }
  return {list,get,save,receive};
}
