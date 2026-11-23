import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {test} from 'node:test';
import vm from 'node:vm';
import {reviewFiles} from './bulk-review.mjs';
import {snapshotHash,syntheticReviewFiles} from './bulk-test-fixture.mjs';

const input = syntheticReviewFiles();
function modified(edit) {
  const manifest = JSON.parse(input.manifest), bundle = JSON.parse(input.bundle);
  edit(manifest,bundle);
  return {manifest:JSON.stringify(manifest),bundle:JSON.stringify(bundle)};
}
function refreshHash(m,b) { m.planners[0].canonicalSha256 = snapshotHash(b[0]); }

test('reviewed inputs and file limits',()=>{
  const plan = reviewFiles(input);
  assert.deepEqual(syntheticReviewFiles(),input);
  assert.equal(reviewFiles(syntheticReviewFiles()).bundleFingerprint,plan.bundleFingerprint);
  assert.deepEqual(plan.issues,[]);
  assert.equal(plan.results.filter(r=>r.operation === 'ready').length,23);
  assert.equal(plan.results.filter(r=>r.operation === 'excluded').length,7);
  assert.equal(plan.results.filter(r=>r.operation === 'excluded' && r.reason === 'blocked').length,6);
  assert.equal(plan.results.find(r=>r.name === '25-Mar-CSCS').operation,'excluded');
  for (const bad of [{manifest:'{'},{bundle:'{}'},{manifest:'null'},{bundle:'x'},{bundle:undefined}]) {
    assert.throws(()=>reviewFiles({...input,...bad}),{status:400});
  }
  assert.throws(()=>reviewFiles({...input,bundle:JSON.stringify(Array(101).fill(null))}),{status:413});
  assert.throws(()=>reviewFiles({...input,manifest:JSON.stringify({...JSON.parse(input.manifest),planners:Array(101).fill({})})}),{status:413});
});

const reviewDir = process.env.CATALOGUE_REVIEW_DIR;
test('real V2 review package compatibility',{
  skip:reviewDir ? false : 'Set CATALOGUE_REVIEW_DIR to opt in to the real V2 compatibility test.'
},async()=>{
  const [manifest,bundle] = await Promise.all([
    readFile(join(reviewDir,'manifest.json'),'utf8'),
    readFile(join(reviewDir,'ba-cs-2024-2026-drafts.json'),'utf8')
  ]);
  const plan = reviewFiles({manifest,bundle});
  assert.deepEqual(plan.issues,[]);
  assert.equal(plan.results.length,30);
  assert.equal(plan.results.filter(r=>r.operation === 'ready').length,23);
  assert.equal(plan.results.filter(r=>r.operation === 'excluded' && r.reason === 'blocked').length,6);
  assert.equal(plan.results.find(r=>r.name === '25-Mar-CSCS').operation,'excluded');
});

test('inconsistent manifests, snapshots, exclusions and checksums fail closed',()=>{
  const invalid = [
    m=>m.summary.bundled++, m=>m.planners.shift(), (m,b)=>b.push(b[0]), m=>m.planners.push(m.planners[0]),
    (m,b)=>b.pop(), (m,b)=>{b[0].status='Published';refreshHash(m,b);},
    (m,b)=>{b[0].units[0].Name='Unreviewed';}, (m,b)=>{b[0].units.push(b[0].units[0]);refreshHash(m,b);},
    (m,b)=>{b[0].units[0].ID++;refreshHash(m,b);}, m=>m.planners[0].major='Missing',
    m=>{m.planners[0].alreadyPresent=true;}, m=>{m.planners[0].status='blocked';m.planners[0].errors=['review'];},
    (m,b)=>b.push({...b[0],name:'25-Mar-CSCS',intakeMonth:3,intakeYear:2025}),
    m=>{m.planners[0].sources=[];}, m=>{m.planners[0].schemaValidation='failed';}
  ];
  for (const edit of invalid) {
    const plan = reviewFiles(modified(edit));
    assert.ok(plan.issues.length || plan.results.some(r=>r.operation==='invalid'),String(edit));
  }
});

test('future-year reviewed batch and edited fingerprints',()=>{
  const input2 = modified((m,b)=>{
    const p=b[0], r=m.planners[0];
    p.intakeYear=r.intakeYear=2028;
    p.name=r.name='28-Feb-CSCS';
    r.canonicalFile='2028 February-March/28-Feb-CSCS/28-Feb-CSCS.json';
    b.splice(1); m.planners.splice(1);
    m.summary={expected:1,discovered:1,bundled:1,valid:1,blocked:0,missing:0};
    refreshHash(m,b);
  });
  assert.equal(reviewFiles(input2).results[0].operation,'ready');
  assert.notEqual(reviewFiles(input2).bundleFingerprint,reviewFiles(input).bundleFingerprint);
});

test('management page requires dry run and typed confirmation, invalidates changed files and blocks double submission',async()=>{
  const html = await readFile(new URL('./manage.html',import.meta.url),'utf8');
  assert.match(html,/This operation creates Draft revisions only\. It does not publish planners\./);
  const nodes = new Map();
  const node = () => ({files:[],value:'',textContent:'',replaceChildren(){},append(){}});
  function byId(id) { if (!nodes.has(id)) nodes.set(id,node()); return nodes.get(id); }
  const calls=[];
  vm.runInNewContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1],{
    byId, document:{createElement:node},edited:()=>false,reload:async()=>{},fetch:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body)});
      return {ok:true,json:async()=>({ok:true,planFingerprint:'abc',counts:{ready:1},results:[{name:'example',operation:'ready'}]})};
    }
  });
  const dry = byId('bulk-plan'), apply = byId('bulk-apply'), confirm = byId('bulk-confirm');
  assert.ok(dry.disabled && apply.disabled);
  for (const id of ['bulk-manifest','bulk-bundle']) {
    byId(id).files=[{size:2,text:async()=>'{}'}]; byId(id).onchange();
  }
  await dry.onclick(); assert.ok(apply.disabled);
  confirm.value='IMPORT DRAFTS';confirm.oninput();assert.equal(apply.disabled,false);
  byId('bulk-bundle').onchange();assert.ok(apply.disabled);assert.equal(confirm.value,'');
  await dry.onclick();confirm.value='IMPORT DRAFTS';confirm.oninput();
  await Promise.all([apply.onclick(),apply.onclick()]);
  assert.deepEqual(calls.map(c=>c.url),['/revisions/bulk/plan','/revisions/bulk/plan','/revisions/bulk/apply']);
  assert.equal(calls[2].body.confirmation,'IMPORT DRAFTS');
  assert.ok(apply.disabled);
});
