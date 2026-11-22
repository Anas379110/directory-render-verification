'use client';
import { useState, useSyncExternalStore } from 'react';
const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const eventName='directory-attempt-change';
const subscribe=(callback:()=>void)=>{window.addEventListener('storage',callback);window.addEventListener(eventName,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(eventName,callback);};};
/** A per-tab owner-scoped reference, not form contents or a credential. */
export function useAttemptResume(scope:string,ownerId?:string,enabled=false){
  const key=enabled&&ownerId?`directory-write:${ownerId}:${scope}`:null;
  const [localPending,setPending]=useState<{id:string;key:string|null}|null>(null);
  const [inFlight,setInFlight]=useState(false);
  const read=()=>{if(!key)return null;try{const id=sessionStorage.getItem(key);return id&&validId(id)?id:null;}catch{return null;}};
  const saved=useSyncExternalStore(subscribe,read,()=>null);
  const changed=()=>window.dispatchEvent(new Event(eventName));
  function begin(){
    if(!key)return null;
    const existing=sessionStorage.getItem(key);
    if(existing&&validId(existing)){setPending({id:existing,key});throw new Error('يوجد إرسال سابق ينتظر التحقق. لا تُعد الإرسال.');}
    const id=crypto.randomUUID();sessionStorage.setItem(key,id);setInFlight(true);changed();return id;
  }
  function uncertain(id:string){try{if(key)sessionStorage.setItem(key,id);}catch{/* the original pre-send reference remains the recovery anchor */}setInFlight(false);setPending({id,key});changed();}
  function clear(){try{if(key)sessionStorage.removeItem(key);}catch{/* a leftover reference only rechecks the committed result */}setInFlight(false);setPending(null);changed();}
  return {pendingId:(localPending?.key===key?localPending?.id:null)??(!inFlight?saved:null),begin,uncertain,clear};
}
