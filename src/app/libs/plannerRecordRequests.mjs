// Resolve spelling separators, never guess a different intake or major.
export const normalizeRecordReference=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const intakePattern=/\b(?:\d{2}|20\d{2})[\s_-]*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|s[12])[\s_-]*[a-z]{2,10}(?:[\s_-]*r\d+)?\b/gi;
export function plannerReferences(question) {
 const q=String(question);
 return [...new Set([...(q.match(intakePattern)||[]),...[...q.matchAll(/\b(?:planner\s+)?(?:id\s*|#)(\d+)\b/gi)].map(m=>m[1])])];
}
export function plannerListRequest(question) {
 const q=String(question).trim();
 if(!/\bplanners?\b/i.test(q)||plannerReferences(q).length||/\b(?:units?|subjects?|templates?|compare|differentiat\w*|best|highest|closest|match\w*|suggest\w*|recommend\w*|take|make|create|upload|import|don't|do not|never)\b/i.test(q))return null;
 if(!/\b(?:all|list|show|browse|search|find|which|available|saved)\b|\bwhat\s+(?:are\s+)?(?:the\s+)?planners?\b|\bhow many\b/i.test(q))return null;
 const aliases=[['CSAI',/\b(?:CSAI|AI|artificial intelligence)\b/i],['CSDS',/\b(?:CSDS|DS|data science)\b/i],['CSSD',/\b(?:CSSD|SD|software development)\b/i],['CSIOT',/\b(?:CSIOT|IOT|internet of things)\b/i],['CSCS',/\b(?:CSCS|cybersecurity|cyber security)\b/i]];
 const majors=aliases.filter(([,pattern])=>pattern.test(q));
 if(majors.length===1)return {name:'list_planners',arguments:{search:majors[0][0]}};
 if(majors.length>1)return null;
 const named=q.match(/\b(?:named|matching|containing)\s+["']?(.+?)["']?[.!?]*$/i);
 if(named)return {name:'list_planners',arguments:{search:named[1].trim()}};
 return {name:'list_planners',arguments:{}};
}

export function plannerRecordRequest(question,context=null) {
 const q=String(question).trim();
 if(/\b(?:don't|do not|never|take|suggest\w*|recommend\w*|remaining|unfinished|complete|finish|need|switch|shift|transfer|change)\b/i.test(q)||/\b(?:compare|differentiat\w*|versus|vs)\b/i.test(q))return null;
 const read=/\b(?:all|only|list|show|which|what|tell|view|inspect|details|how many)\b/i.test(q);
 const units=/\b(?:units?|subjects?|courses?|core|electives?|major units?)\b/i.test(q);
 const references=plannerReferences(q);
 const list=plannerListRequest(q);if(list)return list;
 if(!units&&!references.length&&!/\b(?:best|highest|closest|match\w*|templates?)\b/i.test(q)&&(/\ball\s+(?:(?:the|saved|study|available|database)\s+)*planners?\b/i.test(q)||/\b(?:what|which|how many)\b.*\bplanners?\b.*\b(?:database|saved|available|exist|have)\b/i.test(q)))return {name:'list_planners',arguments:{}};
 if(!read||(!units&&!/\bplanner\b/i.test(q)))return null;
 let reference=references.length===1?references[0]:null;
 if(references.length>1)return null;
 if(!reference&&units){
  const named=q.match(/\b(?:in|of|from|for)\s+(?:the\s+)?(?:study\s+)?planner\s+["']?(.+?)["']?[.!?]*$/i);
  if(named&&!/^(?:my|this|that|current|selected|a|the)$/i.test(named[1]))reference=named[1].trim();
  else if(/\b(?:this|that|current|selected|same)\s+planner\b|\b(?:its|their)\s+(?:units|subjects)\b/i.test(q)||context?.inspectedPlanner&&/^(?:show |list |only )?(?:the )?(?:core|major|elective|wil) (?:units|subjects)[.!?]*$/i.test(q))reference=context?.inspectedPlanner||context?.planner;
  else {const plain=q.match(/\b(?:units?|subjects?)\s+(?:in|of|from)\s+(.+?)[.!?]*$/i);if(plain&&!/^(?:my|this|that|current|selected|a|the)(?:\s+planner)?$/i.test(plain[1]))reference=plain[1].trim();}
 }
 if(!reference)return null;
 const category=/\bcore\b/i.test(q)?'core':/\belectives?\b/i.test(q)?'elective':/\bmajor\s+(?:units|subjects)|\b(?:units|subjects)\s+(?:in|of|for)\s+(?:the\s+)?major\b/i.test(q)?'major':/\bWIL\b|placement/i.test(q)?'wil':null;
 return {name:'inspect_planner',arguments:{planner:String(reference),...(category?{category}:{})}};
}
export function resolvePlannerReference(planners,reference) {
 const key=normalizeRecordReference(reference);
 if(!key)return {status:'missing',choices:[]};
 const exact=planners.filter(p=>String(p.id)===String(reference).trim()||normalizeRecordReference(p.name)===key);
 if(exact.length===1)return {status:'matched',planner:exact[0],choices:[]};
 const choices=exact.length?exact:planners.filter(p=>normalizeRecordReference(p.name).includes(key));
 return {status:choices.length?'ambiguous':'missing',choices:choices.map(p=>({id:p.id,name:p.name}))};
}
export function formatPlannerUnits(detail,{category}={}) {
 const groups=new Map();
 for(const unit of detail.units||[]){
  const label=unit.unitType?.Name||'Unassigned';
  if(category&&!new RegExp(category==='wil'?'wil|placement':category,'i').test(label))continue;
  if(!groups.has(label))groups.set(label,[]);
  groups.get(label).push(unit);
 }
 const count=[...groups.values()].reduce((n,units)=>n+units.length,0);
 const lines=[detail.name+' (ID '+detail.id+'): '+count+' recorded '+(category?category+' ':'')+'units.'];
 for(const [label,units]of groups){
  lines.push('\n'+label+':');
  for(const u of units)lines.push('- '+u.UnitCode+' '+u.Name+' ('+(u.CreditPoints??'Unknown')+' CP)');
 }
 if(!count)lines.push('No units are recorded'+(category?' in this category':'')+'.');
 const template=(detail.templates||[]).find(t=>t.id===detail.plannerTemplateId);
 if(template){lines.push('\nTemplate: '+template.name+'.');for(const t of template.unitTypes||[])lines.push('- '+t.Name+': '+t.requiredCount+' required.');}
 lines.push('\nThis is the saved unit pool. Categories can contain alternatives; the list does not mean every option must be taken.');
 return lines.join('\n');
}
