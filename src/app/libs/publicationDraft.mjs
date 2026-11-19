import {getBcsMajor,getPlannerIntakeMetadata} from './bcsPlannerRules.mjs';

// Only the planner projection is exported. Cohort hints must be confirmed by its publisher.
export function preparePublication(planner) {
  const intake = getPlannerIntakeMetadata(planner);
  return {
    name:planner.name, courseCode:'', major:getBcsMajor(planner) || '',
    intakeYear:intake.year ?? null, intakeMonth:intake.month ?? null,
    plannerTemplate:planner.plannerTemplate, units:planner.units,
    wilCode:'ICT20016', wilEquivalents:['ICT20016','ICT20026'],
  };
}
