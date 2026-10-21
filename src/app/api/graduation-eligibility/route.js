import {NextResponse} from 'next/server';
import prisma from '@utils/db/db';
import {toolIdentity} from '@app/libs/plannerTools.server';
import {validateDocument,documentEvidence} from '@app/libs/chatDpa.mjs';
import {plannerUnitReadSelect} from '@app/libs/plannerReadCompatibility.mjs';
import {graduationEligibilityReport} from '@app/libs/graduationEligibility.mjs';
export async function POST(req){
 try{
  await toolIdentity(req);
  const body=await req.json(),document=validateDocument(body.document);
  if(!document)throw new Error('Upload the student’s DPA PDF or XLSX first.');
  const transcript=documentEvidence(document).transcript;
  if(!transcript)throw new Error('The completed-unit table cannot be verified. Upload a readable DPA XLSX with Course, Status and Earned columns.');
  if(body.plannerId!=null&&body.plannerId!==''&&!/^[1-9]\d{0,11}$/.test(String(body.plannerId)))throw new Error('Select a valid programme planner.');
  const unitSelect=await plannerUnitReadSelect(prisma);
  const records=await prisma.studyPlanner.findMany({orderBy:{createdAt:'desc'},include:{studyPlannerUnits:{select:unitSelect},plannerTemplate:{include:{requirements:{include:{unitType:true}}}}}});
  const planners=records.map(p=>({...p,units:p.studyPlannerUnits.map(j=>({...j.unit,unitType:j.unitType}))}));
  const data=graduationEligibilityReport({transcript,planners,plannerId:body.plannerId});
  return NextResponse.json({success:true,data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({success:false,message:e.status&&[401,403].includes(e.status)?'Sign in with permission to read study planners.':e.message||'Could not check eligibility. Please retry.'},{status:e.status||400});}
}
