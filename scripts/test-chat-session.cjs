const assert=require('node:assert/strict');
const fs=require('node:fs');
const storage={getItem:k=>storage[k]??null,setItem:(k,v)=>{storage[k]=v;},removeItem:k=>{delete storage[k];}};
const local={getItem:()=>JSON.stringify({email:'student@example.test'})};
let active;
function harness(){
  const slots=[],effects=[];let cursor=0;
  return {
    state(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    ref(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
    effect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((d,n)=>d!==slots[i][n])){slots[i]=deps;effects.push(fn);}},
    render(key){cursor=0;active=this;const result=hook(key,[]);while(effects.length)effects.shift()();return result;},
  };
}
const source=fs.readFileSync('src/components/useChatSession.js','utf8').replace(/^'use client';\r?\n/,'').replace(/^import .*;\r?\n/gm,'').replace(/export function/g,'function');
const {useChatSession:hook,clearChatSession,saveRequestId,completeSaveRequest,subscribeChatRecovery}=new Function('useState','useRef','useEffect','useCallback','sessionStorage','localStorage',source+'\nreturn {useChatSession,clearChatSession,saveRequestId,completeSaveRequest,subscribeChatRecovery};')(
  initial=>active.state(initial),initial=>active.ref(initial),(fn,deps)=>active.effect(fn,deps),fn=>fn,storage,local,
);
const chat=harness();chat.render('tool-draft:maker');
let result=chat.render('tool-draft:maker');result[1]([{unitId:12,unitTypeId:3}]);chat.render('tool-draft:maker');
assert.deepEqual(chat.render('tool-draft:upload')[0],[]);
chat.render('tool-draft:upload')[1]([{unitId:24,unitTypeId:4}]);chat.render('tool-draft:upload');
assert.equal(chat.render('tool-draft:maker')[0][0].unitId,12);
const refreshed=harness();refreshed.render('tool-draft:maker');assert.equal(refreshed.render('tool-draft:maker')[0][0].unitId,12);
assert.equal(refreshed.render('tool-draft:upload')[0][0].unitId,24);
const fingerprint=JSON.stringify({name:'save_planner',arguments:{name:'Draft'}});
const requestId=saveRequestId(fingerprint);
assert.equal(saveRequestId(fingerprint),requestId,'Retry keeps its ID after component remount');
completeSaveRequest(fingerprint);assert.throws(()=>saveRequestId(fingerprint),/already saved/);
let warning='';const unsubscribe=subscribeChatRecovery(value=>{warning=value;});
const originalSet=storage.setItem;
storage.setItem=()=>{throw new Error('QuotaExceeded');};
refreshed.render('tool-draft:maker')[1]([{unitId:99}]);refreshed.render('tool-draft:maker');
assert.match(warning,/may be lost on refresh/);
assert.throws(()=>saveRequestId('another draft'),/Cannot safely retain/,'Do not start a save whose retry ID cannot be stored');
storage.setItem=originalSet;unsubscribe();
clearChatSession();assert.equal(Object.keys(storage).filter(k=>k.startsWith('planner-chat-v2:')).length,0);
console.log('Task drafts, session recovery, durable retry IDs, completed-save detection, storage warnings and Clear chat checks passed.');
