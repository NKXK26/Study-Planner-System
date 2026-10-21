import {readPlannerDocument} from '@app/libs/uploadedPlanner.server.mjs';
import {executePlannerTasks} from '@app/libs/plannerTaskRunner.mjs';
import {questionBoundary,generalEvidenceReply,refusal} from '@app/libs/plannerAnswerability.mjs';
import { runPlannerTool } from '@app/libs/plannerTools.server';
import { replacementCandidates } from '@app/libs/unitReplacement.mjs';
import prisma from '@utils/db/db';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { NextResponse } from 'next/server';
import { retrievePlannerKnowledge, normalizePlannerPrompt } from '@app/libs/plannerKnowledge.mjs';
import { documentEvidence, validateDocument } from '@app/libs/chatDpa.mjs';
import { assessDpaDoubleMajor, checkDoubleMajor, normalizeCode } from '@app/libs/doubleMajorChecker.mjs';
import { reviewedChatDocument, explainSemesterDraft } from '@app/libs/reviewedChat.mjs';
import { POST as generateReviewedPlan } from './planning/route';
import { composeToolReply } from '@app/libs/plannerResponse.mjs';
import { interpretPlannerRequest } from '@app/libs/plannerRequest.mjs';
import { plannerAiStatus, resolvePlannerModel } from '@app/libs/plannerAiStatus.mjs';

export async function GET(req) {
  const verify=new URL(req.url).searchParams.get('verify')==='1';
  if(verify){
    const dev=req.headers.get('x-dev-override')==='true'&&process.env.NEXT_PUBLIC_MODE==='DEV';
    if(!dev&&!await SecureSessionManager.authenticateUser(req))return NextResponse.json({message:'Please sign in to test AI.'},{status:401});
  }
  try{return NextResponse.json(await plannerAiStatus({verify,model:new URL(req.url).searchParams.get('model')}),{headers:{'Cache-Control':'no-store'}});}
  catch(e){return NextResponse.json({message:e.message},{status:e.status||503});}
}

