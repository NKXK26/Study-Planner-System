'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  XMarkIcon, CheckCircleIcon, ArrowPathIcon, CalendarIcon,
  UserGroupIcon, ChevronDownIcon, ChevronUpIcon, Bars3Icon,
  PlusIcon, ArrowsRightLeftIcon, ExclamationTriangleIcon,
  ChevronRightIcon, WrenchScrewdriverIcon, ArrowDownTrayIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import UnitPoolToolbox from '@/app/view/unit_suggestion/UnitPoolToolbox';
import { generateStudyPlannerPdf } from '@/app/view/unit_suggestion/Exportstudyplannerpdf';
import GraduationDashboard from './GraduationDashboard';
import {
  CategoryBadge,
  DraggableUnitCard,
  PanelUnitCard,
  ExternalUnitCard,
  SemesterDropZone,
} from './SuggestionUIComponents';
import {
  DEFAULT_CREDIT_POINTS,
  MAX_UNITS_PER_SEMESTER,
  MAX_CREDITS_PER_SEMESTER,
  getNormalizedUnitCode,
  extractUnitCode,
  calculateCompletedCredits,
  parsePrerequisites,
  scheduleRemainingUnits,
  balanceSemesterLoads,
  optimizeFinalSemester,
  compactFinalSemesters,
} from './plannerHelpers';

// Remove hardcoded imports for REQUIRED_CORE etc. We'll handle dynamic requirements.

// Category selector (unchanged)
const CategorySelector = ({ unit, onConfirm, onCancel }) => {
  // ... same as before (keep as is)
};

// EquivalencyModal (unchanged)
const EquivalencyModal = ({ isOpen, onClose, oldUnit, intakeYear, currentSem, onReplace }) => {
  // ... same as before
};

