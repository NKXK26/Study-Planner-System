export const MAX_UNITS_PER_SEMESTER=4;
export const MAX_CREDITS_PER_SEMESTER=50;
const projectPairs={SWE40002:'SWE40001',COS40006:'COS40005',ICT30018:'ICT30017',ENG40013:'ENG40012',EAT40006:'EAT40005',ENG40008:'ENG40007'};
export function projectPrerequisite(unit,pool) {
  const code=String(unit.UnitCode).trim().toUpperCase();
  if(projectPairs[code])return projectPairs[code];
  return null;
}
