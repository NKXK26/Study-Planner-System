import { createHash } from 'node:crypto';
import { checkedSnapshot, fault, seriesOf } from './model.mjs';

export const maxPlanners = 100;
export const bulkBodyLimit = 4 * 1024 * 1024;
export const digest = value => createHash('sha256').update(value).digest('hex');
const checksum = /^[a-f0-9]{64}$/;
const isChecksum = value => typeof value === 'string' && checksum.test(value);
const majors = new Map(Object.entries({
  CSCS: 'Cybersecurity', CSAI: 'Artificial Intelligence', CSDS: 'Data Science',
  CSSD: 'Software Development', CSIOT: 'Internet of Things'
}));
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const pilot = seriesOf({courseCode:'BA-CS', intakeYear:2025, intakeMonth:3, major:'Cybersecurity'});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeName = value => typeof value === 'string' && /^[A-Za-z0-9-]{1,48}$/.test(value) ? value : '(invalid name)';
const strings = values => Array.isArray(values) && values.every(value=>typeof value === 'string');

function validIdentity(row) {
  if (!Number.isInteger(row.intakeYear) || row.intakeYear < 2000 || row.intakeYear > 2199 ||
      row.courseCode !== 'BA-CS' || !Number.isInteger(row.intakeMonth) || row.intakeMonth < 1 || row.intakeMonth > 12) return false;
  const suffix = row.name.split('-').at(-1);
  return majors.has(suffix) && majors.get(suffix) === row.major &&
    row.name === [String(row.intakeYear).slice(-2), months[row.intakeMonth-1], suffix].join('-');
}

function reviewedRecord(row) {
  if (!Array.isArray(row.sources) || !strings(row.errors) || !strings(row.warnings) || !Array.isArray(row.publishedRevisions) ||
      ![true,false,null].includes(row.alreadyPresent) || !['valid','missing','blocked'].includes(row.status)) return false;
  if (row.publishedRevisions.length && (row.alreadyPresent !== true || !row.publishedRevisions.every(r=>
    object(r) && Number.isInteger(r.id) && r.id > 0 && Number.isInteger(r.version) && r.version > 0))) return false;
  if (!row.sources.every(s=>object(s) && typeof s.url === 'string' && strings(s.errors))) return false;
  if (row.status === 'missing') return !row.sources.length;
  if (!row.sources.length) return false;
  if (row.status === 'blocked') return row.errors.length > 0;
  return !row.errors.length && row.schemaValidation === 'passed' &&
    typeof row.canonicalFile === 'string' && row.canonicalFile.endsWith('/'+row.name+'.json') &&
    strings(row.prescribed) && strings(row.recommended) &&
    isChecksum(row.canonicalSha256) && row.sources.every(s=>!s.errors.length && isChecksum(s.sha256));
}

function sameElectives(record, snapshot) {
  const electives = snapshot.units.filter(u=>u.unitType.Name === 'Elective');
  for (const [field,marked] of [['prescribed',true],['recommended',false]]) {
    const actual = electives.filter(u=>u.Name.endsWith('*') === marked).map(u=>u.UnitCode).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...record[field]].sort())) return false;
  }
  return true;
}

// Phase 1 hashes the individual UTF-8, two-space-indented JSON file with its final newline.
function matchesFileHash(snapshot, expected) {
  const lf = JSON.stringify(snapshot,null,2) + '\n';
  return digest(lf) === expected || digest(lf.replaceAll('\n','\r\n')) === expected;
}

function validateUnits(snapshot, ids, codes) {
  const localCodes = new Set();
  const codePattern = /^(?!MPU)[A-Z]{3}\d{5}$/;
  function register(u) {
    if (!codePattern.test(u.UnitCode) || !u.Name.trim() ||
        (ids.has(u.ID) && ids.get(u.ID) !== u.UnitCode) ||
        (codes.has(u.UnitCode) && codes.get(u.UnitCode) !== u.ID)) return false;
    ids.set(u.ID,u.UnitCode);
    codes.set(u.UnitCode,u.ID);
    return true;
  }
  return snapshot.units.every(u => {
    if (localCodes.has(u.UnitCode) || !register(u) || u.unitTypeId !== u.unitType.ID) return false;
    localCodes.add(u.UnitCode);
    return u.requisites.every(r=>!r.unit || register(r.unit));
  });
}

