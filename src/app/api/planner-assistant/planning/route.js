import { unitPlanningInclude } from '@app/libs/unitPlanningProperties.mjs';
import { NextResponse } from 'next/server';
import prisma from '@utils/db/db';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { validateDocument } from '@app/libs/chatDpa.mjs';
import { reviewDpa, semesterPlan } from '@app/libs/academicPlanning.mjs';

async function authorized(req) {
  return (req.headers.get('x-dev-override')==='true' && process.env.NEXT_PUBLIC_MODE==='DEV') || await SecureSessionManager.authenticateUser(req);
}
export async function GET(req) {
  if (!await authorized(req)) return NextResponse.json({success:false,message:'Please sign in.'},{status:401});
  try {
    const [intakes, planners, terms] = await Promise.all([
      prisma.courseIntake.findMany({include:{Major:{include:{Course:true}},Term:true}}),
      prisma.studyPlanner.findMany({select:{id:true,name:true},orderBy:{name:'asc'}}),
      prisma.unitTermOffered.findMany({select:{TermType:true},distinct:['TermType']}),
    ]);
    return NextResponse.json({success:true,intakes:intakes.map(i=>({id:i.ID,label:`${i.Major?.Course?.Code || ''} ${i.Major?.Course?.Name || ''} / ${i.Major?.Name || 'Unknown major'} / ${i.Term?.Name || 'Unknown intake'}`,status:i.Status})),planners,terms:terms.map(t=>t.TermType)});
  } catch { return NextResponse.json({success:false,message:'Could not load programme choices. Please retry.'},{status:503}); }
}
export async function POST(req) {
  if (!await authorized(req)) return NextResponse.json({success:false,message:'Please sign in.'},{status:401});
  let body, document, review;
  try {
    body=await req.json(); document=validateDocument(body.document);
    if (!document || body.dpaConfirmed!==true || body.programmeConfirmed!==true || !Number.isInteger(body.intakeId) || !Number.isInteger(body.plannerId) || !Number.isInteger(body.year) || body.year<2000 || body.year>2100) throw new Error('Review the DPA and confirm your programme, intake, planner and target year first.');
    review=reviewDpa(document,body.corrections || []);
    if (!review.transcript.completed.length) throw new Error('No completed units with earned credits are available. Review the DPA before planning.');
  } catch(e) { return NextResponse.json({success:false,message:e.message || 'Invalid planning request.'},{status:400}); }
  try {
    const [intake,planner]=await Promise.all([
      prisma.courseIntake.findUnique({where:{ID:body.intakeId},include:{Major:{include:{Course:true}},Term:true}}),
      prisma.studyPlanner.findUnique({where:{id:body.plannerId},include:{studyPlannerUnits:{include:{unit:{include:unitPlanningInclude},unitType:true}},plannerTemplate:{include:{requirements:{include:{unitType:true}}}}}}),
    ]);
    if (!intake?.Major?.Course || !intake.Term || !planner) return NextResponse.json({success:false,message:'The selected programme or planner no longer exists. Reload the choices.'},{status:400});
    const units=planner.studyPlannerUnits.map(j=>({...j.unit,unitType:j.unitType}));
    const relations=units.flatMap(u=>u.UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit || []);
    let plan;
    try { plan=semesterPlan({transcript:review.transcript,planner:{...planner,units},relations,term:body.term,maxCredits:body.maxCredits,maxUnits:body.maxUnits}); }
    catch(e) { return NextResponse.json({success:false,message:e.message},{status:400}); }
    plan.warnings.push('Programme-to-planner linkage is student-confirmed: the database has no formal mapping for these planner pools.');
    if (intake.Status?.toLowerCase()!=='published') plan.warnings.push('The selected intake is not published; advisor confirmation is required.');
    const generatedAt=new Date().toISOString();
    const result={generatedAt,programme:`${intake.Major.Course.Code} ${intake.Major.Course.Name} / ${intake.Major.Name} / ${intake.Term.Name}`,plannerName:planner.name,year:body.year,term:body.term,maxUnits:body.maxUnits,maxCredits:body.maxCredits,documentName:document.name,review,plan};
    return NextResponse.json({success:true,...result});
  } catch { return NextResponse.json({success:false,message:'Planning records are unavailable. Your review is retained; please retry.'},{status:503}); }
}
