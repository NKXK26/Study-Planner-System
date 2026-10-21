import { isPassingTranscriptAttempt, isWilUnit } from '../../libs/bcsPlannerRules.mjs';

// ========================= CONSTANTS =========================
export const REQUIRED_CORE = 8;
export const REQUIRED_MAJOR = 8;
export const REQUIRED_ELECTIVE = 8;
export const TOTAL_REQUIRED_UNITS = 24;
export const TOTAL_REQUIRED_CREDITS = 300;
export const DEFAULT_CREDIT_POINTS = 12.5;
export const MAX_UNITS_PER_SEMESTER = 4;
export const MAX_CREDITS_PER_SEMESTER = 50;
export const WIL_CREDIT_POINTS = 25;

// ========================= CANONICAL UNIT MAPPING =========================
export const CANONICAL_UNIT = {
    'COS40005': 'SWE40001',
    'SWE40001': 'SWE40001',
    'COS40006': 'SWE40002',
    'SWE40002': 'SWE40002',
};

// ========================= HELPER FUNCTIONS =========================
export function getNormalizedUnitCode(code) {
    if (!code) return '';
    return CANONICAL_UNIT[code] || code;
}

export const getUnitCategoryById = (typeId) => {
    switch (typeId) {
        case 2: return 'core';
        case 1: return 'elective';
        case 3: return 'major';
        case 4: return 'mpu';
        case 17: return 'wil';
        default: return 'elective';
    }
};

export const getSemesterOrderValue = (year, semester) => (year - 1) * 2 + (semester === 1 ? 1 : 2);

export const orderToYearSemester = (order) => ({
    year: Math.floor((order - 1) / 2) + 1,
    semester: (order - 1) % 2 === 0 ? 1 : 2,
    order,
});

export const getStudentPositionFromCompletedUnits = (completedCount) => {
    const completedSemesters = Math.floor(completedCount / MAX_UNITS_PER_SEMESTER);
    const nextSemesterOrder = Math.max(1, completedSemesters) + 1;
    return orderToYearSemester(nextSemesterOrder);
};

export const getUnitCategory = (unit) => {
    let typeId = null;
    if (unit.unitTypeId !== undefined) typeId = unit.unitTypeId;
    else if (unit.unit_type_id !== undefined) typeId = unit.unit_type_id;
    else if (unit.unitType?.ID !== undefined) typeId = unit.unitType.ID;
    else if (unit.unitType?.id !== undefined) typeId = unit.unitType.id;
    return typeId !== null ? getUnitCategoryById(typeId) : 'elective';
};

export const extractUnitCode = (str) => {
    if (!str) return '';
    const m = str.match(/[A-Z]{3}\d{5}/i);
    return m ? m[0].toUpperCase() : str.split(' ')[0].toUpperCase();
};

export const calculateCompletedCredits = (completedCore, completedElective, completedMajor) =>
    (completedCore + completedElective + completedMajor) * DEFAULT_CREDIT_POINTS;

export const parsePrerequisites = (s) => {
    if (!s || /^nil$/i.test(s)) return { type: 'none', conditions: [] };
    const cm = s.match(/^(\d+)cp$/i);
    if (cm) return { type: 'credit', conditions: [{ type: 'credit', value: parseInt(cm[1]) }] };
    if (s.toLowerCase().includes('co-req')) {
        const m = s.match(/[A-Z]{3}\d{5}/i);
        return m ? { type: 'coreq', conditions: [{ type: 'unit', code: m[0].toUpperCase() }] } : { type: 'coreq', conditions: [] };
    }
    if (s.toLowerCase().includes('anti-req')) return { type: 'anti', conditions: [] };
    if (s.includes('&')) {
        const conds = s.split('&').map(p => p.trim()).flatMap(p => {
            const um = p.match(/[A-Z]{3}\d{5}/i);
            const crm = p.match(/(\d+)cp/i);
            if (um) return [{ type: 'unit', code: um[0].toUpperCase() }];
            if (crm) return [{ type: 'credit', value: parseInt(crm[1]) }];
            return [];
        });
        return { type: 'and', conditions: conds };
    }
    if (s.includes('/')) {
        const conds = s.split('/').map(p => p.trim()).flatMap(p => {
            const um = p.match(/[A-Z]{3}\d{5}/i);
            return um ? [{ type: 'unit', code: um[0].toUpperCase() }] : [];
        });
        return { type: 'or', conditions: conds };
    }
    const um = s.match(/[A-Z]{3}\d{5}/i);
    return um ? { type: 'unit', conditions: [{ type: 'unit', code: um[0].toUpperCase() }] } : { type: 'unknown', conditions: [] };
};

