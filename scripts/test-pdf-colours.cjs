const assert = require('node:assert/strict');
const { jsPDF } = require('jspdf');
(async () => {
  const { extractPdfColours } = await import('../src/app/libs/pdfColours.server.mjs');
  const doc = new jsPDF({ unit: 'pt' });
  doc.setFontSize(12); doc.text('Plain heading', 30, 30);
  const rows = [['COS10003', [198,217,241]], ['COS20019',[214,227,188]], ['COS30018',[253,233,217]]];
  for (let i=0;i<rows.length;i++) {const [code,colour]=rows[i],y=70+i*40;doc.setFillColor(...colour);doc.rect(25,y-16,450,30,'F');doc.text(code,30,y);doc.text('Planner unit '+i,130,y);}
  doc.addPage();doc.setFillColor(198,217,241);doc.rect(25,54,450,30,'F');doc.text('COS 40005',30,70);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  const blocks=await extractPdfColours(bytes);
  for(const [code,rgb]of rows){const block=blocks.find(b=>b.text.includes(code));assert(block,code+' retains its coloured row');assert(rgb.every((v,i)=>Math.abs(v-parseInt(block.color.slice(1+i*2,3+i*2),16))<=3),'Raster colour stays within three channel levels of the PDF fill');assert.equal(block.page,1);assert.equal(block.bbox.length,4);}
  assert(blocks.some(b=>b.page===2&&b.text.includes('COS40005')),'Read later pages and normalise split codes');
  assert(!blocks.some(b=>b.text.includes('Plain heading')),'Do not assign white headings a curriculum colour');
  const mono=new jsPDF();mono.text('Monochrome searchable planner',10,10);
  assert.deepEqual(await extractPdfColours(new Uint8Array(mono.output('arraybuffer'))),[]);
  const blank=new jsPDF();await assert.rejects(extractPdfColours(new Uint8Array(blank.output('arraybuffer'))),/no readable text/i);
  const tooLong=new jsPDF();for(let n=0;n<10;n++)tooLong.addPage();await assert.rejects(extractPdfColours(new Uint8Array(tooLong.output('arraybuffer'))),/at most 10/);
  if(process.env.DESKTOP_PDF_FIXTURE)require('node:fs').writeFileSync(process.env.DESKTOP_PDF_FIXTURE,bytes);
  console.log('PDF colours: all row colours, multipage extraction, split codes, white text backgrounds and source limits passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
