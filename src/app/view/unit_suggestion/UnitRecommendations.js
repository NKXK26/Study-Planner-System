'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  CalendarIcon,
  UserGroupIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Bars3Icon,
  PlusIcon,
  ArrowsRightLeftIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  WrenchScrewdriverIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import UnitPoolToolbox from '@/app/view/unit_suggestion/UnitPoolToolbox';
import { generateStudyPlannerPdf } from '@/app/view/unit_suggestion/Exportstudyplannerpdf';

// ─────────────────────────────────────────────
// UNIT EQUIVALENCE
// ─────────────────────────────────────────────

const EQUIVALENT_UNITS = {
  'COS40005': 'SWE40001',
  'SWE40001': 'COS40005',
  'COS40006': 'SWE40002',
  'SWE40002': 'COS40006',
};

function getNormalizedUnitCode(code) {
  if (!code) return '';
  return EQUIVALENT_UNITS[code] || code;
}

function areUnitsEquivalent(code1, code2) {
  if (!code1 || !code2) return false;
  return getNormalizedUnitCode(code1) === getNormalizedUnitCode(code2);
}

// ─────────────────────────────────────────────
// SCHEDULER HELPERS
// ─────────────────────────────────────────────

const getUnitCategoryById = (typeId) => {
  switch (typeId) {
    case 2: return 'core';
    case 1: return 'elective';
    case 3: return 'major';
    case 4: return 'mpu';
    case 17: return 'wil';
    default: return 'elective';
  }
};

const getSemesterOrderValue = (year, semester) => (year - 1) * 2 + (semester === 1 ? 1 : 2);
const orderToYearSemester = (order) => ({ year: Math.floor((order - 1) / 2) + 1, semester: (order - 1) % 2 === 0 ? 1 : 2, order });

const getUnitCategory = (unit) => {
  let typeId = null;
  if (unit.unitTypeId !== undefined) typeId = unit.unitTypeId;
  else if (unit.unit_type_id !== undefined) typeId = unit.unit_type_id;
  else if (unit.unitType?.ID !== undefined) typeId = unit.unitType.ID;
  else if (unit.unitType?.id !== undefined) typeId = unit.unitType.id;
  return typeId !== null ? getUnitCategoryById(typeId) : 'elective';
};

const extractUnitCode = (str) => {
  if (!str) return '';
  const m = str.match(/[A-Z]{3}\d{5}/i);
  return m ? m[0].toUpperCase() : str.split(' ')[0].toUpperCase();
};

const parsePrerequisites = (s) => {
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

const isAvailableInSemester = (unit, _year, semester) => {
  const o = (unit.OfferedIn || unit.offeredIn || '').toLowerCase();
  if (!o) return true;
  if (o.includes('semester 1 only')) return semester === 1;
  if (o.includes('semester 2 only')) return semester === 2;
  return true;
};

const scheduleRemainingUnits = (missingUnits, completedUnitsMap, _totalCredits, currentYear, currentSemester, totalUnitsCompleted, needCore, needElective, needMajor) => {
  let remaining = [...missingUnits];
  const schedule = [];
  let current = { year: currentYear, semester: currentSemester };
  let plannedCompletedCodes = new Set();
  completedUnitsMap.forEach((_, code) => {
    plannedCompletedCodes.add(code);
    plannedCompletedCodes.add(getNormalizedUnitCode(code));
  });
  let plannedSemesters = [];
  let scheduledCore = 0, scheduledElective = 0, scheduledMajor = 0;
  let semesterCounter = 0;
  const MAX_SEMESTERS = 12;

  const getPriorityBonus = (unit) => {
    const cat = getUnitCategory(unit);
    if (cat === 'core' && scheduledCore < needCore) return 30;
    if (cat === 'elective' && scheduledElective < needElective) return 30;
    if (cat === 'major' && scheduledMajor < needMajor) return 30;
    return 0;
  };

  while (remaining.length > 0 && semesterCounter < MAX_SEMESTERS) {
    if (scheduledCore >= needCore && scheduledElective >= needElective && scheduledMajor >= needMajor) break;
    const currentOrder = getSemesterOrderValue(current.year, current.semester);
    const available = [];
    for (const unit of remaining) {
      const cat = getUnitCategory(unit);
      if (cat === 'core' && scheduledCore >= needCore) continue;
      if (cat === 'elective' && scheduledElective >= needElective) continue;
      if (cat === 'major' && scheduledMajor >= needMajor) continue;

      let prereqsMet = true;
      for (const prereq of (unit.prerequisites || [])) {
        const normPrereq = getNormalizedUnitCode(prereq);
        if (plannedCompletedCodes.has(prereq) || plannedCompletedCodes.has(normPrereq)) continue;
        let found = plannedSemesters.some(sem => sem.order < currentOrder && sem.units.some(u => {
          const uc = u.UnitCode || u.code;
          return uc === prereq || getNormalizedUnitCode(uc) === normPrereq;
        }));
        if (!found) { prereqsMet = false; break; }
      }
      if (!prereqsMet) continue;

      const uc = unit.UnitCode || '';
      if ((uc === 'COS40005' || uc === 'SWE40001') && !(current.year === 3 && current.semester === 1)) continue;
      if ((uc === 'COS40006' || uc === 'SWE40002') && !(current.year === 3 && current.semester === 2)) continue;
      if (uc === 'ICT20016' && !(current.year >= 2 && (current.year > 2 || current.semester >= 2) && totalUnitsCompleted >= 12)) continue;
      if (!isAvailableInSemester(unit, current.year, current.semester)) continue;
      available.push(unit);
    }

    available.sort((a, b) => {
      const pa = getPriorityBonus(a), pb = getPriorityBonus(b);
      if (pa !== pb) return pb - pa;
      if (b.CreditPoints !== a.CreditPoints) return (b.CreditPoints || 0) - (a.CreditPoints || 0);
      return (a.prerequisites?.length || 0) - (b.prerequisites?.length || 0);
    });

    let semesterUnits = [], semesterCredits = 0;
    for (const unit of available) {
      if (scheduledCore >= needCore && scheduledElective >= needElective && scheduledMajor >= needMajor) break;
      const credits = unit.CreditPoints || 12.5;
      if (semesterUnits.length < 4 && semesterCredits + credits <= 50) {
        semesterUnits.push(unit);
        semesterCredits += credits;
        const cat = getUnitCategory(unit);
        if (cat === 'core') scheduledCore++;
        else if (cat === 'elective') scheduledElective++;
        else if (cat === 'major') scheduledMajor++;
      }
    }

    if (semesterUnits.length > 0) {
      schedule.push({
        year: current.year,
        semester: current.semester,
        units: semesterUnits,
        totalCredits: semesterCredits,
        unitCount: semesterUnits.length,
        order: currentOrder
      });
      semesterUnits.forEach(u => {
        const c = u.UnitCode || u.code;
        if (c) {
          plannedCompletedCodes.add(c);
          plannedCompletedCodes.add(getNormalizedUnitCode(c));
        }
      });
      plannedSemesters.push({ order: currentOrder, units: semesterUnits });
      const scheduledIds = new Set(semesterUnits.map(u => u.ID));
      remaining = remaining.filter(u => !scheduledIds.has(u.ID));
      if (scheduledCore >= needCore && scheduledElective >= needElective && scheduledMajor >= needMajor) break;
    }

    const nextOrder = currentOrder + 1;
    const next = orderToYearSemester(nextOrder);
    current = { year: next.year, semester: next.semester };
    semesterCounter++;
  }
  return { schedule };
};

function optimizeFinalSemester(schedule) {
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
    if (secondLast.unitCount + last.unitCount <= 5 && secondLast.totalCredits + last.totalCredits <= 62.5) {
      secondLast.units = [...secondLast.units, ...last.units];
      secondLast.unitCount = secondLast.units.length;
      secondLast.totalCredits = secondLast.totalCredits + last.totalCredits;
      schedule.pop();
    }
  }
  return schedule;
}

