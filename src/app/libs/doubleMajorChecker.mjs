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
    const unit = { code, name: String(get(row, 'course title') ?? ''), earned, grade, status, row: headerIndex + index + 2 };
    const failedGrade = ['N', 'F', 'FAIL', 'NCOM', 'WF'].includes(grade);
    const failed = failedGrade || ['failed', 'fail', 'n', 'f'].includes(status);
    const exempted = grade === 'EXM' || ['exm', 'exempt', 'exempted'].includes(status);
    const complete = exempted || ['complete', 'completed', 'passed'].includes(status);
    if (failed || !complete || !Number.isFinite(earned) || earned <= 0) {
      excluded.push({ ...unit, reason: failed ? failedGrade ? `Failed grade (${grade}); not completed` : 'Failed status; not completed (regardless of grade)' : !complete ? 'Not completed or exempted' : 'No positive earned credit recorded' });
      continue;
    }
    if (completed.has(code)) duplicates++;
    if (!completed.has(code) || completed.get(code).earned < earned) completed.set(code, unit);
  }
  if (!completed.size && !excluded.length) throw new Error('No unit rows found in this worksheet.');
  return { completed: [...completed.values()], excluded, duplicates };
}

export const isMajorCategory=name=>/(?:^|\s)major$/i.test(String(name||'').trim());
export function majorUnits(planner) {
  return [...new Map(planner.units.filter(u => isMajorCategory(u.unitType?.Name)).map(u => [normalizeCode(u.UnitCode), u])).values()];
}

// Rank by earned-unit overlap, consistent with the planner comparison page.
export function rankDpaPlanners(transcript, planners) {
  const earned = new Map(transcript.completed.map(u => [normalizeCode(u.code), u]));
  return planners.filter(p => majorUnits(p).length).map(planner => {
    const units = [...new Map(planner.units.map(u => [normalizeCode(u.UnitCode), u])).values()];
    const matched = units.filter(u => earned.has(normalizeCode(u.UnitCode)) && Number.isFinite(u.CreditPoints) && u.CreditPoints > 0 && earned.get(normalizeCode(u.UnitCode)).earned >= u.CreditPoints);
    return { planner, matched: matched.length, credits: matched.reduce((sum, u) => sum + u.CreditPoints, 0), total: units.length };
  }).sort((a, b) => b.matched - a.matched || b.credits - a.credits);
}

export function assessDpaDoubleMajor(transcript, planners, primaryId) {
  const ranking = rankDpaPlanners(transcript, planners);
  if (!ranking.length || !ranking[0].matched) throw new Error('No completed DPA units match a major planner. Check the worksheet and available planners.');
  const top = ranking[0];
  const ties = ranking.filter(r => r.matched === top.matched && r.credits === top.credits);
  const primary = primaryId == null ? top : ties.find(r => String(r.planner.id) === String(primaryId));
  if (!primary) throw new Error('Choose one of the highest-matching planners.');
  const signature = p => majorUnits(p).map(u => normalizeCode(u.UnitCode)).sort().join(',');
  const options = ranking.filter(r => r.planner.id !== primary.planner.id && signature(r.planner) !== signature(primary.planner)).map(r => {
    const result = checkDoubleMajor(transcript, [primary.planner, r.planner]);
    return { ...result, additional: result.majors[1], missing: [...new Map(result.majors.flatMap(m => m.remaining ? m.units.filter(u => !u.completed) : []).map(u => [u.code, u])).values()] };
  }).sort((a, b) => Number(b.covered) - Number(a.covered) || a.additional.remaining - b.additional.remaining || b.additional.matched - a.additional.matched || a.additional.name.localeCompare(b.additional.name));
  return { ranking, primary, ties, options };
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
    const requirement = p.plannerTemplate?.requirements?.find(r => isMajorCategory(r.unitType?.Name));
    const required = requirement?.requiredCount ?? units.length;
    const matched = units.filter(u => u.completed).length;
    return { id: p.id, name: p.name, units, required, matched, remaining: Math.max(0, required - matched), configured: Boolean(requirement) && required > 0 && required <= units.length, source: requirement ? 'Template required count' : 'Provisional: all Major units in this planner; no template requirement configured' };
  });
  const union = [...new Map(majors.flatMap(m => m.units).filter(u => u.completed).sort((a, b) => a.credits - b.credits).map(u => [u.code, u])).values()];
  const known = new Set(planners.flatMap(p => p.units.map(u => normalizeCode(u.UnitCode))));
  return { majors, shared: majors[0].units.filter(u => majors[1].units.some(v => v.code === u.code)), uniqueCompletedCredits: union.filter(u => u.completed).reduce((sum,u)=>sum + u.credits,0), unmatched: transcript.completed.filter(u => !known.has(u.code)), covered: majors.every(m => m.configured && m.remaining === 0) };
}
