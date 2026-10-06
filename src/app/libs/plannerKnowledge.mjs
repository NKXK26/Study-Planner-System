export const plannerKnowledge = [
  {id:'replacement',title:'Unit Suggestions',href:'/view/compare_study_planner',keywords:'unit replacement expired expire retired unavailable equivalent syllabus suggestion alternative',text:'Search an original unit code under Unit replacement guidance. Compare published candidates, credits and recorded semesters. HOD review view compares manually supplied syllabus excerpts and downloads a review draft. Similar titles are not approved equivalents. Expiry dates and approved replacement links are not stored.'},
  {id:'double-major',title:'Double Major Checker',href:'/view/double-major-checker',keywords:'double major two majors dpa xlsx check missing eligibility',text:'Upload a DPA PDF or XLSX with verifiable Course, Status and Earned fields. The checker suggests the two closest distinct major pools, ranking completed major units first, then all completed planner units and matched credit. It shows remaining requirements and provisional future-semester drafts. You can change the majors, intake or starting semester. Earned units are deduplicated; future and failed attempts do not count. Shared major credits count once. Missing template requirement counts make coverage provisional; course/intake compatibility, HOD approval and overall graduation rules are separate.'},
  {id:'transcript',title:'Transcript planning',href:'/view/compare_study_planner',keywords:'upload transcript results remaining plan schedule recommend',text:'Open Unit Suggestions and scroll to Plan from your transcript. Upload XLSX results to compare planners and plan remaining units. Draft unit substitutions require academic review before enrolment.'},
  {id:'templates',title:'Planner Templates',href:'/view/planner-templates',keywords:'template required count requirement category core elective',text:'Manage required unit counts by category in Study Planner Templates. These counts are used by planning checks.'},
  {id:'maker',title:'Study Planner Maker',href:'/view/study-planner-maker',keywords:'create make build new planner',text:'Use Study Planner Maker to create a planner. Use Study Planner Management to inspect saved planners.'},
  {id:'management',title:'Study Planner Management',href:'/view/study-planner',keywords:'saved manage edit planner',text:'Browse saved study planners and their unit pools. Select the appropriate intake and major; requirements can differ by intake.'},
  {id:'units',title:'Units',href:'/view/unit',keywords:'unit code credits credit points availability published name information',text:'Inspect unit names, credit points, publication status and requisites in the unit module. Published does not guarantee a future semester offering. Duplicate codes can represent different records; confirm the applicable version.'},
  {id:'prerequisites',title:'Prerequisite Chain',href:'/view/prerequisite-chain',keywords:'prerequisite prerequisite chain dependency before requisite',text:'Explore prerequisite relationships before scheduling a unit. Confirm the relevant intake and any credit or co-requisite conditions.'},
];
export function normalizePlannerPrompt(question) {
  return String(question).toLowerCase().replace(/\b(?:double\s*majors?|dual\s*majors?|second\s*major|2\s*majors?|two\s*majors?|double\s*majour)\b/g, 'double major')
    .replace(/\b(?:suggestions?|recomend|reccomend|recommendations?|recommend|what should i take|what can i take|next semester)\b/g, 'suggestion recommend transcript')
    .replace(/\b(?:pre[ -]?reqs?|prerequsites|prerequistes)\b/g, 'prerequisite')
    .replace(/\b(?:dpa|degree progress|academic progress|results)\b/g, 'dpa transcript')
    .replace(/\b([a-z]{2,5})[ -]+(\d{3,6})\b/g, '$1$2');
}
export function retrievePlannerKnowledge(question) {
  const tokens = [...new Set(normalizePlannerPrompt(question).match(/[a-z0-9]+/g)||[])].filter(t=>t.length>2 && !['the','how','can','where','what','for','with','please','want'].includes(t));
  return plannerKnowledge.map(doc=>({...doc,score:tokens.reduce((s,t)=>s+(doc.keywords.includes(t)?3:doc.title.toLowerCase().includes(t)?2:0),0)})).filter(d=>d.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
}