export async function POST(req) {
  try {
    const dev = req.headers.get('x-dev-override') === 'true' && process.env.NEXT_PUBLIC_MODE === 'DEV';
    if (!dev && !await SecureSessionManager.authenticateUser(req)) return NextResponse.json({ success: false, message: 'Please sign in.' }, { status: 401 });
    let body, document;
    try {
      body = await req.json();
      document = validateDocument(body.document);
      readPlannerDocument(body.plannerDocument);
    } catch (e) { return NextResponse.json({ success: false, message: e.message || 'Invalid request.' }, { status: 400 }); }
    const { question, conversationHistory = [], primaryPlannerId } = body;
    if (typeof question !== 'string' || !question.trim() || question.length > 2000 || !Array.isArray(conversationHistory)) return NextResponse.json({ success: false, message: 'Enter a question of up to 2,000 characters.' }, { status: 400 });
    const boundary=questionBoundary(question,{document,workflow:body.workflow,suggestionContext:body.suggestionContext});
    if(boundary.status==='refuse')return NextResponse.json({success:true,...refusal(boundary.reason),source:'guide',answerability:'refused'});
    if(boundary.status==='answer')return NextResponse.json({success:true,answer:boundary.answer,source:'guide',sources:[],answerability:'verified'});
    let model;
    try{if(body.planningOnly!==true)model=await resolvePlannerModel(body.aiModel);}
    catch(e){return NextResponse.json({success:false,message:e.message},{status:e.status||503});}
    let intent=null;
    if(body.enableTools===true){
      intent=body.toolCall?{kind:'tool',call:body.toolCall}:await interpretPlannerRequest({question,conversationHistory,workflow:body.workflow,workspaceContext:body.workspaceContext,document,plannerDocument:body.plannerDocument,suggestionContext:body.suggestionContext,planningOnly:body.planningOnly===true},{model});
      if(intent.kind==='clarify')return NextResponse.json({success:true,answer:intent.message,source:'guide',sources:[]});
      if(intent.kind==='tasks'){
        try{
          const result=await executePlannerTasks(intent.calls,{question,context:{document,plannerDocument:body.plannerDocument,planningContext:body.planningContext,suggestionContext:body.suggestionContext,workflow:body.workflow},run:(call,context)=>runPlannerTool(req,call,context),compose:(verified,input)=>composeToolReply(verified,input,{model})});
          return NextResponse.json({success:true,answer:result.answer,source:'tool',sources:[],toolResult:result,answerability:result.answerability});
        }catch(e){if([401,403].includes(e.status))return NextResponse.json({success:false,message:'Please sign in with permission to access this task.'},{status:e.status});return NextResponse.json({success:true,...refusal('This task request could not be validated. Try requesting one task at a time.'),source:'guide',answerability:'refused'});}
      }
      let inferred=intent.call;
      if(!body.plannerDocument&&['suggest_next_semester','plan_remaining_studies'].includes(inferred?.name) && !inferred.arguments?.planner && !inferred.arguments?.targetMajor && typeof body.suggestionContext?.targetMajor==='string')inferred={...inferred,arguments:{...inferred.arguments,targetMajor:body.suggestionContext.targetMajor}};
      if(inferred && !(inferred.name==='open_workflow' && ((inferred.arguments.workflow==='dpa' && document)))){
        try{
          const verified=await runPlannerTool(req,inferred,{document,plannerDocument:body.plannerDocument,planningContext:body.planningContext,suggestionContext:body.suggestionContext,question});
          const result=await composeToolReply(verified,{question,conversationHistory,suggestionContext:body.suggestionContext,call:inferred,planningOnly:body.planningOnly===true},{model});
          return NextResponse.json({success:true,answer:result.answer,source:'tool',sources:[],toolResult:result,answerability:result.answerability});
        }catch(e){if([401,403].includes(e.status))return NextResponse.json({success:false,message:'Please sign in with permission to access this task.'},{status:e.status});if(body.plannerDocument&&['suggest_next_semester','plan_remaining_studies','adjust_study_plan','explain_next_semester'].includes(inferred.name))return NextResponse.json({success:true,answer:e.message||'Reattach the planner PDF and retry.',source:'guide',answerability:'clarification',sources:[]});return NextResponse.json({success:true,...refusal('The requested task could not be verified. Check the required attachment and selections, or retry when the records are available.'),source:'guide',answerability:'refused'});}
      }
    }
    const context = document ? body.planningContext : null;
    try { document = document ? reviewedChatDocument(document, context) : null; }
    catch(e) { return NextResponse.json({success:false,message:e.message},{status:400}); }
    // Reviewed evidence supersedes old assistant statements about an earlier DPA.
    const history = conversationHistory.slice(-10).filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && !(context?.dpaConfirmed && m.role==='assistant')).map(m => ({ role: m.role, content: m.content.slice(0, 3000) }));
    const query = normalizePlannerPrompt(question);
    const docs = retrievePlannerKnowledge(query);
    const evidence = document ? documentEvidence(document) : null;
    const personalReply = answer => NextResponse.json({success:true,answer,source:'guide',sources:[],plannerChoices:[]});
    if (context?.dpaConfirmed && evidence?.transcript && /how many|completed|passed|earned|exempt|credits|progress|failed/i.test(question) && !/why|semester|schedule|plan|take|major/i.test(question)) return personalReply(evidence.summary);
    if (!intent && context?.dpaConfirmed && context?.programmeConfirmed && !/major/i.test(question) && /semester|schedule|suggest|recommend|plan|why|selected|choose|chosen|take|instead|eligible|can i|what about/i.test(question)) {
      // Re-run the authenticated planning endpoint using raw input + corrections.
      // Never accept a client-supplied plan or trust a stale model-generated summary.
      const response = await generateReviewedPlan(new Request(req.url || 'http://localhost/api/planner-assistant/planning', {method:'POST',headers:req.headers,body:JSON.stringify({...context,document:body.document})}));
      const result = await response.json();
      if (!response.ok || !result.success) return NextResponse.json({success:false,message:result.message||'Could not recheck the reviewed plan. Please retry.'},{status:response.status||503});
      return personalReply(`${evidence.summary}\n\n${explainSemesterDraft(result,question)}`);
    }
    // Personal semester advice must pass the structured review and rules engine.
    // A model must never turn an unconfirmed planner match into enrolment advice.
    if (!intent && document && /suggestion|semester|schedule|what.*take|plan.*next/.test(normalizePlannerPrompt(question))) return NextResponse.json({success:true,source:'guide',sources:[],plannerChoices:[],answer:`${evidence?.summary || ''}\n\nUse the “Review DPA and plan a semester” card in this chat to confirm your extracted results, programme, intake and planner, then choose a semester and workload. Generate a draft to see rule checks and reasons. Year-specific offerings and incomplete rules are flagged for review; a matching planner alone does not establish enrolment eligibility.`});
    const codes = [...new Set(query.toUpperCase().match(/\b[A-Z]{2,5}\d{3,6}\b/g) || [])].slice(0, 8);
    let units = [], databaseWarning = '', comparison = '', unitAdvice = '', plannerChoices = [];
    try {
      if (codes.length) units = await prisma.unit.findMany({ where: { UnitCode: { in: codes } }, select: { ID: true, UnitCode: true, Name: true, CreditPoints: true, Availability: true, UnitTermOffered: { select: { TermType: true } } }, take: 25 });
      if (units.length && /prerequisite|requisite|before|eligible/.test(query)) {
        const relations = await prisma.unitRequisiteRelationship.findMany({ where: { UnitID: { in: units.map(u => u.ID) } }, include: { Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: { select: { UnitCode: true, Name: true } } } });
        unitAdvice += relations.length ? 'Recorded requisite conditions (preserve AND/OR and relationship types):\n' + relations.map(r => [units.find(u => u.ID === r.UnitID)?.UnitCode, r.UnitRelationship, r.LogicalOperators, r.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit?.UnitCode, r.MinCP != null ? r.MinCP + ' minimum CP' : ''].filter(Boolean).join(' | ')).join('\n') : 'No requisite relationships are recorded for these units; this does not prove unrestricted enrolment.';
      }
      if (units.length && /replacement|replace|alternative|expired|retired/.test(query)) {
        const pool = await prisma.unit.findMany({ select: { UnitCode: true, Name: true, CreditPoints: true, Availability: true, UnitTermOffered: { select: { TermType: true } } }, orderBy: { ID: 'asc' } });
        unitAdvice += '\nReplacement candidates based on title similarity, not approved equivalence:\n' + units.map(u => u.UnitCode + ': ' + (replacementCandidates({ code: u.UnitCode, name: u.Name, creditPoints: u.CreditPoints }, pool).map(c => c.code + ' ' + c.name + ' (' + c.credits + ' CP)').join('; ') || 'No title-similarity candidates found.')).join('\n') + '\nConfirm syllabus compatibility and HOD approval before substituting.';
      }
      if (evidence?.transcript && !intent && /double major|dual major|second major|compare/i.test(question)) {
        const records = await prisma.studyPlanner.findMany({ include: { studyPlannerUnits: { include: { unit: true, unitType: true } }, plannerTemplate: { include: { requirements: { include: { unitType: true } } } } } });
        const planners = records.map(p => ({ ...p, units: p.studyPlannerUnits.map(j => ({ ...j.unit, unitType: j.unitType })) }));
        try {
          if (context?.programmeConfirmed) {
            const primary = planners.find(p=>p.id===context.plannerId);
            if (!primary) return personalReply('Your confirmed planner is no longer available. Select it again in the planning card.');
            const options=planners.filter(p=>p.id!==primary.id).flatMap(p=>{try{return [checkDoubleMajor(evidence.transcript,[primary,p])];}catch{return [];}}).sort((a,b)=>a.majors[1].remaining-b.majors[1].remaining);
            return personalReply(evidence.summary+'\n\nUsing your confirmed planner: '+primary.name+'\n\n'+options.slice(0,5).map(o=>o.majors.map(m=>m.name+': '+m.matched+'/'+m.required+' major units matched, '+m.remaining+' remaining ('+m.source+')').join(' + ')).join('\n')+'\n\nThese compare unit coverage only; programme compatibility and graduation rules still need confirmation.');
          }
          const assessment = assessDpaDoubleMajor(evidence.transcript, planners, primaryPlannerId);
          if (assessment.ties.length > 1 && primaryPlannerId == null) {
            plannerChoices = assessment.ties.map(r => ({ id: r.planner.id, name: r.planner.name }));
            comparison = 'Several planners match equally. Select your primary planner below for the comparison.';
          } else {
            const primary = assessment.primary;
            const earned = new Map(evidence.transcript.completed.map(u => [normalizeCode(u.code), u.earned]));
            const remaining = [...new Map(primary.planner.units.filter(u => !earned.has(normalizeCode(u.UnitCode)) || !Number.isFinite(u.CreditPoints) || earned.get(normalizeCode(u.UnitCode)) < u.CreditPoints).map(u => [normalizeCode(u.UnitCode), u])).values()];
            comparison = `Closest planner by earned-unit overlap: ${primary.planner.name} (${primary.matched} matched units). This does not establish your enrolled course or intake.\n\nUnits in its pool without sufficient earned credit: ${remaining.map(u => `${u.UnitCode} ${u.Name}`).join(', ') || 'None'}. These are candidates, not a semester schedule; check category counts, prerequisites and offerings.\n\nSecond-major comparisons:\n` + assessment.options.slice(0, 5).map(o => `${o.additional.name}: ${o.additional.matched}/${o.additional.required} major units matched, ${o.additional.remaining} remaining. Unmet pool candidates: ${o.additional.units.filter(u => !u.completed).map(u => u.code).join(', ') || 'None'}. ${o.additional.source}.`).join('\n') + '\nCourse/intake compatibility, overall graduation requirements and HOD approval still need confirmation. Shared credits count once. Pool candidates can include alternatives.';
          }
        } catch (e) { comparison = e.message; }
      }
    } catch { databaseWarning = 'The unit/planner database is unavailable. Document explanation and general guidance are still available; try the comparison again later.'; }
    const checked=generalEvidenceReply({question,docs,units,unitAdvice,evidence,comparison,plannerChoices,databaseWarning});
    return NextResponse.json({success:true,answer:checked.answer,source:'guide',sources:checked.sources||[],plannerChoices:checked.plannerChoices||[],answerability:checked.status});
  } catch { return NextResponse.json({ success: false, message: 'Could not answer. Your document is still attached; please retry.' }, { status: 500 }); }
}
