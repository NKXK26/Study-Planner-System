'use client';
import { useState, useEffect } from 'react';
import {
  XMarkIcon,
  SparklesIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  CalendarIcon,
  UserGroupIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// ─────────────────────────────────────────────
// RAG HELPERS
// ─────────────────────────────────────────────

function buildUnitVector(unit) {
  const text = [
    unit.UnitCode || unit.code || '',
    unit.Name || unit.name || '',
    unit.Description || '',
    unit.Prerequisites || '',
    unit.OfferedIn || ''
  ].join(' ').toLowerCase();
  const words = text.split(/\W+/).filter(Boolean);
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return freq;
}

function cosineSimilarity(vecA, vecB) {
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0, magA = 0, magB = 0;
  for (const k of keys) {
    const a = vecA[k] || 0;
    const b = vecB[k] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function ragRetrieve(completedUnits, missingUnits, topK = 8) {
  if (!completedUnits.length || !missingUnits.length) return missingUnits.slice(0, topK);
  const completedVecs = completedUnits.map(buildUnitVector);
  const avgVec = {};
  completedVecs.forEach(v => {
    Object.entries(v).forEach(([k, val]) => { avgVec[k] = (avgVec[k] || 0) + val; });
  });
  Object.keys(avgVec).forEach(k => { avgVec[k] /= completedVecs.length; });

  const scored = missingUnits.map(unit => ({
    unit,
    score: cosineSimilarity(avgVec, buildUnitVector(unit))
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(s => s.unit);
}

// ─────────────────────────────────────────────
// OLLAMA HELPERS
// ─────────────────────────────────────────────

const OLLAMA_BASE = 'http://localhost:11434';
const OLLAMA_MODEL = 'llama3.2:3b';

async function fetchLLMRecommendations({ completedUnits, retrievedUnits, categoryRequirements, currentYear, currentSemester, studentInfo }) {
  const completedSummary = completedUnits.slice(0, 20).map(u =>
    `${u.code} – ${u.name || ''} (${u.creditPoints}CP)`
  ).join('\n');

  const candidateSummary = retrievedUnits.map(u =>
    `${u.UnitCode} – ${u.Name || ''} (${u.CreditPoints || 12.5}CP, Category: ${u._category || 'unknown'}, Prerequisites: ${u.Prerequisites || 'None'})`
  ).join('\n');

  const prompt = `You are an academic advisor for a university degree program.

STUDENT PROFILE:
- Currently in: Year ${currentYear}, Semester ${currentSemester}
- Completed units:
${completedSummary}

GRADUATION REQUIREMENTS REMAINING:
- Core units still needed: ${categoryRequirements.core.missing} (${categoryRequirements.core.completed}/8 done)
- Elective units still needed: ${categoryRequirements.elective.missing} (${categoryRequirements.elective.completed}/8 done)
- Major units still needed: ${categoryRequirements.major.missing} (${categoryRequirements.major.completed}/8 done)

CANDIDATE UNITS FOR NEXT 1-2 SEMESTERS (retrieved via semantic relevance):
${candidateSummary}

Your task:
1. Recommend the BEST 4 units from the candidates for the NEXT semester, prioritizing units that satisfy the most urgent graduation requirements.
2. For each recommended unit, write a 1-sentence personalized reason why it suits this student RIGHT NOW based on their completed units.
3. Give a 2-3 sentence overall study strategy tip for this student.

Respond ONLY as a JSON object (no markdown, no backticks) with this exact shape:
{
  "recommendations": [
    { "code": "XXXNNNNN", "reason": "..." },
    ...
  ],
  "strategyTip": "..."
}`;

  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false,
      format: 'json'
    })
  });

  const data = await response.json();
  let text = data.response || '';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Failed to parse Ollama JSON response:', text);
    throw new Error('Invalid JSON from Ollama');
  }
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
const orderToYearSemester = (order) => {
  const year = Math.floor((order - 1) / 2) + 1;
  const semester = (order - 1) % 2 === 0 ? 1 : 2;
  return { year, semester, order };
};

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
  let plannedCompletedCodes = new Set(completedUnitsMap.keys());
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
        if (plannedCompletedCodes.has(prereq)) continue;
        let found = plannedSemesters.some(sem => sem.order < currentOrder && sem.units.some(u => (u.UnitCode || u.code) === prereq));
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
    const MAX_UNITS = 4;
    const MAX_CREDITS = 50;

    for (const unit of available) {
      if (scheduledCore >= needCore && scheduledElective >= needElective && scheduledMajor >= needMajor) break;
      const credits = unit.CreditPoints || 12.5;
      if (semesterUnits.length < MAX_UNITS && semesterCredits + credits <= MAX_CREDITS) {
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
        semesterName: `${current.year} Semester ${current.semester}`,
        units: semesterUnits,
        totalCredits: semesterCredits,
        unitCount: semesterUnits.length,
        order: currentOrder,
      });
      semesterUnits.forEach(u => { const c = u.UnitCode || u.code; if (c) plannedCompletedCodes.add(c); });
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
    const hasProjectA = allUnits.some(u => u.UnitCode === 'SWE40001' || u.UnitCode === 'COS40005');
    const hasProjectB = allUnits.some(u => u.UnitCode === 'SWE40002' || u.UnitCode === 'COS40006');
    return hasProjectA && hasProjectB;
  };

  if (last.unitCount <= 2 && !wouldMergeProjectAB()) {
    const totalUnits = secondLast.unitCount + last.unitCount;
    const totalCredits = secondLast.totalCredits + last.totalCredits;
    if (totalUnits <= 5 && totalCredits <= 62.5) {
      secondLast.units = [...secondLast.units, ...last.units];
      secondLast.unitCount = secondLast.units.length;
      secondLast.totalCredits = secondLast.totalCredits + last.totalCredits;
      schedule.pop();
    }
  }
  return schedule;
}

