import { deriveTranscriptAcademicPeriod, getPlannerIntakeMetadata } from './bcsPlannerRules.mjs';

// Count teaching periods from intake: 0 is the first semester, 0.5 its following break.
const teachingIndex = ({year, semester}) => Number(year) * 2 + Number(semester);

export function transcriptWilOrder(term, intake) {
    if (!term || !intake?.year) return null;
    let year = term.year;
    let semester = term.semester;
    if (term.isBreak) {
        semester = term.breakTerm === 'Winter' ? 1 : 2;
        if (term.monthName === 'JAN') year--;
    } else if (!term.isTeaching) return null;
    return teachingIndex({year, semester}) - teachingIndex(intake) + (term.isBreak ? 0.5 : 0);
}

export function wilContext(planner, attempts, intakeTerm, nextYear, nextSemester) {
    const academic = deriveTranscriptAcademicPeriod(attempts);
    const metadata = getPlannerIntakeMetadata(planner);
    const intake = intakeTerm?.isTeaching ? intakeTerm : academic?.intakeTerm ?? {
        year: metadata.year, semester: metadata.known ? (metadata.month >= 8 ? 2 : 1) : null,
    };
    const firstSemester = intake.semester;
    const nextLabel = teachingIndex({year:nextYear, semester:nextSemester});
    const anchor = transcriptWilOrder(academic?.current.term, intake);
    const nextOrder = anchor === null ? nextLabel - (2 + firstSemester) : anchor + 1;
    const dated = attempts.filter(a => !['future','scheduled'].includes(a.status?.toLowerCase()))
        .map(a => transcriptWilOrder(a.term, intake)).filter(order => order !== null);
    return {intake, firstSemester, currentOrder:dated.length ? Math.max(...dated) : nextOrder - 1, labelOffset:nextOrder-nextLabel};
}

export function wilOrder(entry, context) {
    const term = String(entry.term ?? entry.breakTerm ?? '').toLowerCase();
    if (!['winter','summer'].includes(term)) return teachingIndex(entry) + context.labelOffset;
    const firstBreak = context.firstSemester === 2 ? 'summer' : 'winter';
    return (Number(entry.year)-1)*2 + (term === firstBreak ? 0.5 : 1.5);
}

export function finalTeachingOrder(schedule, context) {
    const teaching = schedule.filter(s => !s.isBreakTerm && !s.term && !s.breakTerm && s.units?.length);
    if (teaching.length) return Math.max(...teaching.map(s => wilOrder(s,context)));
    return context.academicsComplete ? context.currentOrder : 5;
}

export function isWinter2025Transition(unit) {
    return unit?.UnitCode === 'ICT20016' && unit.plannedDates === 'Winter Term | Jun/Jul 2025';
}

export function withinWilWindow(entry, context, finalOrder, recorded = false, unit) {
    const order = wilOrder(entry, context);
    const term = String(entry.term ?? entry.breakTerm).toLowerCase();
    const allowed = isWinter2025Transition(unit)
        ? context.intake?.year === 2023 && context.firstSemester === 2 && Number(entry.year) === 2 && term === 'winter'
        : Number(entry.year) === 3 && ['winter','summer'].includes(term);
    return [1,2].includes(context.firstSemester) && allowed
        && (recorded || order > context.currentOrder) && order < finalOrder;
}