export const isAvailableInSemester = (unit, _year, semester) => {
    const offeredTerms = unit.offeredTerms || unit.OfferedTerms || [];
    if (Array.isArray(offeredTerms) && offeredTerms.length) {
        const normalizedTerms = offeredTerms.map(term => String(term).toLowerCase());
        const semesterTerms = semester === 1
            ? ['semester 1', 'sem 1', 's1']
            : semester === 2
                ? ['semester 2', 'sem 2', 's2']
                : [];
        const hasRecognisedSemester = normalizedTerms.some(term => /(?:semester|sem)\s*[12]|\bs[12]\b/.test(term));
        if (hasRecognisedSemester) return normalizedTerms.some(term => semesterTerms.some(label => term.includes(label)));
    }
    const o = (unit.OfferedIn || unit.offeredIn || '').toLowerCase();
    if (!o) return !unit.requireKnownAvailability;
    if (o.includes('semester 1 only')) return semester === 1;
    if (o.includes('semester 2 only')) return semester === 2;
    return true;
};

export const isWilPlacementUnit = (unit, options = {}) => isWilUnit(unit, options);

const unitTypeText = unit => String(unit?.unitType?.Name ?? unit?.unitTypeName ?? unit?.categoryLabel ?? unit?.categoryKey ?? '').toLowerCase();
const unitCreditPoints = unit => Number(unit?.CreditPoints ?? unit?.creditPoints ?? 0);
const hasTranscriptOutcome = unit => ['Grade', 'grade', 'Status', 'status'].some(key => Object.prototype.hasOwnProperty.call(unit || {}, key));

// WIL eligibility is intentionally narrower than general "completed" status. It
// reflects only credit-bearing Core, Major, and Elective (including prescribed
// elective) study that the selected planner or an explicit mapping recognises.
export const isWilQualifyingAcademicUnit = (unit, { mappedCategory, bcsPlanner = false } = {}) => {
    const type = String(mappedCategory ?? unitTypeText(unit)).toLowerCase();
    const text = `${unit?.UnitCode ?? unit?.code ?? ''} ${unit?.Name ?? unit?.name ?? ''} ${type}`.toLowerCase();
    if (isWilPlacementUnit(unit, { bcsPlanner }) || unitCreditPoints(unit) <= 0) return false;
    if (/\bmpu\b|academic[ -]?integrity|placeholder|exempt(?:ion|ed)?|approved[ -]?elective/.test(text)) return false;
    return /core|major|elective/.test(type);
};

export const getWilQualifyingCompletedUnitCodes = ({ plannerUnits = [], completedUnits = [], mappedExternalUnits = {}, bcsPlanner = false } = {}) => {
    const plannerByCode = new Map();
    plannerUnits.forEach(unit => {
        const code = getNormalizedUnitCode(extractUnitCode(unit?.UnitCode ?? unit?.code));
        if (code) plannerByCode.set(code, unit);
    });

    const qualifyingCodes = new Set();
    completedUnits.forEach(completed => {
        if (hasTranscriptOutcome(completed) && !isPassingTranscriptAttempt(completed)) return;
        const code = getNormalizedUnitCode(extractUnitCode(completed?.code ?? completed?.UnitCode));
        const plannerUnit = plannerByCode.get(code);
        if (plannerUnit && isWilQualifyingAcademicUnit(plannerUnit, { bcsPlanner })) qualifyingCodes.add(code);
    });

    Object.entries(mappedExternalUnits || {}).forEach(([category, mappings]) => {
        if (String(category).toLowerCase() === '__other__') return;
        (Array.isArray(mappings) ? mappings : []).forEach(mapping => {
            const code = getNormalizedUnitCode(extractUnitCode(mapping?.code ?? mapping?.UnitCode));
            const mappedCategory = mapping?.categoryLabel ?? mapping?.categoryKey ?? category;
            if (code && !mapping?.isOtherMapping && isWilQualifyingAcademicUnit(mapping, { mappedCategory, bcsPlanner })) qualifyingCodes.add(code);
        });
    });
    return qualifyingCodes;
};

export const isAvailableInBreakTerm = (unit, breakTerm) => {
    const terms = unit?.offeredTerms || unit?.OfferedTerms || [];
    const normalized = Array.isArray(terms) ? terms.map(term => String(term).toLowerCase()) : [];
    const requested = String(breakTerm).toLowerCase();
    const hasBreakMetadata = normalized.some(term => /winter|summer/.test(term));
    if (hasBreakMetadata) return normalized.some(term => term.includes(requested));
    // No break-term metadata is a provisional fallback, not a confirmed offering.
    return normalized.length === 0;
};

export const scheduleWilBreakPlacement = ({ wilUnits = [], completedAcademicUnits = 0, currentYear, currentSemester }) => {
    if (!wilUnits.length) return { placement: null, warning: null };
    if (completedAcademicUnits < 12) {
        return { placement: null, warning: 'WIL remains outstanding: at least 12 distinct passed academic units are required before WIL can be scheduled.' };
    }
    const startYear = Math.max(1, Number(currentYear) || 1);
    const candidates = Number(currentSemester) === 1
        ? [{ year: startYear, term: 'Winter' }, { year: startYear, term: 'Summer' }, { year: startYear + 1, term: 'Winter' }]
        : [{ year: startYear, term: 'Summer' }, { year: startYear + 1, term: 'Winter' }, { year: startYear + 1, term: 'Summer' }];
    for (const candidate of candidates) {
        const available = wilUnits.find(unit => isAvailableInBreakTerm(unit, candidate.term));
        if (!available) continue;
        const offeredTerms = available.offeredTerms || available.OfferedTerms || [];
        const hasBreakAvailabilityMetadata = Array.isArray(offeredTerms) && offeredTerms.some(term => /winter|summer/i.test(String(term)));
        return {
            placement: {
                year: candidate.year,
                term: candidate.term,
                semester: null,
                isBreakTerm: true,
                units: [{ ...available, CreditPoints: WIL_CREDIT_POINTS, creditPoints: WIL_CREDIT_POINTS, isWilBreakPlacement: true }],
                unitCount: 1,
                totalCredits: WIL_CREDIT_POINTS,
            },
            warning: hasBreakAvailabilityMetadata ? null : `WIL was placed in the first eligible ${candidate.term} break using provisional availability because the selected planner has no Winter/Summer offering data.`,
        };
    }
    return { placement: null, warning: 'WIL remains outstanding: the selected planner does not record an available Winter or Summer placement after the student becomes eligible.' };
};

// ========================= FYP CONFLICT DETECTION =========================
export function hasFypConflict(unit, existingUnits) {
    const code = (unit.UnitCode || unit.code || '').toUpperCase();
    const normCode = getNormalizedUnitCode(code);
    const isA = normCode === 'SWE40001';
    const isB = normCode === 'SWE40002';
    if (!isA && !isB) return false;

    for (const u of existingUnits) {
        const uc = (u.UnitCode || u.code || '').toUpperCase();
        const normUc = getNormalizedUnitCode(uc);
        if (isA && normUc === 'SWE40002') return true;
        if (isB && normUc === 'SWE40001') return true;
    }
    return false;
}

// ========================= DYNAMIC REQUIREMENT HELPER =========================
/**
 * Convert planner template requirements into a map of category → remaining needed
 * @param {Array} templateRequirements - array of { unitType: { Name }, requiredCount }
 * @param {Object} completedCountsByCategory - e.g. { core: 5, major: 3, elective: 2, wil: 1 }
 * @returns {Object} remaining needs per category
 */
export const getRemainingRequirementsFromTemplate = (templateRequirements, completedCountsByCategory = {}) => {
    const remaining = {};
    templateRequirements.forEach(req => {
        const catName = req.unitType.Name.toLowerCase();
        const completed = completedCountsByCategory[catName] || 0;
        remaining[catName] = Math.max(0, req.requiredCount - completed);
    });
    return remaining;
};

// ========================= CORE SCHEDULING FUNCTION (DYNAMIC CATEGORIES) =========================
export const scheduleRemainingUnits = (
    missingUnits,           // units that are not yet completed (from planner)
    completedUnitsMap,      // Map of already completed unit codes (original + mapped)
    totalCredits,           // unused, kept for compatibility
    currentYear,
    currentSemester,
    totalUnitsCompleted,    // total completed unit count (for ICT20016 eligibility)
    categoryNeeds           // e.g. { core: 8, major: 8, elective: 8, wil: 1 }
) => {
    let remaining = [...missingUnits];
    const schedule = [];
    let current = { year: currentYear, semester: currentSemester };
    let plannedCompletedCodes = new Set();
    completedUnitsMap.forEach((_, code) => {
        plannedCompletedCodes.add(code);
        plannedCompletedCodes.add(getNormalizedUnitCode(code));
    });
    let plannedSemesters = [];
    let scheduledCounts = {};
    // Initialize scheduled counts for each needed category
    Object.keys(categoryNeeds).forEach(cat => scheduledCounts[cat] = 0);
    let semesterCounter = 0;
    const MAX_SEMESTERS = 12;

    const getCategoryKey = (unit) => {
        if (unit.scheduleCategoryKey && Object.prototype.hasOwnProperty.call(categoryNeeds, unit.scheduleCategoryKey)) return unit.scheduleCategoryKey;
        const typeId = unit.unitTypeId ?? unit.unitType?.ID;
        const stableKey = typeId == null ? null : String(typeId);
        return stableKey && Object.prototype.hasOwnProperty.call(categoryNeeds, stableKey)
            ? stableKey
            : getUnitCategory(unit);
    };
    const getPriorityBonus = (unit) => {
        const cat = getCategoryKey(unit);
        const remaining = categoryNeeds[cat] - scheduledCounts[cat];
        if (remaining > 0) return 30;   // still need this category
        return 0;
    };

    while (remaining.length > 0 && semesterCounter < MAX_SEMESTERS) {
        // Check if all category needs are satisfied
        const allMet = Object.keys(categoryNeeds).every(cat => scheduledCounts[cat] >= categoryNeeds[cat]);
        if (allMet) break;

        const currentOrder = getSemesterOrderValue(current.year, current.semester);
        const available = [];
        for (const unit of remaining) {
			if (isWilPlacementUnit(unit)) continue;
            const cat = getCategoryKey(unit);
            const code = (unit.UnitCode || unit.code || '').toUpperCase();
            const normalizedCode = getNormalizedUnitCode(code);

            // Skip if we already have enough of this category
            if (categoryNeeds[cat] !== undefined && scheduledCounts[cat] >= categoryNeeds[cat]) continue;

            // FYP B needs FYP A
            if (code === 'COS40006' || code === 'SWE40002') {
                const fypACode = getNormalizedUnitCode('SWE40001');
                const fypACompleted = plannedCompletedCodes.has(fypACode) ||
                    plannedCompletedCodes.has(getNormalizedUnitCode('COS40005'));
                const fypAScheduledEarlier = plannedSemesters.some(
                    sem => sem.order < currentOrder &&
                        sem.units.some(u => {
                            const uc = (u.UnitCode || u.code || '').toUpperCase();
                            return uc === fypACode || getNormalizedUnitCode(uc) === fypACode;
                        })
                );
                if (!fypACompleted && !fypAScheduledEarlier) continue;
            }

            // Prerequisite check
            let prereqsMet = true;
            for (const prereq of unit.prerequisites || []) {
                const normPrereq = getNormalizedUnitCode(prereq);
                if (plannedCompletedCodes.has(prereq) || plannedCompletedCodes.has(normPrereq)) continue;
                let found = plannedSemesters.some(
                    (sem) =>
                        sem.order < currentOrder &&
                        sem.units.some((u) => {
                            const uc = u.UnitCode || u.code;
                            return uc === prereq || getNormalizedUnitCode(uc) === normPrereq;
                        })
                );
                if (!found) {
                    prereqsMet = false;
                    break;
                }
            }
            if (!prereqsMet) continue;

            if (!isAvailableInSemester(unit, current.year, current.semester)) continue;
            available.push(unit);
        }

        available.sort((a, b) => {
            const pa = getPriorityBonus(a),
                pb = getPriorityBonus(b);
            if (pa !== pb) return pb - pa;
            if ((b.CreditPoints || 0) !== (a.CreditPoints || 0))
                return (b.CreditPoints || 0) - (a.CreditPoints || 0);
            return (a.prerequisites?.length || 0) - (b.prerequisites?.length || 0);
        });

        let semesterUnits = [],
            semesterCredits = 0;
        for (const unit of available) {
            const code = (unit.UnitCode || unit.code || '').toUpperCase();
            const cat = getCategoryKey(unit);
            // Skip if category already satisfied
            if (categoryNeeds[cat] !== undefined && scheduledCounts[cat] >= categoryNeeds[cat]) continue;

            // Prevent FYP A and FYP B in the same semester
            if (hasFypConflict(unit, semesterUnits)) continue;

            const credits = unit.CreditPoints || DEFAULT_CREDIT_POINTS;
            if (
                semesterUnits.length < MAX_UNITS_PER_SEMESTER &&
                semesterCredits + credits <= MAX_CREDITS_PER_SEMESTER
            ) {
                semesterUnits.push(unit);
                semesterCredits += credits;

                // Increment scheduled count for the category
                scheduledCounts[cat] = (scheduledCounts[cat] || 0) + 1;

                // Special double‑count for ICT20016 (WIL unit)
                if (cat === 'wil' && code === 'ICT20016') {
                    scheduledCounts[cat] = (scheduledCounts[cat] || 0) + 1;
                }
            }
        }

        if (semesterUnits.length > 0) {
            schedule.push({
                year: current.year,
                semester: current.semester,
                units: semesterUnits,
                totalCredits: semesterCredits,
                unitCount: semesterUnits.length,
                order: currentOrder,
            });
            semesterUnits.forEach((u) => {
                const c = u.UnitCode || u.code;
                if (c) {
                    plannedCompletedCodes.add(c);
                    plannedCompletedCodes.add(getNormalizedUnitCode(c));
                }
            });
            plannedSemesters.push({ order: currentOrder, units: semesterUnits });
            const scheduledIds = new Set(semesterUnits.map((u) => u.ID));
            remaining = remaining.filter((u) => !scheduledIds.has(u.ID));
        }

        const nextOrder = currentOrder + 1;
        const next = orderToYearSemester(nextOrder);
        current = { year: next.year, semester: next.semester };
        semesterCounter++;
    }
    return { schedule };
};

