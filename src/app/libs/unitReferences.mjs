const stop=new Set('i me my we our you your a an the this that these those it one unit units subject subjects course courses what about tell explain why how can could should would do does did take taking study next sem semester term prerequisite prerequisites requisite requisites eligible eligibility available availability offered offering offerings for in on to of and or please pls again instead have has completed passed failed want need is are was be with before after require requirements requirement prereq prereqs req reqs cp credits credit work works consider considering alternative alternatives replacement replacements selected chosen blocked not isn isnt wasn wasnt t already still use used allowed satisfy satisfied meet meets fit fits'.split(' '));
export const cleanUnitText=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function nearWord(a,b){
  if(a===b)return true;
  if(a.length<5||b.length<5||Math.abs(a.length-b.length)>1)return false;
  const row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}
  return row[b.length]<=1;
}
export function resolveUnitReference(records,{question='',unitQuery='',code='',lastCode=''}={}) {
  const q=String(question);const explicit=[...new Set((q.toUpperCase().match(/\b[A-Z]{2,5}[ -]?\d{3,6}\b/g)||[]).map(v=>v.replace(/[ -]/g,'')))];
  const requested=explicit.length?explicit:code?[String(code).toUpperCase().replace(/[ -]/g,'')]:[];
  if(requested.length)return finish(records.filter(u=>requested.includes(String(u.code||u.UnitCode).toUpperCase())),requested.length===1?requested[0]:null);
  const phase=q.match(/\b(?:fyp|final year project|computing project|project)\s*([ab])\b/i);
  const query=cleanUnitText(unitQuery||q);
  const exact=records.filter(u=>cleanUnitText(u.name||u.Name)===query);
  if(exact.length)return finish(exact);
  const named=records.filter(u=>(' '+query+' ').includes(' '+cleanUnitText(u.name||u.Name)+' '));
  if(named.length)return finish(named);
  let words=[...new Set(query.split(' ').filter(w=>!stop.has(w)&&w.length>1&&!/^\d+$/.test(w)))];
  const matches=records.filter(u=>{
    const name=cleanUnitText(u.name||u.Name);const titleWords=name.split(' ');
    if(phase)return /project/.test(name)&&new RegExp('\\b'+phase[1].toLowerCase()+'\\b').test(name);
    if(!words.length)return false;
    if(query===name||(' '+query+' ').includes(' '+name+' '))return true;
    const matched=words.filter(w=>titleWords.some(t=>nearWord(w,t)));
    return matched.length>=(words.length===1?1:2);
  });
  if(matches.length)return finish(matches);
  if(!unitQuery&&!words.length&&lastCode&&/\bit\b|\bthat\b|this unit|same unit/i.test(q))return finish(records.filter(u=>String(u.code||u.UnitCode).toUpperCase()===lastCode.toUpperCase()),lastCode);
  return {status:'missing',choices:[]};
}
function finish(matches,requestedCode=null){
  if(!matches.length)return {status:'missing',choices:[],requestedCode};
  const codes=[...new Set(matches.map(u=>String(u.code||u.UnitCode).toUpperCase()))];
  if(codes.length>1)return {status:'ambiguous',choices:codes.map(code=>({code,name:matches.find(u=>String(u.code||u.UnitCode).toUpperCase()===code).name||matches.find(u=>String(u.code||u.UnitCode).toUpperCase()===code).Name}))};
  if(matches.length>1)return {status:'version-review',choices:[],requestedCode:codes[0]};
  return {status:'matched',unit:matches[0],code:codes[0],choices:[]};
}
