// Read-only measurements. HTML timings exclude client hydration; asset bytes are decoded sizes.
(async()=>{
  const base=process.argv[2]||'http://127.0.0.1:3000';
  const paths=['/view/dashboard','/view/ai-assistant','/view/double-major-checker'];
  for(const route of paths){
    let html='';const timings=[];
    for(let attempt=0;attempt<2;attempt++){
      const start=Date.now();const response=await fetch(new URL(route,base),{signal:AbortSignal.timeout(45000)});
      html=await response.text();timings.push({status:response.status,ms:Date.now()-start});
    }
    const scripts=[...new Set([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')).filter(src=>src.startsWith('/_next/')))];
    const assets=await Promise.all(scripts.map(async src=>{
      const response=await fetch(new URL(src,base),{signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw Error('Asset failed: '+src+' ('+response.status+')');
      return {src,bytes:(await response.arrayBuffer()).byteLength};
    }));
    console.log(JSON.stringify({base,route,htmlTimings:timings,decodedJavaScriptBytes:assets.reduce((n,a)=>n+a.bytes,0),assets}));
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
