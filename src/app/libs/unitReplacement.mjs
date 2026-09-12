const normal = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
const words = text => new Set(String(text ?? '').toLowerCase().match(/[a-z0-9]+/g)?.filter(w => !['and','for','the','in','to','of','with'].includes(w)) || []);
export function compareText(a, b) {
  const left = words(a), right = words(b);
  const shared = [...left].filter(w => right.has(w));
  const total = new Set([...left, ...right]).size;
  return { score: total ? Math.round(shared.length / total * 100) : 0, shared };
}
export function replacementCandidates(source, units) {
  const seen = new Set();
  return units.filter(u => {
    const code = normal(u.UnitCode);
    if (code === normal(source.code) || seen.has(code) || u.Availability?.toLowerCase() !== 'published') return false;
    seen.add(code); return true;
  }).map(u => {
    const name = compareText(source.name, u.Name);
    return { code:u.UnitCode, name:u.Name, credits:u.CreditPoints, availability:u.Availability,
      terms:[...new Set((u.UnitTermOffered || []).map(t=>t.TermType))],
      nameScore:name.score, sharedWords:name.shared,
      creditMatch:source.creditPoints == null || u.CreditPoints == null ? null : source.creditPoints === u.CreditPoints };
  }).filter(u=>u.nameScore > 0).sort((a,b)=>b.nameScore-a.nameScore || Number(b.creditMatch)-Number(a.creditMatch) || a.code.localeCompare(b.code)).slice(0,8);
}
