import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PrismaClient} from './generated/client/index.js';
import prismaPackage from '@prisma/client';
const { PrismaClient: SQLite } = prismaPackage;
import {createCatalogueServer} from './server.mjs';
import {readOfficialCatalogue} from '../src/app/libs/officialCatalogue.mjs';
import {hashPassword} from '../src/utils/auth/passwordHash.mjs';

if (!process.env.CATALOGUE_TEST_URL) throw Error('Set CATALOGUE_TEST_URL to a migrated disposable PostgreSQL database');
const db = new PrismaClient({datasourceUrl:process.env.CATALOGUE_TEST_URL});
const password = randomUUID(), hash = await hashPassword(password);
const server = createCatalogueServer(db,Object.fromEntries(['Admin','HOD','Student'].map(role=>[role,{hash,role}])));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
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
  await db.$disconnect();
  server.closeAllConnections();
  server.close();
}
