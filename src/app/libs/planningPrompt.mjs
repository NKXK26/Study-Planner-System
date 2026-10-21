export function parsePlanningPrompt(text) {
  const q=String(text).toLowerCase();
  // Negated or hypothetical requests need clarification, never a form mutation.
  if(/\b(?:not|never|avoid|without|unless|if)\b|\bdon['’]?t\b|\bdo\s+not\b|\binstead\b/.test(q))return null;
  if(/\bwhy\b|how many|what should|can i|should i/.test(q)||!/\b(take|use|set|limit|maximum|max|plan)\b/.test(q))return null;
  const settings={};
  const units=q.match(/\b([1-8]|one|two|three|four|five|six|seven|eight)\s+units?\b/);
  if(units)settings.maxUnits=Number(units[1])||['one','two','three','four','five','six','seven','eight'].indexOf(units[1])+1;
  const credits=q.match(/\b(\d+(?:\.\d+)?)\s*(?:cp|credits?|credit points)\b/);
  if(credits&&Number(credits[1])>0&&Number(credits[1])<=100)settings.maxCredits=Number(credits[1]);
  const year=q.match(/\byear\s*(20\d{2})\b|\bsemester\s*[12]\s*(?:in|for)?\s*(20\d{2})\b|\b(?:in|for)\s+(20\d{2})\b/);
  if(year)settings.year=Number(year[1]||year[2]||year[3]);
  const term=q.match(/\bsemester\s*([12])\b/);if(term)settings.term=`Semester ${term[1]}`;
  return Object.keys(settings).length?settings:null;
}
