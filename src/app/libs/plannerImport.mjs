// Shared PDF text extraction: files are evidence, not instructions.
export function extractPlannerCodes(text) {
  return [...new Set(String(text).toUpperCase().replace(/\b([A-Z]{2,5})\s+(\d{3,6})\b/g,'$1$2').match(/\b[A-Z]{2,5}\d{3,6}\b/g)||[])];
}
export function extractPlannerCategories(text,types) {
  const found=new Map();
  for(const line of String(text).split('\n')) {
    const codes=extractPlannerCodes(line);
    const tokens=line.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const matches=types.filter(t=>{
      const name=t.Name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(' ');
      return name && (' '+tokens.join(' ')+' ').includes(' '+name+' ');
    });
    if(matches.length===1)for(const code of codes){
      if(found.has(code)&&found.get(code)!==matches[0].ID)found.set(code,null);
      else if(!found.has(code))found.set(code,matches[0].ID);
    }
  }
  return Object.fromEntries(found);
}