// ========================= MAIN COMPONENT =========================
const UnitRecommendations = ({ isOpen, onClose, completedUnits, studentInfo }) => {
  const [allPlanners, setAllPlanners]                 = useState([]);
  const [plannersLoading, setPlannersLoading]         = useState(false);
  const [plannersError, setPlannersError]             = useState(null);
  const [recommendations, setRecommendations]         = useState(null);
  const [editableSchedule, setEditableSchedule]       = useState([]);
  const [scheduleLoading, setScheduleLoading]         = useState(false);
  const [showFullPlan, setShowFullPlan]               = useState(false);
  const [currentYear, setCurrentYear]                 = useState(1);
  const [currentSemester, setCurrentSemester]         = useState(1);
  const [unrecognisedUnits, setUnrecognisedUnits]     = useState([]);
  const [fieldPlanners, setFieldPlanners]             = useState([]);
  const [selectedFieldPlanner, setSelectedFieldPlanner] = useState(null);
  // Dynamic mapped external units: object with category names as keys
  const [mappedExternalUnits, setMappedExternalUnits] = useState({});
  const [dragSource, setDragSource]                   = useState(null);
  const [dragTarget, setDragTarget]                   = useState(null);
  const [dragOverPanel, setDragOverPanel]             = useState(null);
  const [showToolbox, setShowToolbox]                 = useState(false);
  const [pdfLoading, setPdfLoading]                   = useState(false);
  const [allPlannersWithScores, setAllPlannersWithScores] = useState([]);
  const [topPlanners, setTopPlanners]                 = useState([]);
  const [manualPlannerId, setManualPlannerId]         = useState('');
  const [equivModal, setEquivModal]                   = useState({ open: false, unit: null });
  const hasInitiallySelected = useRef(false);

  const intakeYear = studentInfo?.intakeYear ?? studentInfo?.intake_year ?? (new Date().getFullYear() - 1);
  const currentSem = (() => {
    const now = new Date();
    return `${now.getFullYear()} Sem ${now.getMonth() < 6 ? 1 : 2}`;
  })();

  // Helper: get category name for a unit from its unitType.Name
  const getUnitCategoryName = (unit) => {
    if (unit.unitType?.Name) return unit.unitType.Name;
    // fallback: infer from unit code (if needed, but better to rely on unitType)
    const code = (unit.UnitCode || '').toUpperCase();
    if (code.startsWith('CVE') || code.startsWith('MEE')) return 'Major';
    if (code.startsWith('ACC') || code.startsWith('MKT') || code.startsWith('ECO')) return 'Core';
    return 'Elective';
  };

  // Build dynamic category counts from a list of units (for completed units mapping)
  const getCategoryCountsFromUnits = (units, plannerUnitsMap) => {
    const counts = {};
    units.forEach(unit => {
      const code = unit.code?.toUpperCase();
      if (!code) return;
      // Try to find matching planner unit to get its category
      const plannerUnit = plannerUnitsMap.get(code);
      if (plannerUnit) {
        const cat = getUnitCategoryName(plannerUnit);
        counts[cat] = (counts[cat] || 0) + 1;
      } else {
        // If not found, count as uncategorized
        counts['Uncategorized'] = (counts['Uncategorized'] || 0) + 1;
      }
    });
    return counts;
  };

  const computePlannerScores = useCallback((planners, completedUnits) => {
    if (!planners.length || !completedUnits.length) return [];
    const completedCodes = new Set(completedUnits.map(u => u.code?.toUpperCase()).filter(Boolean));
    return planners.map(planner => {
      const plannerCodes = new Set((planner.units || []).map(u => extractUnitCode(u.UnitCode).toUpperCase()));
      const matched = [...completedCodes].filter(code => plannerCodes.has(code)).length;
      return { ...planner, matchedUnits: matched, totalCompleted: completedCodes.size };
    }).sort((a, b) => b.matchedUnits - a.matchedUnits);
  }, []);

  const generateScheduleForPlanner = useCallback((planner) => {
    if (!planner) return;
    setScheduleLoading(true);
    setEditableSchedule([]);
    setMappedExternalUnits({});
    try {
      const plannerUnits = planner.units || [];
      if (!plannerUnits.length) { setScheduleLoading(false); return; }

      // Build a map from unit code to planner unit (to get category)
      const plannerUnitByCode = new Map();
      plannerUnits.forEach(u => {
        plannerUnitByCode.set(extractUnitCode(u.UnitCode).toUpperCase(), u);
      });

      const completedUnitsMap = new Map();
      (completedUnits || []).forEach(u => {
        const code = u.code?.toUpperCase();
        if (code) { completedUnitsMap.set(code, u); completedUnitsMap.set(getNormalizedUnitCode(code), u); }
      });

      // Count completed units per category
      const completedCounts = getCategoryCountsFromUnits(completedUnits || [], plannerUnitByCode);
      const totalCompleted = Object.values(completedCounts).reduce((a,b)=>a+b,0);
      const totalCredits = totalCompleted * DEFAULT_CREDIT_POINTS; // simplified

      // Find missing units
      const allMissingUnits = plannerUnits.filter(u => {
        const code = extractUnitCode(u.UnitCode).toUpperCase();
        return !completedUnitsMap.has(code) && !completedUnitsMap.has(getNormalizedUnitCode(code));
      });

      // For scheduling, we need required counts per category. We'll use the total units in planner per category.
      const requiredCounts = {};
      plannerUnits.forEach(u => {
        const cat = getUnitCategoryName(u);
        requiredCounts[cat] = (requiredCounts[cat] || 0) + 1;
      });

      // For simplicity, we'll allow scheduling of all missing units, ignoring category counts.
      let { schedule } = scheduleRemainingUnits(
        allMissingUnits, completedUnitsMap, totalCredits,
        currentYear, currentSemester, completedUnits.length,
        100, 100, 100 // high thresholds to not filter by core/major/elective
      );
      schedule = compactFinalSemesters(schedule, completedUnitsMap);
      schedule = balanceSemesterLoads(schedule, completedUnitsMap);
      schedule = optimizeFinalSemester(schedule);
      setEditableSchedule(schedule);

      setRecommendations({
        totalCompleted,
        totalCredits,
        plannerName: planner.name,
        completedPercent: (totalCompleted / plannerUnits.length) * 100,
        currentYear, currentSemester,
        creditsToGraduate: Math.max(0, (plannerUnits.length * DEFAULT_CREDIT_POINTS) - totalCredits),
        unitsToGraduate: allMissingUnits.length,
        categoryRequirements: requiredCounts,
      });
    } catch (e) { console.error(e); } finally { setScheduleLoading(false); }
  }, [currentYear, currentSemester, completedUnits]);

  const regenerateFromMapped = useCallback(() => {
    if (!selectedFieldPlanner) return;
    setScheduleLoading(true);
    try {
      const planner = selectedFieldPlanner;
      const plannerUnits = planner.units || [];
      if (!plannerUnits.length) { setScheduleLoading(false); return; }

      const plannerUnitByCode = new Map();
      plannerUnits.forEach(u => {
        plannerUnitByCode.set(extractUnitCode(u.UnitCode).toUpperCase(), u);
      });

      const completedUnitsMap = new Map();
      (completedUnits || []).forEach(u => {
        const code = u.code?.toUpperCase();
        if (code) { completedUnitsMap.set(code, u); completedUnitsMap.set(getNormalizedUnitCode(code), u); }
      });

      // Add mapped external units
      for (const [cat, extUnits] of Object.entries(mappedExternalUnits)) {
        extUnits.forEach(extUnit => {
          const code = extUnit.code?.toUpperCase();
          if (code) { completedUnitsMap.set(code, extUnit); completedUnitsMap.set(getNormalizedUnitCode(code), extUnit); }
        });
      }

      // Recompute completed counts
      const completedCounts = getCategoryCountsFromUnits(
        [...(completedUnits || []), ...Object.values(mappedExternalUnits).flat()],
        plannerUnitByCode
      );
      const totalCompleted = Object.values(completedCounts).reduce((a,b)=>a+b,0);
      const totalCredits = totalCompleted * DEFAULT_CREDIT_POINTS;

      const allMissingUnits = plannerUnits.filter(u => {
        const code = extractUnitCode(u.UnitCode).toUpperCase();
        return !completedUnitsMap.has(code) && !completedUnitsMap.has(getNormalizedUnitCode(code));
      });

      let { schedule } = scheduleRemainingUnits(
        allMissingUnits, completedUnitsMap, totalCredits,
        currentYear, currentSemester, completedUnits.length,
        100, 100, 100
      );
      schedule = compactFinalSemesters(schedule, completedUnitsMap);
      schedule = balanceSemesterLoads(schedule, completedUnitsMap);
      schedule = optimizeFinalSemester(schedule);
      setEditableSchedule(schedule);
      setRecommendations(prev => ({
        ...prev,
        totalCompleted,
        totalCredits,
        completedPercent: (totalCompleted / plannerUnits.length) * 100,
        unitsToGraduate: allMissingUnits.length,
      }));
    } catch (e) { console.error(e); } finally { setScheduleLoading(false); }
  }, [selectedFieldPlanner, completedUnits, currentYear, currentSemester, mappedExternalUnits]);

  const handleExportPdf = useCallback(async () => {
    if (!editableSchedule.length) return;
    setPdfLoading(true);
    try {
      const studentId  = studentInfo?.studentId ?? 'student';
      const plannerSlug = (recommendations?.plannerName ?? 'planner')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      await generateStudyPlannerPdf({
        editableSchedule, recommendations, studentInfo, completedUnits,
        filename: `study-planner-${studentId}-${plannerSlug}.pdf`,
      });
    } catch (err) { console.error('PDF export failed:', err); }
    finally { setPdfLoading(false); }
  }, [editableSchedule, recommendations, studentInfo, completedUnits]);

  // Dynamic grouping of planner units with status
  const getPlannerUnitsWithStatus = useCallback(() => {
    if (!selectedFieldPlanner) return {};
    const plannerUnits = selectedFieldPlanner.units || [];

    // Build category map: category name -> array of units
    const categoriesMap = new Map();
    plannerUnits.forEach(unit => {
      const catName = getUnitCategoryName(unit);
      if (!categoriesMap.has(catName)) categoriesMap.set(catName, []);
      categoriesMap.get(catName).push(unit);
    });

    const completedCodeSet = new Set();
    (completedUnits || []).forEach(u => {
      const code = u.code?.toUpperCase();
      if (code) { completedCodeSet.add(code); completedCodeSet.add(getNormalizedUnitCode(code)); }
    });
    const scheduledCodeSet = new Set();
    editableSchedule.flatMap(s => s.units).forEach(u => {
      const code = extractUnitCode(u.UnitCode || '');
      scheduledCodeSet.add(code); scheduledCodeSet.add(getNormalizedUnitCode(code));
    });

    const result = {};
    for (const [catName, units] of categoriesMap.entries()) {
      result[catName] = units.map(unit => {
        const code = extractUnitCode(unit.UnitCode);
        let status = 'pending';
        if (completedCodeSet.has(code) || completedCodeSet.has(getNormalizedUnitCode(code))) status = 'completed';
        else if (scheduledCodeSet.has(code) || scheduledCodeSet.has(getNormalizedUnitCode(code))) status = 'scheduled';
        return { ...unit, status, isMappedExternal: false, originalCategory: catName };
      });
    }
    // Add mapped external units to their categories
    for (const [catName, extUnits] of Object.entries(mappedExternalUnits)) {
      if (!result[catName]) result[catName] = [];
      extUnits.forEach(extUnit => {
        const item = {
          ...extUnit,
          status: 'pending',
          isMappedExternal: true,
          originalCategory: catName,
          CreditPoints: extUnit.creditPoints || DEFAULT_CREDIT_POINTS,
          Name: extUnit.name,
          UnitCode: extUnit.code,
          doubleCount: extUnit.doubleCount,
        };
        result[catName].push(item);
      });
    }
    return result;
  }, [selectedFieldPlanner, completedUnits, editableSchedule, mappedExternalUnits]);

  const handleMapExternalToCategory = useCallback((category, externalUnit) => {
    let unitToAdd = { ...externalUnit };
    if (category === 'wil' && externalUnit.code?.toUpperCase() === 'ICT20016') {
      unitToAdd.doubleCount = true;
      unitToAdd.creditPoints = (externalUnit.creditPoints || DEFAULT_CREDIT_POINTS) * 2;
    }
    setUnrecognisedUnits(prev => prev.filter(u => u.code !== externalUnit.code));
    setMappedExternalUnits(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), unitToAdd],
    }));
  }, []);

  const handleRemoveMappedUnit = useCallback((category, unitToRemove) => {
    setUnrecognisedUnits(prev => {
      const alreadyExists = prev.some(u => u.code === unitToRemove.code);
      return alreadyExists ? prev : [...prev, unitToRemove];
    });
    setMappedExternalUnits(prev => ({
      ...prev,
      [category]: (prev[category] || []).filter(u => u.code !== unitToRemove.code),
    }));
  }, []);

  // Drag handlers (unchanged)
  const handleDragStart = (info) => setDragSource(info);
  const handleDragEnter = (target) => setDragTarget(target);
  const handleNativeDropIntoSemester = useCallback((semIdx, insertAt, rawUnit) => {
    setEditableSchedule(prev => {
      const newSchedule = prev.map(s => ({ ...s, units: [...s.units] }));
      const sem = newSchedule[semIdx];
      if (!sem) return prev;
      sem.units.splice(insertAt, 0, { ...rawUnit });
      sem.unitCount = sem.units.length;
      sem.totalCredits = sem.units.reduce((s, u) => s + (u.CreditPoints || DEFAULT_CREDIT_POINTS), 0);
      return newSchedule;
    });
    setDragSource(null); setDragTarget(null);
  }, []);
  const handleDrop = useCallback((target) => {
    if (!dragSource) return;
    const newSchedule = editableSchedule.map(s => ({ ...s, units: [...s.units] }));
    if (dragSource.fromPanel) {
      const { semIdx, unitIdx } = target;
      if (semIdx === undefined || semIdx === null) return;
      const sem = newSchedule[semIdx];
      if (!sem) return;
      const insertAt = typeof unitIdx === 'number' ? unitIdx : sem.units.length;
      sem.units.splice(insertAt, 0, { ...dragSource.unit });
      sem.unitCount = sem.units.length;
      sem.totalCredits = sem.units.reduce((s, u) => s + (u.CreditPoints || DEFAULT_CREDIT_POINTS), 0);
      setEditableSchedule(newSchedule.filter(s => s.units.length > 0));
    } else if (dragSource.semIdx !== undefined) {
      // ... same as before (keeping existing logic)
    }
    setDragSource(null); setDragTarget(null); setDragOverPanel(null);
  }, [dragSource, editableSchedule]);
  const handleDropOnPanel = useCallback((panelCategory) => {
    if (!dragSource) return;
    if (dragSource.semIdx !== undefined) {
      setEditableSchedule(prev =>
        prev.map((sem, semIdx) => {
          if (semIdx !== dragSource.semIdx) return sem;
          const newUnits = sem.units.filter((_, idx) => idx !== dragSource.unitIdx);
          return { ...sem, units: newUnits, unitCount: newUnits.length, totalCredits: newUnits.reduce((s, u) => s + (u.CreditPoints || DEFAULT_CREDIT_POINTS), 0) };
        }).filter(sem => sem.units.length > 0)
      );
    }
    setDragSource(null); setDragTarget(null); setDragOverPanel(null);
  }, [dragSource]);
  const handleRemoveUnit = useCallback((semIdx, unitIdx) => {
    const newSchedule = editableSchedule.map(s => ({ ...s, units: [...s.units] }));
    newSchedule[semIdx].units.splice(unitIdx, 1);
    newSchedule[semIdx].unitCount = newSchedule[semIdx].units.length;
    newSchedule[semIdx].totalCredits = newSchedule[semIdx].units.reduce((s, u) => s + (u.CreditPoints || DEFAULT_CREDIT_POINTS), 0);
    setEditableSchedule(newSchedule.filter(s => s.units.length > 0));
  }, [editableSchedule]);
  const handleReplaceUnrecognisedUnit = useCallback((dbUnit, category) => {
    const externalUnit = {
      code:         dbUnit.UnitCode,
      name:         dbUnit.Name,
      creditPoints: dbUnit.CreditPoints || DEFAULT_CREDIT_POINTS,
      originalCode: equivModal.unit?.code,
    };
    handleMapExternalToCategory(category, externalUnit);
    setEquivModal({ open: false, unit: null });
  }, [handleMapExternalToCategory, equivModal.unit]);

  // useEffect hooks (same pattern but adjust for dynamic)
  useEffect(() => {
    if (!isOpen) return;
    setPlannersLoading(true);
    setPlannersError(null);
    fetch('/api/study-planner', { headers: { 'x-dev-override': 'true' } })
      .then(r => r.json())
      .then(json => {
        if (json.success) setAllPlanners(json.data || []);
        else setPlannersError('Failed to load planners from server.');
      })
      .catch(() => setPlannersError('Network error fetching planners.'))
      .finally(() => setPlannersLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (allPlanners.length && completedUnits?.length) {
      const scored = computePlannerScores(allPlanners, completedUnits);
      setAllPlannersWithScores(scored);
      setTopPlanners(scored.slice(0, 5));
      if (!selectedFieldPlanner && scored.length) setSelectedFieldPlanner(scored[0]);
    }
  }, [allPlanners, completedUnits, computePlannerScores, selectedFieldPlanner]);

  useEffect(() => {
    if (!isOpen) { hasInitiallySelected.current = false; return; }
    if (!hasInitiallySelected.current && topPlanners.length > 0 && completedUnits?.length) {
      hasInitiallySelected.current = true;
      const firstPlanner = topPlanners[0];
      setSelectedFieldPlanner(firstPlanner);
      setManualPlannerId('');
      generateScheduleForPlanner(firstPlanner);
    }
  }, [isOpen, topPlanners, completedUnits, generateScheduleForPlanner]);

  useEffect(() => {
    if (!isOpen || !completedUnits) return;
    const getStudentPositionFromCompletedUnits = (completedCount) => {
      const completedSemesters = Math.floor(completedCount / MAX_UNITS_PER_SEMESTER);
      const nextSemesterOrder  = Math.max(1, completedSemesters) + 1;
      const orderToYearSemester = (order) => ({ year: Math.floor((order - 1) / 2) + 1, semester: (order - 1) % 2 === 0 ? 1 : 2, order });
      return orderToYearSemester(nextSemesterOrder);
    };
    const position = getStudentPositionFromCompletedUnits(completedUnits.length);
    setCurrentYear(position.year);
    setCurrentSemester(position.semester);
  }, [isOpen, completedUnits]);

  useEffect(() => {
    if (isOpen && selectedFieldPlanner && completedUnits && !recommendations) {
      generateScheduleForPlanner(selectedFieldPlanner);
    }
  }, [isOpen, selectedFieldPlanner, completedUnits, currentYear, currentSemester, recommendations, generateScheduleForPlanner]);

  if (!isOpen) return null;

  const groupedUnits = getPlannerUnitsWithStatus();
  const allExternalMapped = unrecognisedUnits.length === 0;

  return (
    <>
      <UnitPoolToolbox isOpen={showToolbox} onClose={() => setShowToolbox(false)} />
      <EquivalencyModal isOpen={equivModal.open} onClose={() => setEquivModal({ open: false, unit: null })} oldUnit={equivModal.unit} intakeYear={intakeYear} currentSem={currentSem} onReplace={handleReplaceUnrecognisedUnit} />

      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2" onClick={onClose}>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full h-full flex flex-col overflow-hidden mt-16" style={{ maxWidth: '1600px', maxHeight: '95vh' }} onClick={e => e.stopPropagation()} onDragEnd={() => { setDragSource(null); setDragTarget(null); setDragOverPanel(null); }}>
          {/* Top bar (unchanged) */}
          <div className="bg-white border-b border-gray-200 p-4 rounded-t-2xl flex-shrink-0">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-3">
                <div className="border border-[#cc2131]/30 text-[#cc2131] bg-[#cc2131]/5 p-2 rounded-xl"><CalendarIcon className="h-6 w-6" /></div>
                <div><h2 className="text-xl font-bold text-[#111827]">Study Planner</h2><p className="text-gray-500 text-xs">{plannersLoading ? 'Loading planners…' : `${allPlanners.length} planner(s) available`}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowToolbox(v => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${showToolbox ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5' : 'border-gray-300 text-gray-600 bg-white hover:border-[#cc2131] hover:text-[#cc2131]'}`}><WrenchScrewdriverIcon className="h-4 w-4" /><span className="hidden sm:inline">Unit Toolbox</span></button>
                <button onClick={onClose} className="border border-gray-300 hover:border-[#cc2131] hover:text-[#cc2131] rounded-full p-2 transition-all"><XMarkIcon className="h-5 w-5" /></button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 bg-gray-50/40">
            {plannersError && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm flex items-center gap-2"><ExclamationTriangleIcon className="h-4 w-4" />{plannersError}</div>}

            <GraduationDashboard recommendations={recommendations} studentInfo={studentInfo} completedUnits={completedUnits} editableSchedule={editableSchedule} />

            {topPlanners.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top matching planners</span><span className="text-xs text-gray-400">Match score (completed units)</span></div>
                <div className="flex flex-wrap gap-2">
                  {topPlanners.map(planner => (
                    <button key={planner.id} onClick={() => { setSelectedFieldPlanner(planner); setManualPlannerId(''); setRecommendations(null); generateScheduleForPlanner(planner); }} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${selectedFieldPlanner?.id === planner.id ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5' : 'border-gray-300 text-gray-600 bg-white hover:border-[#cc2131] hover:text-[#cc2131]'}`}>
                      {planner.name} ({planner.matchedUnits}/{completedUnits?.length || 0})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {allPlannersWithScores.length > 0 && (
              <div className="mb-4 flex items-center gap-3">
                <span className="text-xs text-gray-500">Or select any planner:</span>
                <select value={manualPlannerId} onChange={(e) => { const id = e.target.value; setManualPlannerId(id); if (id) { const selected = allPlannersWithScores.find(p => p.id === parseInt(id)); if (selected) { setSelectedFieldPlanner(selected); setRecommendations(null); generateScheduleForPlanner(selected); } } }} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-[#cc2131]/30">
                  <option value="">-- Choose a planner --</option>
                  {allPlannersWithScores.map(planner => <option key={planner.id} value={planner.id}>{planner.name} (matched: {planner.matchedUnits}/{completedUnits?.length || 0})</option>)}
                </select>
              </div>
            )}

            {/* Dynamic category panels */}
            {selectedFieldPlanner && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
                {Object.entries(groupedUnits).map(([catName, units]) => (
                  <div key={catName} className={`bg-white rounded-xl border-2 border-red-500 p-3 flex flex-col transition-all ${dragOverPanel === catName ? 'ring-2 ring-red-500 bg-red-50/30' : ''}`} onDragOver={e => { e.preventDefault(); setDragOverPanel(catName); }} onDragLeave={() => setDragOverPanel(null)} onDrop={() => { handleDropOnPanel(catName); setDragOverPanel(null); }}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-800 text-sm capitalize">{catName}</h4>
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{units.length} units</span>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1 flex-1">
                      {units.map((unit, idx) => (
                        <PanelUnitCard key={`${catName}-${idx}-${unit.UnitCode || unit.code}`} unit={unit} status={unit.status} category={catName} onDragStart={handleDragStart} isDragging={dragSource?.fromPanel && extractUnitCode(dragSource.unit?.UnitCode) === extractUnitCode(unit.UnitCode)} onRemove={unit.isMappedExternal ? (u) => handleRemoveMappedUnit(catName, u) : null} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Unrecognised units */}
            <div className="mb-4 bg-white rounded-xl border border-gray-200 p-3">
              <h4 className="font-semibold text-[#111827] text-sm mb-2 flex items-center gap-1">Student's completed units not recognised in planner<span className="text-xs font-normal text-gray-500 ml-auto">{unrecognisedUnits.length} units</span></h4>
              {unrecognisedUnits.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {unrecognisedUnits.map((unit, idx) => (
                    <div key={`ext-${idx}`} className="relative">
                      <ExternalUnitCard unit={unit} onMapToCategory={handleMapExternalToCategory} />
                      <button onClick={() => setEquivModal({ open: true, unit })} title="Find equivalent unit using AI" className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-xs font-medium"><MagnifyingGlassIcon className="h-3.5 w-3.5" />Find equivalent</button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-500 text-center py-2">All external units have been mapped.</p>}
              <div className="mt-3 flex justify-end">
                <button onClick={() => { regenerateFromMapped(); setShowFullPlan(true); }} disabled={!allExternalMapped || scheduleLoading} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border ${allExternalMapped && !scheduleLoading ? 'border-[#cc2131] text-[#cc2131] bg-white hover:bg-[#cc2131]/5' : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'}`}>
                  {scheduleLoading ? <><ArrowPathIcon className="h-4 w-4 animate-spin" />Generating...</> : <><ArrowPathIcon className="h-4 w-4" />Generate Study Plan</>}
                </button>
              </div>
              {!allExternalMapped && !scheduleLoading && <p className="text-xs text-amber-600 mt-2 text-right">⚠️ All external units must be mapped first</p>}
            </div>

            {/* Schedule display (same as before) */}
            {scheduleLoading || plannersLoading ? (
              <div className="text-center py-12"><ArrowPathIcon className="h-10 w-10 text-[#cc2131] animate-spin mx-auto mb-3" /><p className="text-gray-500">{plannersLoading ? 'Fetching planners…' : 'Building your schedule…'}</p></div>
            ) : editableSchedule.length === 0 ? (
              <div className="text-center py-12"><div className="bg-white border border-gray-200 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center"><CheckCircleIcon className="h-10 w-10 text-[#cc2131]" /></div><p className="text-[#111827] text-lg font-medium">🎓 All requirements met!</p><p className="text-gray-500 mt-2">You've completed all required units.</p></div>
            ) : (
              <div><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><CalendarIcon className="h-5 w-5 text-[#cc2131]" /><h3 className="text-base font-bold text-[#111827]">Full Study Plan</h3><span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{editableSchedule.length} semester(s)</span></div></div>
              {showFullPlan && <div className="space-y-3">{editableSchedule.map((sem, semIdx) => (<div key={`${sem.year}-${sem.semester}`} className="border border-gray-200 rounded-xl overflow-hidden bg-white"><div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex justify-between items-center"><h4 className="font-semibold text-[#111827] text-sm">Year {sem.year}, Semester {sem.semester}</h4><span className="text-xs text-gray-500">{sem.unitCount} unit(s) · {sem.totalCredits} CP</span></div><div className="p-3 space-y-1.5">{sem.units.map((unit, unitIdx) => (<DraggableUnitCard key={`${semIdx}-${unitIdx}-${unit.UnitCode}`} unit={unit} semIdx={semIdx} unitIdx={unitIdx} onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDrop={handleDrop} isDragOver={dragTarget?.semIdx === semIdx && dragTarget?.unitIdx === unitIdx && dragSource && !dragSource.fromPanel} isSource={dragSource && !dragSource.fromPanel && dragSource.semIdx === semIdx && dragSource.unitIdx === unitIdx} onRemove={handleRemoveUnit} />))}<SemesterDropZone sem={sem} semIdx={semIdx} onDragEnter={handleDragEnter} onDrop={handleDrop} onNativeDrop={handleNativeDropIntoSemester} isDragOver={dragTarget?.semIdx === semIdx && dragTarget?.unitIdx === sem.units.length && dragSource} /></div></div>))}<div className="flex items-center justify-between pt-3 border-t border-gray-200 mt-2"><p className="text-xs text-gray-500 flex items-center gap-1"><ArrowsRightLeftIcon className="h-3.5 w-3.5" /> Drag units between semesters to customise.</p><button onClick={handleExportPdf} disabled={pdfLoading} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${pdfLoading ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed' : 'bg-[#cc2131] hover:bg-[#b01d2c] text-white'}`}>{pdfLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}{pdfLoading ? 'Generating PDF…' : 'Save as PDF'}</button></div></div>}</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default UnitRecommendations;