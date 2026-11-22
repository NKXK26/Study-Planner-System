import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempDisposable,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createCatalogueClient} from './database.mjs';
import {startCatalogue} from './server.mjs';
import {hashPassword} from './passwordHash.mjs';
import {runCli} from './bulk-cli.mjs';
import {syntheticReviewFiles} from './bulk-test-fixture.mjs';

test('bulk draft import over authenticated HTTP with real PostgreSQL transactions',async t=>{
  const url = URL.parse(process.env.CATALOGUE_TEST_URL ?? '');
  assert.ok(url && ['postgres:','postgresql:'].includes(url.protocol) && url.hostname === '127.0.0.1' &&
    !url.search && !url.hash && /^\/bulk_test_[a-z0-9_]+$/.test(url.pathname),'Use a new local bulk_test_* database.');
  const db = createCatalogueClient(url.href);
  try {
    const counts = await Promise.all([db.revision.count(), db.publicationEvent.count()]);
    assert.deepEqual(counts,[0,0],'Use an empty migrated disposable database.');
  } catch (error) {
    await db.$disconnect();
    throw error;
  }
  const pwd=randomUUID(), hash=await hashPassword(pwd);
  const accounts = Object.fromEntries(['HOD','Admin','Student','Lecturer'].map(role=>[role,{role,hash}]));
  accounts.otherHod = {role:'HOD',hash};
  const {server,stop}=await startCatalogue({accounts,port:0,host:'127.0.0.1'},db);
  t.after(stop);
  const base='http://127.0.0.1:'+server.address().port;
  const files = syntheticReviewFiles();
  const dir = await mkdtempDisposable(join(tmpdir(),'bulk-test-'));
  t.after(dir.remove);
  const manifest = join(dir.path,'manifest.json');
  const bundle = join(dir.path,'drafts.json');
  await Promise.all([writeFile(manifest,files.manifest),writeFile(bundle,files.bundle)]);
  const names=JSON.parse(files.bundle).map(p=>p.name);
  async function send(actor,action,body,headers={}) {
    const auth = actor ? {Authorization:'Basic '+Buffer.from(actor+':'+pwd).toString('base64')} : {};
    const response=await fetch(base+'/revisions/bulk/'+action,{method:'POST',
      headers:{...auth,'Content-Type':'application/json','X-Catalogue-Write':'1',...headers},body:JSON.stringify(body)});
    const raw=await response.text();
    for (const secret of [pwd,hash,url.href,auth.Authorization].filter(Boolean)) assert.equal(raw.includes(secret),false);
    assert.equal(response.headers.get('access-control-allow-origin'),null);
    return {status:response.status,data:JSON.parse(raw)};
  }
  const size=async()=>[await db.revision.count(),await db.publicationEvent.count()];
  let token;
  const apply=(extra={})=>({...files,planFingerprint:token,confirmation:'IMPORT DRAFTS',...extra});
  const flags=['--url',base,'--manifest',manifest,'--bundle',bundle];
  const creds={CATALOGUE_PUBLISHER_USER:'HOD',CATALOGUE_PUBLISHER_PASSWORD:pwd};
  const messages=[];
  const cli=(extra)=>runCli([...flags,...extra],creds,m=>messages.push(m));

  await t.test('publisher boundaries, request limits and dry-run determinism',async()=>{
    for (const op of ['plan','apply']) {
      for (const [actor,status] of [[null,401],['Student',403],['Lecturer',403]]) {
        assert.equal((await send(actor,op,files)).status,status);
      }
    }
    assert.equal((await send('Admin','plan',files,{'Content-Type':'text/plain'})).status,403);
    assert.equal((await send('Admin','plan',files,{'X-Catalogue-Write':'0'})).status,403);
    assert.equal((await send('Admin','plan',{...files,databaseUrl:'unexpected'})).status,400);
    assert.equal((await send('Admin','plan',{...files,bundle:' '.repeat(4*1024*1024)})).status,413);
    const a=await send('HOD','plan',files), b=await send('HOD','plan',files), c=await send('Admin','plan',files);
    assert.equal(a.status,200);assert.equal(c.status,200);assert.deepEqual(a.data,b.data);
    assert.equal(a.data.counts.ready,23);assert.equal(a.data.counts.excluded,7);assert.equal(a.data.results.length,30);
    token=a.data.planFingerprint;
    assert.notEqual(token,c.data.planFingerprint);assert.equal(a.data.bundleFingerprint,c.data.bundleFingerprint);
    const invalid=await send('HOD','plan',{...files,bundle:'[]'});
    assert.equal(invalid.status,422);assert.equal(invalid.data.planFingerprint,null);
    assert.equal((await send('Admin','apply',apply())).status,409);
    assert.equal((await send('otherHod','apply',apply())).status,409);
    assert.equal((await send('HOD','apply',apply({bundle:files.bundle+'\n'}))).status,409);
    assert.equal((await send('HOD','apply',apply({confirmation:'yes'}))).status,400);
    assert.equal((await send('HOD','apply',apply({planFingerprint:undefined}))).status,400);
    assert.equal(await cli([]),0);assert.equal(await cli(['--apply']),1);
    assert.equal(await cli(['--password','forbidden']),1);
    assert.deepEqual(await size(),[0,0]);
  });
  await t.test('last planner failure rolls back drafts and audit events',async()=>{
    // Reject the final synthetic planner after the preceding inserts have been attempted.
    assert.equal(names.at(-1),'32-Sep-CSSD');
    await db.$executeRawUnsafe('ALTER TABLE "Revision" ADD CONSTRAINT bulk_test_last CHECK (snapshot->>\'name\' <> \'32-Sep-CSSD\')');
    try {
      const rejected=await send('HOD','apply',apply());
      assert.equal(rejected.status,500);assert.equal(rejected.data.message,'Catalogue operation failed');
      assert.deepEqual(await size(),[0,0]);
      const [sequence]=await db.$queryRawUnsafe('SELECT last_value FROM "Revision_id_seq"');
      assert.ok(Number(sequence.last_value)>=23,'All 23 inserts were attempted');
    } finally { await db.$executeRawUnsafe('ALTER TABLE "Revision" DROP CONSTRAINT bulk_test_last'); }
  });
  await t.test('concurrent apply creates exactly 23 drafts, followed by idempotent recovery',async()=>{
    const attempts=await Promise.all([send('HOD','apply',apply()),send('HOD','apply',apply())]);
    assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
    const receipt=attempts.find(r=>r.status===200).data;
    assert.deepEqual(receipt.created.map(r=>r.name).sort(),[...names].sort());
    assert.equal(receipt.actor,'HOD');assert.ok(Date.parse(receipt.timestamp));assert.equal(receipt.counts.published,0);
    assert.deepEqual(await size(),[23,23]);
    assert.equal(await db.revision.count({where:{status:'Draft',version:1}}),23);
    assert.equal(await db.publicationEvent.count({where:{actor:'HOD',action:'bulk import draft'}}),23);
    assert.deepEqual((await (await fetch(base+'/catalogue')).json()).data,[]);
    const retry=(await send('HOD','plan',files)).data;
    assert.equal(retry.counts.identicalDraft,23);assert.notEqual(retry.planFingerprint,token);
    const noop=await send('HOD','apply',apply({planFingerprint:retry.planFingerprint}));
    assert.equal(noop.data.skipped.length,23);assert.equal(noop.data.created.length,0);
    assert.equal(await cli(['--apply','--expected-plan',retry.planFingerprint,'--confirm','IMPORT DRAFTS']),0);
    assert.deepEqual(await size(),[23,23]);
  });
  await t.test('different drafts and historical published or archived series block the whole batch',async()=>{
    const rows=await db.revision.findMany({orderBy:{id:'asc'}});
    const oldToken=(await send('HOD','plan',files)).data.planFingerprint;
    await db.revision.update({where:{id:rows[0].id},data:{edit:{increment:1}}});
    assert.equal((await send('HOD','apply',apply({planFingerprint:oldToken}))).status,409);
    await db.revision.update({where:{id:rows[0].id},data:{snapshot:{...rows[0].snapshot,name:'Test edit'},edit:{increment:1}}});
    // Model prior history in the disposable DB. Even an identical Draft in the same series cannot bypass it.
    for (const [i,status] of [[1,'Published'],[2,'Archived'],[3,'Superseded']]) {
      await db.revision.create({data:{series:rows[i].series,version:2,status,
        publishedAt:status === 'Archived' ? null : new Date(),snapshot:{...rows[i].snapshot,name:'Test history'}}});
    }
    const before=await db.revision.findMany({orderBy:{id:'asc'}});
    const denied=await send('HOD','apply',apply({planFingerprint:oldToken}));
    assert.equal(denied.status,409);assert.equal(denied.data.planFingerprint,null);
    assert.equal(denied.data.counts.conflictingDraft,1);assert.equal(denied.data.counts.conflictingPublished,2);
    assert.equal(denied.data.counts.conflictingArchived,1);
    assert.equal(await cli([]),1);
    assert.deepEqual(await db.revision.findMany({orderBy:{id:'asc'}}),before);
    assert.equal(await db.publicationEvent.count(),23);
    assert.ok(messages.every(m=>![pwd,hash,url.href].some(s=>m.includes(s))));
  });
});
