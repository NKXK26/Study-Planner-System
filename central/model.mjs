import Ajv from 'ajv';

const text = { type: 'string', minLength: 1, maxLength: 2048 };
const id = { type: 'integer', minimum: 1 };
const count = { type: 'integer', minimum: 0 };
const optional = schema => ({ anyOf: [schema, {type: 'null'}] });
const list = (items, minItems = 0) => ({ type: 'array', items, minItems, maxItems: 2000 });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const category = object({ ID: id, Name: text, Colour: optional(text) }, ['ID','Name']);
const reference = object({ ID: id, UnitCode: text, Name: text });
const unit = object({
  ...reference.properties, CreditPoints: { type: 'number', minimum: 0 }, Availability: text,
  unitType: category, unitTypeId: id, plannedYear: optional(id), plannedSemester: optional(text),
  plannedDates: optional(text), sortOrder: count, offeredTerms: list(text),
  requisites: list(object({ relationship: text, logicalOperator: optional(text), minCredits: optional({type:'number'}), unit: optional(reference) })),
}, ['ID','UnitCode','Name','CreditPoints','unitType','unitTypeId','offeredTerms','requisites']);
const requirement = object({ id, plannerTemplateId: id, unitTypeId: id, requiredCount: count, unitType: category }, ['unitTypeId','unitType','requiredCount']);
const template = object({ id, name: text, createdAt: text, updatedAt: text, requirements: list(requirement,1) }, ['name','requirements']);
const validate = new Ajv().compile(object({
  name: text, courseCode: {type:'string',pattern:'^[A-Z0-9-]{1,32}$'}, major: text,
  intakeYear: {type:'integer',minimum:2000,maximum:2199}, intakeMonth: {type:'integer',minimum:1,maximum:12},
  plannerTemplate: template, units: list(unit,1), wilCode: text, wilEquivalents: list(text),
}));
export function checkedSnapshot(value) {
  if (!validate(value)) throw fault(400, 'Invalid planner field ' + validate.errors[0].dataPath + ' ' + validate.errors[0].message);
  return value;
}
export class CatalogueFault extends Error {}
export function fault(status, message) { return Object.assign(new CatalogueFault(message), { status }); }
export const seriesOf = p => JSON.stringify([p.courseCode,p.intakeYear,p.intakeMonth,p.major.trim().toLowerCase()]);
export function publicPlanner(r) {
  return {...r.snapshot, units:r.snapshot.units.map(u=>({...u,isOfficialWil:u.UnitCode===r.snapshot.wilCode})), id:r.id, version:r.version, status:r.status, createdAt:r.createdAt, publishedAt:r.publishedAt};
}
export async function change(db, actor, {action, id, edit, snapshot}) {
  if (!['Admin','HOD'].includes(actor?.role)) throw fault(403,'Publisher access required');
  return db.$transaction(async tx => {
    const rows = tx.revision;
    let row;
    if (action === 'create' || action === 'revise') {
      if (action === 'revise') {
        const old = await rows.findUnique({where:{id}});
        if (!old) throw fault(404,'Revision missing');
        snapshot = old.snapshot;
      }
      checkedSnapshot(snapshot);
      const series = seriesOf(snapshot);
      const last = await rows.findFirst({where:{series},orderBy:{version:'desc'}});
      if (last && action === 'create') throw fault(409,'Series exists. Revise an existing version.');
      row = await rows.create({data:{series,version:(last?.version || 0)+1,snapshot}});
    } else {
      if (!['save','publish','archive'].includes(action)) throw fault(405,'Unsupported operation');
      if (!Number.isInteger(id) || !Number.isInteger(edit)) throw fault(400,'Revision and edit number required');
      const current = await rows.findUnique({where:{id}});
      if (!current || current.edit !== edit) throw fault(409,'Revision changed. Reload before continuing.');
      if (action !== 'archive' && current.status !== 'Draft') throw fault(409,'Only drafts can be edited or published');
      const data = {edit:{increment:1}};
      if (action === 'save') {
        checkedSnapshot(snapshot);
        if (seriesOf(snapshot) !== current.series) throw fault(409,'Create a new series for a different intake, course or major');
        data.snapshot = snapshot;
      } else if (action === 'publish') {
        checkedSnapshot(current.snapshot);
        const newest = await rows.findFirst({where:{series:current.series,publishedAt:{not:null}},orderBy:{version:'desc'}});
        if (newest && newest.version >= current.version) throw fault(409,'A newer revision has already been published');
        await rows.updateMany({where:{series:current.series,status:'Published'},data:{status:'Superseded',edit:{increment:1}}});
        Object.assign(data,{status:'Published',publishedAt:new Date()});
      } else { data.status = 'Archived'; }
      row = await rows.update({where:{id,edit},data});
    }
    await tx.publicationEvent.create({data:{revisionId:row.id,action,actor:actor.name}});
    return row;
  }, {isolationLevel:'Serializable'});
}
