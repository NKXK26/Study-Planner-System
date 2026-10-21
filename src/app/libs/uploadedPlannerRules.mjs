// Parse only supported academic expressions; free-form PDF prose cannot become instructions.
export function pdfRequisite(raw,ownCode){
 let text=String(raw||'').trim();
 if(/^(?:nil|none|no prerequisites?|not applicable|n\/?a)$/i.test(text))return {groups:[],source:text};
 if(!text)return {error:'No readable prerequisite information in the uploaded planner'};
 const co=/co[ -]?requisite/i.test(text);text=text.replace(/^(?:co[ -]?requisites?|pre[ -]?requisites?)\s*:?\s*/i,'').trim();
 if(/[()]/.test(text))return {error:'Parenthesized prerequisite expression needs review: '+raw};
 const groups=[];
 for(const part of text.split(/\s*(?:&|\band\b)\s*/i)){
  const alternatives=[];
  for(const token of part.split(/\s*(?:\/|\bor\b)\s*/i)){
   const code=token.trim().toUpperCase(),cp=token.match(/^(\d+(?:\.\d+)?)\s*(?:credit points?|CP)$/i);
   if(cp)alternatives.push({credits:Number(cp[1])});
   else if(/^[A-Z]{2,5}\d{3,6}$/.test(code)&&code!==ownCode)alternatives.push({code,co});
   else return {error:code===ownCode?'The PDF lists this unit as its own prerequisite; the source needs correction':'Unrecognized prerequisite expression: '+raw};
  }
  groups.push(alternatives);
 }
 return {groups,source:raw};
}
export function pdfTerms(text){
 if(/Semester\s*1\s*(?:&|and|\/|,)\s*(?:Semester\s*)?2/i.test(text))return ['Semester 1','Semester 2'];
 return [...new Set((String(text).match(/Semester\s*[12]/gi)||[]).map(t=>'Semester '+t.at(-1)))];
}
export function uploadedPlannerModel(data,records){
 const warnings=[...data.issues],units=data.units.map((row,i)=>{
  const versions=records.filter(u=>u.UnitCode===row.code);const known=versions.length===1?versions[0]:null;
  const credits=row.credits??known?.CreditPoints??null;
  const explicitTerms=pdfTerms(row.offerings),storedTerms=known?.UnitTermOffered?.map(t=>t.TermType)||[];
  const terms=explicitTerms.length?explicitTerms:storedTerms.length?storedTerms:row.sequenceTerm?[row.sequenceTerm]:[];
  if(!known)warnings.push(row.code+': not uniquely recorded in the units database; PDF data is used; missing credits or semester offerings are held for review.');
  if(!explicitTerms.length&&!storedTerms.length&&row.sequenceTerm)warnings.push(row.code+': the recommended sequence is used as a semester assumption; no offering is recorded.');
  const rule=pdfRequisite(row.requisite,row.code);
  for(const group of rule.groups||[])for(const c of group)if(c.code){const candidates=records.filter(r=>r.UnitCode===c.code);const inPdf=data.units.find(r=>r.code===c.code);c.requiredCredits=inPdf?.credits??(candidates.length===1?candidates[0].CreditPoints:null);}
  return {ID:-(i+1),UnitCode:row.code,Name:row.name,CreditPoints:credits,Availability:known?.Availability||'Published',unitType:{Name:row.category},UnitTermOffered:terms.map(TermType=>({TermType})),uploadedRule:rule};
 });
 for(const u of units){const unlocks=units.filter(v=>(v.uploadedRule.groups||[]).some(group=>group.some(c=>c.code===u.UnitCode))).length;u.PlanningPriority=(/elective/i.test(u.unitType.Name)?100:0)-unlocks*10;}
 return {planner:{name:data.title,units,plannerTemplate:{requirements:data.requirements.map(r=>({unitType:{Name:r.category},requiredCount:r.count}))}},relations:[],warnings};
}
export function checkUploadedRule(rule,earned,totalEarned,units){
 if(rule.error)return {unknown:[rule.error],reasons:[],rules:[]};
 const passed=condition=>condition.credits!=null?totalEarned>=condition.credits:Number.isFinite(condition.requiredCredits??units.find(u=>u.UnitCode===condition.code)?.CreditPoints)&&(earned.get(condition.code)||0)>=(condition.requiredCredits??units.find(u=>u.UnitCode===condition.code)?.CreditPoints);
 const unknown=rule.groups.filter(group=>!group.some(passed)&&group.some(c=>c.code&&!Number.isFinite(c.requiredCredits??units.find(u=>u.UnitCode===c.code)?.CreditPoints))).map(()=> 'A prerequisite unit credit value is not recorded');
 return {unknown,reasons:rule.groups.every(group=>group.some(passed))?[]:['Uploaded planner prerequisites are not yet met (co-requisites must already be earned)'],rules:['PDF prerequisite: '+rule.source]};
}
