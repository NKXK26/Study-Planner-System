import { reviewDpa } from './academicPlanning.mjs';

export function reviewedChatDocument(document, context) {
  if (!context) return document;
  if (!Array.isArray(context.corrections) || context.corrections.length > 300) throw new Error('Invalid DPA review. Please review the attachment again.');
  if (!context.dpaConfirmed) {
    if (context.corrections.length) throw new Error('Your DPA corrections are not confirmed yet. Review the updated totals and confirm them in the planning card before asking about your results.');
    return document;
  }
  const review = reviewDpa(document, context.corrections);
  const rows = [['Course','Course Title','Status','Grade','Earned'], ...[...review.transcript.completed,...review.transcript.excluded].map(u=>[u.code,u.name,u.status,u.grade,Number.isFinite(u.earned)?u.earned:0])];
  return {name:document.name,rows,text:rows.map(r=>r.join('\t')).join('\n')};
}

export function explainSemesterDraft(result, question) {
  const plan=result.plan;
  const codes=question.toUpperCase().match(/\b[A-Z]{2,5}\d{3,6}\b/g)||[];
  const candidates=codes.length?plan.candidates.filter(u=>codes.includes(u.code)):plan.candidates;
  return [
    `Current reviewed programme: ${result.programme}. Planner: ${result.plannerName}.`,
    `Recomputed draft for ${result.year} ${result.term}: ${plan.selected.map(u=>u.code).join(', ')||'No units selected'} (${plan.credits} CP). Requested limits: ${result.maxUnits} units / ${result.maxCredits} CP.`,
    ...candidates.map(u=>{
      const selected=plan.selected.some(s=>s.code===u.code);
      return `${u.code} — ${u.name}: ${selected?'Selected':u.status}. ${selected?'Published, recorded for this semester, sufficient category space, and within the requested workload.':([...u.reasons,...u.unknown].join('; ')||'Passes recorded checks but not selected within workload/category limits.')} ${u.rules.join('; ')}`;
    }),
    ...(codes.length&&!candidates.length?['That code is not an outstanding candidate in the confirmed planner. It may already be completed or outside the selected pool.']:[]),
    'Selection uses unit-code order, not an optimised graduation sequence. Prerequisites must be earned already; concurrent co-requisite scheduling is not yet supported.',
    'To change the workload or semester, edit the planning card and regenerate. A chat question alone does not change these settings.',
    ...plan.warnings,
  ].join('\n\n');
}
