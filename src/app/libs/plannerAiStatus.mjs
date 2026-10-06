// Check the app server's configured service, never the browser's localhost.
export function validateModelName(model) {
  if(model==null||model==='')return '';
  if(typeof model!=='string'||model.length>200||!/^[a-zA-Z0-9][a-zA-Z0-9._/:\-]*$/.test(model))throw Object.assign(new Error('Choose an installed model from AI & setup.'),{status:400});
  return model;
}
const canonical=name=>name.includes(':')?name:name+':latest';
export async function resolvePlannerModel(model,{env=process.env,fetchImpl=fetch}={}) {
  const selected=validateModelName(model);
  if(!selected)return undefined;
  let data;
  try {
    const response=await fetchImpl((env.OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/$/,'')+'/api/tags',{cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw new Error();
    data=await response.json();if(!Array.isArray(data.models))throw new Error();
  }catch{throw Object.assign(new Error('Ollama is unavailable. Check AI & setup or continue in planner mode.'),{status:503});}
  const installed=data.models.map(m=>m.name||m.model).find(name=>typeof name==='string'&&canonical(name)===canonical(selected));
  if(!installed)throw Object.assign(new Error('That model is no longer installed. Check again and choose another model in AI & setup.'),{status:409});
  return installed;
}
export async function plannerAiStatus({env=process.env,fetchImpl=fetch,verify=false,model}={}) {
  const base=env.OLLAMA_MODEL||'llama3.2:1b';
  const configuredModels={router:env.OLLAMA_ROUTER_MODEL||base,response:env.OLLAMA_RESPONSE_MODEL||base};
  const selectedModel=validateModelName(model);
  const models=selectedModel?[selectedModel]:[...new Set(Object.values(configuredModels))];
  const url=(env.OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/$/,'');
  const localService=['localhost','127.0.0.1','::1','[::1]'].includes(new URL(url).hostname);
  const common={models,configuredModels,selectedModel,installedModels:[],localService,checkedAt:new Date().toISOString()};
  let installed;
  try {
    const response=await fetchImpl(url+'/api/tags',{cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw new Error('Unavailable');
    const data=await response.json();
    if(!Array.isArray(data.models))throw new Error('Invalid model list');
    installed=[...new Set(data.models.map(m=>m.name||m.model).filter(name=>typeof name==='string'))].sort();
    common.installedModels=installed;
  } catch {return {...common,status:'offline',missingModels:[]};}
  const missingModels=models.filter(model=>!installed.some(name=>typeof name==='string'&&canonical(name)===canonical(model)));
  if(missingModels.length)return {...common,status:'no-model',missingModels};
  if(!verify)return {...common,status:'installed',missingModels:[]};
  try {
    // Only an explicit check runs inference. No student data is sent.
    for(const model of models){
      const response=await fetchImpl(url+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),body:JSON.stringify({model,stream:false,think:false,format:'json',options:{temperature:0,num_predict:32,num_ctx:8192},messages:[{role:'user',content:'Return only JSON: {"ok":true}'}]})});
      if(!response.ok)throw new Error('Inference failed');
      const data=await response.json();
      if(data.done!==true||JSON.parse(data.message?.content||'null')?.ok!==true)throw new Error('Invalid response');
    }
    return {...common,status:'ready',missingModels:[]};
  }catch{return {...common,status:'inference-failed',missingModels:[]};}
}
