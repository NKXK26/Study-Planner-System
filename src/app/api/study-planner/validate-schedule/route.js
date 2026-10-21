import prisma from '@utils/db/db';
import { NextResponse } from 'next/server';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { isPassingTranscriptAttempt } from '@app/libs/bcsPlannerRules.mjs';

const MAX_UNITS_PER_SEMESTER = 4;
const MAX_CREDITS_PER_SEMESTER = 50;

async function authenticate(req) {
    const dev = req.headers.get('x-dev-override') === 'true' && process.env.NEXT_PUBLIC_MODE === 'DEV';
    if (dev) return { user: { email: 'developer@dev.local' } };
    if (!req.headers.get('x-session-email')) return { error: NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 }) };
    const user = await SecureSessionManager.authenticateUser(req);
    return user ? { user } : { error: NextResponse.json({ success: false, message: 'Unauthorized user session' }, { status: 401 }) };
}

const codeOf = value => String(value ?? '').trim().toUpperCase();
const isBreakTerm = semester => ['winter', 'summer'].includes(String(semester.term ?? semester.breakTerm ?? '').toLowerCase());
const semesterOrder = semester => Number(semester.year) * 10 + (isBreakTerm(semester) ? (String(semester.term ?? semester.breakTerm).toLowerCase() === 'winter' ? 3 : 8) : Number(semester.semester));
const isWilUnit = unit => {
    const type = String(unit?.unitType?.Name ?? '').toLowerCase();
    const text = `${unit?.UnitCode ?? ''} ${unit?.Name ?? ''}`.toLowerCase();
    return type.includes('wil') || /\bwil\b|work[-\s]?integrated learning|work integrated learning|internship|\bplacement\b/.test(text);
};

function isOfferedInSemester(terms, semester, requireKnownAvailability = false) {
    if (!terms.length) return !requireKnownAvailability;
    const values = terms.map(term => String(term).toLowerCase());
    if (isBreakTerm(semester)) {
        const requested = String(semester.term ?? semester.breakTerm).toLowerCase();
        const hasBreakTerms = values.some(term => /winter|summer/.test(term));
        return hasBreakTerms ? values.some(term => term.includes(requested)) : !requireKnownAvailability;
    }
    const recognised = values.some(term => /(?:semester|sem)\s*[12]|\bs[12]\b/.test(term));
    if (!recognised) return true;
    const labels = Number(semester.semester) === 1 ? ['semester 1', 'sem 1', 's1'] : ['semester 2', 'sem 2', 's2'];
    return values.some(term => labels.some(label => term.includes(label)));
}

function requirementMet(relations, allowedCodes, relationship) {
    const matching = relations.filter(rel => String(rel.UnitRelationship).toLowerCase() === relationship && rel.RequisiteUnitID);
    if (!matching.length) return true;
    const operator = matching.some(rel => String(rel.LogicalOperators).toLowerCase() === 'and') ? 'and' : 'or';
    const results = matching.map(rel => allowedCodes.has(codeOf(rel.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit?.UnitCode)));
    return operator === 'and' ? results.every(Boolean) : results.some(Boolean);
}