// ─────────────────────────────────────────────
// CATEGORY BADGE
// ─────────────────────────────────────────────

const CategoryBadge = ({ category }) => {
  const map = {
    core: 'bg-blue-50 text-blue-700 border-blue-200',
    elective: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    major: 'bg-purple-50 text-purple-700 border-purple-200',
    mpu: 'bg-orange-50 text-orange-700 border-orange-200',
    wil: 'bg-pink-50 text-pink-700 border-pink-200',
  };
  const label = { core: 'Core', elective: 'Elective', major: 'Major', mpu: 'MPU', wil: 'WIL' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[category] || map.elective}`}>
      {label[category] || category}
    </span>
  );
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

const UnitRecommendations = ({ isOpen, onClose, planner, completedUnits, studentInfo }) => {
  const [recommendations, setRecommendations] = useState(null);
  const [fullSchedule, setFullSchedule] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showFullPlan, setShowFullPlan] = useState(true);
  const [currentYear, setCurrentYear] = useState(1);
  const [currentSemester, setCurrentSemester] = useState(1);
  const [categoryWarning, setCategoryWarning] = useState(null);
  const [unrecognisedUnits, setUnrecognisedUnits] = useState([]);
  const [showUnrecognised, setShowUnrecognised] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [activeTab, setActiveTab] = useState('plan');

  useEffect(() => {
    if (!isOpen || !completedUnits) return;

    const completedCount = completedUnits.length;
    const completedSemesters = Math.floor(completedCount / 4);
    const displaySemester = Math.max(1, completedSemesters);
    const startSemester = displaySemester + 1;
    const startYear = Math.floor((startSemester - 1) / 2) + 1;

    setCurrentYear(startYear);
    setCurrentSemester(startSemester);
  }, [isOpen, completedUnits]);

  useEffect(() => {
    if (isOpen && planner && completedUnits) generateSchedule();
  }, [isOpen, planner, completedUnits, currentYear, currentSemester]);

  const generateSchedule = () => {
    setLoading(true);
    setCategoryWarning(null);
    try {
      const plannerUnits = planner?.totalUnits || [];
      if (!plannerUnits.length) { setLoading(false); return; }

      const plannerUnitTypeMap = new Map();
      plannerUnits.forEach(u => plannerUnitTypeMap.set(extractUnitCode(u.UnitCode), getUnitCategory(u)));

      const completedUnitsMap = new Map();
      completedUnits.forEach(u => {
        const code = u.code?.toUpperCase();
        if (code) completedUnitsMap.set(code, u);
      });

      let completedCore = 0, completedElective = 0, completedMajor = 0;
      const uncounted = [];

      completedUnits.forEach(u => {
        const code = u.code?.toUpperCase();
        if (plannerUnitTypeMap.has(code)) {
          const cat = plannerUnitTypeMap.get(code);
          if (cat === 'core') completedCore++;
          else if (cat === 'elective') completedElective++;
          else if (cat === 'major') completedMajor++;
        } else {
          uncounted.push({ code: code, name: u.name || u.unitName || '' });
        }
      });

      setUnrecognisedUnits(uncounted);

      if (uncounted.length) {
        console.warn('Units not found in selected planner (ignored):', uncounted.map(item => item.code));
      }

      const totalCredits = completedUnits.reduce((s, u) => s + (u.creditPoints || 0), 0);
      const totalUnitsCompleted = completedUnitsMap.size;

      const prereqMap = new Map();
      plannerUnits.forEach(u => {
        const code = extractUnitCode(u.UnitCode);
        const parsed = parsePrerequisites(u.Prerequisites || '');
        prereqMap.set(code, ['unit', 'and', 'or'].includes(parsed.type) ? parsed.conditions.filter(c => c.type === 'unit').map(c => c.code) : []);
      });

      const unitsWithPrereqs = plannerUnits.map(u => ({ ...u, prerequisites: prereqMap.get(extractUnitCode(u.UnitCode)) || [] }));
      const missingUnits = unitsWithPrereqs.filter(u => !completedUnitsMap.has(extractUnitCode(u.UnitCode)));

      const required = 8;
      const needCore = Math.max(0, required - completedCore);
      const needElective = Math.max(0, required - completedElective);
      const needMajor = Math.max(0, required - completedMajor);

      let mcnt = 0, ecnt = 0, majcnt = 0;
      missingUnits.forEach(u => { const c = getUnitCategory(u); if (c === 'core') mcnt++; else if (c === 'elective') ecnt++; else if (c === 'major') majcnt++; });
      if (mcnt < needCore) setCategoryWarning(`⚠️ Only ${mcnt} core unit(s) remaining in planner, but ${needCore} more needed.`);
      else if (ecnt < needElective) setCategoryWarning(`⚠️ Only ${ecnt} elective unit(s) remaining, but ${needElective} more needed.`);
      else if (majcnt < needMajor) setCategoryWarning(`⚠️ Only ${majcnt} major unit(s) remaining, but ${needMajor} more needed.`);

      let { schedule } = scheduleRemainingUnits(missingUnits, completedUnitsMap, totalCredits, currentYear, currentSemester, totalUnitsCompleted, needCore, needElective, needMajor);
      schedule = optimizeFinalSemester(schedule);
      setFullSchedule(schedule);

      const totalCompletedRelevant = completedCore + completedElective + completedMajor;
      setRecommendations({
        totalCompleted: totalCompletedRelevant,
        totalCredits,
        plannerName: planner?.plannerName,
        completedPercent: (totalCompletedRelevant / 24) * 100,
        currentYear, currentSemester,
        creditsToGraduate: Math.max(0, 300 - totalCredits),
        unitsToGraduate: needCore + needElective + needMajor,
        categoryRequirements: {
          core: { completed: completedCore, required, missing: needCore },
          elective: { completed: completedElective, required, missing: needElective },
          major: { completed: completedMajor, required, missing: needMajor }
        },
        _missingUnits: missingUnits,
        _completedUnits: completedUnits,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const runAIRecommendations = async () => {
    if (!recommendations) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const { _missingUnits, _completedUnits, categoryRequirements, currentYear, currentSemester } = recommendations;

      const retrieved = ragRetrieve(_completedUnits, _missingUnits, 10);
      retrieved.forEach(u => { u._category = getUnitCategory(u); });

      const result = await fetchLLMRecommendations({
        completedUnits: _completedUnits,
        retrievedUnits: retrieved,
        categoryRequirements,
        currentYear,
        currentSemester,
        studentInfo
      });

      const allUnitsMap = new Map();
      (planner?.totalUnits || []).forEach(u => allUnitsMap.set(extractUnitCode(u.UnitCode), u));

      const enrichedRecs = (result.recommendations || []).map(r => ({
        ...r,
        unit: allUnitsMap.get(r.code) || null,
        category: allUnitsMap.has(r.code) ? getUnitCategory(allUnitsMap.get(r.code)) : 'unknown'
      }));

      setAiResult({ recommendations: enrichedRecs, strategyTip: result.strategyTip });
    } catch (e) {
      console.error(e);
      setAiError('AI recommendations failed. Check your network or Ollama configuration.');
    } finally {
      setAiLoading(false);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'plan', label: 'Study Plan', icon: CalendarIcon },
    { id: 'ai', label: 'AI Picks', icon: SparklesIcon },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 rounded-t-2xl flex-shrink-0">
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

          {/* Tab bar */}
          <div className="flex gap-1 mt-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-emerald-700 shadow-sm' : 'bg-white/20 text-white hover:bg-white/30'}`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6">

          {/* Progress summary */}
          {studentInfo && recommendations && (
            <div className="bg-emerald-50 rounded-xl p-4 mb-5 border border-emerald-200">
              <div className="flex items-center gap-2 mb-3">
                <UserGroupIcon className="h-5 w-5 text-emerald-600" />
                <h3 className="font-semibold text-emerald-800">Graduation Progress</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div><span className="text-gray-500 text-xs">Student ID</span><p className="font-semibold">{studentInfo.studentId}</p></div>
                <div>
                  <span className="text-gray-500 text-xs">Position</span>
                  {(() => {
                    const completedCount = completedUnits?.length || 0;
                    const completedSemesters = Math.floor(completedCount / 4);
                    const currentSemIdx = completedSemesters + 1;
                    const year = Math.ceil(currentSemIdx / 2);
                    const sem = ((currentSemIdx - 1) % 2) + 1;
                    return <p className="font-semibold text-blue-600">Y{year} S{sem}</p>;
                  })()}
                </div>
                <div><span className="text-gray-500 text-xs">Units</span><p className="font-semibold text-emerald-600">{recommendations.totalCompleted}/24</p></div>
                <div><span className="text-gray-500 text-xs">Credits</span><p className="font-semibold text-emerald-600">{recommendations.totalCredits}/300</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                {['core', 'elective', 'major'].map(cat => (
                  <div key={cat} className="bg-white rounded-lg p-2 text-center">
                    <span className="text-gray-500 capitalize">{cat}</span>
                    <p className="font-bold">{recommendations.categoryRequirements[cat].completed}/{recommendations.categoryRequirements[cat].required}</p>
                    <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                      <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${(recommendations.categoryRequirements[cat].completed / recommendations.categoryRequirements[cat].required) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {categoryWarning && (
                <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-sm text-amber-700 flex items-start gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {categoryWarning}
                </div>
              )}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Overall progress (24 units)</span>
                  <span>{recommendations.completedPercent?.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-emerald-200 rounded-full h-2">
                  <div className="bg-emerald-600 h-2 rounded-full transition-all" style={{ width: `${recommendations.completedPercent || 0}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Unrecognised units block */}
          {unrecognisedUnits.length > 0 && (
            <div className="mb-5 border border-amber-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowUnrecognised(!showUnrecognised)}
                className="w-full flex items-center justify-between p-3 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    {unrecognisedUnits.length} completed unit(s) not found in this planner
                  </span>
                </div>
                {showUnrecognised ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
              </button>
              {showUnrecognised && (
                <div className="p-3 bg-white border-t border-amber-200">
                  <p className="text-xs text-gray-500 mb-3">
                    These units were completed but are not part of the selected study planner. They do not count toward your progress in this planner.
                  </p>
                  <div className="flex flex-col gap-2">
                    {unrecognisedUnits.map((item, idx) => (
                      <div key={idx} className="text-sm text-gray-700">
                        <span className="font-mono font-medium">{item.code}</span> – {item.name || 'Unknown unit'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Study Plan Tab */}
          {activeTab === 'plan' && (
            <>
              {loading ? (
                <div className="text-center py-12">
                  <ArrowPathIcon className="h-10 w-10 text-emerald-500 animate-spin mx-auto mb-3" />
                  <p className="text-gray-500">Building your schedule…</p>
                </div>
              ) : fullSchedule.length === 0 ? (
                <div className="text-center py-12">
                  <div className="bg-emerald-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                    <CheckCircleIcon className="h-10 w-10 text-emerald-600" />
                  </div>
                  <p className="text-gray-700 text-lg font-medium">🎓 All requirements met!</p>
                  <p className="text-gray-500 mt-2">You've completed all 8 Core, 8 Elective, 8 Major units and 300 credits.</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-emerald-600" />
                      <h3 className="text-lg font-bold text-gray-800">Full Study Plan</h3>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{fullSchedule.length} semester(s)</span>
                    </div>
                    <button onClick={() => setShowFullPlan(!showFullPlan)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                      {showFullPlan ? 'Collapse' : 'Expand'}
                      {showFullPlan ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                    </button>
                  </div>
                  {showFullPlan && (
                    <div className="space-y-4">
                      {fullSchedule.map((sem, i) => (
                        <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
                          <div className="bg-amber-50 px-4 py-3 border-b border-amber-200 flex justify-between items-center">
                            <h4 className="font-semibold text-amber-800">Year {sem.year}, Semester {sem.semester}</h4>
                            <span className="text-xs text-amber-600">{sem.unitCount} unit(s) · {sem.totalCredits} CP</span>
                          </div>
                          <div className="p-4 bg-white divide-y divide-gray-100">
                            {sem.units.map((unit, j) => {
                              const cat = getUnitCategory(unit);
                              return (
                                <div key={j} className="flex justify-between items-center py-2 first:pt-0 last:pb-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-semibold text-gray-800 text-sm">{extractUnitCode(unit.UnitCode)}</span>
                                    <CategoryBadge category={cat} />
                                    {unit.Name && <span className="text-sm text-gray-500">{unit.Name}</span>}
                                  </div>
                                  <span className="text-sm font-semibold text-emerald-600 ml-3 flex-shrink-0">{unit.CreditPoints || 12.5} CP</span>
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
            </>
          )}

          {/* AI Picks Tab */}
          {activeTab === 'ai' && (
            <div>
              <div className="flex items-start gap-3 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4 mb-5">
                <MagnifyingGlassIcon className="h-5 w-5 text-violet-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-violet-800 text-sm">RAG + LLM Powered</p>
                  <p className="text-violet-600 text-xs mt-0.5">
                    Uses semantic similarity (RAG) to find the most relevant upcoming units from your planner, then asks Ollama to reason about which 4 you should take next based on your academic history and graduation needs.
                  </p>
                </div>
              </div>

              {!aiResult && !aiLoading && (
                <div className="text-center py-8">
                  <SparklesIcon className="h-12 w-12 text-violet-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium mb-1">Get personalised unit recommendations</p>
                  <p className="text-gray-400 text-sm mb-5">Ollama will analyse your progress and suggest the best 4 units for your next semester.</p>
                  <button
                    onClick={runAIRecommendations}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:shadow-lg hover:scale-105 transition-all inline-flex items-center gap-2"
                  >
                    <SparklesIcon className="h-4 w-4" />
                    Generate AI Recommendations
                  </button>
                </div>
              )}

              {aiLoading && (
                <div className="text-center py-12">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <ArrowPathIcon className="h-16 w-16 text-violet-400 animate-spin" />
                    <SparklesIcon className="h-6 w-6 text-violet-600 absolute inset-0 m-auto" />
                  </div>
                  <p className="text-gray-500 text-sm">Retrieving relevant units via RAG…</p>
                  <p className="text-gray-400 text-xs mt-1">Then asking Ollama to reason about your path…</p>
                </div>
              )}

              {aiError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                  {aiError}
                  <button onClick={runAIRecommendations} className="ml-3 underline">Retry</button>
                </div>
              )}

              {aiResult && (
                <div className="space-y-5">
                  {aiResult.strategyTip && (
                    <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <LightBulbIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-800 text-sm mb-1">Study Strategy</p>
                        <p className="text-amber-700 text-sm">{aiResult.strategyTip}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                      <SparklesIcon className="h-5 w-5 text-violet-500" />
                      Recommended for Next Semester
                    </h3>
                    <div className="grid gap-3">
                      {aiResult.recommendations.map((rec, i) => (
                        <div key={i} className="border border-violet-100 bg-gradient-to-r from-violet-50 to-white rounded-xl p-4 flex gap-4">
                          <div className="flex-shrink-0 w-8 h-8 bg-violet-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono font-semibold text-gray-800">{rec.code}</span>
                              {rec.category !== 'unknown' && <CategoryBadge category={rec.category} />}
                              {rec.unit?.Name && <span className="text-sm text-gray-600">{rec.unit.Name}</span>}
                            </div>
                            <p className="text-sm text-violet-700 flex items-start gap-1">
                              <SparklesIcon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                              {rec.reason}
                            </p>
                            {rec.unit?.Prerequisites && rec.unit.Prerequisites !== 'Nil' && (
                              <p className="text-xs text-gray-400 mt-1">Prerequisites: {rec.unit.Prerequisites}</p>
                            )}
                          </div>
                          {rec.unit?.CreditPoints && (
                            <span className="text-sm font-semibold text-emerald-600 flex-shrink-0">{rec.unit.CreditPoints} CP</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={runAIRecommendations}
                    className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-800 transition-colors"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    Regenerate recommendations
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UnitRecommendations;