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
  REQUIRED_CORE,
  REQUIRED_MAJOR,
  REQUIRED_ELECTIVE,
  TOTAL_REQUIRED_UNITS,
  TOTAL_REQUIRED_CREDITS,
  DEFAULT_CREDIT_POINTS,
  MAX_UNITS_PER_SEMESTER,
  MAX_CREDITS_PER_SEMESTER,
  getRemainingRequirements,
  getNormalizedUnitCode,
  getUnitCategory,
  extractUnitCode,
  calculateCompletedCredits,
  parsePrerequisites,
  scheduleRemainingUnits,
  balanceSemesterLoads,
  optimizeFinalSemester,
  compactFinalSemesters,
} from './plannerHelpers';

// ─── Category selector used inside EquivalencyModal ───────────────────────────
// Replaces the window.prompt hack with a proper inline UI.
const CategorySelector = ({ unit, onConfirm, onCancel }) => {
  const [selected, setSelected] = useState('elective');
  const categories = [
    { key: 'core',     label: 'Core',     description: 'Required core unit' },
    { key: 'major',    label: 'Major',    description: 'Major specialisation unit' },
    { key: 'elective', label: 'Elective', description: 'Elective credit' },
    { key: 'wil',      label: 'WIL',      description: 'Work-integrated learning' },
  ];
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-sm font-semibold text-gray-800 mb-2">
        Map <span className="font-mono bg-gray-100 px-1 rounded">{unit?.UnitCode || unit?.code}</span> to which category?
      </p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {categories.map(c => (
          <button
            key={c.key}
            onClick={() => setSelected(c.key)}
            className={`text-left px-3 py-2 rounded-lg border text-sm transition-all
              ${selected === c.key
                ? 'border-[#cc2131] bg-[#cc2131]/5 text-[#cc2131] font-medium'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
          >
            <div className="font-medium">{c.label}</div>
            <div className="text-xs text-gray-400">{c.description}</div>
          </button>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={() => onConfirm(selected)}
          className="px-4 py-1.5 rounded-lg bg-[#cc2131] text-white text-sm font-medium hover:bg-[#b01d2c]"
        >
          Confirm mapping
        </button>
      </div>
    </div>
  );
};

const EquivalencyModal = ({ isOpen, onClose, oldUnit, intakeYear, currentSem, onReplace }) => {
  const [loading, setLoading]       = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [reasoning, setReasoning]   = useState(null);
  const [meta, setMeta]             = useState(null);
  const [noMatch, setNoMatch]       = useState(false);
  const [error, setError]           = useState(null);
  const [pendingUnit, setPendingUnit] = useState(null);

  useEffect(() => {
    if (!isOpen || !oldUnit?.code) return;
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setReasoning(null);
    setMeta(null);
    setNoMatch(false);
    setPendingUnit(null);

    fetch('/api/unit-rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missingUnit: {
          code:        oldUnit.code,
          name:        oldUnit.name || oldUnit.code,
          creditPoints: oldUnit.creditPoints ?? null,
        },
        intakeYear:  intakeYear ?? new Date().getFullYear() - 1,
        currentSem:  currentSem ?? null,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSuggestions(data.suggestions || []);
          setReasoning(data.reasoning || null);
          setMeta(data.meta || null);
          setNoMatch(data.noMatchFound ?? (data.suggestions?.length === 0));
        } else {
          setError(data.message || 'Failed to get suggestions from AI.');
        }
      })
      .catch(err => setError(`Network error: ${err.message}`))
      .finally(() => setLoading(false));
  }, [isOpen, oldUnit, intakeYear, currentSem]);

  const handleRetry = () => {
    if (!oldUnit?.code) return;
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setNoMatch(false);
    setPendingUnit(null);

    fetch('/api/unit-rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missingUnit: { code: oldUnit.code, name: oldUnit.name || oldUnit.code, creditPoints: oldUnit.creditPoints ?? null },
        intakeYear:  intakeYear ?? new Date().getFullYear() - 1,
        currentSem:  currentSem ?? null,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSuggestions(data.suggestions || []);
          setReasoning(data.reasoning || null);
          setMeta(data.meta || null);
          setNoMatch(data.noMatchFound ?? (data.suggestions?.length === 0));
        } else {
          setError(data.message || 'Failed to get suggestions from AI.');
        }
      })
      .catch(err => setError(`Network error: ${err.message}`))
      .finally(() => setLoading(false));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Find equivalent for{' '}
              <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[#cc2131]">
                {oldUnit?.code}
              </code>
            </h2>
            {oldUnit?.name && oldUnit.name !== oldUnit.code && (
              <p className="text-xs text-gray-500 mt-0.5">{oldUnit.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Dynamic badge showing actual model used */}
            {meta?.model === 'similarity-only' ? (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium" title="Falling back to text similarity">
                ⚠️ Similarity only
              </span>
            ) : meta?.model ? (
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                ✅ AI · {meta.model}
              </span>
            ) : (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                RAG · llama3 · grounded
              </span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none transition-colors">
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Loading with better messaging */}
          {loading && (
            <div className="flex items-center gap-3 text-gray-600">
              <svg className="w-5 h-5 animate-spin text-[#cc2131] flex-shrink-0" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <div>
                <p className="text-sm font-medium">Searching database for equivalent units…</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {meta?.model === 'similarity-only' ? 'Using similarity scoring' : 'Querying AI (llama3) — may take up to 60s'}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
              <button
                onClick={handleRetry}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* No match */}
          {!loading && !error && noMatch && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
              No close equivalent was found in the current unit database for{' '}
              <code className="font-mono font-semibold">{oldUnit?.code}</code>.
              <br />
              <span className="text-xs mt-1 block">The student may need to consult their program coordinator.</span>
            </div>
          )}

          {/* Advisor reasoning – with colour based on source */}
          {!loading && !error && reasoning && (
            <div className={`p-3 rounded-lg ${
              meta?.model === 'similarity-only'
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-emerald-50 border border-emerald-200'
            }`}>
              <p className="text-xs font-semibold text-amber-700 mb-1 uppercase tracking-wide">Advisor note</p>
              <p className="text-sm text-gray-700 leading-relaxed">{reasoning}</p>
            </div>
          )}

          {/* Suggestion cards (unchanged) */}
          {!loading && !error && suggestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {suggestions.length} suggested equivalent{suggestions.length > 1 ? 's' : ''} — sourced from live database
              </p>

              {suggestions.map((sug, idx) => {
                const isBest    = idx === 0;
                const isPending = pendingUnit?.code === sug.code;

                return (
                  <div
                    key={sug.code}
                    className={`border rounded-xl p-4 transition-all
                      ${isBest ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">
                            {sug.code}
                          </code>
                          <span className="text-sm font-medium text-gray-900">{sug.name}</span>
                          {isBest && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                              Best match
                            </span>
                          )}
                        </div>
                        {sug.creditPoints && (
                          <p className="text-xs text-gray-400 mt-0.5">{sug.creditPoints} credit points</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-center">
                        <div className={`text-sm font-bold rounded-lg px-2 py-1 min-w-[44px]
                          ${(sug.matchScore ?? 0) >= 80 ? 'bg-emerald-100 text-emerald-700' :
                            (sug.matchScore ?? 0) >= 60 ? 'bg-amber-100 text-amber-700' :
                                                          'bg-gray-100 text-gray-600'}`}>
                          {sug.matchScore ?? '—'}%
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">match</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed italic bg-gray-50 px-3 py-2 rounded-lg">
                      {sug.reason}
                    </p>
                    {sug.caveats && (
                      <div className="mt-2 flex items-start gap-1.5">
                        <ExclamationTriangleIcon className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700">{sug.caveats}</p>
                      </div>
                    )}
                    {!isPending ? (
                      <button
                        onClick={() => setPendingUnit(sug)}
                        className="mt-3 px-3 py-1.5 rounded-lg bg-[#cc2131] text-white text-xs font-medium hover:bg-[#b01d2c] transition-colors"
                      >
                        Use this unit
                      </button>
                    ) : (
                      <CategorySelector
                        unit={sug}
                        onConfirm={(category) => {
                          onReplace(
                            {
                              UnitCode:     sug.code,
                              Name:         sug.name,
                              CreditPoints: sug.creditPoints ?? DEFAULT_CREDIT_POINTS,
                            },
                            category
                          );
                          setPendingUnit(null);
                        }}
                        onCancel={() => setPendingUnit(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — meta info + close */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          {meta ? (
            <p className="text-xs text-gray-400">
              Scanned {meta.totalUnitsScanned ?? '?'} units · retrieved {meta.candidatesRetrieved ?? '?'} candidates · model: {meta.model ?? 'llama3'}
              {meta.elapsedMs && ` · ${meta.elapsedMs}ms`}
            </p>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
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
  const [mappedExternalUnits, setMappedExternalUnits] = useState({ core: [], major: [], elective: [], wil: [] });
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

  // Derive intake year from studentInfo (e.g. studentInfo.intakeYear or studentInfo.year)
  // Falls back to currentYear - 1 so the RAG prompt has a sensible value.
  const intakeYear = studentInfo?.intakeYear
    ?? studentInfo?.intake_year
    ?? (new Date().getFullYear() - 1);

  // Current semester string e.g. "2025 Sem 1"
  const currentSem = (() => {
    const now = new Date();
    return `${now.getFullYear()} Sem ${now.getMonth() < 6 ? 1 : 2}`;
  })();

  // ======================== HELPER FUNCTIONS ========================

  const computePlannerScores = useCallback((planners, completedUnits) => {
    if (!planners.length || !completedUnits.length) return [];
    const completedCodes = new Set(completedUnits.map(u => u.code?.toUpperCase()).filter(Boolean));
    return planners.map(planner => {
      const plannerCodes = new Set((planner.units || []).map(u => extractUnitCode(u.UnitCode).toUpperCase()));
      const matched = [...completedCodes].filter(code => plannerCodes.has(code)).length;
      return { ...planner, matchedUnits: matched, totalCompleted: completedCodes.size };
    }).sort((a, b) => b.matchedUnits - a.matchedUnits);
  }, []);

  const scorePlannerByCompletedUnits = useCallback((planner, completedUnits) => {
    const plannerUnitCodes = new Set((planner.units || []).map(u => extractUnitCode(u.UnitCode).toUpperCase()));
    return (completedUnits || []).filter(u => plannerUnitCodes.has(u.code?.toUpperCase())).length;
  }, []);

  // ======================== GENERATE SCHEDULE ========================
  const generateScheduleForPlanner = useCallback((planner) => {
    if (!planner) return;
    setScheduleLoading(true);
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
      let physicalCompletedCount = 0;
      const uncounted = [];
      (completedUnits || []).forEach(u => {
        const code = u.code?.toUpperCase();
        physicalCompletedCount++;
        if (code === 'ICT20016') { completedElective += 2; return; }
        if (plannerUnitTypeMap.has(code) || plannerUnitTypeMap.has(getNormalizedUnitCode(code))) {
          const actualCode = plannerUnitTypeMap.has(code) ? code : getNormalizedUnitCode(code);
          const cat = plannerUnitTypeMap.get(actualCode);
          if (cat === 'core') completedCore++;
          else if (cat === 'elective') completedElective++;
          else if (cat === 'major') completedMajor++;
          else uncounted.push({ code, name: u.name || u.unitName || '' });
        } else {
          uncounted.push({ code, name: u.name || u.unitName || '' });
        }
      });
      setUnrecognisedUnits(uncounted);

      const totalCredits = calculateCompletedCredits(completedCore, completedElective, completedMajor);

      const prereqMap = new Map();
      plannerUnits.forEach(u => {
        const code = extractUnitCode(u.UnitCode);
        const parsed = parsePrerequisites(u.Prerequisites || '');
        prereqMap.set(code, ['unit', 'and', 'or'].includes(parsed.type) ? parsed.conditions.filter(c => c.type === 'unit').map(c => c.code) : []);
      });
      const unitsWithPrereqs = plannerUnits.map(u => {
        const code = extractUnitCode(u.UnitCode);
        let prereqCodes = prereqMap.get(code) || [];
        if (code === 'COS40006' || code === 'SWE40002') {
          const fypANorm = getNormalizedUnitCode('SWE40001');
          if (!prereqCodes.includes(fypANorm) && !prereqCodes.includes('COS40005')) prereqCodes.push(fypANorm);
        }
        return { ...u, prerequisites: prereqCodes };
      });

      const allMissingUnits = unitsWithPrereqs.filter(u => {
        const code = extractUnitCode(u.UnitCode);
        return !completedUnitsMap.has(code) && !completedUnitsMap.has(getNormalizedUnitCode(code));
      });

      const { needCore, needMajor, needElective } = getRemainingRequirements(completedCore, completedMajor, completedElective);

      let missingUnits = [];
      let coreAdded = 0, majorAdded = 0, electiveAdded = 0;
      for (const u of allMissingUnits) {
        const cat = getUnitCategory(u);
        if (cat === 'core' && coreAdded < needCore) { missingUnits.push(u); coreAdded++; }
        else if (cat === 'major' && majorAdded < needMajor) { missingUnits.push(u); majorAdded++; }
        else if (cat === 'elective' && electiveAdded < needElective) { missingUnits.push(u); electiveAdded++; }
      }

      let { schedule } = scheduleRemainingUnits(
        missingUnits, completedUnitsMap, totalCredits,
        currentYear, currentSemester, physicalCompletedCount,
        needCore, needMajor, needElective
      );
      schedule = compactFinalSemesters(schedule, completedUnitsMap);
      schedule = balanceSemesterLoads(schedule, completedUnitsMap);
      schedule = optimizeFinalSemester(schedule);
      setEditableSchedule(schedule);
      setRecommendations({
        totalCompleted: completedCore + completedElective + completedMajor,
        totalCredits,
        plannerName: planner.name,
        completedPercent: ((completedCore + completedElective + completedMajor) / TOTAL_REQUIRED_UNITS) * 100,
        currentYear, currentSemester,
        creditsToGraduate: Math.max(0, TOTAL_REQUIRED_CREDITS - totalCredits),
        unitsToGraduate: needCore + needMajor + needElective,
        categoryRequirements: {
          core:     { completed: completedCore,    required: REQUIRED_CORE,     missing: needCore },
          major:    { completed: completedMajor,   required: REQUIRED_MAJOR,    missing: needMajor },
          elective: { completed: completedElective, required: REQUIRED_ELECTIVE, missing: needElective },
        },
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
      const plannerUnitTypeMap = new Map();
      plannerUnits.forEach(u => plannerUnitTypeMap.set(extractUnitCode(u.UnitCode), getUnitCategory(u)));

      const completedUnitsMap = new Map();
      (completedUnits || []).forEach(u => {
        const code = u.code?.toUpperCase();
        if (code) { completedUnitsMap.set(code, u); completedUnitsMap.set(getNormalizedUnitCode(code), u); }
      });

      const addMappedToMap = (arr) => arr.forEach(extUnit => {
        const code = extUnit.code?.toUpperCase();
        if (code) { completedUnitsMap.set(code, extUnit); completedUnitsMap.set(getNormalizedUnitCode(code), extUnit); }
      });
      addMappedToMap(mappedExternalUnits.core);
      addMappedToMap(mappedExternalUnits.major);
      addMappedToMap(mappedExternalUnits.elective);
      addMappedToMap(mappedExternalUnits.wil);

      let completedCore = 0, completedElective = 0, completedMajor = 0;
      let physicalCompletedCount = (completedUnits || []).length;
      (completedUnits || []).forEach(u => {
        const code = u.code?.toUpperCase();
        if (code === 'ICT20016') { completedElective += 2; return; }
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
      let mappedElectiveCount = 0;
      mappedExternalUnits.elective.forEach(() => mappedElectiveCount++);
      mappedExternalUnits.wil.forEach(u => {
        if (u.code?.toUpperCase() === 'ICT20016' || u.doubleCount) mappedElectiveCount += 2;
        else mappedElectiveCount++;
      });
      completedElective += mappedElectiveCount;

      const totalCredits = calculateCompletedCredits(completedCore, completedElective, completedMajor);

      const prereqMap = new Map();
      plannerUnits.forEach(u => {
        const code = extractUnitCode(u.UnitCode);
        const parsed = parsePrerequisites(u.Prerequisites || '');
        prereqMap.set(code, ['unit', 'and', 'or'].includes(parsed.type) ? parsed.conditions.filter(c => c.type === 'unit').map(c => c.code) : []);
      });
      const unitsWithPrereqs = plannerUnits.map(u => ({ ...u, prerequisites: prereqMap.get(extractUnitCode(u.UnitCode)) || [] }));

      const allMissingUnits = unitsWithPrereqs.filter(u => {
        const code = extractUnitCode(u.UnitCode);
        return !completedUnitsMap.has(code) && !completedUnitsMap.has(getNormalizedUnitCode(code));
      });

      const { needCore, needMajor, needElective } = getRemainingRequirements(completedCore, completedMajor, completedElective);

      let missingUnits = [];
      let coreAdded = 0, majorAdded = 0, electiveAdded = 0;
      for (const u of allMissingUnits) {
        const cat = getUnitCategory(u);
        if (cat === 'core' && coreAdded < needCore) { missingUnits.push(u); coreAdded++; }
        else if (cat === 'major' && majorAdded < needMajor) { missingUnits.push(u); majorAdded++; }
        else if (cat === 'elective' && electiveAdded < needElective) { missingUnits.push(u); electiveAdded++; }
      }

      let { schedule } = scheduleRemainingUnits(
        missingUnits, completedUnitsMap, totalCredits,
        currentYear, currentSemester, physicalCompletedCount,
        needCore, needMajor, needElective
      );
      schedule = compactFinalSemesters(schedule, completedUnitsMap);
      schedule = balanceSemesterLoads(schedule, completedUnitsMap);
      schedule = optimizeFinalSemester(schedule);
      setEditableSchedule(schedule);
      setRecommendations(prev => ({
        ...prev,
        totalCompleted: completedCore + completedElective + completedMajor,
        totalCredits,
        completedPercent: ((completedCore + completedElective + completedMajor) / TOTAL_REQUIRED_UNITS) * 100,
        creditsToGraduate: Math.max(0, TOTAL_REQUIRED_CREDITS - totalCredits),
        unitsToGraduate: needCore + needMajor + needElective,
        categoryRequirements: {
          core:     { completed: completedCore,    required: REQUIRED_CORE,     missing: needCore },
          major:    { completed: completedMajor,   required: REQUIRED_MAJOR,    missing: needMajor },
          elective: { completed: completedElective, required: REQUIRED_ELECTIVE, missing: needElective },
        },
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
    scheduledCodeSet.add(code); scheduledCodeSet.add(getNormalizedUnitCode(code));
  });

  // Helper to add a unit to a category array, preventing duplicates by code (case‑insensitive)
  const addUnique = (arr, unit, existingCodesSet) => {
    const code = (unit.UnitCode || unit.code || '').toUpperCase();
    if (!existingCodesSet.has(code)) {
      existingCodesSet.add(code);
      arr.push(unit);
    } else {
      console.warn(`Duplicate unit code ${code} skipped in panel`);
    }
    return arr;
  };

  const core = [], major = [], elective = [], wil = [];
  const coreCodes = new Set(), majorCodes = new Set(), electiveCodes = new Set(), wilCodes = new Set();

  // Add planner units first
  plannerUnits.forEach(unit => {
    const code = extractUnitCode(unit.UnitCode);
    let status = 'pending';
    if (completedCodeSet.has(code) || completedCodeSet.has(getNormalizedUnitCode(code))) status = 'completed';
    else if (scheduledCodeSet.has(code) || scheduledCodeSet.has(getNormalizedUnitCode(code))) status = 'scheduled';

    const cat = getUnitCategory(unit);
    const item = { ...unit, status, isMappedExternal: false, originalCategory: cat };

    if (cat === 'core') addUnique(core, item, coreCodes);
    else if (cat === 'major') addUnique(major, item, majorCodes);
    else if (cat === 'elective') addUnique(elective, item, electiveCodes);
    else if (cat === 'wil') addUnique(wil, item, wilCodes);
  });

  // Helper to add mapped external units
  const addMapped = (arr, mapArray, category, codesSet) => {
    mapArray.forEach(extUnit => {
      const item = {
        ...extUnit, status: 'pending', isMappedExternal: true, originalCategory: category,
        CreditPoints: extUnit.creditPoints || DEFAULT_CREDIT_POINTS,
        Name: extUnit.name, UnitCode: extUnit.code, doubleCount: extUnit.doubleCount,
      };
      addUnique(arr, item, codesSet);
    });
  };

  addMapped(core, mappedExternalUnits.core, 'core', coreCodes);
  addMapped(major, mappedExternalUnits.major, 'major', majorCodes);
  addMapped(elective, mappedExternalUnits.elective, 'elective', electiveCodes);
  addMapped(wil, mappedExternalUnits.wil, 'wil', wilCodes);

  return { core, major, elective, wil };
}, [selectedFieldPlanner, completedUnits, editableSchedule, mappedExternalUnits]);

  // Drag handlers
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
      const srcSemIdx = dragSource.semIdx, srcUnitIdx = dragSource.unitIdx;
      const dstSemIdx = target.semIdx,   dstUnitIdx = target.unitIdx;
      if (srcSemIdx === undefined || dstSemIdx === undefined) return;
      const srcSem = newSchedule[srcSemIdx], dstSem = newSchedule[dstSemIdx];
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
        s.totalCredits = s.units.reduce((acc, u) => acc + (u.CreditPoints || DEFAULT_CREDIT_POINTS), 0);
      });
      setEditableSchedule(newSchedule.filter(s => s.units.length > 0));
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

  const handleMapExternalToCategory = useCallback((category, externalUnit) => {
    let unitToAdd = { ...externalUnit };
    if (category === 'wil' && externalUnit.code?.toUpperCase() === 'ICT20016') {
      unitToAdd.doubleCount = true;
      unitToAdd.creditPoints = (externalUnit.creditPoints || DEFAULT_CREDIT_POINTS) * 2;
    }
    setUnrecognisedUnits(prev => prev.filter(u => u.code !== externalUnit.code));
    setMappedExternalUnits(prev => ({ ...prev, [category]: [...prev[category], unitToAdd] }));
  }, []);

  const handleRemoveMappedUnit = useCallback((category, unitToRemove) => {
    setUnrecognisedUnits(prev => {
      const alreadyExists = prev.some(u => u.code === unitToRemove.code);
      return alreadyExists ? prev : [...prev, unitToRemove];
    });
    setMappedExternalUnits(prev => ({ ...prev, [category]: prev[category].filter(u => u.code !== unitToRemove.code) }));
  }, []);

  const handleRemoveUnit = useCallback((semIdx, unitIdx) => {
    const newSchedule = editableSchedule.map(s => ({ ...s, units: [...s.units] }));
    newSchedule[semIdx].units.splice(unitIdx, 1);
    newSchedule[semIdx].unitCount = newSchedule[semIdx].units.length;
    newSchedule[semIdx].totalCredits = newSchedule[semIdx].units.reduce((s, u) => s + (u.CreditPoints || DEFAULT_CREDIT_POINTS), 0);
    setEditableSchedule(newSchedule.filter(s => s.units.length > 0));
  }, [editableSchedule]);

  /**
   * Called by EquivalencyModal when lecturer clicks "Confirm mapping".
   * Receives the DB unit shape from /api/unit-rag and the chosen category.
   * Converts to the externalUnit shape and delegates to handleMapExternalToCategory.
   */
  const handleReplaceUnrecognisedUnit = useCallback((dbUnit, category) => {
    const externalUnit = {
      code:         dbUnit.UnitCode,
      name:         dbUnit.Name,
      creditPoints: dbUnit.CreditPoints || DEFAULT_CREDIT_POINTS,
      originalCode: equivModal.unit?.code, // track which code was replaced
    };
    handleMapExternalToCategory(category, externalUnit);
    setEquivModal({ open: false, unit: null });
  }, [handleMapExternalToCategory, equivModal.unit]);

  // ======================== useEffect HOOKS ========================

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

  useEffect(() => {
    if (!selectedFieldPlanner || !completedUnits || !recommendations) return;
    const plannerUnits = selectedFieldPlanner.units || [];
    const plannerUnitTypeMap = new Map();
    plannerUnits.forEach(u => plannerUnitTypeMap.set(extractUnitCode(u.UnitCode), getUnitCategory(u)));
    let completedCore = 0, completedElective = 0, completedMajor = 0;
    (completedUnits || []).forEach(u => {
      const code = u.code?.toUpperCase();
      if (code === 'ICT20016') { completedElective += 2; return; }
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
    let mappedElectiveCount = 0;
    mappedExternalUnits.elective.forEach(() => mappedElectiveCount++);
    mappedExternalUnits.wil.forEach(u => {
      if (u.code?.toUpperCase() === 'ICT20016' || u.doubleCount) mappedElectiveCount += 2;
      else mappedElectiveCount++;
    });
    completedElective += mappedElectiveCount;
    const totalCredits = calculateCompletedCredits(completedCore, completedElective, completedMajor);
    const { needCore, needMajor, needElective } = getRemainingRequirements(completedCore, completedMajor, completedElective);
    setRecommendations(prev => ({
      ...prev,
      totalCompleted: completedCore + completedElective + completedMajor,
      totalCredits,
      completedPercent: ((completedCore + completedElective + completedMajor) / TOTAL_REQUIRED_UNITS) * 100,
      categoryRequirements: {
        core:     { completed: completedCore,    required: REQUIRED_CORE,     missing: needCore },
        major:    { completed: completedMajor,   required: REQUIRED_MAJOR,    missing: needMajor },
        elective: { completed: completedElective, required: REQUIRED_ELECTIVE, missing: needElective },
      },
    }));
  }, [mappedExternalUnits, selectedFieldPlanner, completedUnits]);

  if (!isOpen) return null;

  const { core: coreUnits, major: majorUnits, elective: electiveUnits, wil: wilUnits } = getPlannerUnitsWithStatus();
  const allExternalMapped = unrecognisedUnits.length === 0;

  return (
    <>
      <UnitPoolToolbox isOpen={showToolbox} onClose={() => setShowToolbox(false)} />

      {/* ── Equivalency Modal: now wired to /api/unit-rag ── */}
      <EquivalencyModal
        isOpen={equivModal.open}
        onClose={() => setEquivModal({ open: false, unit: null })}
        oldUnit={equivModal.unit}
        intakeYear={intakeYear}
        currentSem={currentSem}
        onReplace={handleReplaceUnrecognisedUnit}
      />

      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full h-full flex flex-col overflow-hidden mt-16"
          style={{ maxWidth: '1600px', maxHeight: '95vh' }}
          onClick={e => e.stopPropagation()}
          onDragEnd={() => { setDragSource(null); setDragTarget(null); setDragOverPanel(null); }}
        >
          {/* Top bar */}
          <div className="bg-white border-b border-gray-200 p-4 rounded-t-2xl flex-shrink-0">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-3">
                <div className="border border-[#cc2131]/30 text-[#cc2131] bg-[#cc2131]/5 p-2 rounded-xl">
                  <CalendarIcon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#111827]">Study Planner</h2>
                  <p className="text-gray-500 text-xs">
                    {plannersLoading ? 'Loading planners…' : `${allPlanners.length} planner(s) available`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowToolbox(v => !v)}
                  title="Toggle Unit Toolbox"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
                    ${showToolbox
                      ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5'
                      : 'border-gray-300 text-gray-600 bg-white hover:border-[#cc2131] hover:text-[#cc2131]'}`}
                >
                  <WrenchScrewdriverIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Unit Toolbox</span>
                </button>
                <button onClick={onClose} className="border border-gray-300 hover:border-[#cc2131] hover:text-[#cc2131] rounded-full p-2 transition-all">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-5 bg-gray-50/40">
            {plannersError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm flex items-center gap-2">
                <ExclamationTriangleIcon className="h-4 w-4" />
                {plannersError}
              </div>
            )}

            <GraduationDashboard
              recommendations={recommendations}
              studentInfo={studentInfo}
              completedUnits={completedUnits}
              editableSchedule={editableSchedule}
            />

            {/* Top 5 planners */}
            {topPlanners.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top matching planners</span>
                  <span className="text-xs text-gray-400">Match score (completed units)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {topPlanners.map(planner => (
                    <button
                      key={planner.id}
                      onClick={() => {
                        setSelectedFieldPlanner(planner);
                        setManualPlannerId('');
                        setRecommendations(null);
                        generateScheduleForPlanner(planner);
                      }}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all
                        ${selectedFieldPlanner?.id === planner.id
                          ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5'
                          : 'border-gray-300 text-gray-600 bg-white hover:border-[#cc2131] hover:text-[#cc2131]'}`}
                    >
                      {planner.name} ({planner.matchedUnits}/{completedUnits?.length || 0})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Planner dropdown */}
            {allPlannersWithScores.length > 0 && (
              <div className="mb-4 flex items-center gap-3">
                <span className="text-xs text-gray-500">Or select any planner:</span>
                <select
                  value={manualPlannerId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setManualPlannerId(id);
                    if (id) {
                      const selected = allPlannersWithScores.find(p => p.id === parseInt(id));
                      if (selected) {
                        setSelectedFieldPlanner(selected);
                        setRecommendations(null);
                        generateScheduleForPlanner(selected);
                      }
                    }
                  }}
                  className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-[#cc2131]/30"
                >
                  <option value="">-- Choose a planner --</option>
                  {allPlannersWithScores.map(planner => (
                    <option key={planner.id} value={planner.id}>
                      {planner.name} (matched: {planner.matchedUnits}/{completedUnits?.length || 0})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Category panels */}
            {selectedFieldPlanner && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  { key: 'core',     units: coreUnits },
                  { key: 'major',    units: majorUnits },
                  { key: 'elective', units: electiveUnits },
                  { key: 'wil',      units: wilUnits },
                ].map(({ key, units }) => (
                  <div
                    key={key}
                    className={`bg-white rounded-xl border-2 border-red-500 p-3 flex flex-col transition-all
                      ${dragOverPanel === key ? 'ring-2 ring-red-500 bg-red-50/30' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOverPanel(key); }}
                    onDragLeave={() => setDragOverPanel(null)}
                    onDrop={() => { handleDropOnPanel(key); setDragOverPanel(null); }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-800 text-sm capitalize">{key}</h4>
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{units.length} units</span>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1 flex-1">
                      {units.map((unit, idx) => (
                        <PanelUnitCard
                          key={`${key}-${idx}-${unit.UnitCode || unit.code}`}
                          unit={unit}
                          status={unit.status}
                          category={key}
                          onDragStart={handleDragStart}
                          isDragging={dragSource?.fromPanel && extractUnitCode(dragSource.unit?.UnitCode) === extractUnitCode(unit.UnitCode)}
                          onRemove={unit.isMappedExternal ? (u) => handleRemoveMappedUnit(key, u) : null}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Unrecognised units — with "Find equivalent" button */}
            <div className="mb-4 bg-white rounded-xl border border-gray-200 p-3">
              <h4 className="font-semibold text-[#111827] text-sm mb-2 flex items-center gap-1">
                Student's completed units not recognised in planner
                <span className="text-xs font-normal text-gray-500 ml-auto">{unrecognisedUnits.length} units</span>
              </h4>

              {unrecognisedUnits.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {unrecognisedUnits.map((unit, idx) => (
                    <div key={`ext-${idx}`} className="relative">
                      <ExternalUnitCard unit={unit} onMapToCategory={handleMapExternalToCategory} />
                      {/* "Find equivalent" button → opens EquivalencyModal for this unit */}
                      <button
                        onClick={() => setEquivModal({ open: true, unit })}
                        title="Find equivalent unit using AI"
                        className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-xs font-medium"
                      >
                        <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                        Find equivalent
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 text-center py-2">All external units have been mapped.</p>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => { regenerateFromMapped(); setShowFullPlan(true); }}
                  disabled={!allExternalMapped || scheduleLoading}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border
                    ${allExternalMapped && !scheduleLoading
                      ? 'border-[#cc2131] text-[#cc2131] bg-white hover:bg-[#cc2131]/5'
                      : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'}`}
                >
                  {scheduleLoading ? (
                    <><ArrowPathIcon className="h-4 w-4 animate-spin" />Generating...</>
                  ) : (
                    <><ArrowPathIcon className="h-4 w-4" />Generate Study Plan</>
                  )}
                </button>
              </div>
              {!allExternalMapped && !scheduleLoading && (
                <p className="text-xs text-amber-600 mt-2 text-right">
                  ⚠️ All external units must be mapped first
                </p>
              )}
            </div>

            {/* Schedule */}
            {scheduleLoading || plannersLoading ? (
              <div className="text-center py-12">
                <ArrowPathIcon className="h-10 w-10 text-[#cc2131] animate-spin mx-auto mb-3" />
                <p className="text-gray-500">{plannersLoading ? 'Fetching planners…' : 'Building your schedule…'}</p>
              </div>
            ) : editableSchedule.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-white border border-gray-200 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <CheckCircleIcon className="h-10 w-10 text-[#cc2131]" />
                </div>
                <p className="text-[#111827] text-lg font-medium">🎓 All requirements met!</p>
                <p className="text-gray-500 mt-2">You've completed all required units.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-[#cc2131]" />
                    <h3 className="text-base font-bold text-[#111827]">Full Study Plan</h3>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{editableSchedule.length} semester(s)</span>
                  </div>
                </div>
                {showFullPlan && (
                  <div className="space-y-3">
                    {editableSchedule.map((sem, semIdx) => (
                      <div key={`${sem.year}-${sem.semester}`} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                        <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
                          <h4 className="font-semibold text-[#111827] text-sm">Year {sem.year}, Semester {sem.semester}</h4>
                          <span className="text-xs text-gray-500">{sem.unitCount} unit(s) · {sem.totalCredits} CP</span>
                        </div>
                        <div className="p-3 space-y-1.5">
                          {sem.units.map((unit, unitIdx) => (
                            <DraggableUnitCard
                              key={`${semIdx}-${unitIdx}-${unit.UnitCode}`}
                              unit={unit} semIdx={semIdx} unitIdx={unitIdx}
                              onDragStart={handleDragStart}
                              onDragEnter={handleDragEnter}
                              onDrop={handleDrop}
                              isDragOver={dragTarget?.semIdx === semIdx && dragTarget?.unitIdx === unitIdx && dragSource && !dragSource.fromPanel}
                              isSource={dragSource && !dragSource.fromPanel && dragSource.semIdx === semIdx && dragSource.unitIdx === unitIdx}
                              onRemove={handleRemoveUnit}
                            />
                          ))}
                          <SemesterDropZone
                            sem={sem} semIdx={semIdx}
                            onDragEnter={handleDragEnter}
                            onDrop={handleDrop}
                            onNativeDrop={handleNativeDropIntoSemester}
                            isDragOver={dragTarget?.semIdx === semIdx && dragTarget?.unitIdx === sem.units.length && dragSource}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 mt-2">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <ArrowsRightLeftIcon className="h-3.5 w-3.5" /> Drag units between semesters to customise.
                      </p>
                      <button
                        onClick={handleExportPdf}
                        disabled={pdfLoading}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                          ${pdfLoading ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed' : 'bg-[#cc2131] hover:bg-[#b01d2c] text-white'}`}
                      >
                        {pdfLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                        {pdfLoading ? 'Generating PDF…' : 'Save as PDF'}
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