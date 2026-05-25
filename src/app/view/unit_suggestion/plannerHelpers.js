// ========================= CONSTANTS =========================
export const REQUIRED_CORE = 8;
export const REQUIRED_MAJOR = 8;
export const REQUIRED_ELECTIVE = 8;
export const TOTAL_REQUIRED_UNITS = 24;
export const TOTAL_REQUIRED_CREDITS = 300;
export const DEFAULT_CREDIT_POINTS = 12.5;
export const MAX_UNITS_PER_SEMESTER = 4;
export const MAX_CREDITS_PER_SEMESTER = 50;

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
    const o = (unit.OfferedIn || unit.offeredIn || '').toLowerCase();
    if (!o) return true;
    if (o.includes('semester 1 only')) return semester === 1;
    if (o.includes('semester 2 only')) return semester === 2;
    return true;
};

// ========================= FYP CONFLICT DETECTION =========================
// Returns true if adding 'unit' to 'existingUnits' would put both FYP A and FYP B in the same semester
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

// ========================= CENTRAL REQUIREMENTS FUNCTION =========================
export const getRemainingRequirements = (completedCore, completedMajor, completedElective) => ({
    needCore: Math.max(0, REQUIRED_CORE - completedCore),
    needMajor: Math.max(0, REQUIRED_MAJOR - completedMajor),
    needElective: Math.max(0, REQUIRED_ELECTIVE - completedElective),
});

// ========================= CORE SCHEDULING FUNCTION =========================
export const scheduleRemainingUnits = (
    missingUnits,
    completedUnitsMap,
    _totalCredits,
    currentYear,
    currentSemester,
    totalUnitsCompleted,
    remainingCoreNeeded,
    remainingMajorNeeded,
    electiveNeeded
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
    let scheduledCore = 0,
        scheduledElective = 0,
        scheduledMajor = 0;
    let semesterCounter = 0;
    const MAX_SEMESTERS = 12;

    const getPriorityBonus = (unit) => {
        const cat = getUnitCategory(unit);
        const code = (unit.UnitCode || unit.code || '').toUpperCase();
        if (cat === 'core' && scheduledCore < remainingCoreNeeded) return 30;
        if (cat === 'major' && scheduledMajor < remainingMajorNeeded) return 30;
        if (cat === 'elective' && scheduledElective < electiveNeeded) return 30;
        if (code === 'ICT20016' && scheduledElective < electiveNeeded) return 40;
        return 0;
    };

    while (remaining.length > 0 && semesterCounter < MAX_SEMESTERS) {
        if (
            scheduledCore >= remainingCoreNeeded &&
            scheduledMajor >= remainingMajorNeeded &&
            scheduledElective >= electiveNeeded
        ) {
            break;
        }

        const currentOrder = getSemesterOrderValue(current.year, current.semester);
        const available = [];
        for (const unit of remaining) {
            const cat = getUnitCategory(unit);
            const code = (unit.UnitCode || unit.code || '').toUpperCase();
            const normalizedCode = getNormalizedUnitCode(code);

            if (cat === 'core' && scheduledCore >= remainingCoreNeeded) continue;
            if (cat === 'major' && scheduledMajor >= remainingMajorNeeded) continue;
            if (cat === 'elective' && scheduledElective >= electiveNeeded) continue;

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

            // ICT20016 eligibility
            if (
                code === 'ICT20016' &&
                !(
                    current.year >= 2 &&
                    (current.year > 2 || current.semester >= 2) &&
                    totalUnitsCompleted >= 12
                )
            )
                continue;

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
            const cat = getUnitCategory(unit);
            if (cat === 'core' && scheduledCore >= remainingCoreNeeded) continue;
            if (cat === 'major' && scheduledMajor >= remainingMajorNeeded) continue;
            if (cat === 'elective' && scheduledElective >= electiveNeeded) continue;

            // Prevent FYP A and FYP B in the same semester
            if (hasFypConflict(unit, semesterUnits)) continue;

            const credits = unit.CreditPoints || DEFAULT_CREDIT_POINTS;
            if (
                semesterUnits.length < MAX_UNITS_PER_SEMESTER &&
                semesterCredits + credits <= MAX_CREDITS_PER_SEMESTER
            ) {
                semesterUnits.push(unit);
                semesterCredits += credits;

                if (cat === 'core') scheduledCore++;
                else if (cat === 'major') scheduledMajor++;
                else if (cat === 'elective') {
                    scheduledElective++;
                    if (code === 'ICT20016') scheduledElective++; // double count
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
// Redistribute units to avoid very light semesters (e.g., 4+1 → 3+2)
export function balanceSemesterLoads(schedule, completedUnitsMap) {
    if (schedule.length < 2) return schedule;

    // Create a mutable copy
    const balanced = schedule.map(sem => ({
        ...sem,
        units: [...sem.units],
    }));

    // Keep track of completed codes for prerequisite checks (including previous semesters)
    let cumulativeCompleted = new Set(completedUnitsMap.keys());
    const semesterOrders = balanced.map(sem => sem.order);

    for (let i = 0; i < balanced.length - 1; i++) {
        const currentSem = balanced[i];
        const nextSem = balanced[i + 1];

        // Only attempt to rebalance if next semester is light (≤2 units) and current has ≥3
        if (nextSem.units.length > 2 || currentSem.units.length < 3) continue;

        // Try to move one unit from current to next
        for (let uIdx = 0; uIdx < currentSem.units.length; uIdx++) {
            const unit = currentSem.units[uIdx];
            const code = (unit.UnitCode || unit.code || '').toUpperCase();

            // Check if unit can be moved to next semester
            if (!isAvailableInSemester(unit, nextSem.year, nextSem.semester)) continue;

            // Prerequisite check: all prerequisites must be satisfied by cumulative completed up to next semester
            let prereqsMet = true;
            for (const prereq of unit.prerequisites || []) {
                const normPrereq = getNormalizedUnitCode(prereq);
                if (cumulativeCompleted.has(prereq) || cumulativeCompleted.has(normPrereq)) continue;
                // Also need to check if prereq is scheduled in currentSem or earlier? Since we are moving
                // unit from current to next, the prereq could be in currentSem (which will still be taken before nextSem)
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

            // Prevent FYP A/B conflict in next semester
            if (hasFypConflict(unit, nextSem.units)) continue;

            // Capacity check
            const credits = unit.CreditPoints || DEFAULT_CREDIT_POINTS;
            if (nextSem.units.length >= MAX_UNITS_PER_SEMESTER) continue;
            if (nextSem.totalCredits + credits > MAX_CREDITS_PER_SEMESTER) continue;

            // Also ensure current semester still respects its own limits after removal
            if (currentSem.units.length - 1 < 0) continue; // safety

            // Perform the move
            currentSem.units.splice(uIdx, 1);
            currentSem.unitCount = currentSem.units.length;
            currentSem.totalCredits -= credits;
            nextSem.units.push(unit);
            nextSem.unitCount = nextSem.units.length;
            nextSem.totalCredits += credits;

            // Update cumulative completed set for future checks (add the moved unit as if taken in current semester)
            // Actually we keep cumulative as is – the unit is still completed before next semester.
            // No need to add because it's already considered via the loop over semesters.
            break; // Only move one unit per pair
        }
    }

    // Remove any empty semesters (should not happen with this balancing, but safe)
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
                // Prevent FYP A and FYP B from being moved into the same semester
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