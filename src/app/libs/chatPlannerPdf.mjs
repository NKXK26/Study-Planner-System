import {jsPDF} from 'jspdf';

export function createChatPlannerPdf(snapshot) {
  if(!snapshot?.units?.length)throw new Error('No suggested units are available to export. Generate suggestions first.');
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const width=174,bottom=275;let y=24;
  const text=value=>String(value??'').replace(/[—–]/g,'-').replace(/[’]/g,"'");
  const line=(value,{bold=false,size=10,color=[25,25,25]}={})=>{
    doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
    for(const row of doc.splitTextToSize(text(value),width)){
      if(y+6>bottom){doc.addPage();y=24;}
      doc.text(row,18,y);y+=5.5;
    }
    y+=2;
  };
  line('Suggested study planner',{bold:true,size:20,color:[185,28,28]});
  line(snapshot.semesters?'Provisional pathway through remaining semesters':'Provisional next-semester draft',{bold:true});
  line('Planner: '+(snapshot.planner?.name||'Not recorded'));
  line('Semester: '+(snapshot.term||'Not recorded')+' '+(snapshot.year||''));
  if(snapshot.uploadedPlannerName)line('Uploaded planner: '+snapshot.uploadedPlannerName);
  if(snapshot.documentName)line('DPA: '+snapshot.documentName);
  y+=3;
  line('SUGGESTED UNITS',{bold:true,color:[185,28,28]});
  for(const semester of snapshot.semesters||[{term:snapshot.term,year:snapshot.year,selected:snapshot.units,credits:snapshot.credits}]){
  line(semester.term+' '+semester.year+' | '+semester.selected.length+(semester.selected.length===1?' unit | ':' units | ')+semester.credits+' CP',{bold:true});
  semester.selected.forEach((u,i)=>{
    line((i+1)+'. '+u.code+' - '+u.name,{bold:true});
    line((u.category||'Category not recorded')+' | '+u.credits+' CP');
  });
  }
  line('TOTAL SCHEDULED: '+snapshot.units.length+(snapshot.units.length===1?' unit | ':' units | ')+snapshot.credits+' CP',{bold:true});
  if(snapshot.completeDraft===false){
    line('PARTIAL PATHWAY: some requirements could not be scheduled.',{bold:true});
    if(snapshot.outstanding?.length){line('UNSCHEDULED REQUIREMENTS',{bold:true,color:[185,28,28]});for(const u of snapshot.outstanding){if(u.code)line(u.code+' '+(u.name||'')+': '+[...(u.reasons||[]),...(u.unknown||[])].join('; '),{size:9});else {line(u.name+': '+(u.remainingCount??'unknown')+' remaining',{size:9});for(const option of u.options||[])line(option.code+': '+(option.reasons||[]).join('; '),{size:9});}}}
  }
  if(snapshot.coverage){line('DOUBLE-MAJOR UNIT COVERAGE',{bold:true,color:[185,28,28]});for(const m of snapshot.coverage.majors)line(m.name+': '+m.matched+' earned / '+m.required+' required; '+m.remaining+' remaining.');}
  if(snapshot.completionAudit){
    y+=3;line(snapshot.semesters?'DPA CATEGORY PROGRESS BEFORE THIS PATHWAY':'REMAINING CATEGORY REQUIREMENTS',{bold:true,color:[185,28,28]});
    for(const c of snapshot.completionAudit.categories){
      line(c.name+': '+c.completedCount+' completed slots; '+(c.requiredCount==null?'required count not configured':c.requiredCount+' required; '+c.remainingCount+' remaining'));
      for(const a of c.allocations||[])if(a.reason!=='Completed planner elective')line(a.code+': '+a.slots+' elective slot(s)',{size:9});
    }
  }
  y+=3;line('CHECKS AND ASSUMPTIONS',{bold:true,color:[185,28,28]});
  const notes=[...new Set([snapshot.semesters?'Future semesters assume successful passes. This pathway is not enrolment or graduation approval.':'This PDF contains only the suggested semester, not a complete multi-semester schedule or enrolment approval.',...(snapshot.warnings||[]),...(snapshot.completionAudit?.warnings||[])].filter(v=>typeof v==='string'&&v.trim()))];
  notes.forEach(note=>line(note,{size:9}));
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++){
    doc.setPage(page);doc.setDrawColor(185,28,28);doc.line(18,283,192,283);doc.setFontSize(8);doc.setTextColor(90,90,90);doc.text('Study Planner Assistant | Provisional draft',18,289);doc.text(page+' / '+pages,192,289,{align:'right'});
  }
  return doc;
}
export function downloadChatPlannerPdf(snapshot) {
  const filename=('study-planner-'+(snapshot.planner?.name||'suggestions')+'-'+snapshot.term+'-'+snapshot.year).replace(/[^a-z0-9_-]+/gi,'-');
  createChatPlannerPdf(snapshot).save(filename+'.pdf');
}
