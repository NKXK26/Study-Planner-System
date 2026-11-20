import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PrismaClient} from './generated/client/index.js';
import {createRequire} from 'node:module';
import {EventEmitter, once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {startCatalogue} from './server.mjs';
import {readConfig} from './config.mjs';
import {readOfficialCatalogue} from '../src/app/libs/officialCatalogue.mjs';
import {hashPassword} from '../src/utils/auth/passwordHash.mjs';

const { PrismaClient: SQLite } = createRequire(new URL('../package.json', import.meta.url))('@prisma/client');
if (!process.env.CATALOGUE_TEST_URL) throw Error('Set CATALOGUE_TEST_URL to a migrated disposable PostgreSQL database');
const db = new PrismaClient({datasourceUrl:process.env.CATALOGUE_TEST_URL});
const password = randomUUID(), hash = await hashPassword(password);
const env = {CATALOGUE_DATABASE_URL: process.env.CATALOGUE_TEST_URL};
const localConfig = readConfig(env);
assert.equal(localConfig.host, '127.0.0.1');
assert.equal(localConfig.port, 4100);
assert.equal(readConfig({...env, CATALOGUE_PORT:'4200'}).port, 4200);
const staging = readConfig({...env, NODE_ENV:'production', HOST:'0.0.0.0', PORT:'4300', CATALOGUE_PORT:'4200',
  CATALOGUE_PUBLISHERS:JSON.stringify({publisher:{role:'HOD',hash}})});
assert.equal(staging.host, '0.0.0.0');
assert.equal(staging.port, 4300);
for (const mode of ['production','staging']) assert.throws(() => readConfig({...env,NODE_ENV:mode}), /at least one/);
for (const invalid of ['[', 'null', '[]', JSON.stringify({a:{role:'Student',hash}}),
  JSON.stringify({a:{role:'Admin',hash:password}})]) {
  assert.throws(() => readConfig({...env,CATALOGUE_PUBLISHERS:invalid}), /CATALOGUE_PUBLISHERS/);
}
assert.throws(() => readConfig({CATALOGUE_DATABASE_URL:'file:private.db'}), /CATALOGUE_DATABASE_URL/);
assert.throws(() => readConfig({...env, PORT:'invalid'}), /port/);
const rejected = spawnSync(process.execPath,[fileURLToPath(new URL('./server.mjs',import.meta.url))],{
  env:{...process.env,...env,NODE_ENV:'staging',CATALOGUE_PUBLISHERS:'invalid-'+password}, encoding:'utf8',timeout:5000,
});
assert.equal(rejected.status,1);
assert.equal(rejected.stdout,'');
assert.match(rejected.stderr,/CATALOGUE_PUBLISHERS/);
for (const secret of [password,hash,env.CATALOGUE_DATABASE_URL]) assert(!rejected.stderr.includes(secret));

const accounts = Object.fromEntries(['Admin','HOD','Student'].map(role=>[role,{hash,role}]));
const {server,stop} = await startCatalogue({...localConfig,port:0,accounts},db);
const base = 'http://127.0.0.1:'+server.address().port;
async function send(actor,body,method='POST') {
  return fetch(base+'/revisions',{method,headers:{Authorization:'Basic '+Buffer.from(actor+':'+password).toString('base64'),'X-Catalogue-Write':'1','Content-Type':'application/json'},body:JSON.stringify(body)});
}
async function write(actor,body) {
  const response = await send(actor,body);
  assert.equal(response.status,200,await response.clone().text());
  return response.json();
}
const category={ID:1,Name:'Core'};
const snapshot = {name:'Test CS',courseCode:'BA-CS',major:randomUUID(),intakeMonth:3,intakeYear:2025,
  wilCode:'ICT20016',wilEquivalents:['ICT20026'],plannerTemplate:{name:'BCS',requirements:[{unitType:category,unitTypeId:1,requiredCount:1}]},
  units:[{ID:1,UnitCode:'COS10001',Name:'Computing',CreditPoints:12.5,unitType:category,unitTypeId:1,offeredTerms:['Semester 1'],requisites:[]}]};
try {
  const healthy = await fetch(base+'/health');
  assert.equal(healthy.status,200);
  assert.deepEqual(await healthy.json(),{status:'ok'});
  assert.equal(healthy.headers.get('access-control-allow-origin'),null);
  assert.equal((await fetch(base+'/catalogue',{method:'POST'})).status,404);
  for (const endpoint of ['/manage','/revisions']) {
    assert.equal((await fetch(base+endpoint)).status,401);
    assert.equal((await fetch(base+endpoint,{headers:{Authorization:'Basic '+Buffer.from('Student:'+password).toString('base64')}})).status,403);
  }
  const offlineDb = new PrismaClient({datasourceUrl:'postgresql://fixture:'+password+'@127.0.0.1:1/test?connect_timeout=1'});
  const unavailable = await startCatalogue({...localConfig,port:0},offlineDb);
  try {
    const offlineBase = 'http://127.0.0.1:'+unavailable.server.address().port;
    for (const [url,status,body] of [['/health',503,{status:'unavailable'}],['/catalogue',500,{message:'Catalogue operation failed'}]]) {
      const response = await fetch(offlineBase+url);
      assert.equal(response.status,status);
      assert.deepEqual(await response.json(),body);
    }
  } finally {
    await unavailable.stop();
  }
  const events = new EventEmitter();
  let disconnects = 0;
  const delayed = await startCatalogue({...localConfig,port:0}, {
    async $queryRaw() { events.emit('started'); await once(events,'release'); },
    async $disconnect() { disconnects++; },
  });
  const started = once(events,'started');
  try {
    const pending = fetch('http://127.0.0.1:'+delayed.server.address().port+'/health');
    await started;
    const closing = delayed.stop();
    assert.equal(delayed.stop(),closing);
    assert.equal(disconnects,0);
    events.emit('release');
    assert.equal((await pending).status,200);
    await closing;
    assert.equal(disconnects,1);
  } finally {
    events.emit('release');
    await delayed.stop();
  }
  const root=await mkdtemp(path.join(tmpdir(),'planner-contexts-'));
  const dirs=[path.join(root,'student1'),path.join(root,'student2')];
  const copies=[];
  for (const dir of dirs) {
    await mkdir(dir);
    const file=path.join(dir,'planner.db');
    const local = new SQLite({datasourceUrl:'file:'+file.replaceAll('\\','/')});
    await local.$executeRawUnsafe('CREATE TABLE Draft (name TEXT)');
    await local.$executeRawUnsafe("INSERT INTO Draft VALUES ('private record')");
    await local.$disconnect();
    copies.push(await readFile(file));
  }
  const refresh=(dir,options={})=>readOfficialCatalogue({url:base+'/catalogue',dir,...options});
  const draft=await write('HOD',{action:'create',snapshot});
  assert(!(await refresh(dirs[0])).data.some(p=>p.id===draft.id));
  for (const action of ['create','save','publish','archive','revise','delete']) {
    assert.equal((await send('Student',{action,id:draft.id,edit:draft.edit,snapshot})).status,403);
  }
  assert.equal((await send('Student',undefined,'DELETE')).status,403);
  await write('Admin',{action:'publish',id:draft.id,edit:draft.edit});
  for (const dir of dirs) assert((await refresh(dir)).data.some(p=>p.id===draft.id && p.version===1));
  const revised=await write('HOD',{action:'revise',id:draft.id});
  const edited=await write('HOD',{action:'save',id:revised.id,edit:revised.edit,snapshot:{...snapshot,name:'Correction'}});
  await write('HOD',{action:'publish',id:edited.id,edit:edited.edit});
  const offline=await refresh(dirs[0],{request:async()=>{throw Error('offline')}});
  assert.equal(offline.source,'cache');
  assert(offline.data.some(p=>p.id===draft.id));
  for (const dir of dirs) {
    const latest=await refresh(dir);
    assert.equal(latest.source,'central');
    assert(!latest.data.some(p=>p.id===draft.id));
    assert(latest.data.some(p=>p.id===edited.id && p.version===2));
  }
  const old=await db.revision.findUniqueOrThrow({where:{id:draft.id}});
  assert.equal(old.status,'Superseded');
  assert.deepEqual(old.snapshot,snapshot);
  assert.equal((await send('Admin',{action:'save',id:old.id,edit:old.edit,snapshot})).status,409);
  const current=await db.revision.findUniqueOrThrow({where:{id:edited.id}});
  await write('Admin',{action:'archive',id:current.id,edit:current.edit});
  assert(!(await refresh(dirs[1])).data.some(p=>p.id===current.id));
  for (const [i,dir] of dirs.entries()) assert.deepEqual(await readFile(path.join(dir,'planner.db')),copies[i]);
  console.log('PostgreSQL publication lifecycle, endpoint permissions, two SQLite contexts, offline cache and recovery passed.');
} finally {
  const draining = stop();
  assert.equal(stop(),draining);
  await draining;
  assert.equal(server.listening,false);
  await assert.rejects(fetch(base+'/health'));
}
