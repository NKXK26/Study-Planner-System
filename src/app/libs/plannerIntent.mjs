const majors=[
  {id:'AI',label:'Artificial Intelligence',pattern:/\bai\b|artificial intelligence|\bcsai\b/i,planner:/CSAI|artificial intelligence/i},
  {id:'DS',label:'Data Science',pattern:/data science|\bcsds\b|\bds major\b/i,planner:/CSDS|data science/i},
  {id:'SD',label:'Software Development',pattern:/software (?:development|engineering)|\bcssd\b/i,planner:/CSSD|software development/i},
  {id:'IOT',label:'Internet of Things',pattern:/\biot\b|internet of things/i,planner:/CSIOT|internet of things/i},
  {id:'CS',label:'Cybersecurity',pattern:/cyber\s*security|\bcscs\b/i,planner:/CSCS|cyber\s*security/i},
];
export function requestedMajor(question) {
  let text=String(question);
  // Resolve a destination before looking at origin mentions; ignore explicitly rejected majors.
  const destination=text.match(/\b(?:shift|switch|change|move|transfer)(?:ing)?\s+(?:from\s+.+?\s+)?(?:my\s+major\s+)?(?:to|into)\s+(.+)/i);
  if(destination)text=destination[1];
  text=text.split(/\binstead\s+of\b/i)[0];
  text=text.replace(/\b(?:not|no longer|don['’]?t want|do not want|avoid)\s+(?:an?\s+)?(?:ai\b|artificial intelligence|data science|software development|cyber\s*security|iot\b)/gi,'');
  // Multiple alternatives require a choice, not the first alias in the registry.
  if(/\bor\b|\beither\b/i.test(text) && majors.filter(m=>m.pattern.test(text)).length>1)return null;
  const known=majors.find(m=>m.pattern.test(text));
  if(known)return known.id;
  const unknown=text.match(/(?:shift|switch|change|move|transfer)\s+(?:my\s+major\s+)?(?:to|into)\s+(?:an?\s+)?(.+?)\s+major\b/i);
  return unknown?unknown[1].trim().slice(0,100):null;
}
export function majorMatches(name,target) {
  const known=majors.find(m=>m.id===String(target).toUpperCase()||m.pattern.test(String(target)));
  return known?known.planner.test(name):String(name).toLowerCase().includes(String(target).toLowerCase());
}
export function majorLabel(target){return majors.find(m=>m.id===target)?.label||target;}
export function attachmentKey(document) {
  if(!document)return '';
  const text=JSON.stringify([document.name,document.text,document.rows]);
  let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return `${document.name}:${text.length}:${hash>>>0}`;
}
export function appendToolReply(messages,answer,metadata={}) {
  const last=messages.at(-1);
  if(last?.role==='assistant'&&last.source==='tool'&&last.content===answer){
    if(!Object.keys(metadata).length)return messages;
    return [...messages.slice(0,-1),{...last,...metadata}];
  }
  return [...messages,{role:'assistant',content:answer,source:'tool',...metadata}];
}
