// src/app/libs/studyPlannerUtils.js
import {
  Bars3Icon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

export const REQUIRED_UNITS_PER_CATEGORY = 8;
export const TOTAL_REQUIRED_UNITS = 24;
export const TOTAL_REQUIRED_CREDITS = 300;
export const DEFAULT_CREDIT_POINTS = 12.5;
export const MAX_UNITS_PER_SEMESTER = 4;
export const MAX_CREDITS_PER_SEMESTER = 50;

// Units that count as 2 towards requirements
export const DOUBLE_COUNT_UNITS = ['ICT20016'];

// ─────────────────────────────────────────────
// UNIT EQUIVALENCE
// ─────────────────────────────────────────────

export const EQUIVALENT_UNITS = {
  'COS40005': 'SWE40001',
  'SWE40001': 'COS40005',
  'COS40006': 'SWE40002',
  'SWE40002': 'COS40006',
};

export function getNormalizedUnitCode(code) {
  if (!code) return '';
  return EQUIVALENT_UNITS[code] || code;
}

export function areUnitsEquivalent(code1, code2) {
  if (!code1 || !code2) return false;
  return getNormalizedUnitCode(code1) === getNormalizedUnitCode(code2);
}

// ─────────────────────────────────────────────
// DOUBLE-COUNT HELPER
// ─────────────────────────────────────────────

export function isDoubleCountUnit(unit) {
  const code = unit.UnitCode || unit.code || '';
  return DOUBLE_COUNT_UNITS.includes(code) || unit.doubleCount === true;
}

// ─────────────────────────────────────────────
// SCHEDULER HELPERS
// ─────────────────────────────────────────────

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

export const limitMissingUnitsToRequirements = (missingUnits, needCore, needElective, needMajor) => {
  const scheduledByCategory = { core: 0, elective: 0, major: 0 };
  const neededByCategory = { core: needCore, elective: needElective, major: needMajor };
  return missingUnits.filter(unit => {
    const category = getUnitCategory(unit);
    if (!(category in neededByCategory)) return true;
    const double = isDoubleCountUnit(unit);
    const increment = double ? 2 : 1;
    if (scheduledByCategory[category] + increment > neededByCategory[category]) return false;
    scheduledByCategory[category] += increment;
    return true;
  });
};

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

export const scheduleRemainingUnits = (
  missingUnits,
  completedUnitsMap,
  _totalCredits,
  currentYear,
  currentSemester,
  totalUnitsCompleted,
  needCore,
  needElective,
  needMajor
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
    const double = isDoubleCountUnit(unit);
    const remainingCore = needCore - scheduledCore;
    const remainingElective = needElective - scheduledElective;
    const remainingMajor = needMajor - scheduledMajor;
    if (cat === 'core' && remainingCore > 0) return 30 + (double ? 10 : 0);
    if (cat === 'elective' && remainingElective > 0) return 30 + (double ? 10 : 0);
    if (cat === 'major' && remainingMajor > 0) return 30 + (double ? 10 : 0);
    return 0;
  };

  while (remaining.length > 0 && semesterCounter < MAX_SEMESTERS) {
    if (
      scheduledCore >= needCore &&
      scheduledElective >= needElective &&
      scheduledMajor >= needMajor
    )
      break;
    const currentOrder = getSemesterOrderValue(current.year, current.semester);
    const available = [];
    for (const unit of remaining) {
      const cat = getUnitCategory(unit);
      const double = isDoubleCountUnit(unit);
      const neededCount = double ? 2 : 1;
      if (cat === 'core' && scheduledCore + neededCount > needCore) continue;
      if (cat === 'elective' && scheduledElective + neededCount > needElective) continue;
      if (cat === 'major' && scheduledMajor + neededCount > needMajor) continue;

      let prereqsMet = true;
      for (const prereq of unit.prerequisites || []) {
        const normPrereq = getNormalizedUnitCode(prereq);
        if (
          plannedCompletedCodes.has(prereq) ||
          plannedCompletedCodes.has(normPrereq)
        )
          continue;
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

      const uc = unit.UnitCode || '';
      // Special case: ICT20016 – double unit with specific availability
      if (uc === 'ICT20016') {
        if (!(current.year >= 2 && (current.year > 2 || current.semester >= 2) && totalUnitsCompleted >= 12))
          continue;
      }
      if ((uc === 'COS40005' || uc === 'SWE40001') && !(current.year === 3 && current.semester === 1))
        continue;
      if ((uc === 'COS40006' || uc === 'SWE40002') && !(current.year === 3 && current.semester === 2))
        continue;
      if (!isAvailableInSemester(unit, current.year, current.semester))
        continue;
      available.push(unit);
    }

    available.sort((a, b) => {
      const pa = getPriorityBonus(a),
        pb = getPriorityBonus(b);
      if (pa !== pb) return pb - pa;
      if (b.CreditPoints !== a.CreditPoints)
        return (b.CreditPoints || 0) - (a.CreditPoints || 0);
      return (a.prerequisites?.length || 0) - (b.prerequisites?.length || 0);
    });

    let semesterUnits = [],
      semesterCredits = 0;
    for (const unit of available) {
      const double = isDoubleCountUnit(unit);
      const credits = unit.CreditPoints || DEFAULT_CREDIT_POINTS;
      const effectiveCredits = double ? credits * 2 : credits;
      const countIncrement = double ? 2 : 1;

      const cat = getUnitCategory(unit);
      if (cat === 'core' && scheduledCore + countIncrement > needCore) continue;
      if (cat === 'elective' && scheduledElective + countIncrement > needElective) continue;
      if (cat === 'major' && scheduledMajor + countIncrement > needMajor) continue;

      if (
        semesterUnits.length < MAX_UNITS_PER_SEMESTER &&
        semesterCredits + effectiveCredits <= MAX_CREDITS_PER_SEMESTER
      ) {
        semesterUnits.push(unit);
        semesterCredits += effectiveCredits;
        if (cat === 'core') scheduledCore += countIncrement;
        else if (cat === 'elective') scheduledElective += countIncrement;
        else if (cat === 'major') scheduledMajor += countIncrement;
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
      if (
        scheduledCore >= needCore &&
        scheduledElective >= needElective &&
        scheduledMajor >= needMajor
      )
        break;
    }

    const nextOrder = currentOrder + 1;
    const next = orderToYearSemester(nextOrder);
    current = { year: next.year, semester: next.semester };
    semesterCounter++;
  }
  return { schedule };
};

export function optimizeFinalSemester(schedule) {
  if (schedule.length < 2) return schedule;
  const last = schedule[schedule.length - 1];
  const secondLast = schedule[schedule.length - 2];
  const wouldMergeProjectAB = () => {
    const allUnits = [...secondLast.units, ...last.units];
    const hasA = allUnits.some(
      (u) => u.UnitCode === 'SWE40001' || u.UnitCode === 'COS40005'
    );
    const hasB = allUnits.some(
      (u) => u.UnitCode === 'SWE40002' || u.UnitCode === 'COS40006'
    );
    return hasA && hasB;
  };
  if (last.unitCount <= 2 && !wouldMergeProjectAB()) {
    if (
      secondLast.unitCount + last.unitCount <= 5 &&
      secondLast.totalCredits + last.totalCredits <= 62.5
    ) {
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

// ─────────────────────────────────────────────
// COMPONENTS (unchanged from original, but shown for completeness)
// ─────────────────────────────────────────────

export const CategoryBadge = ({ category }) => {
  const label = {
    core: 'Core',
    elective: 'Elective',
    major: 'Major',
    mpu: 'MPU',
    wil: 'WIL',
  };
  const colorMap = {
    core: 'text-blue-700 border-blue-300',
    major: 'text-amber-700 border-amber-300',
    elective: 'text-emerald-700 border-emerald-300',
    wil: 'text-pink-700 border-pink-300',
    mpu: 'text-amber-700 border-amber-300',
  };
  const defaultStyle = 'text-gray-600 border-gray-300';
  const style = colorMap[category] || defaultStyle;
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium bg-white ${style}`}
    >
      {label[category] || category}
    </span>
  );
};

export const DraggableUnitCard = ({
  unit,
  semIdx,
  unitIdx,
  onDragStart,
  onDragEnter,
  onDrop,
  isDragOver,
  isSource,
  onRemove,
  compact = false,
}) => {
  const cat = getUnitCategory(unit);
  const code = extractUnitCode(unit.UnitCode || unit.code || '');
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/json',
          JSON.stringify({ unit, fromToolbox: false })
        );
        onDragStart({ semIdx, unitIdx, unit, fromPanel: false });
      }}
      onDragEnter={() => onDragEnter({ semIdx, unitIdx })}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop({ semIdx, unitIdx });
      }}
      className={`
        group relative flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing
        transition-all duration-150 select-none
        ${isSource ? 'opacity-40 scale-95 border-dashed border-gray-300 bg-gray-50' : ''}
        ${isDragOver && !isSource ? 'border-emerald-400 bg-emerald-50 shadow-md scale-[1.02]' : ''}
        ${!isSource && !isDragOver ? 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm' : ''}
      `}
    >
      <Bars3Icon className="h-3.5 w-3.5 text-gray-300 flex-shrink-0 group-hover:text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono font-semibold text-gray-800 text-xs">
            {code}
          </span>
          <CategoryBadge category={cat} />
        </div>
        {!compact && unit.Name && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{unit.Name}</p>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs text-red-600 font-semibold">
          {unit.CreditPoints || DEFAULT_CREDIT_POINTS}CP
        </span>
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(semIdx, unitIdx);
            }}
            className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export const PanelUnitCard = ({
  unit,
  status,
  onDragStart,
  isDragging,
  onRemove,
  category,
}) => {
  const code = extractUnitCode(unit.UnitCode || unit.code || '');
  const isMapped = unit.isMappedExternal;
  const double = isDoubleCountUnit(unit);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/json',
          JSON.stringify({ unit, fromToolbox: false, fromPanel: true, category })
        );
        onDragStart({ unit, fromPanel: true, category });
      }}
      onDragOver={(e) => e.preventDefault()}
      className={`
        group flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500 cursor-grab active:cursor-grabbing
        transition-all duration-150 select-none bg-white
        ${isDragging ? 'opacity-40 border-dashed border-red-300 bg-gray-50' : 'hover:border-red-600 hover:shadow-sm'}
      `}
    >
      <Bars3Icon className="h-3.5 w-3.5 text-gray-300 flex-shrink-0 mt-0.5 group-hover:text-red-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="font-mono font-semibold text-gray-800 text-xs">
            {code}
          </span>
          <CategoryBadge category={category} />
          {status === 'completed' && (
            <span className="text-xs text-green-700 border border-green-300 bg-white px-1.5 py-0.5 rounded-full">
              ✓ Completed
            </span>
          )}
          {status === 'scheduled' && (
            <span className="text-xs text-blue-700 border border-blue-300 bg-white px-1.5 py-0.5 rounded-full">
              Scheduled
            </span>
          )}
          {isMapped && (
            <span className="text-xs text-amber-600 border border-amber-300 bg-white px-1.5 py-0.5 rounded-full">
              Mapped
            </span>
          )}
          {double && (
            <span className="text-xs text-purple-600 border border-purple-300 bg-white px-1.5 py-0.5 rounded-full">
              2x
            </span>
          )}
          <span className="text-xs text-red-600 font-semibold ml-auto">
            {unit.CreditPoints || DEFAULT_CREDIT_POINTS}CP
          </span>
        </div>
        {unit.Name && <p className="text-xs text-gray-500 leading-snug">{unit.Name}</p>}
        {unit.Prerequisites &&
          unit.Prerequisites !== 'Nil' &&
          unit.Prerequisites !== 'nil' &&
          !isMapped && (
            <p className="text-xs text-amber-600 mt-1 leading-snug">
              Pre: {unit.Prerequisites}
            </p>
          )}
      </div>
      {onRemove && isMapped && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(unit);
          }}
          className="ml-1 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
// Add this function to studyPlannerUtils.js
export const countPlannerUnitsByCategory = (plannerUnits) => {
  let core = 0, major = 0, elective = 0, wil = 0;
  (plannerUnits || []).forEach(unit => {
    const cat = getUnitCategory(unit);
    if (cat === 'core') core++;
    else if (cat === 'major') major++;
    else if (cat === 'elective') elective++;
    else if (cat === 'wil') wil++;
  });
  return { core, major, elective, wil };
};
export const SemesterDropZone = ({
  sem,
  semIdx,
  onDragEnter,
  onDrop,
  onNativeDrop,
  isDragOver,
}) => (
  <div
    onDragEnter={() => onDragEnter({ semIdx, unitIdx: sem.units.length })}
    onDragOver={(e) => e.preventDefault()}
    onDrop={(e) => {
      e.preventDefault();
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) {
          const data = JSON.parse(raw);
          if (data.fromToolbox && data.unit) {
            onNativeDrop(semIdx, sem.units.length, data.unit);
            return;
          }
        }
      } catch (_) {}
      onDrop({ semIdx, unitIdx: sem.units.length });
    }}
    className={`mt-2 border-2 border-dashed rounded-lg p-2 text-center text-xs transition-all
      ${
        isDragOver
          ? 'border-emerald-500 bg-emerald-100 text-emerald-600'
          : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500 hover:bg-gray-50'
      }`}
  >
    <PlusIcon className="h-3.5 w-3.5 inline mr-1" /> Drop unit here
  </div>
);