// ========================= OPTIMISATION FUNCTIONS =========================
export function balanceSemesterLoads(schedule, completedUnitsMap) {
    if (schedule.length < 2) return schedule;

    const balanced = schedule.map(sem => ({
        ...sem,
        units: [...sem.units],
    }));

    let cumulativeCompleted = new Set(completedUnitsMap.keys());
    const semesterOrders = balanced.map(sem => sem.order);

    for (let i = 0; i < balanced.length - 1; i++) {
        const currentSem = balanced[i];
        const nextSem = balanced[i + 1];

        if (nextSem.units.length > 2 || currentSem.units.length < 3) continue;

        for (let uIdx = 0; uIdx < currentSem.units.length; uIdx++) {
            const unit = currentSem.units[uIdx];
            const code = (unit.UnitCode || unit.code || '').toUpperCase();

            if (!isAvailableInSemester(unit, nextSem.year, nextSem.semester)) continue;

            let prereqsMet = true;
            for (const prereq of unit.prerequisites || []) {
                const normPrereq = getNormalizedUnitCode(prereq);
                if (cumulativeCompleted.has(prereq) || cumulativeCompleted.has(normPrereq)) continue;
                let found = false;
                for (let k = 0; k <= i; k++) {
                    if (balanced[k].units.some(u => {
                        const uc = u.UnitCode || u.code;
                        return uc === prereq || getNormalizedUnitCode(uc) === normPrereq;
                    })) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    prereqsMet = false;
                    break;
                }
            }
            if (!prereqsMet) continue;

            if (hasFypConflict(unit, nextSem.units)) continue;

            const credits = unit.CreditPoints || DEFAULT_CREDIT_POINTS;
            if (nextSem.units.length >= MAX_UNITS_PER_SEMESTER) continue;
            if (nextSem.totalCredits + credits > MAX_CREDITS_PER_SEMESTER) continue;

            currentSem.units.splice(uIdx, 1);
            currentSem.unitCount = currentSem.units.length;
            currentSem.totalCredits -= credits;
            nextSem.units.push(unit);
            nextSem.unitCount = nextSem.units.length;
            nextSem.totalCredits += credits;
            break;
        }
    }

    return balanced.filter(sem => sem.units.length > 0);
}

