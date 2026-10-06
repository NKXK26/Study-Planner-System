export function personalPlanKey(identity) {return 'personal-study-plans-v1:'+String(identity||'dev').toLowerCase();}
export function validatePersonalDraft(draft) {
  const s=draft?.snapshot;
  if(typeof draft?.id!=='string'||draft.id.length>100||typeof draft.name!=='string'||draft.name.length>100||!Number.isInteger(s?.planner?.id)||typeof s.planner.name!=='string'||!Array.isArray(s.units)||s.units.length>100||!s.units.every(u=>typeof u.code==='string'&&typeof u.name==='string'&&Number.isFinite(u.credits)&&u.credits>0)||!['Semester 1','Semester 2'].includes(s.term)||!Number.isInteger(s.year))throw new Error('A saved draft is invalid.');
  return draft;
}
export function readPersonalDrafts(storage,identity) {
  const drafts=JSON.parse(storage.getItem(personalPlanKey(identity))||'[]');
  if(!Array.isArray(drafts)||drafts.length>20)throw new Error('Saved drafts could not be read.');
  return drafts.map(validatePersonalDraft);
}
export function writePersonalDrafts(storage,identity,drafts) {
  if(drafts.length>20)throw new Error('You can keep up to 20 drafts. Delete an old draft first.');
  storage.setItem(personalPlanKey(identity),JSON.stringify(drafts.map(validatePersonalDraft)));
}
