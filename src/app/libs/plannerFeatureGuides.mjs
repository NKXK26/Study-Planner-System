export const plannerFeatureGuides = [
  {
    "id": "templates",
    "title": "Study Planner Templates",
    "href": "/view/planner-templates",
    "text": "Templates store required unit counts for categories such as Core, Major and Elective. You can list the saved templates and their counts in chat. The Templates page creates or edits those counts; a planner must be linked to a template for its category audit to use them."
  },
  {
    "id": "upload",
    "title": "Upload Study Planner",
    "href": "/view/upload_planner",
    "text": "This page imports a study-planner PDF. It extracts unit codes, matches them to database units and lets you review categories, name the planner and optionally link a template before saving. This differs from attaching a DPA in chat: a DPA supplies earned results for personal planning. Use the upload page for saving an imported planner."
  },
  {
    "id": "suggestions",
    "title": "Unit Suggestions",
    "href": "/view/compare_study_planner",
    "text": "For personal suggestions, attach your DPA in chat. The chatbot matches saved planners, checks unfinished category requirements, recorded prerequisites and semester offerings, then drafts up to four units or all remaining semesters. N is failed; valid EXM earned credit counts. You can also ask for replacement candidates by unit code; title similarity does not establish approved equivalence."
  },
  {
    "id": "maker",
    "title": "Study Planner Maker",
    "href": "/view/study-planner-maker",
    "text": "The Maker page creates a saved planner by selecting recorded units and assigning categories, or copying an existing planner as a starting point. Give it a name and review before saving. In chat you can inspect a source planner, compare its units and draft a personal semester pathway from a DPA; creating a database planner uses the Maker page."
  },
  {
    "id": "management",
    "title": "Study Planner Management",
    "href": "/view/study-planner",
    "text": "Management lists saved planners and opens their unit details. Planner details support category edits and template assignment. In chat, ask to list planners, search a name or show all units in a specific planner. Editing or deleting a saved database record uses the Management page."
  },
  {
    "id": "compare",
    "title": "Differentiate Study Planners",
    "href": "/view/compare-planners",
    "text": "This compares two saved planners by unit code and shows shared units, units only in each planner and category changes. In chat, supply two planner names or IDs, for example compare 23 Sep CSDS vs 24 Sep CSDS. No DPA is needed for this comparison."
  },
  {
    "id": "double-major",
    "title": "Double Major Checker",
    "href": "/view/double-major-checker",
    "text": "Attach your DPA in chat and ask to check a double major. It chooses the highest completed-unit match as the primary planner, then a different major using earned electives or other earned units matching its major units. It shows both major counts, remaining major choices and a provisional future-semester pathway. The checker page uses the same calculation. This checks recorded major coverage; overall degree completion is a separate planning task."
  }
];

export function featureGuideRequest(question) {
 const q=String(question).trim();
 if(!/\b(?:how|what|where|help|explain|can you|can this)\b/i.test(q))return null;
 if(/\b(?:all|available|supported)\b.*\b(?:features|functions|tasks|tools)\b|what can (?:this |the )?(?:chatbot|assistant|system) do/i.test(q))return {name:'describe_workflow',arguments:{}};
 let workflow=/double\s*major.*(?:checker|page|function)|(?:checker|page).*double\s*major/i.test(q)?'double-major':/differentiat.*planner|compare.*planner.*(?:page|work|use)|planner comparison/i.test(q)?'compare':/planner\s*templates?/i.test(q)?'templates':/upload\s+(?:a |my |the )?(?:study )?planner|import.*planner/i.test(q)?'upload':/planner\s*maker|(?:make|create|build).*planner/i.test(q)?'maker':/planner\s*management|manage.*planner|(?:edit|delete).*saved.*planner/i.test(q)?'management':/unit\s*suggestions?/i.test(q)?'suggestions':null;
 if(!workflow)return null;
 // Guidance only: a concrete unit/planning request must still run its data tool.
 if(!/\bhow\b|\bwhere\b|how.*work|what (?:is|does|can)|explain.*(?:page|feature|function)|help.*(?:use|page)/i.test(q))return null;
 return {name:'describe_workflow',arguments:{workflow}};
}
export function describePlannerFeature(workflow) {
 const selected=workflow?plannerFeatureGuides.filter(g=>g.id===workflow):plannerFeatureGuides;
 return selected.map(g=>'**'+g.title+'**\n'+g.text+'\n[Open '+g.title+']('+g.href+')').join('\n\n');
}