function parseFile(source, label) {
  if (typeof source !== 'string') throw fault(400,'Supply the '+label+' as JSON file text.');
  try { return JSON.parse(source); } catch { throw fault(400,'Malformed '+label+' JSON.'); }
}

export function reviewFiles(body) {
  const manifest = parseFile(body.manifest,'manifest');
  const bundle = parseFile(body.bundle,'bundle');
  if (!object(manifest) || !object(manifest.summary) || !Array.isArray(manifest.planners) ||
      !manifest.planners.length || typeof manifest.index !== 'string' || !isChecksum(manifest.indexSha256) ||
      !(manifest.publicCatalogueSha256 === null || isChecksum(manifest.publicCatalogueSha256)) || !Array.isArray(bundle)) {
    throw fault(400,'Unrecognized Phase 1 manifest or draft bundle.');
  }
  if (Math.max(manifest.planners.length,bundle.length) > maxPlanners) throw fault(413,'Batch exceeds the 100-planner limit.');
  const bundleFingerprint = digest(JSON.stringify([body.manifest, body.bundle]));
  const snapshots = new Map(), duplicate = new Set(), names = new Set(), seriesKeys = new Set();
  const ids = new Map(), codes = new Map(), results = [], issues = [];
  const counts = {expected:manifest.planners.length, discovered:0, valid:0, blocked:0, missing:0, bundled:bundle.length};
  for (const snapshot of bundle) {
    const name = safeName(snapshot?.name);
    if (snapshots.has(name)) duplicate.add(name);
    snapshots.set(name,snapshot);
  }
  for (const record of manifest.planners) {
    const name = safeName(record?.name);
    const row = {name, series:null, operation:'invalid'};
    results.push(row);
    if (!object(record) || name === '(invalid name)') { row.reason = 'Invalid manifest identity'; continue; }
    counts.discovered += Number(Boolean(record.sources?.length));
    if (record.status === 'valid') counts.valid++;
    else counts.blocked++;
    if (record.status === 'missing') counts.missing++;
    const reviewed = reviewedRecord(record);
    // A missing early-intake PDF may have an unresolved February/March month.
    const unresolved = record.status !== 'valid' && record.intakeMonth === null &&
      record.courseCode === 'BA-CS' && Number.isInteger(record.intakeYear) &&
      name === [String(record.intakeYear).slice(-2),'Feb-Mar',name.split('-').at(-1)].join('-') &&
      majors.has(name.split('-').at(-1)) && majors.get(name.split('-').at(-1)) === record.major;
    if (!validIdentity(record) && !unresolved) { row.reason = 'Invalid planner name or intake identity'; continue; }
    row.series = unresolved ? null : seriesOf(record);
    if (!reviewed || names.has(name) || (row.series && seriesKeys.has(row.series)) || duplicate.has(name)) {
      row.reason = 'Inconsistent review record or duplicate planner';
    }
    names.add(name);
    if (row.series) seriesKeys.add(row.series);
    if (row.reason) continue;
    if (record.status !== 'valid' || record.alreadyPresent || row.series === pilot) {
      const reason = record.status === 'valid' ? 'Already present or protected pilot' : record.status;
      if (snapshots.has(name)) row.reason = 'Excluded planner included in bundle: '+reason;
      else Object.assign(row,{operation:'excluded',reason});
      continue;
    }
    const snapshot = snapshots.get(name);
    try { checkedSnapshot(snapshot); }
    catch { row.reason = 'Missing or invalid planner snapshot'; continue; }
    if (seriesOf(snapshot) !== row.series || !validIdentity(snapshot)) row.reason = 'Snapshot identity differs from manifest';
    else if (!matchesFileHash(snapshot,record.canonicalSha256)) row.reason = 'Reviewed snapshot checksum mismatch';
    else if (!validateUnits(snapshot,ids,codes)) row.reason = 'Invalid or duplicate unit identity';
    else if (!sameElectives(record,snapshot)) row.reason = 'Reviewed elective lists differ from snapshot';
    else row.operation = 'ready';
  }
  for (const name of snapshots.keys()) {
    if (!names.has(name)) results.push({name,series:null,operation:'invalid',reason:'Missing matching manifest identity'});
  }
  if (Object.entries(counts).some(([key,n])=>manifest.summary[key] !== n)) issues.push('Manifest summary counts disagree with the input files.');
  return {bundleFingerprint,results,issues,snapshots};
}
