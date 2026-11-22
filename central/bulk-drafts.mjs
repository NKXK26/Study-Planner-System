import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { reviewFiles } from './bulk-review.mjs';
import { fault } from './model.mjs';

const notice = 'This operation creates Draft revisions only. It does not publish planners.';
export const confirmation = 'IMPORT DRAFTS';

function classify(result, rows, snapshot) {
  const published = rows.find(r=>r.status === 'Published' || r.status === 'Superseded');
  const archived = rows.find(r=>r.status === 'Archived');
  const identical = rows.length === 1 && rows[0].status === 'Draft' && !rows[0].publishedAt &&
    isDeepStrictEqual(rows[0].snapshot,snapshot);
  const operation = published ? 'conflictingPublished' : archived ? 'conflictingArchived' :
    identical ? 'identicalDraft' : 'conflictingDraft';
  return {...result, operation, revisions:rows.map(({id,edit,version,status})=>({id,edit,version,status}))};
}

async function makePlan(db, review, actor, key) {
  const candidates = review.results.filter(r=>r.operation === 'ready').map(r=>r.series);
  const revisions = candidates.length ? await db.revision.findMany({
    where:{series:{in:candidates}}, orderBy:[{series:'asc'},{version:'asc'}]
  }) : [];
  const bySeries = Map.groupBy(revisions,r=>r.series);
  const results = review.results.map(r=>r.operation === 'ready' && bySeries.has(r.series)
    ? classify(r,bySeries.get(r.series),review.snapshots.get(r.name)) : r);
  const counts = {ready:0,identicalDraft:0,conflictingDraft:0,conflictingPublished:0,conflictingArchived:0,invalid:0,excluded:0};
  for (const r of results) counts[r.operation]++;
  const conflicts = results.filter(r=>r.operation.startsWith('conflicting'));
  const ok = !review.issues.length && !conflicts.length && !counts.invalid;
  const {bundleFingerprint, issues} = review;
  const planFingerprint = ok ? createHmac('sha256',key)
    .update(JSON.stringify([bundleFingerprint,actor.name,actor.role,results])).digest('hex') : null;
  return {ok,actor:actor.name,notice,bundleFingerprint,planFingerprint,counts,issues,results,conflicts};
}

// One secret per service instance. Restarting the service requires a new dry run.
export function createBulkImporter(db) {
  const key = randomBytes(32);
  return async function bulkImport(actor, body, apply) {
    if (!['Admin','HOD'].includes(actor?.role)) throw fault(403,'Publisher access required');
    const allowed = apply ? ['manifest','bundle','confirmation','planFingerprint'] : ['manifest','bundle'];
    if (Object.keys(body).some(k=>!allowed.includes(k))) throw fault(400,'Unexpected bulk request field.');
    if (apply && (body.confirmation !== confirmation || typeof body.planFingerprint !== 'string' ||
        !/^[a-f0-9]{64}$/.test(body.planFingerprint))) throw fault(400,'Dry-run fingerprint and typed confirmation required.');
    const review = reviewFiles(body);
    if (!apply) return makePlan(db,review,actor,key);
    return db.$transaction(async tx=>{
      const plan = await makePlan(tx,review,actor,key);
      if (!plan.ok) return plan;
      if (!timingSafeEqual(Buffer.from(plan.planFingerprint,'hex'),Buffer.from(body.planFingerprint,'hex'))) {
        throw fault(409,'Dry run has changed or expired. Run it again with the same publisher.');
      }
      const created = [], skipped = [];
      for (const r of plan.results) {
        if (r.operation === 'identicalDraft') skipped.push({id:r.revisions[0].id,name:r.name,series:r.series});
        if (r.operation !== 'ready') continue;
        const {id} = await tx.revision.create({data:{
          series:r.series,version:1,status:'Draft',snapshot:review.snapshots.get(r.name),
          events:{create:{action:'bulk import draft',actor:actor.name}}
        },select:{id:true}});
        created.push({id,name:r.name,series:r.series});
      }
      return {...plan,created,skipped,counts:{...plan.counts,created:created.length,skipped:skipped.length,published:0},
        timestamp:new Date().toISOString(),message:'Draft import complete. Nothing was published.'};
    },{isolationLevel:'Serializable',timeout:60000});
  };
}
