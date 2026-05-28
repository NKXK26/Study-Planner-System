'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import {
	CheckCircleIcon, AcademicCapIcon, ChartBarIcon, DocumentArrowDownIcon,
	LightBulbIcon, ArrowUpTrayIcon, CalendarIcon, ArrowPathIcon,
	ArrowsRightLeftIcon, ExclamationTriangleIcon, WrenchScrewdriverIcon,
	ArrowDownTrayIcon, MagnifyingGlassIcon, XMarkIcon, ChevronDownIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';
import UnitPoolToolbox from '@/app/view/unit_suggestion/UnitPoolToolbox';
import { generateStudyPlannerPdf } from '@/app/view/unit_suggestion/Exportstudyplannerpdf';
import GraduationDashboard from '@/app/view/unit_suggestion/GraduationDashboard';
import {
	CategoryBadge,
	DraggableUnitCard,
	PanelUnitCard,
	ExternalUnitCard,
	SemesterDropZone,
} from '@/app/view/unit_suggestion/SuggestionUIComponents';
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
} from '@/app/view/unit_suggestion/plannerHelpers';

// ─── Category selector (unchanged) ─────────────────────────────────────────────
const CategorySelector = ({ unit, onConfirm, onCancel }) => {
	const [selected, setSelected] = useState('elective');
	const categories = [
		{ key: 'core', label: 'Core', description: 'Required core unit' },
		{ key: 'major', label: 'Major', description: 'Major specialisation unit' },
		{ key: 'elective', label: 'Elective', description: 'Elective credit' },
		{ key: 'wil', label: 'WIL', description: 'Work-integrated learning' },
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

// ─── Equivalency Modal (unchanged) ────────────────────────────────────────────
const EquivalencyModal = ({ isOpen, onClose, oldUnit, intakeYear, currentSem, onReplace }) => {
	const [loading, setLoading] = useState(false);
	const [suggestions, setSuggestions] = useState([]);
	const [reasoning, setReasoning] = useState(null);
	const [meta, setMeta] = useState(null);
	const [noMatch, setNoMatch] = useState(false);
	const [error, setError] = useState(null);
	const [pendingUnit, setPendingUnit] = useState(null);

	useEffect(() => {
		if (!isOpen || !oldUnit?.code) return;
		setLoading(true); setError(null); setSuggestions([]); setReasoning(null);
		setMeta(null); setNoMatch(false); setPendingUnit(null);
		fetch('/api/unit-rag', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				missingUnit: { code: oldUnit.code, name: oldUnit.name || oldUnit.code, creditPoints: oldUnit.creditPoints ?? null },
				intakeYear: intakeYear ?? new Date().getFullYear() - 1,
				currentSem: currentSem ?? null,
			}),
		})
			.then(r => r.json())
			.then(data => {
				if (data.success) {
					setSuggestions(data.suggestions || []);
					setReasoning(data.reasoning || null);
					setMeta(data.meta || null);
					setNoMatch(data.noMatchFound ?? (data.suggestions?.length === 0));
				} else { setError(data.message || 'Failed to get suggestions from AI.'); }
			})
			.catch(err => setError(`Network error: ${err.message}`))
			.finally(() => setLoading(false));
	}, [isOpen, oldUnit, intakeYear, currentSem]);

	const handleRetry = () => {
		if (!oldUnit?.code) return;
		setLoading(true); setError(null); setSuggestions([]); setNoMatch(false); setPendingUnit(null);
		fetch('/api/unit-rag', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				missingUnit: { code: oldUnit.code, name: oldUnit.name || oldUnit.code, creditPoints: oldUnit.creditPoints ?? null },
				intakeYear: intakeYear ?? new Date().getFullYear() - 1,
				currentSem: currentSem ?? null,
			}),
		})
			.then(r => r.json())
			.then(data => {
				if (data.success) {
					setSuggestions(data.suggestions || []);
					setReasoning(data.reasoning || null);
					setMeta(data.meta || null);
					setNoMatch(data.noMatchFound ?? (data.suggestions?.length === 0));
				} else { setError(data.message || 'Failed to get suggestions from AI.'); }
			})
			.catch(err => setError(`Network error: ${err.message}`))
			.finally(() => setLoading(false));
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
			<div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
				<div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
					<div>
						<h2 className="text-base font-bold text-gray-900">
							Find equivalent for{' '}
							<code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[#cc2131]">{oldUnit?.code}</code>
						</h2>
						{oldUnit?.name && oldUnit.name !== oldUnit.code && (
							<p className="text-xs text-gray-500 mt-0.5">{oldUnit.name}</p>
						)}
					</div>
					<div className="flex items-center gap-2">
						{meta?.model === 'similarity-only' ? (
							<span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">⚠️ Similarity only</span>
						) : meta?.model ? (
							<span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">✅ AI · {meta.model}</span>
						) : (
							<span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">RAG · llama3 · grounded</span>
						)}
						<button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none transition-colors">×</button>
					</div>
				</div>
				<div className="flex-1 overflow-y-auto p-6 space-y-4">
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
					{!loading && error && (
						<div className="space-y-3">
							<div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
							<button onClick={handleRetry} className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition-colors">Retry</button>
						</div>
					)}
					{!loading && !error && noMatch && (
						<div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
							No close equivalent was found in the current unit database for{' '}
							<code className="font-mono font-semibold">{oldUnit?.code}</code>.
							<br />
							<span className="text-xs mt-1 block">The student may need to consult their program coordinator.</span>
						</div>
					)}
					{!loading && !error && reasoning && (
						<div className={`p-3 rounded-lg ${meta?.model === 'similarity-only' ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
							<p className="text-xs font-semibold text-amber-700 mb-1 uppercase tracking-wide">Advisor note</p>
							<p className="text-sm text-gray-700 leading-relaxed">{reasoning}</p>
						</div>
					)}
					{!loading && !error && suggestions.length > 0 && (
						<div className="space-y-3">
							<p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
								{suggestions.length} suggested equivalent{suggestions.length > 1 ? 's' : ''} — sourced from live database
							</p>
							{suggestions.map((sug, idx) => {
								const isBest = idx === 0;
								const isPending = pendingUnit?.code === sug.code;
								return (
									<div key={sug.code} className={`border rounded-xl p-4 transition-all ${isBest ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													<code className="text-xs font-mono font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">{sug.code}</code>
													<span className="text-sm font-medium text-gray-900">{sug.name}</span>
													{isBest && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Best match</span>}
												</div>
												{sug.creditPoints && <p className="text-xs text-gray-400 mt-0.5">{sug.creditPoints} credit points</p>}
											</div>
											<div className="flex-shrink-0 text-center">
												<div className={`text-sm font-bold rounded-lg px-2 py-1 min-w-[44px] ${(sug.matchScore ?? 0) >= 80 ? 'bg-emerald-100 text-emerald-700' : (sug.matchScore ?? 0) >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
													{sug.matchScore ?? '—'}%
												</div>
												<p className="text-xs text-gray-400 mt-0.5">match</p>
											</div>
										</div>
										<p className="text-xs text-gray-500 mt-2 leading-relaxed italic bg-gray-50 px-3 py-2 rounded-lg">{sug.reason}</p>
										{sug.caveats && (
											<div className="mt-2 flex items-start gap-1.5">
												<ExclamationTriangleIcon className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
												<p className="text-xs text-amber-700">{sug.caveats}</p>
											</div>
										)}
										{!isPending ? (
											<button onClick={() => setPendingUnit(sug)} className="mt-3 px-3 py-1.5 rounded-lg bg-[#cc2131] text-white text-xs font-medium hover:bg-[#b01d2c] transition-colors">
												Use this unit
											</button>
										) : (
											<CategorySelector
												unit={sug}
												onConfirm={(category) => {
													onReplace({ UnitCode: sug.code, Name: sug.name, CreditPoints: sug.creditPoints ?? DEFAULT_CREDIT_POINTS }, category);
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
				<div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
					{meta ? (
						<p className="text-xs text-gray-400">
							Scanned {meta.totalUnitsScanned ?? '?'} units · retrieved {meta.candidatesRetrieved ?? '?'} candidates · model: {meta.model ?? 'llama3'}
							{meta.elapsedMs && ` · ${meta.elapsedMs}ms`}
						</p>
					) : <span />}
					<button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
				</div>
			</div>
		</div>
	);
};

// ─── Inline Study Planner (unchanged logic, made full‑width later) ────────────
const InlineStudyPlanner = ({ completedUnits, studentInfo }) => {
	const [allPlanners, setAllPlanners] = useState([]);
	const [plannersLoading, setPlannersLoading] = useState(false);
	const [plannersError, setPlannersError] = useState(null);
	const [recommendations, setRecommendations] = useState(null);
	const [editableSchedule, setEditableSchedule] = useState([]);
	const [scheduleLoading, setScheduleLoading] = useState(false);
	const [showFullPlan, setShowFullPlan] = useState(false);
	const [currentYear, setCurrentYear] = useState(1);
	const [currentSemester, setCurrentSemester] = useState(1);
	const [unrecognisedUnits, setUnrecognisedUnits] = useState([]);
	const [selectedFieldPlanner, setSelectedFieldPlanner] = useState(null);
	const [mappedExternalUnits, setMappedExternalUnits] = useState({ core: [], major: [], elective: [], wil: [] });
	const [dragSource, setDragSource] = useState(null);
	const [dragTarget, setDragTarget] = useState(null);
	const [dragOverPanel, setDragOverPanel] = useState(null);
	const [showToolbox, setShowToolbox] = useState(false);
	const [pdfLoading, setPdfLoading] = useState(false);
	const [allPlannersWithScores, setAllPlannersWithScores] = useState([]);
	const [topPlanners, setTopPlanners] = useState([]);
	const [manualPlannerId, setManualPlannerId] = useState('');
	const [equivModal, setEquivModal] = useState({ open: false, unit: null });
	const hasInitiallySelected = useRef(false);

	const intakeYear = studentInfo?.intakeYear ?? studentInfo?.intake_year ?? (new Date().getFullYear() - 1);
	const currentSem = (() => {
		const now = new Date();
		return `${now.getFullYear()} Sem ${now.getMonth() < 6 ? 1 : 2}`;
	})();

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

			let { schedule } = scheduleRemainingUnits(missingUnits, completedUnitsMap, totalCredits, currentYear, currentSemester, physicalCompletedCount, needCore, needMajor, needElective);
			schedule = compactFinalSemesters(schedule, completedUnitsMap);
			schedule = balanceSemesterLoads(schedule, completedUnitsMap);
			schedule = optimizeFinalSemester(schedule);
			setEditableSchedule(schedule);
			setRecommendations({
				totalCompleted: completedCore + completedElective + completedMajor,
				totalCredits, plannerName: planner.name,
				completedPercent: ((completedCore + completedElective + completedMajor) / TOTAL_REQUIRED_UNITS) * 100,
				currentYear, currentSemester,
				creditsToGraduate: Math.max(0, TOTAL_REQUIRED_CREDITS - totalCredits),
				unitsToGraduate: needCore + needMajor + needElective,
				categoryRequirements: {
					core: { completed: completedCore, required: REQUIRED_CORE, missing: needCore },
					major: { completed: completedMajor, required: REQUIRED_MAJOR, missing: needMajor },
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

			let { schedule } = scheduleRemainingUnits(missingUnits, completedUnitsMap, totalCredits, currentYear, currentSemester, physicalCompletedCount, needCore, needMajor, needElective);
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
					core: { completed: completedCore, required: REQUIRED_CORE, missing: needCore },
					major: { completed: completedMajor, required: REQUIRED_MAJOR, missing: needMajor },
					elective: { completed: completedElective, required: REQUIRED_ELECTIVE, missing: needElective },
				},
			}));
		} catch (e) { console.error(e); } finally { setScheduleLoading(false); }
	}, [selectedFieldPlanner, completedUnits, currentYear, currentSemester, mappedExternalUnits]);

	const handleExportPdf = useCallback(async () => {
		if (!editableSchedule.length) return;
		setPdfLoading(true);
		try {
			const studentId = studentInfo?.studentId ?? 'student';
			const plannerSlug = (recommendations?.plannerName ?? 'planner').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
			await generateStudyPlannerPdf({ editableSchedule, recommendations, studentInfo, completedUnits, filename: `study-planner-${studentId}-${plannerSlug}.pdf` });
		} catch (err) { console.error('PDF export failed:', err); } finally { setPdfLoading(false); }
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
		const addUnique = (arr, unit, existingCodesSet) => {
			const code = (unit.UnitCode || unit.code || '').toUpperCase();
			if (!existingCodesSet.has(code)) { existingCodesSet.add(code); arr.push(unit); }
			return arr;
		};
		const core = [], major = [], elective = [], wil = [];
		const coreCodes = new Set(), majorCodes = new Set(), electiveCodes = new Set(), wilCodes = new Set();
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
		const addMapped = (arr, mapArray, category, codesSet) => {
			mapArray.forEach(extUnit => {
				const item = { ...extUnit, status: 'pending', isMappedExternal: true, originalCategory: category, CreditPoints: extUnit.creditPoints || DEFAULT_CREDIT_POINTS, Name: extUnit.name, UnitCode: extUnit.code, doubleCount: extUnit.doubleCount };
				addUnique(arr, item, codesSet);
			});
		};
		addMapped(core, mappedExternalUnits.core, 'core', coreCodes);
		addMapped(major, mappedExternalUnits.major, 'major', majorCodes);
		addMapped(elective, mappedExternalUnits.elective, 'elective', electiveCodes);
		addMapped(wil, mappedExternalUnits.wil, 'wil', wilCodes);
		return { core, major, elective, wil };
	}, [selectedFieldPlanner, completedUnits, editableSchedule, mappedExternalUnits]);

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
			const dstSemIdx = target.semIdx, dstUnitIdx = target.unitIdx;
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
				} else { dstSem.units.push(movedUnit); }
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

	const handleReplaceUnrecognisedUnit = useCallback((dbUnit, category) => {
		const externalUnit = {
			code: dbUnit.UnitCode, name: dbUnit.Name,
			creditPoints: dbUnit.CreditPoints || DEFAULT_CREDIT_POINTS,
			originalCode: equivModal.unit?.code,
		};
		handleMapExternalToCategory(category, externalUnit);
		setEquivModal({ open: false, unit: null });
	}, [handleMapExternalToCategory, equivModal.unit]);

	// Effects
	useEffect(() => {
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
	}, []);

	useEffect(() => {
		if (allPlanners.length && completedUnits?.length) {
			const scored = computePlannerScores(allPlanners, completedUnits);
			setAllPlannersWithScores(scored);
			setTopPlanners(scored.slice(0, 5));
			if (!selectedFieldPlanner && scored.length) setSelectedFieldPlanner(scored[0]);
		}
	}, [allPlanners, completedUnits, computePlannerScores, selectedFieldPlanner]);

	useEffect(() => {
		if (!hasInitiallySelected.current && topPlanners.length > 0 && completedUnits?.length) {
			hasInitiallySelected.current = true;
			const firstPlanner = topPlanners[0];
			setSelectedFieldPlanner(firstPlanner);
			setManualPlannerId('');
			generateScheduleForPlanner(firstPlanner);
		}
	}, [topPlanners, completedUnits, generateScheduleForPlanner]);

	useEffect(() => {
		if (!completedUnits) return;
		const getStudentPositionFromCompletedUnits = (completedCount) => {
			const completedSemesters = Math.floor(completedCount / MAX_UNITS_PER_SEMESTER);
			const nextSemesterOrder = Math.max(1, completedSemesters) + 1;
			const orderToYearSemester = (order) => ({ year: Math.floor((order - 1) / 2) + 1, semester: (order - 1) % 2 === 0 ? 1 : 2, order });
			return orderToYearSemester(nextSemesterOrder);
		};
		const position = getStudentPositionFromCompletedUnits(completedUnits.length);
		setCurrentYear(position.year);
		setCurrentSemester(position.semester);
	}, [completedUnits]);

	useEffect(() => {
		if (selectedFieldPlanner && completedUnits && !recommendations) {
			generateScheduleForPlanner(selectedFieldPlanner);
		}
	}, [selectedFieldPlanner, completedUnits, currentYear, currentSemester, recommendations, generateScheduleForPlanner]);

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
				core: { completed: completedCore, required: REQUIRED_CORE, missing: needCore },
				major: { completed: completedMajor, required: REQUIRED_MAJOR, missing: needMajor },
				elective: { completed: completedElective, required: REQUIRED_ELECTIVE, missing: needElective },
			},
		}));
	}, [mappedExternalUnits, selectedFieldPlanner, completedUnits]);

	const { core: coreUnits, major: majorUnits, elective: electiveUnits, wil: wilUnits } = getPlannerUnitsWithStatus();
	const allExternalMapped = unrecognisedUnits.length === 0;

	return (
		<div
			className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden"
			onDragEnd={() => { setDragSource(null); setDragTarget(null); setDragOverPanel(null); }}
		>
			<UnitPoolToolbox isOpen={showToolbox} onClose={() => setShowToolbox(false)} />
			<EquivalencyModal
				isOpen={equivModal.open}
				onClose={() => setEquivModal({ open: false, unit: null })}
				oldUnit={equivModal.unit}
				intakeYear={intakeYear}
				currentSem={currentSem}
				onReplace={handleReplaceUnrecognisedUnit}
			/>

			<div className="bg-white border-b border-gray-200 px-6 py-4">
				<div className="flex justify-between items-center">
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
					<button
						onClick={() => setShowToolbox(v => !v)}
						title="Toggle Unit Toolbox"
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border
							${showToolbox ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5' : 'border-gray-300 text-gray-600 bg-white hover:border-[#cc2131] hover:text-[#cc2131]'}`}
					>
						<WrenchScrewdriverIcon className="h-4 w-4" />
						<span className="hidden sm:inline">Unit Toolbox</span>
					</button>
				</div>
			</div>

			<div className="p-6 bg-gray-50/40 space-y-5">
				{plannersError && (
					<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm flex items-center gap-2">
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

				{topPlanners.length > 0 && (
					<div>
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top matching planners</span>
							<span className="text-xs text-gray-400">Match score (completed units)</span>
						</div>
						<div className="flex flex-wrap gap-2">
							{topPlanners.map(planner => (
								<button
									key={planner.id}
									onClick={() => { setSelectedFieldPlanner(planner); setManualPlannerId(''); setRecommendations(null); generateScheduleForPlanner(planner); }}
									className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all
										${selectedFieldPlanner?.id === planner.id ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5' : 'border-gray-300 text-gray-600 bg-white hover:border-[#cc2131] hover:text-[#cc2131]'}`}
								>
									{planner.name} ({planner.matchedUnits}/{completedUnits?.length || 0})
								</button>
							))}
						</div>
					</div>
				)}

				{allPlannersWithScores.length > 0 && (
					<div className="flex items-center gap-3">
						<span className="text-xs text-gray-500">Or select any planner:</span>
						<select
							value={manualPlannerId}
							onChange={(e) => {
								const id = e.target.value;
								setManualPlannerId(id);
								if (id) {
									const sel = allPlannersWithScores.find(p => p.id === parseInt(id));
									if (sel) { setSelectedFieldPlanner(sel); setRecommendations(null); generateScheduleForPlanner(sel); }
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

				{selectedFieldPlanner && (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						{[
							{ key: 'core', units: coreUnits },
							{ key: 'major', units: majorUnits },
							{ key: 'elective', units: electiveUnits },
							{ key: 'wil', units: wilUnits },
						].map(({ key, units }) => (
							<div
								key={key}
								className={`bg-white rounded-xl border-2 border-red-500 p-3 flex flex-col transition-all ${dragOverPanel === key ? 'ring-2 ring-red-500 bg-red-50/30' : ''}`}
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
											unit={unit} status={unit.status} category={key}
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

				<div className="bg-white rounded-xl border border-gray-200 p-3">
					<h4 className="font-semibold text-[#111827] text-sm mb-2 flex items-center gap-1">
						Student's completed units not recognised in planner
						<span className="text-xs font-normal text-gray-500 ml-auto">{unrecognisedUnits.length} units</span>
					</h4>
					{unrecognisedUnits.length > 0 ? (
						<div className="space-y-2 max-h-60 overflow-y-auto pr-1">
							{unrecognisedUnits.map((unit, idx) => (
								<div key={`ext-${idx}`} className="relative">
									<ExternalUnitCard unit={unit} onMapToCategory={handleMapExternalToCategory} />
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
								${allExternalMapped && !scheduleLoading ? 'border-[#cc2131] text-[#cc2131] bg-white hover:bg-[#cc2131]/5' : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'}`}
						>
							{scheduleLoading ? <><ArrowPathIcon className="h-4 w-4 animate-spin" />Generating...</> : <><ArrowPathIcon className="h-4 w-4" />Generate Study Plan</>}
						</button>
					</div>
					{!allExternalMapped && !scheduleLoading && (
						<p className="text-xs text-amber-600 mt-2 text-right">⚠️ All external units must be mapped first</p>
					)}
				</div>

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
													onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDrop={handleDrop}
													isDragOver={dragTarget?.semIdx === semIdx && dragTarget?.unitIdx === unitIdx && dragSource && !dragSource.fromPanel}
													isSource={dragSource && !dragSource.fromPanel && dragSource.semIdx === semIdx && dragSource.unitIdx === unitIdx}
													onRemove={handleRemoveUnit}
												/>
											))}
											<SemesterDropZone
												sem={sem} semIdx={semIdx}
												onDragEnter={handleDragEnter} onDrop={handleDrop} onNativeDrop={handleNativeDropIntoSemester}
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
	);
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CompareStudyPlannerPage() {
	const { can, isSuperadmin } = useRole();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [matchedPlanners, setMatchedPlanners] = useState([]);
	const [studentInfo, setStudentInfo] = useState(null);
	const [searched, setSearched] = useState(false);
	const [completedUnits, setCompletedUnits] = useState([]);
	const [exporting, setExporting] = useState(false);
	const [fileName, setFileName] = useState('');
	const [expandedPlanners, setExpandedPlanners] = useState([]); // track which planner IDs are expanded
	const fileInputRef = useRef(null);

	const hasAccess = isSuperadmin() || can('planner', 'read');

	const parseXlsxFile = (file) => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const data = new Uint8Array(e.target.result);
					const workbook = XLSX.read(data, { type: 'array' });
					const sheet = workbook.Sheets[workbook.SheetNames[0]];
					const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
					const passed = rows.filter(row => {
						const grade = row['Grade'];
						if (grade === null || grade === undefined || grade === '') return false;
						return String(grade).trim().toUpperCase() !== 'N';
					});
					const units = passed.map((row) => {
						const code = String(row['Course'] || '').trim().toUpperCase();
						const title = String(row['Course Title'] || '').trim();
						const isWil = code === 'ICT20016' && title === 'Work Integrated Learning Placement - ICT (3 month)';
						return {
							id: code, code, name: title,
							creditPoints: parseFloat(row['Credits'] || row['Earned'] || 0) || 0,
							grade: String(row['Grade'] || '').trim(),
							prerequisites: [],
							unitTypeId: isWil ? 17 : null,
						};
					}).filter(u => u.code);
					resolve(units);
				} catch (err) { reject(new Error('Failed to parse XLSX file: ' + err.message)); }
			};
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsArrayBuffer(file);
		});
	};

	const fetchAllStudyPlanners = async () => {
		const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/study-planner`);
		if (!response.ok) throw new Error(`Failed to fetch study planners: ${response.status}`);
		const result = await response.json();
		if (result.success) return result.data;
		throw new Error(result.message || 'Failed to fetch study planners');
	};

	const compareWithPlanner = (completedUnitsMap, planner) => {
		const plannerUnits = planner.units || [];
		const plannerUnitsMap = new Map();
		plannerUnits.forEach(unit => {
			const code = (unit.UnitCode || '').trim().toUpperCase();
			if (code) plannerUnitsMap.set(code, { id: unit.ID, code: unit.UnitCode, name: unit.Name, creditPoints: unit.CreditPoints || 0, prerequisites: unit.Prerequisites || [], offeredIn: unit.OfferedIn || unit.offeredIn || '' });
		});
		const matchingUnits = [];
		let overlapCount = 0, totalMatchedCredits = 0;
		completedUnitsMap.forEach((completedUnit, unitCode) => {
			const key = unitCode.toUpperCase();
			if (plannerUnitsMap.has(key)) {
				overlapCount++;
				const plannerUnit = plannerUnitsMap.get(key);
				totalMatchedCredits += completedUnit.creditPoints || 0;
				matchingUnits.push({ id: unitCode, code: completedUnit.code, name: completedUnit.name, plannerCode: plannerUnit.code, plannerName: plannerUnit.name, creditPoints: completedUnit.creditPoints });
			}
		});
		const plannerUnitCount = plannerUnits.length;
		const MAX_UNITS_FOR_100_PERCENT = 24, MAX_CREDITS_FOR_100_PERCENT = 300;
		const unitPercentage = (overlapCount / MAX_UNITS_FOR_100_PERCENT) * 100;
		const creditPercentage = (totalMatchedCredits / MAX_CREDITS_FOR_100_PERCENT) * 100;
		const matchStudentPct = Math.min(Math.max(unitPercentage, creditPercentage), 100);
		const matchPlannerPct = plannerUnitCount > 0 ? (overlapCount / plannerUnitCount) * 100 : 0;
		return { plannerId: planner.id, plannerName: planner.name, createdAt: planner.createdAt, overlapCount, completedCount: completedUnitsMap.size, plannerUnitCount, matchStudentPct, matchPlannerPct, matchingUnits, totalUnits: plannerUnits, totalMatchedCredits };
	};

	const exportToExcel = () => {
		if (!matchedPlanners.length || !studentInfo) { alert('No data to export'); return; }
		setExporting(true);
		try {
			const workbook = XLSX.utils.book_new();
			const studentRows = [['Student / File Information'], ['File', studentInfo.studentId], ['Completed Units', studentInfo.completedUnitsCount], ['Total Credits Earned', studentInfo.totalCredits], [''], ['Completed Units List'], ['Unit Code', 'Unit Name', 'Grade', 'Credits']];
			studentInfo.completedUnitsList?.forEach(unit => studentRows.push([unit.code, unit.name, unit.grade, unit.creditPoints]));
			XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(studentRows), 'Completed Units');
			const plannerRows = [['Rank', 'Planner Name', 'Planner ID', 'Created', 'Matching Units', 'Matched Credits', "% of Student's Completed", "% of Planner's Units"]];
			matchedPlanners.forEach((planner, idx) => plannerRows.push([idx + 1, planner.plannerName, planner.plannerId, new Date(planner.createdAt).toLocaleDateString(), planner.overlapCount, planner.totalMatchedCredits, planner.matchStudentPct.toFixed(1) + '%', planner.matchPlannerPct.toFixed(1) + '%']));
			XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(plannerRows), 'Top Planners');
			matchedPlanners.forEach((planner, idx) => {
				const matchingRows = [[`Matched Units for ${planner.plannerName}`], ['Unit Code', 'Unit Name', 'Credits']];
				planner.matchingUnits.forEach(unit => matchingRows.push([unit.code, unit.name, unit.creditPoints]));
				XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matchingRows), `Planner_${idx + 1}_Matches`.slice(0, 31));
			});
			XLSX.writeFile(workbook, `study_planner_comparison_${fileName.replace(/\.xlsx$/i, '')}.xlsx`);
		} catch (err) { console.error('Export error:', err); alert('Failed to export Excel.'); } finally { setExporting(false); }
	};

	const togglePlanner = (plannerId) => {
		setExpandedPlanners(prev =>
			prev.includes(plannerId) ? prev.filter(id => id !== plannerId) : [...prev, plannerId]
		);
	};

	const handleFileChange = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setSearched(true); setFileName(file.name); setError(null);
		setMatchedPlanners([]); setCompletedUnits([]); setStudentInfo(null);
		setExpandedPlanners([]);
		try {
			setLoading(true);
			const completedUnitsList = await parseXlsxFile(file);
			if (completedUnitsList.length === 0) { setError('No completed units found in the uploaded file. Make sure units have a grade other than "N".'); return; }
			const completedUnitsMap = new Map();
			completedUnitsList.forEach(unit => { if (!completedUnitsMap.has(unit.code.toUpperCase())) completedUnitsMap.set(unit.code.toUpperCase(), unit); });
			setCompletedUnits(Array.from(completedUnitsMap.values()));
			const totalCredits = Array.from(completedUnitsMap.values()).reduce((sum, u) => sum + (u.creditPoints || 0), 0);
			setStudentInfo({ studentId: file.name, completedUnitsCount: completedUnitsMap.size, totalCredits, completedUnitsList: Array.from(completedUnitsMap.values()).map(u => ({ code: u.code, name: u.name, grade: u.grade, creditPoints: u.creditPoints })) });
			const allPlanners = await fetchAllStudyPlanners();
			if (allPlanners.length === 0) { setError('No study planners found in the system'); return; }
			const comparisons = allPlanners.map(planner => compareWithPlanner(completedUnitsMap, planner));
			const top5Planners = comparisons.sort((a, b) => b.overlapCount !== a.overlapCount ? b.overlapCount - a.overlapCount : b.matchStudentPct - a.matchStudentPct).slice(0, 5).filter(planner => planner.overlapCount > 0);
			if (top5Planners.length === 0) setError("No matching study planners found for the units in this file.");
			else setMatchedPlanners(top5Planners);
		} catch (err) { console.error('Error processing file:', err); setError(err.message || 'Failed to process the uploaded file'); }
		finally { setLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
	};

	const showStudyPlanner = matchedPlanners.length > 0 && studentInfo && studentInfo.totalCredits < 300;

	return (
		<ConditionalRequireAuth>
			{!hasAccess ? (
				<AccessDenied requiredPermission="planner:read or system:superadmin" resourceName="study planner comparison" />
			) : (
				<PageLoadingWrapper requiredPermission={{ resource: 'dashboard', action: 'access' }} resourceName="study planner comparison" isLoading={false}>
					<div className="page-bg p-6 min-h-screen">
						<div className="max-w-7xl mx-auto">
							{/* Page header */}
							<div className="mb-8 flex justify-between items-center flex-wrap gap-3">
								<div>
									<h1 className="title-text text-3xl font-bold">Compare Study Planner</h1>
									<p className="text-muted text-sm mt-1">
										Upload a student grid XLSX file to compare completed units with available study planners
									</p>
								</div>
								{matchedPlanners.length > 0 && studentInfo && (
									<div className="flex gap-3">
										<button
											onClick={exportToExcel}
											disabled={exporting}
											className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150"
										>
											<DocumentArrowDownIcon className="h-5 w-5" />
											{exporting ? 'Exporting...' : 'Export to Excel'}
										</button>
										{studentInfo.totalCredits >= 300 && (
											<div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center">
												🎓 Student has already completed 300 credits – no recommendations needed.
											</div>
										)}
									</div>
								)}
							</div>

							{/* File upload */}
							<div className="card-bg p-6 rounded-theme shadow-theme mb-8">
								<label className="label-text-alt block mb-2 text-sm font-medium">Upload Student Transcript (XLSX)</label>
								<div
									className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-[#cc2131] transition-colors bg-white"
									onClick={() => fileInputRef.current?.click()}
									onDragOver={(e) => e.preventDefault()}
									onDrop={(e) => {
										e.preventDefault();
										const file = e.dataTransfer.files?.[0];
										if (file) {
											const dt = new DataTransfer();
											dt.items.add(file);
											fileInputRef.current.files = dt.files;
											handleFileChange({ target: { files: dt.files } });
										}
									}}
								>
									<ArrowUpTrayIcon className="h-10 w-10 text-gray-400 mb-3" />
									<p className="text-sm font-medium text-gray-700">
										{loading ? 'Processing...' : fileName ? `Loaded: ${fileName}` : 'Click or drag & drop an XLSX file here'}
									</p>
									<p className="text-xs text-gray-400 mt-1">Completed units: grade = EXM or any grade except N</p>
									<input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} disabled={loading} />
								</div>
							</div>

							{error && (
								<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
									<strong>Error:</strong> {error}
								</div>
							)}

							{/* File summary */}
							{studentInfo && (
								<div className="card-bg p-6 rounded-theme shadow-theme mb-8 bg-gradient-to-r from-red-50 to-orange-50">
									<h2 className="text-lg font-semibold heading-text mb-4 flex items-center gap-2">
										<AcademicCapIcon className="h-5 w-5" />
										File Summary
									</h2>
									<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
										<div><p className="text-sm text-muted">File</p><p className="font-semibold text-[#cc2131] text-base break-all">{studentInfo.studentId}</p></div>
										<div><p className="text-sm text-muted">Completed Units</p><p className="font-semibold text-[#cc2131] text-lg">{studentInfo.completedUnitsCount}</p></div>
										<div><p className="text-sm text-muted">Total Credits Earned</p><p className="font-semibold text-[#cc2131] text-lg">{studentInfo.totalCredits}</p></div>
									</div>
									<details className="mt-4 border-t border-gray-200 pt-3">
										<summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-[#cc2131]">
											View Completed Units ({completedUnits.length} unit(s))
										</summary>
										<div className="flex flex-wrap gap-2 mt-3 max-h-64 overflow-y-auto p-2 bg-white rounded-md">
											{completedUnits.map(unit => (
												<div key={unit.code} className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
													{unit.code} – {unit.name}
													{unit.grade && <span className="ml-1 opacity-70">({unit.grade})</span>}
												</div>
											))}
										</div>
									</details>
								</div>
							)}

							{/* Matched planners as accordion */}
							{searched && !error && matchedPlanners.length === 0 && studentInfo ? (
								<div className="card-bg p-12 rounded-theme shadow-theme text-center">
									<ChartBarIcon className="h-16 w-16 text-muted mx-auto mb-4 opacity-50" />
									<p className="text-muted text-lg">No matching study planners found.</p>
								</div>
							) : matchedPlanners.length > 0 && (
								<div className="space-y-4 mb-8">
									<h2 className="text-xl font-semibold heading-text mb-2 flex items-center gap-2">
										<ChartBarIcon className="h-6 w-6" />
										Top {matchedPlanners.length} Matching Study Planners
									</h2>
									{matchedPlanners.map((planner, index) => {
										const isExpanded = expandedPlanners.includes(planner.plannerId);
										return (
											<div key={planner.plannerId} className="card-bg rounded-theme shadow-theme overflow-hidden">
												{/* Header (always visible, click to toggle) */}
												<div
													className="p-5 bg-gradient-to-r from-gray-50 to-white border-b cursor-pointer hover:bg-gray-100 transition-colors flex justify-between items-center"
													onClick={() => togglePlanner(planner.plannerId)}
												>
													<div className="flex-1">
														<div className="flex items-center gap-3 flex-wrap">
															<span className="text-2xl font-bold text-[#cc2131]">#{index + 1}</span>
															<h3 className="text-xl font-bold heading-text">{planner.plannerName}</h3>
															<span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
																ID: {planner.plannerId}
															</span>
															<span className="text-xs text-gray-500">
																Created: {new Date(planner.createdAt).toLocaleDateString()}
															</span>
														</div>
														<div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
															<div><span className="text-gray-500">Matching Units:</span> {planner.overlapCount} / {planner.completedCount}</div>
															<div><span className="text-gray-500">Matched Credits:</span> {planner.totalMatchedCredits}</div>

														</div>
													</div>
													<div className="ml-4">
														{isExpanded ? (
															<ChevronDownIcon className="h-5 w-5 text-gray-500" />
														) : (
															<ChevronRightIcon className="h-5 w-5 text-gray-500" />
														)}
													</div>
												</div>
												{/* Collapsible content */}
												{isExpanded && (
													<div className="p-6 border-t border-gray-100">
														<h4 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
															<CheckCircleIcon className="h-4 w-4 text-red-600" />
															Matched Units ({planner.matchingUnits.length})
														</h4>
														{planner.matchingUnits.length > 0 ? (
															<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
																{planner.matchingUnits.map((unit, idx) => (
																	<div key={idx} className="bg-white border border-red-500 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
																		<p className="font-mono text-sm font-semibold text-gray-800">{unit.code}</p>
																		{unit.name && <p className="text-xs text-gray-600 mt-1">{unit.name}</p>}
																		<p className="text-xs text-gray-500 mt-1">{unit.creditPoints} credits</p>
																	</div>
																))}
															</div>
														) : <p className="text-sm text-gray-500">No matching units found</p>}
													</div>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div> {/* end max-w-7xl */}

						{/* Full-width Study Planner section */}
						{showStudyPlanner && (
							<div className="relative w-screen left-1/2 right-1/2 -mx-[50vw] bg-gray-50/40 py-8 px-4 md:px-8">
								{/* Remove the inner max‑width container */}
								<InlineStudyPlanner
									completedUnits={completedUnits}
									studentInfo={studentInfo}
								/>
							</div>
						)}

						{/* Empty state when no file uploaded */}
						{!searched && !studentInfo && !error && (
							<div className="max-w-7xl mx-auto mt-6">
								<div className="card-bg p-12 rounded-theme shadow-theme text-center">
									<ArrowUpTrayIcon className="h-16 w-16 text-muted mx-auto mb-4 opacity-50" />
									<p className="text-muted text-lg">Upload a Student Transcript to compare completed units with available study planners</p>
								</div>
							</div>
						)}
					</div>
				</PageLoadingWrapper>
			)}
		</ConditionalRequireAuth>
	);
}