const CategoryBadge = ({ category }) => {
  const label = { core: 'Core', elective: 'Elective', major: 'Major', mpu: 'MPU', wil: 'WIL' };
  const colorMap = {
    core: 'text-blue-700 border-blue-300',
    major: 'text-amber-700 border-amber-300',   // changed from purple to orange
    elective: 'text-emerald-700 border-emerald-300',
    wil: 'text-pink-700 border-pink-300',
    mpu: 'text-amber-700 border-amber-300',
  };
  const defaultStyle = 'text-gray-600 border-gray-300';
  const style = colorMap[category] || defaultStyle;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium bg-white ${style}`}>
      {label[category] || category}
    </span>
  );
};

// ─────────────────────────────────────────────
// DRAG-AND-DROP UNIT CARD (for schedule)
// ─────────────────────────────────────────────

const DraggableUnitCard = ({ unit, semIdx, unitIdx, onDragStart, onDragEnter, onDrop, isDragOver, isSource, onRemove, compact = false }) => {
  const cat = getUnitCategory(unit);
  const code = extractUnitCode(unit.UnitCode || unit.code || '');
  return (
    <div
      draggable
      onDragStart={(e) => {
        // Support both internal state DnD and native dataTransfer (for toolbox compat)
        e.dataTransfer.setData('application/json', JSON.stringify({ unit, fromToolbox: false }));
        onDragStart({ semIdx, unitIdx, unit, fromPanel: false });
      }}
      onDragEnter={() => onDragEnter({ semIdx, unitIdx })}
      onDragOver={e => e.preventDefault()}
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
          <span className="font-mono font-semibold text-gray-800 text-xs">{code}</span>
          <CategoryBadge category={cat} />
        </div>
        {!compact && unit.Name && <p className="text-xs text-gray-500 mt-0.5 truncate">{unit.Name}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs text-red-600 font-semibold ml-auto">{unit.CreditPoints || 12.5}CP</span>
        {onRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemove(semIdx, unitIdx); }}
            className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

// Panel unit card
const PanelUnitCard = ({ unit, status, onDragStart, isDragging, onRemove, category }) => {
  const code = extractUnitCode(unit.UnitCode || unit.code || '');
  const isMapped = unit.isMappedExternal;
  return (
    <div
      draggable
      onDragStart={() => onDragStart({ unit, fromPanel: true, category })}
      onDragOver={e => e.preventDefault()}
      className={`
        group flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500 cursor-grab active:cursor-grabbing
        transition-all duration-150 select-none bg-white
        ${isDragging ? 'opacity-40 border-dashed border-red-300 bg-gray-50' : 'hover:border-red-600 hover:shadow-sm'}
      `}
    >
      <Bars3Icon className="h-3.5 w-3.5 text-gray-300 flex-shrink-0 mt-0.5 group-hover:text-red-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="font-mono font-semibold text-gray-800 text-xs">{code}</span>
          <CategoryBadge category={category} />
          {status === 'completed' && <span className="text-xs text-green-700 border border-green-300 bg-white px-1.5 py-0.5 rounded-full">✓ Completed</span>}
          {isMapped && <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">Mapped</span>}
          {unit.doubleCount && <span className="text-xs text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full">2x</span>}
          <span className="text-xs text-red-600 font-semibold ml-auto">{unit.CreditPoints || 12.5}CP</span>
        </div>
        {unit.Name && <p className="text-xs text-gray-500 leading-snug">{unit.Name}</p>}
        {unit.Prerequisites && unit.Prerequisites !== 'Nil' && unit.Prerequisites !== 'nil' && !isMapped && (
          <p className="text-xs text-amber-600 mt-1 leading-snug">Pre: {unit.Prerequisites}</p>
        )}
      </div>
      {onRemove && isMapped && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(unit); }}
          className="ml-1 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

const ExternalUnitCard = ({ unit, onMapToCategory }) => {
  const [showMenu, setShowMenu] = useState(false);
  const categories = [
    { id: 'core', label: 'Core' },
    { id: 'major', label: 'Major' },
    { id: 'elective', label: 'Elective' },
    { id: 'wil', label: 'WIL' }
  ];
  const handleMap = (category) => { onMapToCategory(category, unit); setShowMenu(false); };
  return (
    <div className="relative bg-white rounded-lg border border-red-200 p-3 hover:border-red-400 hover:shadow-md transition-all cursor-pointer">
      <div onClick={() => setShowMenu(!showMenu)}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-gray-800">{unit.code}</span>
              <span className="text-xs text-red-600 font-semibold ml-auto">{unit.CreditPoints || 12.5}CP</span>
            </div>
            {unit.name && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{unit.name}</p>}
          </div>
          <ChevronRightIcon className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${showMenu ? 'rotate-90' : ''}`} />
        </div>
      </div>
      {showMenu && (
        <div className="mt-3 pt-2 border-t border-gray-200 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => handleMap(cat.id)} className="text-xs px-3 py-1.5 rounded-md bg-white border border-red-300 text-red-600 hover:bg-red-50 transition-colors font-medium">
              Map to {cat.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// SEMESTER DROP ZONE — handles BOTH internal DnD
// and native dataTransfer drops from the toolbox
// ─────────────────────────────────────────────

const SemesterDropZone = ({ sem, semIdx, onDragEnter, onDrop, onNativeDrop, isDragOver }) => (
  <div
    onDragEnter={() => onDragEnter({ semIdx, unitIdx: sem.units.length })}
    onDragOver={e => e.preventDefault()}
    onDrop={(e) => {
      e.preventDefault();
      // Check for native toolbox drop first
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) {
          const data = JSON.parse(raw);
          if (data.fromToolbox && data.unit) {
            onNativeDrop(semIdx, sem.units.length, data.unit);
            return;
          }
        }
      } catch (_) { }
      // Fall back to internal state DnD
      onDrop({ semIdx, unitIdx: sem.units.length });
    }}
    className={`mt-2 border-2 border-dashed rounded-lg p-2 text-center text-xs transition-all
      ${isDragOver ? 'border-emerald-500 bg-emerald-100 text-emerald-600' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500 hover:bg-gray-50'}`}
  >
    <PlusIcon className="h-3.5 w-3.5 inline mr-1" /> Drop unit here
  </div>
);

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

const UnitRecommendations = ({ isOpen, onClose, completedUnits, studentInfo }) => {
  const [allPlanners, setAllPlanners] = useState([]);
  const [plannersLoading, setPlannersLoading] = useState(false);
  const [plannersError, setPlannersError] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [editableSchedule, setEditableSchedule] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [showFullPlan, setShowFullPlan] = useState(true);
  const [currentYear, setCurrentYear] = useState(1);
  const [currentSemester, setCurrentSemester] = useState(1);
  const [categoryWarning, setCategoryWarning] = useState(null);
  const [unrecognisedUnits, setUnrecognisedUnits] = useState([]);
  const [fieldPlanners, setFieldPlanners] = useState([]);
  const [selectedFieldPlanner, setSelectedFieldPlanner] = useState(null);
  const [mappedExternalUnits, setMappedExternalUnits] = useState({ core: [], major: [], elective: [], wil: [] });
  const [dragSource, setDragSource] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [dragOverPanel, setDragOverPanel] = useState(null);

  // ── toolbox visibility state ──
  const [showToolbox, setShowToolbox] = useState(false);

  // ── PDF export ──
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleExportPdf = useCallback(async () => {
    if (!editableSchedule.length) return;
    setPdfLoading(true);
    try {
      const studentId = studentInfo?.studentId ?? 'student';
      const plannerSlug = (recommendations?.plannerName ?? 'planner')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      await generateStudyPlannerPdf({
        editableSchedule,
        recommendations,
        studentInfo,
        completedUnits,
        filename: `study-planner-${studentId}-${plannerSlug}.pdf`,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [editableSchedule, recommendations, studentInfo, completedUnits]);

  const getPlannerUnitsWithStatus = useCallback(() => {
    if (!selectedFieldPlanner) return { core: [], major: [], elective: [], wil: [] };
    const plannerUnits = selectedFieldPlanner.units || [];
    const completedCodeSet = new Set();
    (completedUnits || []).forEach(u => {
      const code = u.code?.toUpperCase();
      if (code) { completedCodeSet.add(code); completedCodeSet.add(getNormalizedUnitCode(code)); }
    });
    const scheduledCodeSet = new Set();
    editableSchedule.flatMap(s => s.units).forEach(u => {
      const code = extractUnitCode(u.UnitCode || '');
      scheduledCodeSet.add(code);
      scheduledCodeSet.add(getNormalizedUnitCode(code));
    });
    const core = [], major = [], elective = [], wil = [];
    plannerUnits.forEach(unit => {
      const code = extractUnitCode(unit.UnitCode);
      let status = 'pending';
      if (completedCodeSet.has(code) || completedCodeSet.has(getNormalizedUnitCode(code))) status = 'completed';
      else if (scheduledCodeSet.has(code) || scheduledCodeSet.has(getNormalizedUnitCode(code))) status = 'scheduled';
      const cat = getUnitCategory(unit);
      const item = { ...unit, status, isMappedExternal: false, originalCategory: cat };
      if (cat === 'core') core.push(item);
      else if (cat === 'major') major.push(item);
      else if (cat === 'elective') elective.push(item);
      else if (cat === 'wil') wil.push(item);
    });
    const addMapped = (arr, mapArray, category) => {
      mapArray.forEach(extUnit => {
        arr.push({ ...extUnit, status: 'pending', isMappedExternal: true, originalCategory: category, CreditPoints: extUnit.creditPoints || 12.5, Name: extUnit.name, UnitCode: extUnit.code, doubleCount: extUnit.doubleCount });
      });
    };
    addMapped(core, mappedExternalUnits.core, 'core');
    addMapped(major, mappedExternalUnits.major, 'major');
    addMapped(elective, mappedExternalUnits.elective, 'elective');
    addMapped(wil, mappedExternalUnits.wil, 'wil');
    return { core, major, elective, wil };
  }, [selectedFieldPlanner, completedUnits, editableSchedule, mappedExternalUnits]);

  const handleDragStart = (info) => setDragSource(info);
  const handleDragEnter = (target) => setDragTarget(target);

  // ── NEW: handle a native drop from the toolbox into a semester slot ──
  const handleNativeDropIntoSemester = useCallback((semIdx, insertAt, rawUnit) => {
    setEditableSchedule(prev => {
      const newSchedule = prev.map(s => ({ ...s, units: [...s.units] }));
      const sem = newSchedule[semIdx];
      if (!sem) return prev;
      sem.units.splice(insertAt, 0, { ...rawUnit });
      sem.unitCount = sem.units.length;
      sem.totalCredits = sem.units.reduce((s, u) => s + (u.CreditPoints || 12.5), 0);
      return newSchedule;
    });
    setDragSource(null);
    setDragTarget(null);
  }, []);

  const handleDrop = (target) => {
    if (!dragSource) return;
    const newSchedule = editableSchedule.map(s => ({ ...s, units: [...s.units] }));
    if (dragSource.fromPanel) {
      const { semIdx, unitIdx } = target;
      if (semIdx === undefined || semIdx === null) return;
      const sem = newSchedule[semIdx];
      if (!sem) return;
      const insertAt = typeof unitIdx === 'number' ? unitIdx : sem.units.length;
      const unitToAdd = { ...dragSource.unit };
      sem.units.splice(insertAt, 0, unitToAdd);
      sem.unitCount = sem.units.length;
      sem.totalCredits = sem.units.reduce((s, u) => s + (u.CreditPoints || 12.5), 0);
      setEditableSchedule(newSchedule.filter(s => s.units.length > 0));
    } else if (dragSource.semIdx !== undefined) {
      const srcSemIdx = dragSource.semIdx;
      const srcUnitIdx = dragSource.unitIdx;
      const dstSemIdx = target.semIdx;
      const dstUnitIdx = target.unitIdx;
      if (srcSemIdx === undefined || dstSemIdx === undefined) return;
      const srcSem = newSchedule[srcSemIdx];
      const dstSem = newSchedule[dstSemIdx];
      if (!srcSem || !dstSem) return;
      const [movedUnit] = srcSem.units.splice(srcUnitIdx, 1);
      if (srcSemIdx === dstSemIdx) {
        const adjustedIdx = dstUnitIdx > srcUnitIdx ? dstUnitIdx - 1 : dstUnitIdx;
        srcSem.units.splice(Math.max(0, adjustedIdx), 0, movedUnit);
      } else {
        if (typeof dstUnitIdx === 'number' && dstUnitIdx < dstSem.units.length) {
          const [swappedUnit] = dstSem.units.splice(dstUnitIdx, 1, movedUnit);
          srcSem.units.splice(srcUnitIdx, 0, swappedUnit);
        } else {
          dstSem.units.push(movedUnit);
        }
      }
      [srcSem, dstSem].forEach(s => {
        s.unitCount = s.units.length;
        s.totalCredits = s.units.reduce((acc, u) => acc + (u.CreditPoints || 12.5), 0);
      });
      setEditableSchedule(newSchedule.filter(s => s.units.length > 0));
    }
    setDragSource(null);
    setDragTarget(null);
    setDragOverPanel(null);
  };

  const handleDropOnPanel = (panelCategory) => {
    if (!dragSource) return;
    if (dragSource.semIdx !== undefined) {
      const newSchedule = editableSchedule.map(sem => {
        const newUnits = sem.units.filter((_, idx) => !(dragSource.semIdx === sem.idx && dragSource.unitIdx === idx));
        return { ...sem, units: newUnits, unitCount: newUnits.length, totalCredits: newUnits.reduce((s, u) => s + (u.CreditPoints || 12.5), 0) };
      }).filter(sem => sem.units.length > 0);
      setEditableSchedule(newSchedule);
    }
    setDragSource(null);
    setDragTarget(null);
    setDragOverPanel(null);
  };

  const handleMapExternalToCategory = (category, externalUnit) => {
    let unitToAdd = { ...externalUnit };
    if (category === 'wil' && externalUnit.code?.toUpperCase() === 'ICT20016') {
      unitToAdd.doubleCount = true;
      unitToAdd.creditPoints = (externalUnit.creditPoints || 12.5) * 2;
    }
    setUnrecognisedUnits(prev => prev.filter(u => u.code !== externalUnit.code));
    setMappedExternalUnits(prev => ({ ...prev, [category]: [...prev[category], unitToAdd] }));
  };

  const handleRemoveMappedUnit = (category, unitToRemove) => {
    setUnrecognisedUnits(prev => {
      const alreadyExists = prev.some(u => u.code === unitToRemove.code);
      if (!alreadyExists) return [...prev, unitToRemove];
      return prev;
    });
    setMappedExternalUnits(prev => ({ ...prev, [category]: prev[category].filter(u => u.code !== unitToRemove.code) }));
  };

  const handleRemoveUnit = (semIdx, unitIdx) => {
    const newSchedule = editableSchedule.map(s => ({ ...s, units: [...s.units] }));
    newSchedule[semIdx].units.splice(unitIdx, 1);
    newSchedule[semIdx].unitCount = newSchedule[semIdx].units.length;
    newSchedule[semIdx].totalCredits = newSchedule[semIdx].units.reduce((s, u) => s + (u.CreditPoints || 12.5), 0);
    setEditableSchedule(newSchedule.filter(s => s.units.length > 0));
  };

  const scorePlannerByCompletedUnits = (planner, completedUnits) => {
    const plannerUnitCodes = new Set((planner.units || []).map(u => extractUnitCode(u.UnitCode).toUpperCase()));
    return (completedUnits || []).filter(u => plannerUnitCodes.has(u.code?.toUpperCase())).length;
  };

  const computeFieldPlanners = (planners, completedUnits) => {
    const fields = ['cssd', 'cscs', 'csiot', 'csds', 'csai'];
    const fieldLabels = { cssd: 'Software Dev', cscs: 'Cybersecurity', csiot: 'IoT', csds: 'Data Science', csai: 'AI' };
    const bestPerField = [];
    for (const field of fields) {
      const plannersWithField = planners.filter(p => p.name.toLowerCase().includes(field));
      if (plannersWithField.length) {
        let best = null, bestScore = -1;
        for (const planner of plannersWithField) {
          const score = scorePlannerByCompletedUnits(planner, completedUnits);
          if (score > bestScore) { bestScore = score; best = planner; }
        }
        if (best) bestPerField.push({ field: fieldLabels[field], planner: best, score: bestScore });
      }
    }
    setFieldPlanners(bestPerField);
    if (bestPerField.length && !selectedFieldPlanner) setSelectedFieldPlanner(bestPerField[0].planner);
    else if (bestPerField.length && selectedFieldPlanner) {
      const stillExists = bestPerField.some(p => p.planner.name === selectedFieldPlanner.name);
      if (!stillExists) setSelectedFieldPlanner(bestPerField[0].planner);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setPlannersLoading(true);
    setPlannersError(null);
    fetch('/api/study-planner', { headers: { 'x-dev-override': 'true' } })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setAllPlanners(json.data || []);
          if (json.data?.length && completedUnits?.length) computeFieldPlanners(json.data, completedUnits);
        } else setPlannersError('Failed to load planners from server.');
      })
      .catch(() => setPlannersError('Network error fetching planners.'))
      .finally(() => setPlannersLoading(false));
  }, [isOpen, completedUnits]);

  useEffect(() => {
    if (allPlanners.length && completedUnits?.length) computeFieldPlanners(allPlanners, completedUnits);
  }, [allPlanners, completedUnits]);

  useEffect(() => {
    if (!isOpen || !completedUnits) return;
    const count = completedUnits.length;
    const sems = Math.floor(count / 4);
    const disp = Math.max(1, sems);
    const start = disp + 1;
    setCurrentYear(Math.floor((start - 1) / 2) + 1);
    setCurrentSemester(start);
  }, [isOpen, completedUnits]);

  useEffect(() => {
    if (isOpen && selectedFieldPlanner && completedUnits && !recommendations) generateScheduleForPlanner(selectedFieldPlanner);
  }, [isOpen, selectedFieldPlanner, completedUnits, currentYear, currentSemester]);

  const generateScheduleForPlanner = (planner) => {
    if (!planner) return;
    setScheduleLoading(true);
    setCategoryWarning(null);
    setEditableSchedule([]);
    setMappedExternalUnits({ core: [], major: [], elective: [], wil: [] });
    try {
      const plannerUnits = planner.units || [];
      if (!plannerUnits.length) { setScheduleLoading(false); return; }
      const plannerUnitTypeMap = new Map();
      plannerUnits.forEach(u => plannerUnitTypeMap.set(extractUnitCode(u.UnitCode), getUnitCategory(u)));
      const completedUnitsMap = new Map();
      (completedUnits || []).forEach(u => {
        const code = u.code?.toUpperCase();
        if (code) { completedUnitsMap.set(code, u); completedUnitsMap.set(getNormalizedUnitCode(code), u); }
      });
      let completedCore = 0, completedElective = 0, completedMajor = 0;
      const uncounted = [];
      (completedUnits || []).forEach(u => {
        const code = u.code?.toUpperCase();
        if (plannerUnitTypeMap.has(code) || plannerUnitTypeMap.has(getNormalizedUnitCode(code))) {
          const actualCode = plannerUnitTypeMap.has(code) ? code : getNormalizedUnitCode(code);
          const cat = plannerUnitTypeMap.get(actualCode);
          if (cat === 'core') completedCore++;
          else if (cat === 'elective') completedElective++;
          else if (cat === 'major') completedMajor++;
        } else uncounted.push({ code, name: u.name || u.unitName || '' });
      });
      setUnrecognisedUnits(uncounted);
      const totalCredits = (completedUnits || []).reduce((s, u) => s + (u.creditPoints || 0), 0);
      const totalUnitsCompleted = completedUnitsMap.size;
      const prereqMap = new Map();
      plannerUnits.forEach(u => {
        const code = extractUnitCode(u.UnitCode);
        const parsed = parsePrerequisites(u.Prerequisites || '');
        prereqMap.set(code, ['unit', 'and', 'or'].includes(parsed.type) ? parsed.conditions.filter(c => c.type === 'unit').map(c => c.code) : []);
      });
      const unitsWithPrereqs = plannerUnits.map(u => ({ ...u, prerequisites: prereqMap.get(extractUnitCode(u.UnitCode)) || [] }));
      const missingUnits = unitsWithPrereqs.filter(u => {
        const code = extractUnitCode(u.UnitCode);
        return !completedUnitsMap.has(code) && !completedUnitsMap.has(getNormalizedUnitCode(code));
      });
      const required = 8;
      const needCore = Math.max(0, required - completedCore);
      const needElective = Math.max(0, required - completedElective);
      const needMajor = Math.max(0, required - completedMajor);
      let mcnt = 0, ecnt = 0, majcnt = 0;
      missingUnits.forEach(u => { const c = getUnitCategory(u); if (c === 'core') mcnt++; else if (c === 'elective') ecnt++; else if (c === 'major') majcnt++; });
      if (mcnt < needCore) setCategoryWarning(`⚠️ Only ${mcnt} core unit(s) remaining, but ${needCore} more needed.`);
      else if (ecnt < needElective) setCategoryWarning(`⚠️ Only ${ecnt} elective(s) remaining, but ${needElective} more needed.`);
      else if (majcnt < needMajor) setCategoryWarning(`⚠️ Only ${majcnt} major unit(s) remaining, but ${needMajor} more needed.`);
      let { schedule } = scheduleRemainingUnits(missingUnits, completedUnitsMap, totalCredits, currentYear, currentSemester, totalUnitsCompleted, needCore, needElective, needMajor);
      schedule = optimizeFinalSemester(schedule);
      setEditableSchedule(schedule);
      setRecommendations({
        totalCompleted: completedCore + completedElective + completedMajor,
        totalCredits,
        plannerName: planner.name,
        completedPercent: ((completedCore + completedElective + completedMajor) / 24) * 100,
        currentYear, currentSemester,
        creditsToGraduate: Math.max(0, 300 - totalCredits),
        unitsToGraduate: needCore + needElective + needMajor,
        categoryRequirements: {
          core: { completed: completedCore, required, missing: needCore },
          major: { completed: completedMajor, required, missing: needMajor },
          elective: { completed: completedElective, required, missing: needElective },
        },
      });
    } catch (e) { console.error(e); } finally { setScheduleLoading(false); }
  };

  const regenerateFromMapped = () => {
    if (!selectedFieldPlanner) return;
    setScheduleLoading(true);
    try {
      const planner = selectedFieldPlanner;
      const plannerUnits = planner.units || [];
      if (!plannerUnits.length) { setScheduleLoading(false); return; }
      const plannerUnitTypeMap = new Map();
      plannerUnits.forEach(u => plannerUnitTypeMap.set(extractUnitCode(u.UnitCode), getUnitCategory(u)));
      const completedUnitsMap = new Map();
      (completedUnits || []).forEach(u => {
        const code = u.code?.toUpperCase();
        if (code) { completedUnitsMap.set(code, u); completedUnitsMap.set(getNormalizedUnitCode(code), u); }
      });
      const addMappedToMap = (arr) => {
        arr.forEach(extUnit => {
          const code = extUnit.code?.toUpperCase();
          if (code) { completedUnitsMap.set(code, extUnit); completedUnitsMap.set(getNormalizedUnitCode(code), extUnit); }
        });
      };
      addMappedToMap(mappedExternalUnits.core);
      addMappedToMap(mappedExternalUnits.major);
      addMappedToMap(mappedExternalUnits.elective);
      addMappedToMap(mappedExternalUnits.wil);
      let completedCore = 0, completedElective = 0, completedMajor = 0;
      (completedUnits || []).forEach(u => {
        const code = u.code?.toUpperCase();
        if (plannerUnitTypeMap.has(code) || plannerUnitTypeMap.has(getNormalizedUnitCode(code))) {
          const actualCode = plannerUnitTypeMap.has(code) ? code : getNormalizedUnitCode(code);
          const cat = plannerUnitTypeMap.get(actualCode);
          if (cat === 'core') completedCore++;
          else if (cat === 'elective') completedElective++;
          else if (cat === 'major') completedMajor++;
        }
      });
      completedCore += mappedExternalUnits.core.length;
      completedMajor += mappedExternalUnits.major.length;
      let extraElectiveFromWil = 0;
      mappedExternalUnits.wil.forEach(unit => { extraElectiveFromWil += unit.doubleCount ? 2 : 1; });
      completedElective += mappedExternalUnits.elective.length + extraElectiveFromWil;
      const totalCredits = (completedUnits || []).reduce((s, u) => s + (u.creditPoints || 0), 0) +
        [...mappedExternalUnits.core, ...mappedExternalUnits.major, ...mappedExternalUnits.elective, ...mappedExternalUnits.wil].reduce((s, u) => s + (u.creditPoints || 0), 0);
      const totalUnitsCompleted = completedUnitsMap.size;
      const prereqMap = new Map();
      plannerUnits.forEach(u => {
        const code = extractUnitCode(u.UnitCode);
        const parsed = parsePrerequisites(u.Prerequisites || '');
        prereqMap.set(code, ['unit', 'and', 'or'].includes(parsed.type) ? parsed.conditions.filter(c => c.type === 'unit').map(c => c.code) : []);
      });
      const unitsWithPrereqs = plannerUnits.map(u => ({ ...u, prerequisites: prereqMap.get(extractUnitCode(u.UnitCode)) || [] }));
      const missingUnits = unitsWithPrereqs.filter(u => {
        const code = extractUnitCode(u.UnitCode);
        return !completedUnitsMap.has(code) && !completedUnitsMap.has(getNormalizedUnitCode(code));
      });
      const required = 8;
      const needCore = Math.max(0, required - completedCore);
      const needElective = Math.max(0, required - completedElective);
      const needMajor = Math.max(0, required - completedMajor);
      let mcnt = 0, ecnt = 0, majcnt = 0;
      missingUnits.forEach(u => { const c = getUnitCategory(u); if (c === 'core') mcnt++; else if (c === 'elective') ecnt++; else if (c === 'major') majcnt++; });
      if (mcnt < needCore) setCategoryWarning(`⚠️ Only ${mcnt} core unit(s) remaining, but ${needCore} more needed.`);
      else if (ecnt < needElective) setCategoryWarning(`⚠️ Only ${ecnt} elective(s) remaining, but ${needElective} more needed.`);
      else if (majcnt < needMajor) setCategoryWarning(`⚠️ Only ${majcnt} major unit(s) remaining, but ${needMajor} more needed.`);
      let { schedule } = scheduleRemainingUnits(missingUnits, completedUnitsMap, totalCredits, currentYear, currentSemester, totalUnitsCompleted, needCore, needElective, needMajor);
      schedule = optimizeFinalSemester(schedule);
      setEditableSchedule(schedule);
      setRecommendations(prev => ({
        ...prev,
        totalCompleted: completedCore + completedElective + completedMajor,
        totalCredits,
        completedPercent: ((completedCore + completedElective + completedMajor) / 24) * 100,
        creditsToGraduate: Math.max(0, 300 - totalCredits),
        unitsToGraduate: needCore + needElective + needMajor,
        categoryRequirements: {
          core: { completed: completedCore, required, missing: needCore },
          major: { completed: completedMajor, required, missing: needMajor },
          elective: { completed: completedElective, required, missing: needElective },
        },
      }));
    } catch (e) { console.error(e); } finally { setScheduleLoading(false); }
  };

  useEffect(() => {
    if (!selectedFieldPlanner || !completedUnits || !recommendations) return;
    const plannerUnits = selectedFieldPlanner.units || [];
    const plannerUnitTypeMap = new Map();
    plannerUnits.forEach(u => plannerUnitTypeMap.set(extractUnitCode(u.UnitCode), getUnitCategory(u)));
    let completedCore = 0, completedElective = 0, completedMajor = 0;
    (completedUnits || []).forEach(u => {
      const code = u.code?.toUpperCase();
      if (plannerUnitTypeMap.has(code) || plannerUnitTypeMap.has(getNormalizedUnitCode(code))) {
        const actualCode = plannerUnitTypeMap.has(code) ? code : getNormalizedUnitCode(code);
        const cat = plannerUnitTypeMap.get(actualCode);
        if (cat === 'core') completedCore++;
        else if (cat === 'elective') completedElective++;
        else if (cat === 'major') completedMajor++;
      }
    });
    let extraElectiveFromWil = 0;
    mappedExternalUnits.wil.forEach(unit => { extraElectiveFromWil += unit.doubleCount ? 2 : 1; });
    completedCore += mappedExternalUnits.core.length;
    completedMajor += mappedExternalUnits.major.length;
    completedElective += mappedExternalUnits.elective.length + extraElectiveFromWil;
    const totalCredits = (completedUnits || []).reduce((s, u) => s + (u.creditPoints || 0), 0) +
      [...mappedExternalUnits.core, ...mappedExternalUnits.major, ...mappedExternalUnits.elective, ...mappedExternalUnits.wil].reduce((s, u) => s + (u.creditPoints || 0), 0);
    const required = 8;
    const needCore = Math.max(0, required - completedCore);
    const needElective = Math.max(0, required - completedElective);
    const needMajor = Math.max(0, required - completedMajor);
    setRecommendations(prev => ({
      ...prev,
      totalCompleted: completedCore + completedElective + completedMajor,
      totalCredits,
      completedPercent: ((completedCore + completedElective + completedMajor) / 24) * 100,
      categoryRequirements: {
        core: { completed: completedCore, required, missing: needCore },
        major: { completed: completedMajor, required, missing: needMajor },
        elective: { completed: completedElective, required, missing: needElective },
      },
    }));
  }, [mappedExternalUnits, selectedFieldPlanner, completedUnits]);

  if (!isOpen) return null;

  const { core: coreUnits, major: majorUnits, elective: electiveUnits, wil: wilUnits } = getPlannerUnitsWithStatus();
  const allExternalMapped = unrecognisedUnits.length === 0;

  return (
    <>
      <UnitPoolToolbox
        isOpen={showToolbox}
        onClose={() => setShowToolbox(false)}
      />

      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full h-full flex flex-col overflow-hidden mt-16"
          style={{ maxWidth: '1600px', maxHeight: '95vh' }}
          onClick={e => e.stopPropagation()}
          onDragEnd={() => {
            setDragSource(null);
            setDragTarget(null);
            setDragOverPanel(null);
          }}
        >
          {/* Header */}
          <div className="bg-white border-b border-gray-200 p-4 rounded-t-2xl flex-shrink-0">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-3">
                <div className="border border-[#cc2131]/30 text-[#cc2131] bg-[#cc2131]/5 p-2 rounded-xl">
                  <CalendarIcon className="h-6 w-6" />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-[#111827]">
                    Study Planner
                  </h2>

                  <p className="text-gray-500 text-xs">
                    {plannersLoading
                      ? 'Loading planners…'
                      : `${allPlanners.length} planner(s) available`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Toolbox */}
                <button
                  onClick={() => setShowToolbox(v => !v)}
                  title="Toggle Unit Toolbox"
                  className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
                  ${showToolbox
                      ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5'
                      : 'border-gray-300 text-gray-600 bg-white hover:border-[#cc2131] hover:text-[#cc2131]'
                    }
                `}
                >
                  <WrenchScrewdriverIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Unit Toolbox</span>
                </button>

                <button
                  onClick={onClose}
                  className="border border-gray-300 hover:border-[#cc2131] hover:text-[#cc2131] rounded-full p-2 transition-all"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 bg-gray-50/40">
            {/* Error */}
            {plannersError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm flex items-center gap-2">
                <ExclamationTriangleIcon className="h-4 w-4" />
                {plannersError}
              </div>
            )}

            {/* Progress */}
            {studentInfo && recommendations && (
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <UserGroupIcon className="h-5 w-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-800">Graduation Progress</h3>
                  <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full ml-auto">{recommendations.plannerName}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                  <div><span className="text-gray-500 text-xs">Student ID</span><p className="font-semibold">{studentInfo.studentId}</p></div>
                  <div><span className="text-gray-500 text-xs">Position</span>{(() => { const count = completedUnits?.length || 0; const sems = Math.floor(count / 4); const sem = Math.max(1, sems); const yr = Math.floor((sem - 1) / 2) + 1; return <p className="font-semibold text-red-600">Y{yr} S{sem}</p>; })()}</div>
                  <div><span className="text-gray-500 text-xs">Units</span><p className="font-semibold text-red-600">{recommendations.totalCompleted}/24</p></div>
                  <div><span className="text-gray-500 text-xs">Credits</span><p className="font-semibold text-red-600">{recommendations.totalCredits}/300</p></div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  {['core', 'major', 'elective'].map(cat => (
                    <div key={cat} className="bg-white rounded-lg p-2 text-center border border-gray-100">
                      <span className="text-gray-500 capitalize">{cat}</span>
                      <p className="font-bold">{recommendations.categoryRequirements[cat].completed}/{recommendations.categoryRequirements[cat].required}</p>
                      <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                        <div className="bg-red-500 h-1 rounded-full" style={{ width: `${(recommendations.categoryRequirements[cat].completed / recommendations.categoryRequirements[cat].required) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {categoryWarning && (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-sm text-amber-700 flex items-start gap-2">
                    <ExclamationTriangleIcon className="h-4 w-4 mt-0.5" />{categoryWarning}
                  </div>
                )}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Overall progress (24 units)</span>
                    <span>{recommendations.completedPercent?.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-[#cc2131] h-2 rounded-full transition-all" style={{ width: `${recommendations.completedPercent || 0}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* Field planners */}
            {fieldPlanners.length > 1 && (
              <div className="mb-4 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500">Study field:</span>

                {fieldPlanners.map(item => (
                  <button
                    key={item.field}
                    onClick={() => {
                      setSelectedFieldPlanner(item.planner);
                      setRecommendations(null);
                      generateScheduleForPlanner(item.planner);
                    }}
                    className={`
                    text-xs px-3 py-1.5 rounded-full border font-medium transition-all
                    ${selectedFieldPlanner?.name === item.planner.name
                        ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5'
                        : 'border-gray-300 text-gray-600 bg-white hover:border-[#cc2131] hover:text-[#cc2131]'
                      }
                  `}
                  >
                    {item.field} ({item.score}/{completedUnits?.length || 0})
                  </button>
                ))}
              </div>
            )}

            {/* Panels */}
            {selectedFieldPlanner && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  { key: 'core', units: coreUnits },
                  { key: 'major', units: majorUnits },
                  { key: 'elective', units: electiveUnits },
                  { key: 'wil', units: wilUnits },
                ].map(({ key, units }) => (
                  <div
                    key={key}
                    className={`
          bg-white rounded-xl border-2 border-red-500 p-3 flex flex-col transition-all
          ${dragOverPanel === key ? 'ring-2 ring-red-500 bg-red-50/30' : ''}
        `}
                    onDragOver={e => { e.preventDefault(); setDragOverPanel(key); }}
                    onDragLeave={() => setDragOverPanel(null)}
                    onDrop={() => { handleDropOnPanel(key); setDragOverPanel(null); }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-800 text-sm capitalize">
                        {key}
                      </h4>
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                        {units.length} units
                      </span>
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1 flex-1">
                      {units.map((unit, idx) => (
                        <PanelUnitCard
                          key={`${key}-${idx}-${unit.UnitCode || unit.code}`}
                          unit={unit}
                          status={unit.status}
                          category={key}
                          onDragStart={handleDragStart}
                          isDragging={
                            dragSource?.fromPanel &&
                            extractUnitCode(dragSource.unit?.UnitCode) === extractUnitCode(unit.UnitCode)
                          }
                          onRemove={
                            unit.isMappedExternal ? (u) => handleRemoveMappedUnit(key, u) : null
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* External units */}
            <div className="mb-4 bg-white rounded-xl border border-gray-200 p-3">
              <h4 className="font-semibold text-[#111827] text-sm mb-2 flex items-center gap-1">
                Completed (External)

                <span className="text-xs font-normal text-gray-500 ml-auto">
                  {unrecognisedUnits.length} units
                </span>
              </h4>

              {unrecognisedUnits.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {unrecognisedUnits.map((unit, idx) => (
                    <ExternalUnitCard
                      key={`ext-${idx}`}
                      unit={unit}
                      onMapToCategory={handleMapExternalToCategory}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 text-center py-2">
                  All external units have been mapped.
                </p>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  onClick={regenerateFromMapped}
                  disabled={!allExternalMapped || scheduleLoading}
                  className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border
                  ${allExternalMapped && !scheduleLoading
                      ? 'border-[#cc2131] text-[#cc2131] bg-white hover:bg-[#cc2131]/5'
                      : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                    }
                `}
                >
                  {scheduleLoading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <ArrowPathIcon className="h-4 w-4" />
                      Generate Study Plan
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Loading */}
            {scheduleLoading || plannersLoading ? (
              <div className="text-center py-12">
                <ArrowPathIcon className="h-10 w-10 text-[#cc2131] animate-spin mx-auto mb-3" />

                <p className="text-gray-500">
                  {plannersLoading
                    ? 'Fetching planners…'
                    : 'Building your schedule…'}
                </p>
              </div>
            ) : editableSchedule.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-white border border-gray-200 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <CheckCircleIcon className="h-10 w-10 text-[#cc2131]" />
                </div>

                <p className="text-[#111827] text-lg font-medium">
                  🎓 All requirements met!
                </p>

                <p className="text-gray-500 mt-2">
                  You've completed all required units.
                </p>
              </div>
            ) : (
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-[#cc2131]" />

                    <h3 className="text-base font-bold text-[#111827]">
                      Full Study Plan
                    </h3>

                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {editableSchedule.length} semester(s)
                    </span>
                  </div>

                  <button
                    onClick={() => setShowFullPlan(!showFullPlan)}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#cc2131]"
                  >
                    {showFullPlan ? 'Collapse' : 'Expand'}

                    {showFullPlan ? (
                      <ChevronUpIcon className="h-4 w-4" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {showFullPlan && (
                  <div className="space-y-3">
                    {editableSchedule.map((sem, semIdx) => (
                      <div
                        key={semIdx}
                        className="border border-gray-200 rounded-xl overflow-hidden bg-white"
                      >
                        <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
                          <h4 className="font-semibold text-[#111827] text-sm">
                            Year {sem.year}, Semester {sem.semester}
                          </h4>

                          <span className="text-xs text-gray-500">
                            {sem.unitCount} unit(s) · {sem.totalCredits} CP
                          </span>
                        </div>

                        <div className="p-3 space-y-1.5">
                          {sem.units.map((unit, unitIdx) => (
                            <DraggableUnitCard
                              key={`${semIdx}-${unitIdx}-${unit.UnitCode}`}
                              unit={unit}
                              semIdx={semIdx}
                              unitIdx={unitIdx}
                              onDragStart={handleDragStart}
                              onDragEnter={handleDragEnter}
                              onDrop={handleDrop}
                              isDragOver={
                                dragTarget?.semIdx === semIdx &&
                                dragTarget?.unitIdx === unitIdx &&
                                dragSource &&
                                !dragSource.fromPanel
                              }
                              isSource={
                                dragSource &&
                                !dragSource.fromPanel &&
                                dragSource.semIdx === semIdx &&
                                dragSource.unitIdx === unitIdx
                              }
                              onRemove={handleRemoveUnit}
                            />
                          ))}

                          <SemesterDropZone
                            sem={sem}
                            semIdx={semIdx}
                            onDragEnter={handleDragEnter}
                            onDrop={handleDrop}
                            onNativeDrop={handleNativeDropIntoSemester}
                            isDragOver={
                              dragTarget?.semIdx === semIdx &&
                              dragTarget?.unitIdx === sem.units.length &&
                              dragSource
                            }
                          />
                        </div>
                      </div>
                    ))}

                    {/* Bottom */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 mt-2">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
                        Drag units between semesters to customise.
                      </p>

                      <button
                        onClick={handleExportPdf}
                        disabled={pdfLoading}
                        className={`
                        flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                        ${pdfLoading
                            ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed'
                            : 'bg-[#cc2131] hover:bg-[#b01d2c] text-white'
                          }
                      `}
                      >
                        {pdfLoading ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowDownTrayIcon className="h-4 w-4" />
                        )}

                        {pdfLoading
                          ? 'Generating PDF…'
                          : 'Save as PDF'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default UnitRecommendations;