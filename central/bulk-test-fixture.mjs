import {createHash} from 'node:crypto';

export const snapshotHash = snapshot => sha256(JSON.stringify(snapshot,null,2)+'\n');
const sha256 = text => createHash('sha256').update(text,'utf8').digest('hex');

const majors = [
  ['CSCS','Cybersecurity'], ['CSDS','Data Science'], ['CSAI','Artificial Intelligence'],
  ['CSSD','Software Development'], ['CSIOT','Internet of Things']
];
const intakes = [
  [2030,2,'Feb'], [2030,9,'Sep'], [2031,2,'Feb'],
  [2031,9,'Sep'], [2032,3,'Mar'], [2032,9,'Sep']
];
const unitGroups = [
  {type:{ID:2,Name:'Core'}, prefix:'TCR', units:8, requiredCount:8},
  {type:{ID:3,Name:'Major'}, prefix:'TMJ', units:8, requiredCount:8},
  {type:{ID:1,Name:'Elective'}, prefix:'TEL', units:7, requiredCount:6},
  {type:{ID:17,Name:'WIL Placement'}, prefix:'ICT', units:1, requiredCount:1}
];

function planner(intakeYear, intakeMonth, month, [suffix, major]) {
  const name = String(intakeYear).slice(-2)+'-'+month+'-'+suffix;
  const wilCode = 'ICT20016';
  const units = unitGroups.flatMap(({type,prefix,units:count},group) => Array.from({length:count},(_,i) => {
    const wil = type.ID === 17;
    const prescribed = type.ID === 1 && i < 2;
    return {
      ID:10000 + group * 100 + i,
      UnitCode:wil ? wilCode : prefix+String(10001+i),
      Name:'Synthetic '+type.Name+' '+(i+1)+(prescribed ? '*' : ''),
      CreditPoints:wil ? 25 : 12.5,
      unitType:type,
      unitTypeId:type.ID,
      offeredTerms:wil ? ['Summer','Winter'] : ['Semester 1','Semester 2'],
      requisites:[],
      ...(wil ? {plannedYear:3} : type.ID !== 1 || prescribed
        ? {plannedYear:type.ID === 2 ? 1 : 2, plannedSemester:i < 4 ? 'Semester 1' : 'Semester 2'}
        : {})
    };
  }));
  const requirements = unitGroups.map(({type,requiredCount})=>({unitType:type,unitTypeId:type.ID,requiredCount}));
  return {
    name, courseCode:'BA-CS', major, intakeYear, intakeMonth, units,
    plannerTemplate:{name:'Synthetic BA-CS requirements',requirements},
    wilCode, wilEquivalents:[wilCode,'ICT20026']
  };
}

export function syntheticReviewFiles() {
  const all = intakes.flatMap(intake=>majors.map(major=>planner(...intake,major))).slice(0,29);
  all.push(planner(2025,3,'Mar',majors[0]));
  const blockedIndexes = new Set([4,5,9,13,18,23]);
  const bundle = [];
  const index = 'https://catalogue-fixture.invalid/planners';
  const planners = all.map((snapshot,i)=>{
    const {name,courseCode,major,intakeYear,intakeMonth} = snapshot;
    const blocked = blockedIndexes.has(i);
    const alreadyPresent = name === '25-Mar-CSCS';
    if (!blocked && !alreadyPresent) bundle.push(snapshot);
    const filename = name+'.pdf';
    const record = {
      name, courseCode, major, intakeYear, intakeMonth, batch:String(intakeYear),
      alreadyPresent:alreadyPresent ? true : null,
      sources:[{name,filename,url:index+'/'+filename,errors:[],sha256:sha256('Synthetic source '+filename)}],
      errors:blocked ? ['Synthetic review blocker'] : [],
      warnings:[],
      publishedRevisions:alreadyPresent ? [{id:1,version:1,name,publishedAt:'2025-03-01T00:00:00.000Z'}] : [],
      status:blocked ? 'blocked' : 'valid',
      schemaValidation:blocked ? 'not submitted' : 'passed'
    };
    if (blocked) return record;
    const electives = snapshot.units.filter(u=>u.unitType.Name === 'Elective');
    return {
      ...record,
      canonicalFile:intakeYear+'/'+name+'/'+name+'.json',
      canonicalSha256:snapshotHash(snapshot),
      prescribed:electives.filter(u=>u.Name.endsWith('*')).map(u=>u.UnitCode),
      recommended:electives.filter(u=>!u.Name.endsWith('*')).map(u=>u.UnitCode)
    };
  });
  const summary = {
    expected:all.length, discovered:all.length, valid:all.length-blockedIndexes.size,
    blocked:blockedIndexes.size, missing:0, bundled:bundle.length
  };
  const manifest = {index,indexSha256:sha256('Synthetic review index'),summary,publicCatalogueSha256:null,planners};
  return {manifest:JSON.stringify(manifest,null,2)+'\n',bundle:JSON.stringify(bundle,null,2)+'\n'};
}
