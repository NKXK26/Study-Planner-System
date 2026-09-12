export const normalizeCode = value => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');

// Workbook cells are data only. Never evaluate formulas or infer completion from filenames.
export function parseTranscript(rows) {
  const headerIndex = rows.findIndex(row => ['course', 'status', 'earned'].every(key => row.some(cell => String(cell).trim().toLowerCase() === key)));
  if (headerIndex < 0) throw new Error('Expected columns: Course, Status and Earned. Choose a transcript worksheet.');
  const headers = rows[headerIndex].map(v => String(v).trim().toLowerCase());
  const get = (row, key) => row[headers.indexOf(key)];
  const completed = new Map();
  const excluded = [];
  let duplicates = 0;
  for (const [index, row] of rows.slice(headerIndex + 1).entries()) {
    const code = normalizeCode(get(row, 'course'));
    if (!code) continue;
    const earned = Number(get(row, 'earned'));
    const grade = String(get(row, 'grade') ?? '').trim().toUpperCase();
    const status = String(get(row, 'status') ?? '').trim().toLowerCase();
    const unit = { code, name: String(get(row, 'course title') ?? ''), earned, grade, row: headerIndex + index + 2 };
    if (!['complete', 'completed', 'passed', 'exempt', 'exempted'].includes(status) || !Number.isFinite(earned) || earned <= 0 || ['N', 'F', 'FAIL', 'NCOM', 'WF'].includes(grade)) {
      excluded.push({ ...unit, reason: 'Not completed with positive earned credit' });
      continue;
    }
    if (completed.has(code)) duplicates++;
    if (!completed.has(code) || completed.get(code).earned < earned) completed.set(code, unit);
  }
  if (!completed.size && !excluded.length) throw new Error('No unit rows found in this worksheet.');
  return { completed: [...completed.values()], excluded, duplicates };
}

export function majorUnits(planner) {
  return [...new Map(planner.units.filter(u => u.unitType?.Name?.trim().toLowerCase() === 'major').map(u => [normalizeCode(u.UnitCode), u])).values()];
}

export function checkDoubleMajor(transcript, planners) {
  if (planners.length !== 2 || planners[0].id === planners[1].id) throw new Error('Choose two different major planners.');
  const pools = planners.map(majorUnits);
  if (pools.some(p => !p.length)) throw new Error('Both planners must contain units categorised as Major.');
  const signatures = pools.map(p => p.map(u => normalizeCode(u.UnitCode)).sort().join(','));
  if (signatures[0] === signatures[1]) throw new Error('These planners have identical major requirements. Select a different major.');
  const earned = new Map(transcript.completed.map(u => [u.code, u]));
  const majors = planners.map((p, i) => {
    const units = pools[i].map(u => ({ code: normalizeCode(u.UnitCode), name: u.Name, credits: u.CreditPoints, completed: earned.has(normalizeCode(u.UnitCode)) && Number.isFinite(u.CreditPoints) && earned.get(normalizeCode(u.UnitCode)).earned >= u.CreditPoints }));
    const requirement = p.plannerTemplate?.requirements?.find(r => r.unitType?.Name?.trim().toLowerCase() === 'major');
    const required = requirement?.requiredCount ?? units.length;
    const matched = units.filter(u => u.completed).length;
    return { id: p.id, name: p.name, units, required, matched, remaining: Math.max(0, required - matched), configured: Boolean(requirement) && required > 0 && required <= units.length, source: requirement ? 'Template required count' : 'Provisional: all Major units in this planner; no template requirement configured' };
  });
  const union = [...new Map(majors.flatMap(m => m.units).map(u => [u.code, u])).values()];
  const known = new Set(planners.flatMap(p => p.units.map(u => normalizeCode(u.UnitCode))));
  return { majors, shared: majors[0].units.filter(u => majors[1].units.some(v => v.code === u.code)), uniqueCompletedCredits: union.filter(u => u.completed).reduce((sum,u)=>sum + u.credits,0), unmatched: transcript.completed.filter(u => !known.has(u.code)), covered: majors.every(m => m.configured && m.remaining === 0) };
}