export async function POST(req) {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;

    let body;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 }); }
    const schedule = Array.isArray(body.schedule) ? body.schedule : null;
    const completedUnits = Array.isArray(body.completedUnits) ? body.completedUnits : [];
    const wilQualifyingUnitCodes = new Set((Array.isArray(body.wilQualifyingUnitCodes) ? body.wilQualifyingUnitCodes : []).map(codeOf).filter(Boolean));
    const strictAvailability = body.strictAvailability === true;
    if (!schedule || schedule.length > 24) return NextResponse.json({ success: false, message: 'Provide a schedule containing at most 24 semesters.' }, { status: 400 });

    const validCompletedUnits = strictAvailability ? completedUnits.filter(isPassingTranscriptAttempt) : completedUnits;
    const completedCodes = new Set(validCompletedUnits.map(unit => codeOf(unit.code)).filter(Boolean));
    const completedCredits = validCompletedUnits.reduce((sum, unit) => sum + (Number(unit.creditPoints) || 0), 0);
    const submittedCodes = schedule.flatMap(semester => Array.isArray(semester.units) ? semester.units.map(unit => codeOf(unit.UnitCode || unit.code)) : []).filter(Boolean);
    if (submittedCodes.length > 96) return NextResponse.json({ success: false, message: 'A schedule may contain at most 96 units.' }, { status: 400 });

    const units = await prisma.unit.findMany({
        where: { UnitCode: { in: [...new Set(submittedCodes)] } },
        include: {
            unitType: { select: { Name: true } },
            UnitTermOffered: { select: { TermType: true } },
            UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: {
                include: { Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: { select: { UnitCode: true } } },
            },
        },
    });
    const unitByCode = new Map(units.map(unit => [codeOf(unit.UnitCode), unit]));
    const errors = [];
    const seen = new Set();

    for (const semester of schedule) {
        const semesterUnits = Array.isArray(semester.units) ? semester.units : [];
        const breakTerm = isBreakTerm(semester);
        if (!Number.isInteger(Number(semester.year)) || Number(semester.year) < 1 || (!breakTerm && ![1, 2].includes(Number(semester.semester)))) {
            errors.push('Each teaching entry must have a positive year and semester 1 or 2; break entries must use Winter or Summer.');
            continue;
        }
        if (breakTerm && semesterUnits.length !== 1) errors.push(`${semester.term ?? semester.breakTerm} break must contain exactly one WIL placement.`);
        if (!breakTerm && semesterUnits.length > MAX_UNITS_PER_SEMESTER) errors.push(`Year ${semester.year}, Semester ${semester.semester} exceeds the ${MAX_UNITS_PER_SEMESTER}-unit workload limit.`);
        let semesterCredits = 0;
        for (const submitted of semesterUnits) {
            const code = codeOf(submitted.UnitCode || submitted.code);
            const unit = unitByCode.get(code);
            if (!unit) { errors.push(`${code || 'A unit'} is not a known database unit and cannot be validated.`); continue; }
            if (seen.has(code)) errors.push(`${code} appears more than once in the schedule.`);
            seen.add(code);
            if (breakTerm && !isWilUnit(unit)) errors.push(`${code} cannot be placed in a Winter/Summer break entry.`);
            if (!breakTerm && isWilUnit(unit)) errors.push(`${code} is a WIL placement and must be scheduled in a dedicated Winter/Summer break entry.`);
            if (unit.CreditPoints == null) errors.push(`${code} has no stored credit value and cannot be workload-validated.`);
            else semesterCredits += unit.CreditPoints;
            if (!isOfferedInSemester(unit.UnitTermOffered.map(term => term.TermType), semester, strictAvailability)) errors.push(`${code} is not recorded as offered in Year ${semester.year}, Semester ${semester.semester}.`);
        }
        if (!breakTerm && semesterCredits > MAX_CREDITS_PER_SEMESTER) errors.push(`Year ${semester.year}, Semester ${semester.semester} exceeds the ${MAX_CREDITS_PER_SEMESTER} CP workload limit.`);
    }

    const ordered = [...schedule].sort((a, b) => semesterOrder(a) - semesterOrder(b));
    const priorCodes = new Set(completedCodes);
    let priorCredits = completedCredits;
    for (const semester of ordered) {
        const semesterCodes = new Set((semester.units || []).map(unit => codeOf(unit.UnitCode || unit.code)));
        for (const code of semesterCodes) {
            const unit = unitByCode.get(code);
            if (!unit) continue;
            const relations = unit.UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit;
            if (!requirementMet(relations, priorCodes, 'pre')) errors.push(`${code} has an unmet prerequisite in Year ${semester.year}, Semester ${semester.semester}.`);
            if (!requirementMet(relations, new Set([...priorCodes, ...semesterCodes]), 'co')) errors.push(`${code} has an unmet co-requisite in Year ${semester.year}, Semester ${semester.semester}.`);
            const anti = relations.filter(rel => String(rel.UnitRelationship).toLowerCase() === 'anti' && rel.RequisiteUnitID);
            if (anti.some(rel => priorCodes.has(codeOf(rel.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit?.UnitCode)) || semesterCodes.has(codeOf(rel.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit?.UnitCode)))) errors.push(`${code} conflicts with an anti-requisite in Year ${semester.year}, Semester ${semester.semester}.`);
            const minCredit = relations.filter(rel => String(rel.UnitRelationship).toLowerCase() === 'min').reduce((max, rel) => Math.max(max, Number(rel.MinCP) || 0), 0);
            if (minCredit > priorCredits) errors.push(`${code} requires ${minCredit} completed CP before Year ${semester.year}, Semester ${semester.semester}.`);
            if (isWilUnit(unit) && !(isBreakTerm(semester) && wilQualifyingUnitCodes.size >= 12)) errors.push(`${code} requires 12 distinct qualifying completed Core, Major, or Elective units and a Winter/Summer break placement.`);
        }
        if (semesterCodes.has('COS40005') && semesterCodes.has('COS40006') || semesterCodes.has('SWE40001') && semesterCodes.has('SWE40002')) errors.push(`FYP A and FYP B cannot be in the same semester (Year ${semester.year}, Semester ${semester.semester}).`);
        semesterCodes.forEach(code => priorCodes.add(code));
        priorCredits += [...semesterCodes].reduce((sum, code) => sum + (Number(unitByCode.get(code)?.CreditPoints) || 0), 0);
    }

    return NextResponse.json({ success: true, valid: errors.length === 0, errors: [...new Set(errors)] });
}
