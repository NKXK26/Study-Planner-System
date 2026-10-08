// Keep old messages visible without grounding a new DPA in an earlier transcript's conversation.
export function currentDocumentHistory(messages=[]) {
 const boundary=messages.findLastIndex(m=>m?.role==='assistant'&&/^(?:DPA|Study planner) attached:|^(?:DPA|Study planner) removed\./.test(m.content||''));
 return messages.slice(boundary+1).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-10).map(({role,content})=>({role,content}));
}
export function followUpContext(current,step) {
 if(!step?.resetPlannerMatch)return current;
 return {...current,planner:null,plannerName:'',plannerConfirmed:false,primaryPlanner:null,secondaryPlanner:null,inspectedPlanner:null,inspectedPlannerName:'',targetMajor:null,unitCode:null,pendingQuestion:null,planMode:step.call?.name==='plan_remaining_studies'?'full':'semester',preferences:current?.preferences?{...current.preferences,excluded:[],deferred:{}}:undefined};
}
export function replacementDocumentContext(current) {
 if(!current)return null;
 return {...current,unitCode:null,plannerConfirmed:false,planner:null,plannerName:'',primaryPlanner:null,secondaryPlanner:null,inspectedPlanner:null,inspectedPlannerName:'',preferences:current.preferences?{...current.preferences,excluded:[],deferred:{}}:undefined};
}
