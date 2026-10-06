import {NextResponse} from 'next/server';
import prisma from '@utils/db/db';
import {toolIdentity} from '@app/libs/plannerTools.server';
import {validateDocument,documentEvidence} from '@app/libs/chatDpa.mjs';
import {unitPlanningInclude} from '@app/libs/unitPlanningProperties.mjs';
import {doubleMajorPathway} from '@app/libs/doubleMajorPathway.mjs';

export async function POST(req){
  try{
    await toolIdentity(req);
    const body=await req.json();
    const document=validateDocument(body.document);
    if(!document)throw new Error('Upload your DPA first.');
    const transcript=documentEvidence(document).transcript;
    if(!transcript)throw new Error('The DPA table cannot be verified. Upload a readable XLSX export with Course, Status and Earned columns.');
    const records=await prisma.studyPlanner.findMany({orderBy:{createdAt:'desc'},include:{studyPlannerUnits:{include:{unit:{include:unitPlanningInclude},unitType:true}},plannerTemplate:{include:{requirements:{include:{unitType:true}}}}}});
    const planners=records.map(p=>({...p,units:p.studyPlannerUnits.map(j=>({...j.unit,unitType:j.unitType}))}));
    const result=doubleMajorPathway({transcript,planners,primaryId:body.primaryId,secondaryId:body.secondaryId,term:body.term,year:body.year});
    return NextResponse.json({success:true,data:result},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return NextResponse.json({success:false,message:e.message||'Could not generate a double-major draft. Please retry.'},{status:e.status||400});}
}
