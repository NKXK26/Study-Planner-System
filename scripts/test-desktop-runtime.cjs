const assert=require('node:assert/strict');
const http=require('node:http');
const {EventEmitter}=require('node:events');
const {availablePort,waitForServer}=require('../electron/server');
(async()=>{
  const occupied=http.createServer((req,res)=>res.end('another application'));
  await new Promise(r=>occupied.listen(0,'127.0.0.1',r));
  try{const free=await availablePort(occupied.address().port);assert.notEqual(free,occupied.address().port);assert(free>0);
    await assert.rejects(waitForServer('http://127.0.0.1:'+occupied.address().port,new EventEmitter(),'ours',100),/not become ready/);
    const child=new EventEmitter();const failed=waitForServer('http://127.0.0.1:'+free,child,'ours');child.emit('error',new Error('ENOENT'));await assert.rejects(failed,/ENOENT/);
    const exited=new EventEmitter();const early=waitForServer('http://127.0.0.1:'+free,exited,'ours');exited.emit('exit',1,null);await assert.rejects(early,/stopped before startup/);
  }finally{await new Promise(r=>occupied.close(r));}
  const ready=http.createServer((req,res)=>{assert.equal(req.headers['x-desktop-token'],'ours');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ready:true,token:'ours'}));});
  await new Promise(r=>ready.listen(0,'127.0.0.1',r));
  try{await waitForServer('http://127.0.0.1:'+ready.address().port,new EventEmitter(),'ours');}finally{await new Promise(r=>ready.close(r));}
  console.log('Desktop startup: occupied port, unrelated server, spawn errors, early exit and owned-server readiness passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
