'use client';
import { useState, useEffect } from 'react';
import {
  LightBulbIcon,
  XMarkIcon,
  ClockIcon,
  SparklesIcon,
  CreditCardIcon,
  CheckCircleIcon,
  AcademicCapIcon,
  BookOpenIcon,
  ArrowPathIcon,
  CalendarIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';

const UnitRecommendations = ({
  isOpen,
  onClose,
  planner,
  completedUnits,
  studentInfo
}) => {
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fullSchedule, setFullSchedule] = useState([]);
  const [showFullPlan, setShowFullPlan] = useState(true);
  const [currentYear, setCurrentYear] = useState(1);
  const [currentSemester, setCurrentSemester] = useState(1);
  const [categoryWarning, setCategoryWarning] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  // Helper to map unit type ID to category name (based on your UnitType lookup)
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

  // Convert year/semester to linear order (1‑based)
  const getSemesterOrderValue = (year, semester) => (year - 1) * 2 + (semester === 1 ? 1 : 2);

  const orderToYearSemester = (order) => {
    const year = Math.floor((order - 1) / 2) + 1;
    const semester = (order - 1) % 2 === 0 ? 1 : 2;
    return { year, semester, order };
  };

  // --- Compute current year/semester from total credits ---
  useEffect(() => {
    if (!isOpen || !completedUnits) return;
    const totalCredits = completedUnits.reduce((sum, u) => sum + (u.creditPoints || 0), 0);
    let year = 1;
    if (totalCredits >= 200) year = 3;
    else if (totalCredits >= 100) year = 2;
    setCurrentYear(year);
    const currentMonth = new Date().getMonth();
    const semester = currentMonth < 6 ? 1 : 2;
    setCurrentSemester(semester);
  }, [isOpen, completedUnits]);

  useEffect(() => {
    if (isOpen && planner && completedUnits) {
      generateRecommendations();
    }
  }, [isOpen, planner, completedUnits, currentYear, currentSemester]);


  const extractUnitCode = (unitCodeStr) => {
    if (!unitCodeStr) return '';
    const match = unitCodeStr.match(/[A-Z]{3}\d{5}/i);
    return match ? match[0].toUpperCase() : unitCodeStr.split(' ')[0].toUpperCase();
  };

  // Determine unit category – from unit_type_id or unitType relation
  const getUnitCategory = (unit) => {
    let typeId = null;
    if (unit.unitTypeId !== undefined) typeId = unit.unitTypeId;
    else if (unit.unit_type_id !== undefined) typeId = unit.unit_type_id;
    else if (unit.unitType?.ID !== undefined) typeId = unit.unitType.ID;
    else if (unit.unitType?.id !== undefined) typeId = unit.unitType.id;
    return typeId !== null ? getUnitCategoryById(typeId) : 'elective';
  };

  const parsePrerequisites = (prereqString) => {
    if (!prereqString || prereqString === 'Nil' || prereqString === 'nil' || prereqString === 'NIL') {
      return { type: 'none', conditions: [] };
    }
    const creditMatch = prereqString.match(/^(\d+)cp$/i);
    if (creditMatch) {
      return { type: 'credit', conditions: [{ type: 'credit', value: parseInt(creditMatch[1]) }] };
    }
    if (prereqString.toLowerCase().includes('co-req')) {
      const unitMatch = prereqString.match(/[A-Z]{3}\d{5}/i);
      if (unitMatch) {
        return { type: 'coreq', conditions: [{ type: 'unit', code: unitMatch[0].toUpperCase() }] };
      }
    }
    if (prereqString.toLowerCase().includes('anti-req')) {
      return { type: 'anti', conditions: [] };
    }
    if (prereqString.includes('&')) {
      const parts = prereqString.split('&').map(p => p.trim());
      const conditions = [];
      for (const part of parts) {
        const unitMatch = part.match(/[A-Z]{3}\d{5}/i);
        const creditMatchPart = part.match(/(\d+)cp/i);
        if (unitMatch) conditions.push({ type: 'unit', code: unitMatch[0].toUpperCase() });
        else if (creditMatchPart) conditions.push({ type: 'credit', value: parseInt(creditMatchPart[1]) });
      }
      return { type: 'and', conditions };
    }
    if (prereqString.includes('/')) {
      const parts = prereqString.split('/').map(p => p.trim());
      const conditions = [];
      for (const part of parts) {
        const unitMatch = part.match(/[A-Z]{3}\d{5}/i);
        if (unitMatch) conditions.push({ type: 'unit', code: unitMatch[0].toUpperCase() });
      }
      return { type: 'or', conditions };
    }
    const unitMatch = prereqString.match(/[A-Z]{3}\d{5}/i);
    if (unitMatch) {
      return { type: 'unit', conditions: [{ type: 'unit', code: unitMatch[0].toUpperCase() }] };
    }
    return { type: 'unknown', conditions: [] };
  };

  const arePrerequisitesMet = (unit, completedUnitsMap, totalCredits) => {
    const prereqString = unit.Prerequisites;
    const parsed = parsePrerequisites(prereqString);
    if (parsed.type === 'none') return true;
    if (parsed.type === 'anti') return true;
    if (parsed.type === 'unknown') return false;
    if (parsed.type === 'credit') return totalCredits >= parsed.conditions[0].value;
    if (parsed.type === 'and') {
      for (const condition of parsed.conditions) {
        if (condition.type === 'unit') {
          if (!completedUnitsMap.has(condition.code) && !completedUnitsMap.has(condition.code.toUpperCase())) return false;
        } else if (condition.type === 'credit') {
          if (totalCredits < condition.value) return false;
        }
      }
      return true;
    }
    if (parsed.type === 'or') {
      for (const condition of parsed.conditions) {
        if (condition.type === 'unit') {
          if (completedUnitsMap.has(condition.code) || completedUnitsMap.has(condition.code.toUpperCase())) return true;
        }
      }
      return false;
    }
    if (parsed.type === 'unit') {
      const unitCode = parsed.conditions[0].code;
      return completedUnitsMap.has(unitCode) || completedUnitsMap.has(unitCode.toUpperCase());
    }
    if (parsed.type === 'coreq') {
      const unitCode = parsed.conditions[0].code;
      return completedUnitsMap.has(unitCode) || completedUnitsMap.has(unitCode.toUpperCase());
    }
    return false;
  };

  const isProjectACompleted = (completedUnitsMap) => completedUnitsMap.has('COS40005') || completedUnitsMap.has('COS40005'.toUpperCase());
  const isProjectBCompleted = (completedUnitsMap) => completedUnitsMap.has('COS40006') || completedUnitsMap.has('COS40006'.toUpperCase());
  const isWILCompleted = (completedUnitsMap) => completedUnitsMap.has('ICT20016') || completedUnitsMap.has('ICT20016'.toUpperCase());

  // ============================================================
  // AVAILABILITY & DISPLAY HELPERS
  // ============================================================

  const isAvailableInSemester = (unit, year, semester) => {
    const offeredIn = unit.OfferedIn || unit.offeredIn || '';
    const offeredLower = offeredIn.toLowerCase();
    if (!offeredLower) return true;
    if (offeredLower.includes('semester 1 only')) return semester === 1;
    if (offeredLower.includes('semester 2 only')) return semester === 2;
    if (offeredLower.includes('semester 1 & 2')) return true;
    return true;
  };

  const getSemesterDisplayName = (unit) => {
    const termId = unit.TermID || unit.termId || unit.semester || '';
    const termLower = termId.toLowerCase();
    const unitCode = unit.UnitCode || '';
    if (unitCode === 'COS40005') return 'Year 3, Semester 1 (Capstone Project A)';
    if (unitCode === 'COS40006') return 'Year 3, Semester 2 (Capstone Project B)';
    if (unitCode === 'ICT20016') return 'Work-Integrated Learning (WIL)';
    if (termLower.includes('year one') && termLower.includes('semester 1')) return 'Year 1, Semester 1';
    if (termLower.includes('winter') && termLower.includes('june')) return 'Winter Term (Year 1)';
    if (termLower.includes('year one') && termLower.includes('semester 2')) return 'Year 1, Semester 2';
    if (termLower.includes('year two') && termLower.includes('semester 1')) return 'Year 2, Semester 1';
    if (termLower.includes('year two') && termLower.includes('semester 2')) return 'Year 2, Semester 2';
    if (termLower.includes('summer') && termLower.includes('jan')) return 'Summer Term (Year 2)';
    if (termLower.includes('year three') && termLower.includes('semester 1')) return 'Year 3, Semester 1';
    if (termLower.includes('year three') && termLower.includes('semester 2')) return 'Year 3, Semester 2';
    return termId || 'Recommended';
  };

  // ============================================================
  // CONSTRAINT-BASED SCHEDULER
  // ============================================================

  const scheduleRemainingUnits = (
    missingUnits,
    completedUnitsMap,
    totalCredits,
    currentYear,
    currentSemester,
    totalUnitsCompleted,
    requiredCore, requiredElective, requiredMajor,
    completedCore, completedElective, completedMajor
  ) => {
    let remaining = [...missingUnits];
    const schedule = [];
    let current = { year: currentYear, semester: currentSemester };
    let plannedCompletedCodes = new Set(Array.from(completedUnitsMap.keys()));
    let plannedSemesters = [];
    let plannedCore = completedCore;
    let plannedElective = completedElective;
    let plannedMajor = completedMajor;
    let maxSemesters = 12;
    let semesterCounter = 0;

    const getPriorityBonus = (unit) => {
      const cat = getUnitCategory(unit);
      if (cat === 'core' && plannedCore < requiredCore) return 30;
      if (cat === 'elective' && plannedElective < requiredElective) return 30;
      if (cat === 'major' && plannedMajor < requiredMajor) return 30;
      return 0;
    };

    while (remaining.length > 0 && semesterCounter < maxSemesters) {
      const currentOrder = getSemesterOrderValue(current.year, current.semester);
      const available = [];

      for (const unit of remaining) {
        let prereqsMet = true;
        for (const prereq of (unit.prerequisites || [])) {
          if (plannedCompletedCodes.has(prereq)) continue;
          let foundInPrevious = false;
          for (const sem of plannedSemesters) {
            if (sem.order < currentOrder && sem.units.some(u => (u.UnitCode || u.code) === prereq)) {
              foundInPrevious = true;
              break;
            }
          }
          if (!foundInPrevious) { prereqsMet = false; break; }
        }
        if (!prereqsMet) continue;

        const unitCode = unit.UnitCode || '';
        if ((unitCode === 'COS40005' || unitCode === 'SWE40001') && !(current.year === 3 && current.semester === 1)) continue;
        if ((unitCode === 'COS40006' || unitCode === 'SWE40002') && !(current.year === 3 && current.semester === 2)) continue;
        if (unitCode === 'ICT20016' && !(current.year >= 2 && (current.year > 2 || current.semester >= 2) && totalUnitsCompleted >= 12)) continue;
        if (!isAvailableInSemester(unit, current.year, current.semester)) continue;

        available.push(unit);
      }

      available.sort((a, b) => {
        const aPri = getPriorityBonus(a);
        const bPri = getPriorityBonus(b);
        if (aPri !== bPri) return bPri - aPri;
        if (b.CreditPoints !== a.CreditPoints) return (b.CreditPoints || 0) - (a.CreditPoints || 0);
        return (a.prerequisites?.length || 0) - (b.prerequisites?.length || 0);
      });

      let semesterUnits = [];
      let semesterCredits = 0;
      const MAX_UNITS = 4;
      const MAX_CREDITS = 50;

      for (const unit of available) {
        const credits = unit.CreditPoints || 12.5;
        if (semesterUnits.length < MAX_UNITS && semesterCredits + credits <= MAX_CREDITS) {
          semesterUnits.push(unit);
          semesterCredits += credits;
          const cat = getUnitCategory(unit);
          if (cat === 'core') plannedCore++;
          else if (cat === 'elective') plannedElective++;
          else if (cat === 'major') plannedMajor++;
        }
      }

      if (semesterUnits.length > 0) {
        schedule.push({
          year: current.year,
          semester: current.semester,
          semesterName: `${current.year} Semester ${current.semester}`,
          units: semesterUnits,
          totalCredits: semesterCredits,
          unitCount: semesterUnits.length,
          order: currentOrder,
        });
        semesterUnits.forEach(unit => { const code = unit.UnitCode || unit.code; if (code) plannedCompletedCodes.add(code); });
        plannedSemesters.push({ order: currentOrder, units: semesterUnits });
        const scheduledIds = new Set(semesterUnits.map(u => u.ID));
        remaining = remaining.filter(u => !scheduledIds.has(u.ID));
      }

      const nextOrder = currentOrder + 1;
      const next = orderToYearSemester(nextOrder);
      current = { year: next.year, semester: next.semester };
      semesterCounter++;
    }

    return { schedule, remaining };
  };

  const isWILEligible = (totalUnitsCompleted, studentYear, studentSemester) => {
    const hasCompletedYear2Sem2 = (studentYear > 2) || (studentYear === 2 && studentSemester >= 2);
    return hasCompletedYear2Sem2 && totalUnitsCompleted >= 12;
  };

  // ============================================================
  // MAIN GENERATION (with type enrichment)
  // ============================================================

  const generateRecommendations = () => {
    setLoading(true);
    setCategoryWarning(null);
    try {
      const plannerUnits = planner?.totalUnits || [];
      if (!plannerUnits.length) { setLoading(false); return; }

      // Build set of planner unit codes (for missing units check)
      const plannerUnitCodes = new Set();
      plannerUnits.forEach(unit => {
        const code = extractUnitCode(unit.UnitCode);
        if (code) plannerUnitCodes.add(code);
      });

      // Include ALL completed units (no planner filter)
      const completedUnitsMap = new Map(); // key: unit code (uppercase)
      completedUnits.forEach(unit => {
        const codeUpper = unit.code?.toUpperCase();
        if (codeUpper) {
          completedUnitsMap.set(codeUpper, {
            id: unit.id,
            code: unit.code,
            name: unit.name,
            creditPoints: unit.creditPoints,
            prerequisites: unit.prerequisites,
            year: unit.year,
            termId: unit.termId,
            unitTypeId: unit.unitTypeId   // ← direct from API
          });
        }
      });

      // Count completed categories directly from completedUnits (not from planner)
      let completedCore = 0, completedElective = 0, completedMajor = 0;
      for (const unit of completedUnits) {
        const typeId = unit.unitTypeId;
        if (typeId !== undefined && typeId !== null) {
          const cat = getUnitCategoryById(typeId);
          if (cat === 'core') completedCore++;
          else if (cat === 'elective') completedElective++;
          else if (cat === 'major') completedMajor++;
          // MPU/WIL ignored
        }
      }

      const totalCredits = Array.from(completedUnitsMap.values()).reduce((sum, u) => sum + (u.creditPoints || 0), 0);
      const totalUnitsCompleted = completedUnitsMap.size;

      // Build prerequisite map (from planner units, unchanged)
      const prereqMap = new Map();
      for (const unit of plannerUnits) {
        const unitCode = extractUnitCode(unit.UnitCode);
        const prereqString = unit.Prerequisites || '';
        const parsed = parsePrerequisites(prereqString);
        let prereqCodes = [];
        if (parsed.type === 'unit' || parsed.type === 'and' || parsed.type === 'or') {
          prereqCodes = parsed.conditions.filter(c => c.type === 'unit').map(c => c.code);
        }
        prereqMap.set(unitCode, prereqCodes);
      }

      const unitsWithPrereqs = plannerUnits.map(unit => ({
        ...unit,
        prerequisites: prereqMap.get(extractUnitCode(unit.UnitCode)) || []
      }));

      // Missing units (those not in completedUnitsMap)
      const missingUnits = unitsWithPrereqs.filter(unit => {
        const code = extractUnitCode(unit.UnitCode);
        return !completedUnitsMap.has(code);
      });

      let missingCore = 0, missingElective = 0, missingMajor = 0;
      for (const unit of missingUnits) {
        const cat = getUnitCategory(unit);
        if (cat === 'core') missingCore++;
        else if (cat === 'elective') missingElective++;
        else if (cat === 'major') missingMajor++;
      }

      const requiredCore = 8, requiredElective = 8, requiredMajor = 8;
      const needCore = Math.max(0, requiredCore - completedCore);
      const needElective = Math.max(0, requiredElective - completedElective);
      const needMajor = Math.max(0, requiredMajor - completedMajor);

      if (missingCore < needCore) {
        setCategoryWarning(`⚠️ Planner has only ${missingCore} core unit(s) remaining, but you need ${needCore} more to meet the 8 core requirement.`);
      } else if (missingElective < needElective) {
        setCategoryWarning(`⚠️ Planner has only ${missingElective} elective unit(s) remaining, but you need ${needElective} more to meet the 8 elective requirement.`);
      } else if (missingMajor < needMajor) {
        setCategoryWarning(`⚠️ Planner has only ${missingMajor} major unit(s) remaining, but you need ${needMajor} more to meet the 8 major requirement.`);
      }

      const { schedule } = scheduleRemainingUnits(
        missingUnits,
        completedUnitsMap,
        totalCredits,
        currentYear,
        currentSemester,
        totalUnitsCompleted,
        requiredCore, requiredElective, requiredMajor,
        completedCore, completedElective, completedMajor
      );

      setFullSchedule(schedule);

      setRecommendations({
        totalPlannerUnits: plannerUnits.length,
        totalCompleted: totalUnitsCompleted,
        totalRemaining: missingUnits.length,
        totalCredits,
        plannerName: planner?.plannerName,
        completedPercent: (totalUnitsCompleted / plannerUnits.length) * 100,
        currentYear, currentSemester,
        creditsToGraduate: Math.max(0, 300 - totalCredits),
        unitsToGraduate: missingUnits.length,
        categoryRequirements: {
          core: { completed: completedCore, required: requiredCore, missing: needCore },
          elective: { completed: completedElective, required: requiredElective, missing: needElective },
          major: { completed: completedMajor, required: requiredMajor, missing: needMajor }
        },
        fullSchedule: schedule
      });
    } catch (error) {
      console.error('Error generating recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatSemesterTitle = (year, semester) => `Year ${year}, Semester ${semester}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* Modal Header */}
        <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-xl">
                <SparklesIcon className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Unit Recommendations</h2>
                <p className="text-emerald-100 text-sm">{recommendations?.plannerName}</p>
              </div>
            </div>
            <button onClick={onClose} className="bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6">

          {/* Student Progress Summary */}
          {studentInfo && recommendations && (
            <div className="bg-emerald-50 rounded-xl p-4 mb-6 border border-emerald-200">
              <div className="flex items-center gap-2 mb-3">
                <UserGroupIcon className="h-5 w-5 text-emerald-600" />
                <h3 className="font-semibold text-emerald-800">Student Progress</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div><span className="text-gray-500">Student ID:</span><p className="font-semibold">{studentInfo.studentId}</p></div>
                <div><span className="text-gray-500">Current Position:</span><p className="font-semibold text-blue-600">Year {recommendations.currentYear}, Semester {recommendations.currentSemester}</p></div>
                <div><span className="text-gray-500">Completed:</span><p className="font-semibold text-emerald-600">{recommendations.totalCompleted}/{recommendations.totalPlannerUnits} units</p></div>
                <div><span className="text-gray-500">Credits:</span><p className="font-semibold text-emerald-600">{recommendations.totalCredits}/300</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div className="bg-white rounded-lg p-2 text-center">
                  <span className="text-gray-500">Core Units</span>
                  <p className="font-semibold">{recommendations.categoryRequirements?.core.completed}/{recommendations.categoryRequirements?.core.required}</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <span className="text-gray-500">Elective Units</span>
                  <p className="font-semibold">{recommendations.categoryRequirements?.elective.completed}/{recommendations.categoryRequirements?.elective.required}</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <span className="text-gray-500">Major Units</span>
                  <p className="font-semibold">{recommendations.categoryRequirements?.major.completed}/{recommendations.categoryRequirements?.major.required}</p>
                </div>
              </div>
              {categoryWarning && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700">
                  {categoryWarning}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div className="bg-white rounded-lg p-2 text-center">
                  <span className="text-gray-500">Credits Left:</span>
                  <p className="font-bold text-orange-600 text-lg">{recommendations.creditsToGraduate}</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <span className="text-gray-500">Units Left:</span>
                  <p className="font-bold text-orange-600 text-lg">{recommendations.unitsToGraduate}</p>
                </div>
              </div>
              <div className="border-t border-emerald-200 pt-3">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progress</span>
                  <span>{recommendations.completedPercent?.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-emerald-200 rounded-full h-2">
                  <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${recommendations.completedPercent || 0}%` }}></div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <ArrowPathIcon className="h-10 w-10 text-emerald-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-500">Calculating fastest path...</p>
            </div>
          )}

          {/* Full Study Plan */}
          {!loading && fullSchedule.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-lg font-bold text-gray-800">📅 Full Study Plan (All Remaining Semesters)</h3>
                  <span className="text-xs text-gray-400">({fullSchedule.length} semester(s) until graduation)</span>
                </div>
                <button
                  onClick={() => setShowFullPlan(!showFullPlan)}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  {showFullPlan ? 'Collapse' : 'Expand'}
                  {showFullPlan ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                </button>
              </div>

              {showFullPlan && (
                <div className="space-y-6">
                  {fullSchedule.map((semester, semIdx) => (
                    <div key={semIdx} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
                        <div className="flex justify-between items-center">
                          <h4 className="font-semibold text-amber-800">
                            {formatSemesterTitle(semester.year, semester.semester)}
                          </h4>
                          <div className="text-right">
                            <p className="text-xs text-amber-600">
                              {semester.unitCount} unit(s) · {semester.totalCredits} credits
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-white space-y-3">
                        {semester.units.map((unit, uIdx) => {
                          const category = getUnitCategory(unit);
                          const categoryColor = category === 'core' ? 'text-blue-600' : category === 'elective' ? 'text-green-600' : 'text-purple-600';
                          const categoryBg = category === 'core' ? 'bg-blue-50' : category === 'elective' ? 'bg-green-50' : 'bg-purple-50';
                          return (
                            <div key={uIdx} className="flex justify-between items-center border-b border-gray-100 pb-3 last:border-0">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-mono font-semibold text-gray-800">{extractUnitCode(unit.UnitCode)}</p>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${categoryBg} ${categoryColor}`}>
                                    {category === 'core' ? 'Core' : category === 'elective' ? 'Elective' : 'Major'}
                                  </span>
                                </div>
                                {unit.Name && <p className="text-sm text-gray-600 mt-1">{unit.Name}</p>}
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-emerald-600">{unit.CreditPoints || 12.5} CP</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No Recommendations */}
          {!loading && recommendations && fullSchedule.length === 0 && (
            <div className="text-center py-12">
              <div className="bg-emerald-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <CheckCircleIcon className="h-10 w-10 text-emerald-600" />
              </div>
              <p className="text-gray-700 text-lg font-medium">🎓 Congratulations!</p>
              <p className="text-gray-500 mt-2">You have completed all units for this study planner!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnitRecommendations;