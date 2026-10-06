import { NextResponse } from 'next/server';
import { plannerCatalog, runPlannerTool } from '@app/libs/plannerTools.server';
import { composeToolReply } from '@app/libs/plannerResponse.mjs';
import { resolvePlannerModel } from '@app/libs/plannerAiStatus.mjs';
export async function GET(req){
  try{return NextResponse.json({success:true,...await plannerCatalog(req)},{headers:{'Cache-Control':'no-store'}});}
  catch(e){return NextResponse.json({success:false,message:e.message||'Could not load choices. Retry.'},{status:e.status||503});}
}
export async function POST(req){
  try{
    const body=await req.json();
    const model=body.planningOnly===true?undefined:await resolvePlannerModel(body.aiModel);
    const question=typeof body.question==='string'?body.question.slice(0,2000):'Explain this planning result.';
    const verified=await runPlannerTool(req,body.call,{allowWrites:true,document:body.document,planningContext:body.planningContext,suggestionContext:body.suggestionContext,question});
    const result=await composeToolReply(verified,{question,conversationHistory:body.conversationHistory,suggestionContext:body.suggestionContext,call:body.call,planningOnly:body.planningOnly===true},{model});
    return NextResponse.json({success:true,...result});
  }catch(e){return NextResponse.json({success:false,message:e.message||'Could not run this task. Your selections are retained.'},{status:e.status||400});}
}