export function optimizeFinalSemester(schedule) {
    if (schedule.length < 2) return schedule;
    const last = schedule[schedule.length - 1];
    const secondLast = schedule[schedule.length - 2];
    const wouldMergeProjectAB = () => {
        const allUnits = [...secondLast.units, ...last.units];
        const hasA = allUnits.some(u => u.UnitCode === 'SWE40001' || u.UnitCode === 'COS40005');
        const hasB = allUnits.some(u => u.UnitCode === 'SWE40002' || u.UnitCode === 'COS40006');
        return hasA && hasB;
    };
    if (last.unitCount <= 2 && !wouldMergeProjectAB()) {
        if (secondLast.unitCount + last.unitCount <= MAX_UNITS_PER_SEMESTER &&
            secondLast.totalCredits + last.totalCredits <= MAX_CREDITS_PER_SEMESTER) {
            const merged = {
                ...secondLast,
                units: [...secondLast.units, ...last.units],
                unitCount: secondLast.unitCount + last.unitCount,
                totalCredits: secondLast.totalCredits + last.totalCredits,
            };
            return [...schedule.slice(0, -2), merged];
        }
    }
    return schedule;
}

export function compactFinalSemesters(schedule, completedUnitsMap) {
    if (schedule.length < 2) return schedule;

    let completedCodes = new Set(completedUnitsMap.keys());
    const semesters = schedule.map((sem, idx) => ({ ...sem, originalIndex: idx }));
    const placedUnits = [];

    for (let i = 0; i < semesters.length; i++) {
        const currentSem = semesters[i];
        for (let j = i + 1; j < semesters.length; j++) {
            const laterSem = semesters[j];
            const unitsToMove = [];
            for (let uIdx = 0; uIdx < laterSem.units.length; uIdx++) {
                const unit = laterSem.units[uIdx];
                const code = (unit.UnitCode || unit.code || '').toUpperCase();
                if (!isAvailableInSemester(unit, currentSem.year, currentSem.semester)) continue;
                let prereqsMet = true;
                for (const prereq of unit.prerequisites || []) {
                    const normPrereq = getNormalizedUnitCode(prereq);
                    if (completedCodes.has(prereq) || completedCodes.has(normPrereq)) continue;
                    let found = placedUnits.some(pu => pu.order < currentSem.order &&
                        (pu.code === prereq || getNormalizedUnitCode(pu.code) === normPrereq));
                    if (!found) { prereqsMet = false; break; }
                }
                if (!prereqsMet) continue;
                if (hasFypConflict(unit, currentSem.units)) continue;
                const credits = unit.CreditPoints || DEFAULT_CREDIT_POINTS;
                if (currentSem.units.length >= MAX_UNITS_PER_SEMESTER) break;
                if (currentSem.totalCredits + credits > MAX_CREDITS_PER_SEMESTER) break;
                unitsToMove.push({ unit, uIdx });
            }
            for (let k = unitsToMove.length - 1; k >= 0; k--) {
                const { unit, uIdx } = unitsToMove[k];
                laterSem.units.splice(uIdx, 1);
                currentSem.units.push(unit);
                currentSem.totalCredits += unit.CreditPoints || DEFAULT_CREDIT_POINTS;
                currentSem.unitCount++;
                placedUnits.push({ order: currentSem.order, code: unit.UnitCode || unit.code });
                completedCodes.add(unit.UnitCode || unit.code);
                completedCodes.add(getNormalizedUnitCode(unit.UnitCode || unit.code));
            }
            if (laterSem.units.length === 0) {
                semesters.splice(j, 1);
                j--;
            }
        }
        currentSem.units.forEach(u => {
            placedUnits.push({ order: currentSem.order, code: u.UnitCode || u.code });
            completedCodes.add(u.UnitCode || u.code);
            completedCodes.add(getNormalizedUnitCode(u.UnitCode || u.code));
        });
    }
    return semesters;
}
