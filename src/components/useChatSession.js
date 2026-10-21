'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
let recoveryIssue='';
const recoveryListeners=new Set();
function reportRecoveryFailure() {
  recoveryIssue='Browser recovery storage is unavailable, full or unreadable. Changes remain on this page, but may be lost on refresh. Keep this tab open and save important work.';
  recoveryListeners.forEach(listener=>listener(recoveryIssue));
}
export function subscribeChatRecovery(listener) {
  recoveryListeners.add(listener);listener(recoveryIssue);
  return ()=>recoveryListeners.delete(listener);
}

function storageKey(key) {
  let identity='dev';
  try { identity=JSON.parse(localStorage.getItem('userProfile')||'null')?.email||identity; } catch {}
  return `planner-chat-v2:${identity}:${key.split(':')[0]}`;
}
// Session-only recovery: cleared on Clear chat, isolated by signed-in account.
export function useChatSession(key,initial) {
  const fallback=useRef(initial);
  const [values,setValues]=useState({}),[ready,setReady]=useState(false);
  useEffect(()=>{
    try { const saved=JSON.parse(sessionStorage.getItem(storageKey(key))||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))setValues(saved);else reportRecoveryFailure(); } catch {reportRecoveryFailure();}
    setReady(true);
  },[]);
  useEffect(()=>{if(ready)try{sessionStorage.setItem(storageKey(key),JSON.stringify(values));}catch{reportRecoveryFailure();}},[values,ready,key]);
  const value=Object.hasOwn(values,key)?values[key]:fallback.current;
  const setValue=useCallback(next=>setValues(current=>({...current,[key]:typeof next==='function'?next(Object.hasOwn(current,key)?current[key]:fallback.current):next})),[key]);
  return [value,setValue,ready];
}
export function clearChatSession() {
  const prefix=storageKey('messages').replace(/:messages$/,'');
  try { Object.keys(sessionStorage).filter(k=>k.startsWith(prefix+':')).forEach(k=>sessionStorage.removeItem(k)); } catch {reportRecoveryFailure();}
}
export function saveRequestId(fingerprint) {
  try {
    const key=storageKey('save-requests'),requests=JSON.parse(sessionStorage.getItem(key)||'{}');
    if(requests[fingerprint]?.complete)throw new Error('This draft was already saved. Change it or reload the saved record.');
    if(requests[fingerprint]?.id)return requests[fingerprint].id;
    const id=crypto.randomUUID();requests[fingerprint]={id};
    // Store before sending so even a refresh during the request keeps the same ID.
    sessionStorage.setItem(key,JSON.stringify(requests));return id;
  } catch(e) {
    if(e.message?.includes('already saved'))throw e;
    reportRecoveryFailure();throw new Error('Cannot safely retain this save request. Free browser session storage or enable it, then retry. Your draft remains here.');
  }
}
export function completeSaveRequest(fingerprint) {
  try {const key=storageKey('save-requests'),requests=JSON.parse(sessionStorage.getItem(key)||'{}');if(requests[fingerprint])requests[fingerprint].complete=true;sessionStorage.setItem(key,JSON.stringify(requests));}
  catch {reportRecoveryFailure();}
}
