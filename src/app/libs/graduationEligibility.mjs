import {courseCompletionAudit} from './courseCompletion.mjs';
import {rankPlannerMatches} from './plannerMatching.mjs';
import {normalizeCode} from './doubleMajorChecker.mjs';

export function assessGraduationEligibility(transcript,planner){
 const audit=courseCompletionAudit({transcript,planner,plan:{candidates:[]}});
 const reviewIssues=[];
 if(!planner.units.length||!audit.categories.length)reviewIssues.push('This planner has no configured curriculum.');
 if(audit.categories.length&&audit.categories.every(c=>c.requiredCount===0))reviewIssues.push('This planner has no positive requirement counts.');
 if(!audit.countsVerified)reviewIssues.push('Some required category counts are missing or inconsistent.');
 const codes=new Map();
 for(const u of planner.units){const code=normalizeCode(u.UnitCode);const previous=codes.get(code);if(previous&&(previous.ID!==u.ID||previous.unitType?.Name!==u.unitType?.Name||previous.CreditPoints!==u.CreditPoints))reviewIssues.push(code+': duplicate or conflicting unit versions/categories require review.');codes.set(code,u);}
 const deficits=audit.categories.filter(c=>c.remainingCount!==null&&c.remainingCount>0);
 const status=deficits.length?'not-eligible':reviewIssues.length?'needs-review':'eligible';
 const earned=new Map(transcript.completed.map(u=>[normalizeCode(u.code),u]));
 const categories=audit.categories.map(c=>({...c,completedUnits:[...new Map(planner.units.filter(u=>u.unitType?.Name===c.name&&Number.isFinite(u.CreditPoints)&&u.CreditPoints>0&&(earned.get(normalizeCode(u.UnitCode))?.earned||0)>=u.CreditPoints).map(u=>[normalizeCode(u.UnitCode),{code:normalizeCode(u.UnitCode),name:u.Name,credits:u.CreditPoints,earned:earned.get(normalizeCode(u.UnitCode)).earned}])).values()]}));
 return {planner:{id:planner.id,name:planner.name},status,eligible:status==='eligible',countsVerified:audit.countsVerified,remainingSlots:deficits.reduce((n,c)=>n+c.remainingCount,0),categories,unmatched:audit.unmatched,reviewIssues:[...new Set(reviewIssues)],requiredSlots:audit.countsVerified?audit.categories.reduce((n,c)=>n+c.requiredCount,0):null,coveredSlots:audit.categories.reduce((n,c)=>n+Math.min(c.completedCount,c.requiredCount??c.completedCount),0)};
}
export function graduationEligibilityReport({transcript,planners,plannerId=null}){
 if(!Array.isArray(planners)||!planners.length)throw new Error('No study planners are saved. Add a planner and its requirement template first.');
 const ranking=rankPlannerMatches(planners,transcript.completed);
 const assessments=ranking.map(r=>({...assessGraduationEligibility(transcript,r.planner),matched:r.matched}));
 const selected=plannerId==null||plannerId===''?null:assessments.find(r=>String(r.planner.id)===String(plannerId));
 if(plannerId!=null&&plannerId!==''&&!selected)throw new Error('That planner no longer exists. Select an available planner.');
 const matching=assessments.filter(r=>r.status==='eligible'),uncertain=assessments.filter(r=>r.status==='needs-review');
 const status=selected?selected.status:matching.length?'choose-planner':uncertain.length?'needs-review':'not-eligible';
 const reason=selected?selected.status==='eligible'?'The completed units satisfy every configured requirement in the selected planner.':selected.status==='not-eligible'?'The selected planner still has '+selected.remainingSlots+' unmet requirement slot'+(selected.remainingSlots===1?'':'s')+'.':'The selected planner has incomplete or conflicting requirement records.':matching.length?'Requirements are covered for '+matching.length+' planner'+(matching.length===1?'':'s')+'. Select the student’s actual programme and intake to confirm the result.':uncertain.length?'No verified complete match was found. Some planners have incomplete requirement data, so eligibility cannot yet be determined.':'The completed units do not satisfy every requirement of any recorded planner. Total unit count alone does not establish eligibility.';
 return {status,eligible:!!selected&&selected.eligible,reason,selected,closest:assessments[0],fulfillingPlanners:matching.map(r=>r.planner),assessments,transcript:{completed:transcript.completed,excluded:transcript.excluded,duplicates:transcript.duplicates||0,completedCount:transcript.completed.length,earnedCredits:transcript.completed.reduce((n,u)=>n+u.earned,0)},scope:'Recorded unit requirements in the selected programme planner',checkedAt:new Date().toISOString()};
}
