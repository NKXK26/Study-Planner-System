import {readOfficialCatalogue} from '@app/libs/officialCatalogue.mjs';
import {isStudentWebEdition} from '@app/libs/studentPortalAccess.mjs';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  try {
    const result = await readOfficialCatalogue();
    if (isStudentWebEdition()) {
      if (result.source === 'local') return Response.json({success:false,message:'Published catalogue unavailable. No recent copy is available.'},{status:503});
      if (new URL(req.url).searchParams.has('status')) return Response.json({source:result.source,warning:result.warning});
    }
    if (new URL(req.url).searchParams.has('status')) return Response.json({source:result.source,warning:result.warning,manageUrl:result.source === "local" ? null : new URL("/manage",process.env.PLANNER_CATALOGUE_URL).href});
    if (result.source === 'local') {
      const {GET:readLocal} = await import('../study-planner/route');
      const local = await readLocal(req);
      return Response.json({...await local.json(),...result},{status:local.status});
    }
    return Response.json({success:true,...result,data:result.data.filter(p=>p.courseCode === 'BA-CS')});
  } catch {
    return Response.json({success:false,message:'Cannot reach the published catalogue and no recent copy is available.'},{status:503});
  }
}
