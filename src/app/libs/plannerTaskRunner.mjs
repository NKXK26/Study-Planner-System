import {validateToolCall} from './plannerToolDefinitions.mjs';
import {nextSuggestionContext} from './plannerConversation.mjs';
import {refusal} from './plannerAnswerability.mjs';
export async function executePlannerTasks(calls,{run,compose,context={},question=''}) {
 if(!Array.isArray(calls)||!calls.length||calls.length>4)throw new Error('Choose up to four study-planning tasks.');
 const checked=calls.map(call=>validateToolCall(call)); // Validate everything before doing any work.
 const results=[];let suggestionContext=context.suggestionContext;
 for(const call of checked){
  try {
   const verified=await run(call,{...context,suggestionContext,question});
   const result=await compose(verified,{question,suggestionContext,call,planningOnly:true});
   results.push(result);suggestionContext=nextSuggestionContext(suggestionContext,result);
   if(result.answerability==='clarification'||result.answerability==='refused')break;
  }catch(e){
   if([401,403].includes(e.status))throw e;
   results.push({tool:call.name,workflow:results.at(-1)?.workflow||context.workflow,answer:refusal('I could not verify this part of your request. Your previous results are retained; retry when the records are available.').answer,answerability:'refused'});break;
  }
 }
 const last=results.at(-1),pending=!context.document&&last.answerability==='clarification';
 const display=results.findLast(r=>r.data?.plan||r.data?.pathway)||last;
 return {...display,answer:results.map(r=>r.answer).join('\n\n---\n\n'),answerability:last.answerability,toolResults:results,completedTasks:results.filter(r=>r.answerability==='verified').length,requestedTasks:checked.length,
  data:{...display.data,pendingQuestion:pending?question:null},suggestionContext:{...suggestionContext,pendingQuestion:pending?question:null}};
}
