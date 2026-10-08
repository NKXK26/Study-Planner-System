import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

// The client retains a compact signed extraction, never trusted eligibility or raw PDF bytes.
const key=Symbol.for('study-planner.upload-signing-key');
const signingKey=()=>process.env.PLANNER_UPLOAD_SECRET||(globalThis[key]??=randomBytes(32));
export function signPlannerDocument(data){const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return {name:data.name,token:payload+'.'+createHmac('sha256',signingKey()).update(payload).digest('base64url')};}
export function readPlannerDocument(document){
 if(!document)return null;
 if(typeof document.token!=='string'||document.token.length>250000)throw new Error('Reattach the study planner PDF to verify its contents.');
 const [payload,signature,...extra]=document.token.split('.');
 const expected=createHmac('sha256',signingKey()).update(payload||'').digest();
 const actual=Buffer.from(signature||'','base64url');
 if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error('This planner attachment could not be verified. Reattach the PDF after restarting the server.');
 const data=JSON.parse(Buffer.from(payload,'base64url').toString());
 if(data.version!==1||!Array.isArray(data.units)||!data.units.length||data.units.length>300)throw new Error('Invalid planner extraction. Reattach the PDF.');
 return data;
}
const codePattern=/^[A-Z]{2,5}\d{3,6}$/;
const colourDistance=(a,b)=>Math.sqrt(a.slice(0,3).reduce((n,v,i)=>n+(v-b[i])**2,0));
// Geometry separates curriculum codes from codes occurring only in prerequisites.
export async function extractUploadedPlanner(parser,name){
 const info=await parser.getInfo();
 if(info.total>10)throw new Error('Upload only the study planner pages (at most 10).');
 const text=(await parser.getText()).text;
 if(text.length>60000)throw new Error('The study planner is too long. Upload just its course planner pages.');
 const {createCanvas,loadImage}=await import('@napi-rs/canvas');
 const rows=[],legends=[];
 for(let n=1;n<=info.total;n++){
  const page=await parser.doc.getPage(n),vp=page.getViewport({scale:1});
  if(vp.width*vp.height>8000000)throw new Error('This PDF page is too large to read safely. Export it at normal page dimensions.');
  const shot=await parser.getScreenshot({partial:[n],scale:1});
  const img=await loadImage(shot.pages[0].data),canvas=createCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  const items=(await page.getTextContent()).items.filter(i=>i.str?.trim()).map(i=>({text:i.str.trim(),x:i.transform[4],y:vp.height-i.transform[5],w:i.width,h:i.height||i.transform[0]}));
  const colour=(item,legend=false)=>{const x=Math.max(0,Math.min(img.width-1,Math.floor(legend?item.x+item.w+3:item.x-1))),y=Math.max(0,Math.min(img.height-1,Math.floor(item.y-1)));return [...ctx.getImageData(x,y,1,1).data].slice(0,3);};
  for(const item of items){
   const match=item.text.match(/^(\d+)\s+(.+?)\s+Units?$/i);
   if(match&&/core|major|elective/i.test(match[2])){
    if(Number(match[1])>300)throw new Error('A planner category count exceeds the supported 300-unit limit.');
    const category=/core/i.test(match[2])?'Core':/elective/i.test(match[2])?'Elective':match[2].replace(/\s+/g,' ');
    const cp=items.filter(i=>Math.abs(i.x-item.x)<10&&i.y>item.y&&i.y-item.y<24).map(i=>i.text).join(' ').match(/(\d+(?:\.\d+)?)\s*credit points/i);
    legends.push({category,count:Number(match[1]),credits:cp?Number(cp[1]):null,colour:colour(item,true)});
   }
  }
  const lines=[];
  for(const item of items.sort((a,b)=>a.y-b.y||a.x-b.x)){let line=lines.find(l=>Math.abs(l.y-item.y)<2);if(!line){line={y:item.y,items:[]};lines.push(line);}line.items.push(item);}
  // Codes must occupy the first column of a unit table. Requisite columns cannot create units.
  const headers=lines.flatMap(l=>l.items.filter(i=>/^Unit Code$/i.test(i.text)).map(i=>({x:i.x,y:i.y,columns:l.items.slice().sort((a,b)=>a.x-b.x)})));
  for(const line of lines){
   for(const item of line.items.filter(i=>codePattern.test(i.text))){
    const header=headers.filter(h=>h.y<line.y&&Math.abs(h.x-item.x)<8).at(-1);
    if(!header)continue;
    const nameColumn=header.columns.find(i=>/^Unit(?: Name)?$/i.test(i.text)),reqColumn=header.columns.find(i=>/^Pre$|Pre.?requisites?/i.test(i.text)),offerColumn=header.columns.find(i=>/Offered in/i.test(i.text));
    if(!nameColumn)continue;
    const categoryColumn=header.columns.find(i=>/^(?:Category|Unit Type)$/i.test(i.text)),creditColumn=header.columns.find(i=>/^(?:CP|Credit Points)$/i.test(i.text));
    const right=Math.max(offerColumn?offerColumn.x+180:reqColumn?reqColumn.x+100:vp.width,categoryColumn?categoryColumn.x+100:0,creditColumn?creditColumn.x+100:0);
    const nextRow=items.filter(i=>i.y>item.y+3&&((Math.abs(i.x-item.x)<8&&(codePattern.test(i.text)||/^Semester|^Year/i.test(i.text)))||Math.abs(i.x-nameColumn.x)<8&&/^Elective \d/i.test(i.text))).sort((a,b)=>a.y-b.y)[0];
    const bottom=Math.min(item.y+20,nextRow?nextRow.y-3:item.y+20);
    const cells=items.filter(i=>i.y>=item.y-2&&i.y<=bottom&&i.x>item.x+item.w+2&&i.x<right);
    const unitName=cells.filter(i=>i.x>=nameColumn.x-4&&i.x<Math.min(reqColumn?.x??right,categoryColumn?.x??right,creditColumn?.x??right,offerColumn?.x??right)-4).sort((a,b)=>a.y-b.y||a.x-b.x).map(i=>i.text).join(' ');
    if(!unitName||/^Elective \d|Semester|Year /i.test(unitName))continue;
    const fields=[nameColumn,reqColumn,offerColumn,categoryColumn,creditColumn].filter(Boolean).sort((a,b)=>a.x-b.x);
    const end=col=>fields.find(f=>f.x>col.x+8)?.x??right;
    const requisite=cells.filter(i=>reqColumn&&i.x>=reqColumn.x-4&&i.x<end(reqColumn)-4).sort((a,b)=>a.y-b.y||a.x-b.x).map(i=>i.text).join(' ');
    const explicitCategory=cells.filter(i=>categoryColumn&&Math.abs(i.x-categoryColumn.x)<8).map(i=>i.text).join(' ');
    const creditsText=cells.filter(i=>creditColumn&&Math.abs(i.x-creditColumn.x)<8).map(i=>i.text).join(' ');
    const credits=/^\d+(?:\.\d+)?(?:\s*CP)?$/i.test(creditsText)?Number(creditsText.replace(/CP/i,'').trim()):null;
    const offerings=cells.filter(i=>offerColumn&&i.x>=offerColumn.x-4&&i.x<end(offerColumn)-4).map(i=>i.text).join(' ');
    const priorTerm=lines.filter(l=>l.y<line.y&&l.items.some(i=>Math.abs(i.x-header.x)<8&&/^Semester [12]$/i.test(i.text))).at(-1)?.items.find(i=>/^Semester [12]$/i.test(i.text))?.text;
    rows.push({code:item.text,name:unitName,requisite,offerings,sequenceTerm:offerColumn?null:priorTerm||null,explicitCategory,credits,colour:colour(item),page:n});
   }
  }
 }
 const uniqueLegends=[...new Map(legends.map(l=>[l.category,l])).values()];
 if(!uniqueLegends.length)throw new Error('I could not read the core, major and elective requirement counts. Upload a planner with a readable category legend and unit table.');
 const units=[];const issues=[];
 for(const row of rows){
  const explicit=uniqueLegends.filter(l=>l.category.toLowerCase()===row.explicitCategory.toLowerCase());
  const matches=explicit.length?explicit:uniqueLegends.filter(l=>colourDistance(l.colour,row.colour)<32).sort((a,b)=>colourDistance(a.colour,row.colour)-colourDistance(b.colour,row.colour));
  if(matches.length!==1){issues.push(row.code+': unit category could not be read from the PDF legend');continue;}
  const {colour,...unit}=row;units.push({...unit,category:matches[0].category});
 }
 const distinct=[...new Map(units.map(u=>[u.code,u])).values()];
 if(!distinct.length)throw new Error('No categorized unit rows were readable. Use a searchable, colour-coded course planner PDF.');
 if(distinct.length!==units.length)throw new Error('Repeated curriculum unit codes need review. Upload one applicable planner, rather than several versions.');
 const requirements=uniqueLegends.map(({category,count,credits})=>({category,count,credits}));
 const title=text.match(/Bachelor[^\n]+|Master[^\n]+|Diploma[^\n]+/i)?.[0]?.trim()||name.replace(/\.pdf$/i,'');
 return {version:1,name,title,units:distinct,requirements,issues};
}
