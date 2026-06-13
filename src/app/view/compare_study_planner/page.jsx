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
	BugAntIcon, PlusIcon, PencilIcon,
} from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';
import UnitPoolToolbox from '@/app/view/unit_suggestion/UnitPoolToolbox';
import { generateStudyPlannerPdf } from '@/app/view/unit_suggestion/Exportstudyplannerpdf';
import {
	CategoryBadge, DraggableUnitCard, PanelUnitCard,
	ExternalUnitCard, SemesterDropZone,
} from '@/app/view/unit_suggestion/SuggestionUIComponents';
import {
	DEFAULT_CREDIT_POINTS, MAX_UNITS_PER_SEMESTER,
	getNormalizedUnitCode, extractUnitCode,
	scheduleRemainingUnits, balanceSemesterLoads,
	optimizeFinalSemester, compactFinalSemesters, parsePrerequisites,
} from '@/app/view/unit_suggestion/plannerHelpers';

// ─── Category Selector ────────────────────────────────────────────────────────
const CATEGORIES = [
	{ key: 'core', label: 'Core', description: 'Required core unit' },
	{ key: 'major', label: 'Major', description: 'Major specialisation unit' },
	{ key: 'elective', label: 'Elective', description: 'Elective credit' },
	{ key: 'wil', label: 'WIL', description: 'Work-integrated learning' },
];

const CategorySelector = ({ unit, onConfirm, onCancel }) => {
	const [selected, setSelected] = useState('elective');
	return (
		<div className="mt-4 border-t border-gray-100 pt-4">
			<p className="text-sm font-semibold text-gray-800 mb-2">
				Map <span className="font-mono bg-gray-100 px-1 rounded">{unit?.UnitCode || unit?.code}</span> to which category?
			</p>
			<div className="grid grid-cols-2 gap-2 mb-3">
				{CATEGORIES.map(c => (
					<button key={c.key} onClick={() => setSelected(c.key)}
						className={`text-left px-3 py-2 rounded-lg border text-sm transition-all ${selected === c.key
							? 'border-[#cc2131] bg-[#cc2131]/5 text-[#cc2131] font-medium'
							: 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
						<div className="font-medium">{c.label}</div>
						<div className="text-xs text-gray-400">{c.description}</div>
					</button>
				))}
			</div>
			<div className="flex gap-2 justify-end">
				<button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
				<button onClick={() => onConfirm(selected)} className="px-4 py-1.5 rounded-lg bg-[#cc2131] text-white text-sm font-medium hover:bg-[#b01d2c]">Confirm mapping</button>
			</div>
		</div>
	);
};

// ─── Equivalency Modal ────────────────────────────────────────────────────────
const EquivalencyModal = ({ isOpen, onClose, oldUnit, intakeYear, currentSem, onReplace }) => {
	const [state, setState] = useState({ loading: false, suggestions: [], reasoning: null, meta: null, noMatch: false, error: null, pendingUnit: null });

	const fetchSuggestions = useCallback(async () => {
		if (!oldUnit?.code) return;
		setState(s => ({ ...s, loading: true, error: null, suggestions: [], reasoning: null, meta: null, noMatch: false, pendingUnit: null }));
		try {
			const res = await fetch('/api/unit-rag', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					missingUnit: { code: oldUnit.code, name: oldUnit.name || oldUnit.code, creditPoints: oldUnit.creditPoints ?? null },
					intakeYear: intakeYear ?? new Date().getFullYear() - 1,
					currentSem: currentSem ?? null,
				}),
			});
			const data = await res.json();
			if (data.success) {
				setState(s => ({ ...s, suggestions: data.suggestions || [], reasoning: data.reasoning || null, meta: data.meta || null, noMatch: data.noMatchFound ?? (data.suggestions?.length === 0) }));
			} else {
				setState(s => ({ ...s, error: data.message || 'Failed to get suggestions from AI.' }));
			}
		} catch (err) {
			setState(s => ({ ...s, error: `Network error: ${err.message}` }));
		} finally {
			setState(s => ({ ...s, loading: false }));
		}
	}, [oldUnit, intakeYear, currentSem]);

	useEffect(() => { if (isOpen) fetchSuggestions(); }, [isOpen, fetchSuggestions]);
	if (!isOpen) return null;

	const { loading, suggestions, reasoning, meta, noMatch, error, pendingUnit } = state;

	return (
		<div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
			<div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
				<div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
					<div>
						<h2 className="text-base font-bold text-gray-900">
							Find equivalent for <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[#cc2131]">{oldUnit?.code}</code>
						</h2>
						{oldUnit?.name && oldUnit.name !== oldUnit.code && <p className="text-xs text-gray-500 mt-0.5">{oldUnit.name}</p>}
					</div>
					<div className="flex items-center gap-2">
						{meta?.model === 'similarity-only'
							? <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">⚠️ Similarity only</span>
							: meta?.model
								? <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">✅ AI · {meta.model}</span>
								: <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">RAG · llama3 · grounded</span>}
						<button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto p-6 space-y-4">
					{loading && (
						<div className="flex items-center gap-3 text-gray-600">
							<svg className="w-5 h-5 animate-spin text-[#cc2131] flex-shrink-0" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
							</svg>
							<p className="text-sm font-medium">Searching database for equivalent units…</p>
						</div>
					)}
					{!loading && error && (
						<div className="space-y-3">
							<div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
							<button onClick={fetchSuggestions} className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50">Retry</button>
						</div>
					)}
					{!loading && !error && noMatch && (
						<div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 text-center">
							No close equivalent found for <code className="font-mono font-semibold">{oldUnit?.code}</code>. Consult program coordinator.
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
							<p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{suggestions.length} suggested equivalent{suggestions.length > 1 ? 's' : ''}</p>
							{suggestions.map((sug, idx) => {
								const isBest = idx === 0;
								const isPending = pendingUnit?.code === sug.code;
								return (
									<div key={sug.code} className={`border rounded-xl p-4 ${isBest ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1">
												<div className="flex items-center gap-2 flex-wrap">
													<code className="text-xs font-mono font-bold bg-gray-100 px-1.5 py-0.5 rounded">{sug.code}</code>
													<span className="text-sm font-medium text-gray-900">{sug.name}</span>
													{isBest && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Best match</span>}
												</div>
												{sug.creditPoints && <p className="text-xs text-gray-400 mt-0.5">{sug.creditPoints} CP</p>}
											</div>
											<div className="text-center flex-shrink-0">
												<div className={`text-sm font-bold rounded-lg px-2 py-1 ${(sug.matchScore ?? 0) >= 80 ? 'bg-emerald-100 text-emerald-700' : (sug.matchScore ?? 0) >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
													{sug.matchScore ?? '—'}%
												</div>
												<p className="text-xs text-gray-400 mt-0.5">match</p>
											</div>
										</div>
										<p className="text-xs text-gray-500 mt-2 italic bg-gray-50 px-3 py-2 rounded-lg">{sug.reason}</p>
										{sug.caveats && (
											<div className="mt-2 flex items-start gap-1.5">
												<ExclamationTriangleIcon className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
												<p className="text-xs text-amber-700">{sug.caveats}</p>
											</div>
										)}
										{!isPending
											? <button onClick={() => setState(s => ({ ...s, pendingUnit: sug }))} className="mt-3 px-3 py-1.5 rounded-lg bg-[#cc2131] text-white text-xs font-medium hover:bg-[#b01d2c]">Use this unit</button>
											: <CategorySelector unit={sug}
												onConfirm={(category) => {
													onReplace({ UnitCode: sug.code, Name: sug.name, CreditPoints: sug.creditPoints ?? DEFAULT_CREDIT_POINTS }, category);
													setState(s => ({ ...s, pendingUnit: null }));
												}}
												onCancel={() => setState(s => ({ ...s, pendingUnit: null }))} />}
									</div>
								);
							})}
						</div>
					)}
				</div>

				<div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
					{meta
						? <p className="text-xs text-gray-400">Scanned {meta.totalUnitsScanned ?? '?'} units · {meta.candidatesRetrieved ?? '?'} candidates · {meta.model ?? 'llama3'}{meta.elapsedMs ? ` · ${meta.elapsedMs}ms` : ''}</p>
						: <span />}
					<button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Close</button>
				</div>
			</div>
		</div>
	);
};

// ─── Helper: build a completed-units Map from all sources ────────────────────
function buildCompletedMap(completedUnits, mappedExternalUnits) {
	const map = new Map();
	const add = (code, unit) => {
		if (!code) return;
		map.set(code.toUpperCase(), unit);
		map.set(getNormalizedUnitCode(code.toUpperCase()), unit);
	};
	(completedUnits || []).forEach(u => add(u.code, u));
	Object.values(mappedExternalUnits || {}).flat().forEach(u => add(u.code, u));
	return map;
}

// ─── Helper: get the units that are still needed, per category, respecting requirements ───
function getNeededUnitsPerCategory(planner, completedMap, mappedExternalUnits) {
	const plannerUnits = planner.units || [];
	const template = planner.plannerTemplate;
	
	console.group('🔍 getNeededUnitsPerCategory');
	console.log('Planner name:', planner.name);
	console.log('Template requirements:', template?.requirements);
	
	if (!template?.requirements?.length) {
		console.warn('No template requirements found – falling back to all missing units');
		console.groupEnd();
		const missing = plannerUnits.filter(u => {
			const code = extractUnitCode(u.UnitCode).toUpperCase();
			return !completedMap.has(code) && !completedMap.has(getNormalizedUnitCode(code));
		});
		return missing;
	}

	const completedCountByCategory = new Map();
	template.requirements.forEach(req => {
		completedCountByCategory.set(req.unitType.Name, 0);
	});

	plannerUnits.forEach(unit => {
		const cat = unit.unitType?.Name;
		if (!cat) return;
		const code = extractUnitCode(unit.UnitCode).toUpperCase();
		if (completedMap.has(code) || completedMap.has(getNormalizedUnitCode(code))) {
			completedCountByCategory.set(cat, (completedCountByCategory.get(cat) || 0) + 1);
		}
	});

	Object.entries(mappedExternalUnits).forEach(([cat, units]) => {
		const current = completedCountByCategory.get(cat) || 0;
		completedCountByCategory.set(cat, current + units.length);
	});

	console.log('Completed counts per category:', Object.fromEntries(completedCountByCategory));

	const neededByCategory = new Map();
	template.requirements.forEach(req => {
		const completed = completedCountByCategory.get(req.unitType.Name) || 0;
		const needed = Math.max(0, req.requiredCount - completed);
		if (needed > 0) neededByCategory.set(req.unitType.Name, needed);
	});
	console.log('Needed per category:', Object.fromEntries(neededByCategory));

	const pendingByCategory = new Map();
	plannerUnits.forEach(unit => {
		const cat = unit.unitType?.Name;
		if (!cat) return;
		const code = extractUnitCode(unit.UnitCode).toUpperCase();
		const isCompleted = completedMap.has(code) || completedMap.has(getNormalizedUnitCode(code));
		if (!isCompleted) {
			if (!pendingByCategory.has(cat)) pendingByCategory.set(cat, []);
			pendingByCategory.get(cat).push(unit);
		}
	});
	console.log('Pending units per category:', Object.fromEntries(
		[...pendingByCategory.entries()].map(([k, v]) => [k, v.map(u => u.UnitCode)])
	));

	const unitsToSchedule = [];
	for (const [cat, needed] of neededByCategory.entries()) {
		const pending = pendingByCategory.get(cat) || [];
		const take = pending.slice(0, needed);
		console.log(`Taking ${take.length} of ${pending.length} pending units from "${cat}" (need ${needed})`);
		unitsToSchedule.push(...take);
	}
	console.log('Final units to schedule:', unitsToSchedule.map(u => u.UnitCode));
	console.groupEnd();
	return unitsToSchedule;
}

// ─── Editable Semester Header Component ──────────────────────────────────────
const EditableSemesterHeader = ({ year, semester, onYearChange, onSemesterChange, onRemove }) => {
	const [editYear, setEditYear] = useState(year);
	const [editSem, setEditSem] = useState(semester);
	const [isEditing, setIsEditing] = useState(false);

	const handleSave = () => {
		const newYear = parseInt(editYear, 10);
		const newSem = parseInt(editSem, 10);
		if (!isNaN(newYear) && newYear > 0 && !isNaN(newSem) && newSem >= 1 && newSem <= 3) {
			onYearChange(newYear);
			onSemesterChange(newSem);
		} else {
			setEditYear(year);
			setEditSem(semester);
		}
		setIsEditing(false);
	};

	if (isEditing) {
		return (
			<div className="flex items-center gap-2">
				<input
					type="number"
					value={editYear}
					onChange={(e) => setEditYear(e.target.value)}
					className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md"
					min="1"
				/>
				<span className="text-sm text-gray-500">Year</span>
				<input
					type="number"
					value={editSem}
					onChange={(e) => setEditSem(e.target.value)}
					className="w-12 px-2 py-1 text-sm border border-gray-300 rounded-md"
					min="1"
					max="3"
				/>
				<span className="text-sm text-gray-500">Semester</span>
				<button onClick={handleSave} className="text-xs bg-green-600 text-white px-2 py-1 rounded-md hover:bg-green-700">Save</button>
				<button onClick={() => setIsEditing(false)} className="text-xs bg-gray-300 px-2 py-1 rounded-md">Cancel</button>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<h4 className="font-semibold text-[#111827] text-sm">Year {year}, Semester {semester}</h4>
			<button onClick={() => setIsEditing(true)} className="text-gray-400 hover:text-gray-600">
				<PencilIcon className="h-3.5 w-3.5" />
			</button>
			{onRemove && (
				<button onClick={onRemove} className="text-red-400 hover:text-red-600 ml-2">
					<XMarkIcon className="h-4 w-4" />
				</button>
			)}
		</div>
	);
};

// ─── Add Unit Modal ──────────────────────────────────────────────────────────
const AddUnitModal = ({ isOpen, onClose, availableUnits, onAddUnit }) => {
	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
			<div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl">
				<div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
					<h3 className="text-lg font-semibold text-gray-900">Add Unit to Semester</h3>
					<button onClick={onClose} className="text-gray-400 hover:text-gray-600">
						<XMarkIcon className="h-5 w-5" />
					</button>
				</div>
				<div className="flex-1 overflow-y-auto p-4 space-y-2">
					{availableUnits.length === 0 ? (
						<p className="text-center text-gray-500 py-8">No units available to add.</p>
					) : (
						availableUnits.map(unit => {
							const unitType = unit.unitType?.Name || 'Elective';
							let badgeColor = 'bg-gray-100 text-gray-700';
							if (unitType === 'Core') badgeColor = 'bg-blue-100 text-blue-700';
							else if (unitType === 'Major') badgeColor = 'bg-purple-100 text-purple-700';
							else if (unitType === 'WIL') badgeColor = 'bg-green-100 text-green-700';
							return (
								<div key={unit.UnitCode} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => onAddUnit(unit)}>
									<div className="flex justify-between items-start">
										<div className="flex-1">
											<div className="font-mono text-sm font-semibold">{unit.UnitCode}</div>
											<div className="text-xs text-gray-600">{unit.Name}</div>
											<div className="text-xs text-gray-400 mt-1">{unit.CreditPoints || DEFAULT_CREDIT_POINTS} CP</div>
										</div>
										<span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor}`}>{unitType}</span>
									</div>
								</div>
							);
						})
					)}
				</div>
				<div className="px-6 py-3 border-t border-gray-100 flex justify-end">
					<button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Close</button>
				</div>
			</div>
		</div>
	);
};

// ─── Inline Study Planner ─────────────────────────────────────────────────────
const InlineStudyPlanner = ({ completedUnits, studentInfo, initialPlannerId }) => {
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
	const [mappedExternalUnits, setMappedExternalUnits] = useState({});
	const [showToolbox, setShowToolbox] = useState(false);
	const [pdfLoading, setPdfLoading] = useState(false);
	const [allPlannersWithScores, setAllPlannersWithScores] = useState([]);
	const [topPlanners, setTopPlanners] = useState([]);
	const [manualPlannerId, setManualPlannerId] = useState('');
	const [equivModal, setEquivModal] = useState({ open: false, unit: null });
	const [showDebug, setShowDebug] = useState(false);
	const [debugInfo, setDebugInfo] = useState(null);
	const [addUnitModal, setAddUnitModal] = useState({ isOpen: false, semesterIdx: null, availableUnits: [] });
	const hasInitiallySelected = useRef(false);

	const intakeYear = studentInfo?.intakeYear ?? studentInfo?.intake_year ?? (new Date().getFullYear() - 1);
	const currentSem = `${new Date().getFullYear()} Sem ${new Date().getMonth() < 6 ? 1 : 2}`;

	// Compute planner scores
	const computePlannerScores = useCallback((planners, completed) => {
		if (!planners.length || !completed.length) return [];
		const completedCodes = new Set(completed.map(u => u.code?.toUpperCase()).filter(Boolean));
		return planners.map(p => {
			const plannerCodes = new Set((p.units || []).map(u => extractUnitCode(u.UnitCode).toUpperCase()));
			return { ...p, matchedUnits: [...completedCodes].filter(c => plannerCodes.has(c)).length, totalCompleted: completedCodes.size };
		}).sort((a, b) => b.matchedUnits - a.matchedUnits);
	}, []);

	// Core schedule generator (uses category requirements)
	const generateSchedule = useCallback((planner, mapped = mappedExternalUnits) => {
		if (!planner) return;
		setScheduleLoading(true);
		setEditableSchedule([]);
		try {
			const plannerUnits = planner.units || [];
			if (!plannerUnits.length) return;

			const plannerUnitByCode = new Map();
			plannerUnits.forEach(u => plannerUnitByCode.set(extractUnitCode(u.UnitCode).toUpperCase(), u));

			const completedMap = buildCompletedMap(completedUnits, mapped);

			const uncounted = [];
			(completedUnits || []).forEach(u => {
				const code = u.code?.toUpperCase();
				if (code && !plannerUnitByCode.has(code)) uncounted.push({ code, name: u.name || u.unitName || '' });
			});
			setUnrecognisedUnits(
				uncounted.filter(u => !Object.values(mapped).flat().some(m => m.code?.toUpperCase() === u.code))
			);

			const neededUnits = getNeededUnitsPerCategory(planner, completedMap, mapped);
			
			// Store debug info for UI
			if (planner.plannerTemplate?.requirements) {
				const template = planner.plannerTemplate;
				const completedCountByCategory = new Map();
				template.requirements.forEach(req => completedCountByCategory.set(req.unitType.Name, 0));
				plannerUnits.forEach(unit => {
					const cat = unit.unitType?.Name;
					if (!cat) return;
					const code = extractUnitCode(unit.UnitCode).toUpperCase();
					if (completedMap.has(code) || completedMap.has(getNormalizedUnitCode(code))) {
						completedCountByCategory.set(cat, (completedCountByCategory.get(cat) || 0) + 1);
					}
				});
				Object.entries(mapped).forEach(([cat, units]) => {
					completedCountByCategory.set(cat, (completedCountByCategory.get(cat) || 0) + units.length);
				});
				const neededByCategory = {};
				template.requirements.forEach(req => {
					const completed = completedCountByCategory.get(req.unitType.Name) || 0;
					const needed = Math.max(0, req.requiredCount - completed);
					if (needed > 0) neededByCategory[req.unitType.Name] = needed;
				});
				const pendingByCategory = {};
				plannerUnits.forEach(unit => {
					const cat = unit.unitType?.Name;
					if (!cat) return;
					const code = extractUnitCode(unit.UnitCode).toUpperCase();
					const isCompleted = completedMap.has(code) || completedMap.has(getNormalizedUnitCode(code));
					if (!isCompleted) {
						if (!pendingByCategory[cat]) pendingByCategory[cat] = [];
						pendingByCategory[cat].push(unit.UnitCode);
					}
				});
				setDebugInfo({
					templateRequirements: template.requirements.map(r => ({ name: r.unitType.Name, required: r.requiredCount })),
					completedCounts: Object.fromEntries(completedCountByCategory),
					neededCounts: neededByCategory,
					pendingUnits: pendingByCategory,
					selectedUnits: neededUnits.map(u => u.UnitCode),
				});
			}

			if (neededUnits.length === 0) {
				setEditableSchedule([]);
				setShowFullPlan(true);
				setRecommendations(prev => ({ ...(prev || {}), unitsToGraduate: 0 }));
				return;
			}

			const prereqMap = new Map();
			neededUnits.forEach(u => {
				const parsed = parsePrerequisites(u.Prerequisites || '');
				prereqMap.set(extractUnitCode(u.UnitCode), ['unit', 'and', 'or'].includes(parsed.type) ? parsed.conditions.filter(c => c.type === 'unit').map(c => c.code) : []);
			});
			const unitsWithPrereqs = neededUnits.map(u => ({ ...u, prerequisites: prereqMap.get(extractUnitCode(u.UnitCode)) || [] }));

			let totalCompleted = 0;
			for (const code of completedMap.keys()) {
				if (plannerUnitByCode.has(code)) totalCompleted++;
			}
			const totalCredits = totalCompleted * DEFAULT_CREDIT_POINTS;

			let { schedule } = scheduleRemainingUnits(unitsWithPrereqs, completedMap, totalCredits, currentYear, currentSemester, completedUnits.length, 100, 100, 100);

			if (!schedule?.length) {
				schedule = [];
				const unitsPerSem = 4;
				for (let i = 0; i < neededUnits.length; i += unitsPerSem) {
					const chunk = neededUnits.slice(i, i + unitsPerSem);
					schedule.push({ year: Math.floor(i / (unitsPerSem * 2)) + 1, semester: (Math.floor(i / unitsPerSem) % 2) + 1, units: chunk, unitCount: chunk.length, totalCredits: chunk.length * DEFAULT_CREDIT_POINTS });
				}
			}

			schedule = compactFinalSemesters(schedule, completedMap);
			schedule = balanceSemesterLoads(schedule, completedMap);
			schedule = optimizeFinalSemester(schedule);
			setEditableSchedule(schedule);
			setShowFullPlan(true);

			setRecommendations({
				totalCompleted,
				totalCredits,
				plannerName: planner.name,
				completedPercent: (totalCompleted / plannerUnits.length) * 100,
				currentYear,
				currentSemester,
				creditsToGraduate: Math.max(0, (plannerUnits.length * DEFAULT_CREDIT_POINTS) - totalCredits),
				unitsToGraduate: neededUnits.length,
			});
		} catch (e) { console.error(e); }
		finally { setScheduleLoading(false); }
	}, [completedUnits, currentYear, currentSemester, mappedExternalUnits]);

	// Panel grouping
	const getPlannerUnitsWithStatus = useCallback(() => {
		if (!selectedFieldPlanner) return {};
		const plannerUnits = selectedFieldPlanner.units || [];
		const template = selectedFieldPlanner.plannerTemplate;

		let categoryNames = template?.requirements?.length
			? template.requirements.map(r => r.unitType.Name)
			: (() => {
				const s = new Set();
				plannerUnits.forEach(u => u.unitType?.Name && s.add(u.unitType.Name));
				return s.size ? Array.from(s) : ['Core', 'Major', 'Elective', 'WIL'];
			})();

		const completedMap = buildCompletedMap(completedUnits, mappedExternalUnits);

		const scheduledCodeSet = new Set();
		editableSchedule.flatMap(s => s.units).forEach(u => {
			const code = extractUnitCode(u.UnitCode || '');
			scheduledCodeSet.add(code);
			scheduledCodeSet.add(getNormalizedUnitCode(code));
		});

		const result = Object.fromEntries([...categoryNames, 'Other'].map(c => [c, []]));

		plannerUnits.forEach(unit => {
			const cat = unit.unitType?.Name || 'Other';
			const target = result[cat] ? cat : 'Other';
			const code = extractUnitCode(unit.UnitCode);
			let status = 'pending';
			if (completedMap.has(code) || completedMap.has(getNormalizedUnitCode(code))) status = 'completed';
			else if (scheduledCodeSet.has(code) || scheduledCodeSet.has(getNormalizedUnitCode(code))) status = 'scheduled';
			result[target].push({ ...unit, status, isMappedExternal: false });
		});

		Object.entries(mappedExternalUnits).forEach(([catName, extUnits]) => {
			if (!result[catName]) result[catName] = [];
			extUnits.forEach(u => result[catName].push({
				...u, status: 'completed', isMappedExternal: true,
				CreditPoints: u.creditPoints || DEFAULT_CREDIT_POINTS, Name: u.name, UnitCode: u.code,
			}));
		});

		Object.keys(result).forEach(cat => { if (!result[cat].length && cat !== 'Other') delete result[cat]; });
		return result;
	}, [selectedFieldPlanner, completedUnits, editableSchedule, mappedExternalUnits]);

	const handleSelectPlanner = (planner) => {
		setSelectedFieldPlanner(planner);
		setRecommendations(null);
		setMappedExternalUnits({});
		setDebugInfo(null);
		generateSchedule(planner, {});
	};

	// External unit mapping
	const handleMapExternalToCategory = useCallback((category, externalUnit) => {
		const unitToAdd = category === 'wil' && externalUnit.code?.toUpperCase() === 'ICT20016'
			? { ...externalUnit, doubleCount: true, creditPoints: (externalUnit.creditPoints || DEFAULT_CREDIT_POINTS) * 2 }
			: { ...externalUnit };
		setUnrecognisedUnits(prev => prev.filter(u => u.code !== externalUnit.code));
		setMappedExternalUnits(prev => ({ ...prev, [category]: [...(prev[category] || []), unitToAdd] }));
	}, []);

	const handleRemoveMappedUnit = useCallback((category, unitToRemove) => {
		setUnrecognisedUnits(prev => prev.some(u => u.code === unitToRemove.code) ? prev : [...prev, unitToRemove]);
		setMappedExternalUnits(prev => ({ ...prev, [category]: (prev[category] || []).filter(u => u.code !== unitToRemove.code) }));
	}, []);

	const handleReplaceUnrecognisedUnit = useCallback((dbUnit, category) => {
		handleMapExternalToCategory(category, {
			code: dbUnit.UnitCode, name: dbUnit.Name,
			creditPoints: dbUnit.CreditPoints || DEFAULT_CREDIT_POINTS,
			originalCode: equivModal.unit?.code,
		});
		setEquivModal({ open: false, unit: null });
	}, [handleMapExternalToCategory, equivModal.unit]);

	// Remove unit from semester
	const handleRemoveUnit = useCallback((semIdx, unitIdx) => {
		setEditableSchedule(prev => {
			const s = prev.map(x => ({ ...x, units: [...x.units] }));
			s[semIdx].units.splice(unitIdx, 1);
			s[semIdx].unitCount = s[semIdx].units.length;
			s[semIdx].totalCredits = s[semIdx].units.reduce((t, u) => t + (u.CreditPoints || DEFAULT_CREDIT_POINTS), 0);
			return s.filter(x => x.units.length > 0);
		});
	}, []);

	const handleExportPdf = useCallback(async () => {
		if (!editableSchedule.length) return;
		setPdfLoading(true);
		try {
			await generateStudyPlannerPdf({
				editableSchedule, recommendations, studentInfo, completedUnits,
				filename: `study-planner-${studentInfo?.studentId ?? 'student'}-${(recommendations?.plannerName ?? 'planner').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.pdf`,
			});
		} catch (err) { console.error('PDF export failed:', err); }
		finally { setPdfLoading(false); }
	}, [editableSchedule, recommendations, studentInfo, completedUnits]);

	// Add semester
	const handleAddSemester = () => {
		const lastSem = editableSchedule[editableSchedule.length - 1];
		let newYear = 1;
		let newSemester = 1;
		if (lastSem) {
			newYear = lastSem.year;
			newSemester = lastSem.semester + 1;
			if (newSemester > 3) {
				newSemester = 1;
				newYear++;
			}
		}
		const newSem = {
			year: newYear,
			semester: newSemester,
			units: [],
			unitCount: 0,
			totalCredits: 0,
		};
		setEditableSchedule(prev => [...prev, newSem]);
	};

	// Update semester metadata
	const handleSemesterYearChange = (idx, newYear) => {
		setEditableSchedule(prev => prev.map((sem, i) => i === idx ? { ...sem, year: newYear } : sem));
	};
	const handleSemesterSemesterChange = (idx, newSem) => {
		setEditableSchedule(prev => prev.map((sem, i) => i === idx ? { ...sem, semester: newSem } : sem));
	};
	const handleRemoveSemester = (idx) => {
		setEditableSchedule(prev => prev.filter((_, i) => i !== idx));
	};

	// Get all units from panels (including pending, scheduled, completed) but exclude those already in the target semester
	const getAllPanelUnits = () => {
		const grouped = getPlannerUnitsWithStatus();
		const allUnits = [];
		Object.entries(grouped).forEach(([category, units]) => {
			units.forEach(unit => {
				allUnits.push({ ...unit, category }); // attach category for display
			});
		});
		return allUnits;
	};

	// Add unit to semester
	const handleAddUnitToSemester = (semesterIdx, unit) => {
		setEditableSchedule(prev => {
			const newSchedule = [...prev];
			const sem = newSchedule[semesterIdx];
			if (!sem) return prev;
			// Avoid duplicates by code
			if (sem.units.some(u => extractUnitCode(u.UnitCode) === extractUnitCode(unit.UnitCode))) {
				alert('Unit already in this semester');
				return prev;
			}
			const newUnits = [...sem.units, unit];
			const totalCredits = newUnits.reduce((sum, u) => sum + (u.CreditPoints || DEFAULT_CREDIT_POINTS), 0);
			newSchedule[semesterIdx] = {
				...sem,
				units: newUnits,
				unitCount: newUnits.length,
				totalCredits,
			};
			return newSchedule;
		});
		setAddUnitModal({ isOpen: false, semesterIdx: null, availableUnits: [] });
	};

	// Open add unit modal for a specific semester
	const openAddUnitModal = (semesterIdx) => {
		const allPanelUnits = getAllPanelUnits();
		const currentSemesterUnits = editableSchedule[semesterIdx]?.units || [];
		const currentCodes = new Set(currentSemesterUnits.map(u => extractUnitCode(u.UnitCode).toUpperCase()));
		// Show units that are not already in this semester (regardless of status)
		const available = allPanelUnits.filter(unit => !currentCodes.has(extractUnitCode(unit.UnitCode).toUpperCase()));
		setAddUnitModal({ isOpen: true, semesterIdx, availableUnits: available });
	};

	// Effects
	useEffect(() => {
		setPlannersLoading(true);
		fetch('/api/study-planner', { headers: { 'x-dev-override': 'true' } })
			.then(r => r.json())
			.then(json => { if (json.success) setAllPlanners(json.data || []); else setPlannersError('Failed to load planners.'); })
			.catch(() => setPlannersError('Network error fetching planners.'))
			.finally(() => setPlannersLoading(false));
	}, []);

	useEffect(() => {
		if (!allPlanners.length || !completedUnits?.length) return;
		const scored = computePlannerScores(allPlanners, completedUnits);
		setAllPlannersWithScores(scored);
		setTopPlanners(scored.slice(0, 5));
		if (!selectedFieldPlanner && scored.length) {
			const target = initialPlannerId ? scored.find(p => p.id === initialPlannerId) ?? scored[0] : scored[0];
			handleSelectPlanner(target);
		}
	}, [allPlanners, completedUnits]);

	useEffect(() => {
		if (!hasInitiallySelected.current && topPlanners.length > 0 && completedUnits?.length && !selectedFieldPlanner) {
			hasInitiallySelected.current = true;
			handleSelectPlanner(topPlanners[0]);
		}
	}, [topPlanners]);

	useEffect(() => {
		if (!completedUnits) return;
		const completedSems = Math.floor(completedUnits.length / MAX_UNITS_PER_SEMESTER);
		const order = Math.max(1, completedSems) + 1;
		setCurrentYear(Math.floor((order - 1) / 2) + 1);
		setCurrentSemester((order - 1) % 2 === 0 ? 1 : 2);
	}, [completedUnits]);

	useEffect(() => {
		if (selectedFieldPlanner && completedUnits && !recommendations) generateSchedule(selectedFieldPlanner);
	}, [selectedFieldPlanner, completedUnits, currentYear, currentSemester]);

	const groupedUnits = getPlannerUnitsWithStatus();
	const allExternalMapped = unrecognisedUnits.length === 0;

	return (
		<div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
			{/* Header */}
			<div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
				<div className="flex items-center gap-3">
					<div className="border border-[#cc2131]/30 text-[#cc2131] bg-[#cc2131]/5 p-2 rounded-xl">
						<CalendarIcon className="h-6 w-6" />
					</div>
					<div>
						<h2 className="text-xl font-bold text-[#111827]">Study Planner Recommendation</h2>
						<p className="text-gray-500 text-xs">{plannersLoading ? 'Loading planners…' : `${allPlanners.length} planner(s) available`}</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button onClick={() => setShowDebug(v => !v)}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${showDebug ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5' : 'border-gray-300 text-gray-600 hover:border-[#cc2131] hover:text-[#cc2131]'}`}>
						<BugAntIcon className="h-4 w-4" /><span className="hidden sm:inline">Debug</span>
					</button>
					<button onClick={() => setShowToolbox(v => !v)}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${showToolbox ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5' : 'border-gray-300 text-gray-600 hover:border-[#cc2131] hover:text-[#cc2131]'}`}>
						<WrenchScrewdriverIcon className="h-4 w-4" /><span className="hidden sm:inline">Unit Toolbox</span>
					</button>
				</div>
			</div>

			<div className="p-6 bg-gray-50/40 space-y-5">
				{plannersError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm flex items-center gap-2"><ExclamationTriangleIcon className="h-4 w-4" />{plannersError}</div>}

				{/* Debug Panel - Enhanced to show all panel units */}
				{showDebug && debugInfo && (
					<div className="bg-gray-900 text-gray-100 rounded-xl p-4 font-mono text-xs overflow-auto max-h-96">
						<h3 className="text-sm font-bold text-white mb-2">🔍 Debug: Category Requirement Analysis</h3>
						<div className="space-y-2">
							<div><span className="text-yellow-400">Template Requirements:</span> {JSON.stringify(debugInfo.templateRequirements, null, 2)}</div>
							<div><span className="text-yellow-400">Completed Counts (transcript + mapped):</span> {JSON.stringify(debugInfo.completedCounts, null, 2)}</div>
							<div><span className="text-yellow-400">Needed Counts:</span> {JSON.stringify(debugInfo.neededCounts, null, 2)}</div>
							<div><span className="text-yellow-400">Pending Units (from planner, not completed):</span> {JSON.stringify(debugInfo.pendingUnits, null, 2)}</div>
							<div><span className="text-green-400">Selected Units to Schedule:</span> {JSON.stringify(debugInfo.selectedUnits, null, 2)}</div>
						</div>
						<p className="text-gray-400 mt-3 border-t border-gray-700 pt-2">If a category is missing from "Needed Counts", either it's already satisfied or the template doesn't require it.</p>
					</div>
				)}

				{/* Debug: Show all panel units and their status */}
				{showDebug && selectedFieldPlanner && (
					<div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
						<h3 className="text-sm font-bold text-blue-800 mb-2">📋 All Panel Units (from getPlannerUnitsWithStatus)</h3>
						<div className="max-h-60 overflow-y-auto">
							<table className="w-full text-xs">
								<thead className="bg-blue-100 sticky top-0">
									<tr>
										<th className="text-left p-1">Code</th>
										<th className="text-left p-1">Name</th>
										<th className="text-left p-1">Category</th>
										<th className="text-left p-1">Status</th>
									</tr>
								</thead>
								<tbody>
									{Object.entries(groupedUnits).map(([cat, units]) =>
										units.map((unit, idx) => (
											<tr key={`${cat}-${idx}`} className="border-t border-blue-200">
												<td className="p-1 font-mono">{unit.UnitCode || unit.code}</td>
												<td className="p-1 truncate max-w-[200px]">{unit.Name || unit.name}</td>
												<td className="p-1">{cat}</td>
												<td className="p-1">
													<span className={`px-1.5 py-0.5 rounded-full ${unit.status === 'completed' ? 'bg-green-200 text-green-800' : unit.status === 'scheduled' ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-800'}`}>
														{unit.status}
													</span>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
						<p className="text-xs text-blue-600 mt-2">Units with status 'pending' are not yet scheduled or completed.</p>
					</div>
				)}

				{/* Planner selector chips */}
				{topPlanners.length > 0 && (
					<div>
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top matching planners</span>
							<span className="text-xs text-gray-400">Match score (completed units)</span>
						</div>
						<div className="flex flex-wrap gap-2">
							{topPlanners.map(p => (
								<button key={p.id} onClick={() => handleSelectPlanner(p)}
									className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${selectedFieldPlanner?.id === p.id ? 'border-[#cc2131] text-[#cc2131] bg-[#cc2131]/5' : 'border-gray-300 text-gray-600 bg-white hover:border-[#cc2131] hover:text-[#cc2131]'}`}>
									{p.name} ({p.matchedUnits}/{completedUnits?.length || 0})
								</button>
							))}
						</div>
					</div>
				)}

				{allPlannersWithScores.length > 0 && (
					<div className="flex items-center gap-3">
						<span className="text-xs text-gray-500">Or select any planner:</span>
						<select value={manualPlannerId}
							onChange={e => { const id = e.target.value; setManualPlannerId(id); if (id) { const p = allPlannersWithScores.find(x => x.id === parseInt(id)); if (p) handleSelectPlanner(p); } }}
							className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-[#cc2131]/30">
							<option value="">-- Choose a planner --</option>
							{allPlannersWithScores.map(p => <option key={p.id} value={p.id}>{p.name} (matched: {p.matchedUnits}/{completedUnits?.length || 0})</option>)}
						</select>
					</div>
				)}

				{/* Category panels */}
				{selectedFieldPlanner && (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						{Object.entries(groupedUnits).map(([catName, units]) => (
							<div key={catName}
								className="bg-white rounded-xl border-2 border-red-500 p-3 flex flex-col">
								<div className="flex items-center justify-between mb-2">
									<h4 className="font-semibold text-gray-800 text-sm capitalize">{catName}</h4>
									<span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{units.length} units</span>
								</div>
								<div className="space-y-2 max-h-80 overflow-y-auto pr-1 flex-1">
									{units.map((unit, idx) => {
										let badgeColor = 'bg-gray-100 text-gray-700';
										if (catName === 'Core') badgeColor = 'bg-blue-100 text-blue-700';
										else if (catName === 'Major') badgeColor = 'bg-purple-100 text-purple-700';
										else if (catName === 'WIL') badgeColor = 'bg-green-100 text-green-700';
										return (
											<div key={`${catName}-${idx}-${unit.UnitCode || unit.code}`} className="border border-gray-200 rounded-lg p-2 bg-white">
												<div className="flex justify-between items-start">
													<div className="flex-1">
														<div className="font-mono text-xs font-semibold">{unit.UnitCode || unit.code}</div>
														<div className="text-xs text-gray-600">{unit.Name || unit.name}</div>
														<div className="text-xs text-gray-400">{unit.CreditPoints || DEFAULT_CREDIT_POINTS} CP</div>
													</div>
													<div className="flex flex-col items-end gap-1">
														<span className={`text-xs px-1.5 py-0.5 rounded-full ${badgeColor}`}>{catName}</span>
														{unit.status === 'completed' && <span className="text-xs text-green-600">✓ Completed</span>}
														{unit.status === 'scheduled' && <span className="text-xs text-yellow-600">📅 Scheduled</span>}
														{unit.isMappedExternal && (
															<button onClick={() => handleRemoveMappedUnit(catName, unit)} className="text-xs text-red-500 hover:text-red-700">Remove mapping</button>
														)}
													</div>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						))}
					</div>
				)}

				{/* Graduation requirements progress */}
				{selectedFieldPlanner?.plannerTemplate?.requirements && (
					<div className="bg-white rounded-xl border border-gray-200 p-4">
						<h4 className="font-semibold text-[#111827] text-sm mb-3 flex items-center gap-2">
							<CheckCircleIcon className="h-4 w-4 text-green-600" />Graduation Requirements Progress
						</h4>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							{selectedFieldPlanner.plannerTemplate.requirements.map(req => {
								const reqName = req.unitType.Name;
								const categoryUnits = groupedUnits[reqName] || [];
								const completedCount = categoryUnits.filter(u => u.status === 'completed').length;
								const percent = Math.min(100, (completedCount / req.requiredCount) * 100);
								return (
									<div key={reqName}>
										<div className="flex justify-between text-xs text-gray-600 mb-1">
											<span className="font-medium capitalize">{reqName}</span>
											<span>{completedCount} / {req.requiredCount}</span>
										</div>
										<div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
											<div className={`h-2.5 rounded-full transition-all ${completedCount >= req.requiredCount ? 'bg-green-500' : 'bg-[#cc2131]'}`} style={{ width: `${percent}%` }} />
										</div>
									</div>
								);
							})}
						</div>
						<p className="text-xs text-gray-400 mt-3 text-center">{Object.keys(groupedUnits).length} categories · {unrecognisedUnits.length} external units unmapped</p>
					</div>
				)}

				{/* Unrecognised units panel */}
				<div className="bg-white rounded-xl border border-gray-200 p-3">
					<h4 className="font-semibold text-[#111827] text-sm mb-2 flex items-center gap-1">
						Completed units not in planner
						<span className="text-xs font-normal text-gray-500 ml-auto">{unrecognisedUnits.length} units</span>
					</h4>
					{unrecognisedUnits.length > 0 && (
						<div className="space-y-2 max-h-60 overflow-y-auto pr-1">
							{unrecognisedUnits.map((unit, idx) => (
								<div key={`ext-${idx}`} className="border border-gray-200 rounded-lg p-3 bg-white">
									<div className="flex justify-between items-start">
										<div>
											<code className="font-mono font-semibold">{unit.code}</code>
											<p className="text-xs text-gray-500">{unit.name}</p>
										</div>
										<div className="flex gap-2 flex-wrap">
											{Object.keys(groupedUnits).map(cat => (
												<button key={cat} onClick={() => handleMapExternalToCategory(cat, unit)} className="px-2 py-1 text-xs rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200">
													Map to {cat}
												</button>
											))}
										</div>
									</div>
								</div>
							))}
						</div>
					)}
					<div className="mt-3 flex justify-end">
						<button
							onClick={() => generateSchedule(selectedFieldPlanner, mappedExternalUnits)}
							disabled={!allExternalMapped || scheduleLoading || !selectedFieldPlanner}
							className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all ${allExternalMapped && !scheduleLoading && selectedFieldPlanner ? 'border-[#cc2131] text-[#cc2131] bg-white hover:bg-[#cc2131]/5' : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'}`}>
							{scheduleLoading ? <><ArrowPathIcon className="h-4 w-4 animate-spin" />Generating…</> : <><ArrowPathIcon className="h-4 w-4" />Generate Study Plan</>}
						</button>
					</div>
					{!allExternalMapped && !scheduleLoading && <p className="text-xs text-amber-600 mt-2 text-right">⚠️ Map all external units first</p>}
				</div>

				{/* Schedule display with Add Unit buttons and unit badges */}
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
				) : showFullPlan && (
					<div>
						<div className="flex items-center justify-between mb-3">
							<div className="flex items-center gap-2">
								<CalendarIcon className="h-5 w-5 text-[#cc2131]" />
								<h3 className="text-base font-bold text-[#111827]">Full Study Plan</h3>
								<span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{editableSchedule.length} semester(s)</span>
							</div>
							<button
								onClick={handleAddSemester}
								className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
							>
								<PlusIcon className="h-4 w-4" /> Add Semester
							</button>
						</div>
						<div className="space-y-3">
							{editableSchedule.map((sem, semIdx) => (
								<div key={`${sem.year}-${sem.semester}-${semIdx}`} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
									<div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
										<EditableSemesterHeader
											year={sem.year}
											semester={sem.semester}
											onYearChange={(newYear) => handleSemesterYearChange(semIdx, newYear)}
											onSemesterChange={(newSem) => handleSemesterSemesterChange(semIdx, newSem)}
											onRemove={() => handleRemoveSemester(semIdx)}
										/>
										<div className="flex items-center gap-3">
											<span className="text-xs text-gray-500">{sem.unitCount} unit(s) · {sem.totalCredits} CP</span>
											<button
												onClick={() => openAddUnitModal(semIdx)}
												className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
											>
												<PlusIcon className="h-3 w-3" /> Add Unit
											</button>
										</div>
									</div>
									<div className="p-3 space-y-1.5">
										{sem.units.map((unit, unitIdx) => {
											const unitType = unit.unitType?.Name || 'Elective';
											let badgeColor = 'bg-gray-100 text-gray-700';
											if (unitType === 'Core') badgeColor = 'bg-blue-100 text-blue-700';
											else if (unitType === 'Major') badgeColor = 'bg-purple-100 text-purple-700';
											else if (unitType === 'WIL') badgeColor = 'bg-green-100 text-green-700';
											return (
												<div key={`${semIdx}-${unitIdx}-${unit.UnitCode}`} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-2 hover:shadow-sm transition-shadow">
													<div className="flex-1">
														<div className="flex items-center gap-2">
															<span className="font-mono text-sm font-semibold">{unit.UnitCode}</span>
															<span className={`text-xs px-1.5 py-0.5 rounded-full ${badgeColor}`}>{unitType}</span>
														</div>
														<div className="text-xs text-gray-600">{unit.Name}</div>
														<div className="text-xs text-gray-400">{unit.CreditPoints || DEFAULT_CREDIT_POINTS} CP</div>
													</div>
													<button
														onClick={() => handleRemoveUnit(semIdx, unitIdx)}
														className="text-red-500 hover:text-red-700"
													>
														<XMarkIcon className="h-4 w-4" />
													</button>
												</div>
											);
										})}
									</div>
								</div>
							))}
							<div className="flex items-center justify-between pt-3 border-t border-gray-200">
								<p className="text-xs text-gray-500">Click "Add Unit" to add units from the panels.</p>
								<button onClick={handleExportPdf} disabled={pdfLoading}
									className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${pdfLoading ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed' : 'bg-[#cc2131] hover:bg-[#b01d2c] text-white'}`}>
									{pdfLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
									{pdfLoading ? 'Generating PDF…' : 'Save as PDF'}
								</button>
							</div>
						</div>
					</div>
				)}
			</div>

			<UnitPoolToolbox isOpen={showToolbox} onClose={() => setShowToolbox(false)} />
			<EquivalencyModal isOpen={equivModal.open} onClose={() => setEquivModal({ open: false, unit: null })}
				oldUnit={equivModal.unit} intakeYear={intakeYear} currentSem={currentSem} onReplace={handleReplaceUnrecognisedUnit} />
			
			{/* Add Unit Modal */}
			<AddUnitModal
				isOpen={addUnitModal.isOpen}
				onClose={() => setAddUnitModal({ isOpen: false, semesterIdx: null, availableUnits: [] })}
				availableUnits={addUnitModal.availableUnits}
				onAddUnit={(unit) => handleAddUnitToSemester(addUnitModal.semesterIdx, unit)}
			/>
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
	const [expandedPlanners, setExpandedPlanners] = useState([]);
	const fileInputRef = useRef(null);

	const hasAccess = isSuperadmin() || can('planner', 'read');

	const parseXlsxFile = (file) => new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
				const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: null });
				const units = rows
					.filter(row => { const g = String(row['Grade'] ?? '').trim().toUpperCase(); return g && g !== 'N'; })
					.map(row => {
						const code = String(row['Course'] || '').trim().toUpperCase();
						const title = String(row['Course Title'] || '').trim();
						return { id: code, code, name: title, creditPoints: parseFloat(row['Credits'] || row['Earned'] || 0) || 0, grade: String(row['Grade'] || '').trim(), prerequisites: [], unitTypeId: code === 'ICT20016' && title === 'Work Integrated Learning Placement - ICT (3 month)' ? 17 : null };
					}).filter(u => u.code);
				resolve(units);
			} catch (err) { reject(new Error('Failed to parse XLSX: ' + err.message)); }
		};
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsArrayBuffer(file);
	});

	const compareWithPlanner = (completedUnitsMap, planner) => {
		const plannerMap = new Map((planner.units || []).map(u => [u.UnitCode?.trim().toUpperCase(), u]));
		let overlapCount = 0, totalMatchedCredits = 0;
		const matchingUnits = [];
		completedUnitsMap.forEach((unit, code) => {
			if (plannerMap.has(code.toUpperCase())) {
				overlapCount++;
				totalMatchedCredits += unit.creditPoints || 0;
				matchingUnits.push({ code: unit.code, name: unit.name, creditPoints: unit.creditPoints });
			}
		});
		const matchStudentPct = Math.min(Math.max((overlapCount / 24) * 100, (totalMatchedCredits / 300) * 100), 100);
		const matchPlannerPct = planner.units?.length ? (overlapCount / planner.units.length) * 100 : 0;
		return { plannerId: planner.id, plannerName: planner.name, createdAt: planner.createdAt, overlapCount, completedCount: completedUnitsMap.size, plannerUnitCount: planner.units?.length, matchStudentPct, matchPlannerPct, matchingUnits, totalMatchedCredits };
	};

	const exportToExcel = () => {
		if (!matchedPlanners.length || !studentInfo) return;
		setExporting(true);
		try {
			const wb = XLSX.utils.book_new();
			const studentRows = [['File', studentInfo.studentId], ['Completed Units', studentInfo.completedUnitsCount], ['Total Credits', studentInfo.totalCredits], [], ['Code', 'Name', 'Grade', 'Credits'], ...studentInfo.completedUnitsList.map(u => [u.code, u.name, u.grade, u.creditPoints])];
			XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(studentRows), 'Completed Units');
			const plannerRows = [['Rank', 'Planner', 'ID', 'Created', 'Matching', 'Credits', 'Student%', 'Planner%'], ...matchedPlanners.map((p, i) => [i + 1, p.plannerName, p.plannerId, new Date(p.createdAt).toLocaleDateString(), p.overlapCount, p.totalMatchedCredits, p.matchStudentPct.toFixed(1) + '%', p.matchPlannerPct.toFixed(1) + '%'])];
			XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plannerRows), 'Top Planners');
			matchedPlanners.forEach((p, i) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[p.plannerName], ['Code', 'Name', 'Credits'], ...p.matchingUnits.map(u => [u.code, u.name, u.creditPoints])]), `Planner_${i + 1}_Matches`.slice(0, 31)));
			XLSX.writeFile(wb, `study_planner_comparison_${fileName.replace(/\.xlsx$/i, '')}.xlsx`);
		} catch (err) { console.error(err); alert('Export failed.'); }
		finally { setExporting(false); }
	};

	const handleFileChange = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setSearched(true); setFileName(file.name); setError(null);
		setMatchedPlanners([]); setCompletedUnits([]); setStudentInfo(null); setExpandedPlanners([]);
		try {
			setLoading(true);
			const units = await parseXlsxFile(file);
			if (!units.length) { setError('No completed units found. Check that units have a grade other than "N".'); return; }
			const unitsMap = new Map(units.map(u => [u.code.toUpperCase(), u]));
			setCompletedUnits(Array.from(unitsMap.values()));
			const totalCredits = Array.from(unitsMap.values()).reduce((s, u) => s + (u.creditPoints || 0), 0);
			setStudentInfo({ studentId: file.name, completedUnitsCount: unitsMap.size, totalCredits, completedUnitsList: Array.from(unitsMap.values()).map(u => ({ code: u.code, name: u.name, grade: u.grade, creditPoints: u.creditPoints })) });
			const res = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/study-planner`);
			if (!res.ok) throw new Error(`Failed to fetch planners: ${res.status}`);
			const { success, data: allPlanners, message } = await res.json();
			if (!success) throw new Error(message || 'Failed to fetch planners');
			if (!allPlanners.length) { setError('No study planners found.'); return; }
			const top5 = allPlanners.map(p => compareWithPlanner(unitsMap, p)).sort((a, b) => b.overlapCount !== a.overlapCount ? b.overlapCount - a.overlapCount : b.matchStudentPct - a.matchStudentPct).slice(0, 5).filter(p => p.overlapCount > 0);
			if (!top5.length) setError('No matching planners found for the uploaded units.');
			else setMatchedPlanners(top5);
		} catch (err) { setError(err.message || 'Failed to process file'); }
		finally { setLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
	};

	const showStudyPlanner = matchedPlanners.length > 0 && studentInfo; // Removed credit limit

	return (
		<ConditionalRequireAuth>
			{!hasAccess ? <AccessDenied requiredPermission="planner:read or system:superadmin" resourceName="study planner comparison" /> : (
				<PageLoadingWrapper requiredPermission={{ resource: 'dashboard', action: 'access' }} resourceName="study planner comparison" isLoading={false}>
					<div className="page-bg p-6 min-h-screen">
						<div className="max-w-7xl mx-auto">
							{/* Header */}
							<div className="mb-8 flex justify-between items-center flex-wrap gap-3">
								<div>
									<h1 className="title-text text-3xl font-bold">Unit Suggestions</h1>
									<p className="text-muted text-sm mt-1">Upload a student transcript file</p>
								</div>
								{matchedPlanners.length > 0 && studentInfo && (
									<div className="flex gap-3">
										<button onClick={exportToExcel} disabled={exporting} className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
											<DocumentArrowDownIcon className="h-5 w-5" />{exporting ? 'Exporting…' : 'Export to Excel'}
										</button>
									</div>
								)}
							</div>

							{/* Upload area */}
							<div className="card-bg p-6 rounded-theme shadow-theme mb-8">
								<label className="label-text-alt block mb-2 text-sm font-medium">Upload Student Transcript (XLSX)</label>
								<div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-[#cc2131] transition-colors bg-white"
									onClick={() => fileInputRef.current?.click()}
									onDragOver={e => e.preventDefault()}
									onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { const dt = new DataTransfer(); dt.items.add(f); fileInputRef.current.files = dt.files; handleFileChange({ target: { files: dt.files } }); } }}>
									<ArrowUpTrayIcon className="h-10 w-10 text-gray-400 mb-3" />
									<p className="text-sm font-medium text-gray-700">{loading ? 'Processing…' : fileName ? `Loaded: ${fileName}` : 'Click or drag & drop an XLSX file here'}</p>
									<p className="text-xs text-gray-400 mt-1">Completed units: grade = EXM or any grade except N</p>
									<input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} disabled={loading} />
								</div>
							</div>

							{error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6"><strong>Error:</strong> {error}</div>}

							{/* File summary */}
							{studentInfo && (
								<div className="card-bg p-6 rounded-theme shadow-theme mb-8 bg-gradient-to-r from-red-50 to-orange-50">
									<h2 className="text-lg font-semibold heading-text mb-4 flex items-center gap-2"><AcademicCapIcon className="h-5 w-5" />File Summary</h2>
									<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
										<div><p className="text-sm text-muted">File</p><p className="font-semibold text-[#cc2131] text-base break-all">{studentInfo.studentId}</p></div>
										<div><p className="text-sm text-muted">Completed Units</p><p className="font-semibold text-[#cc2131] text-lg">{studentInfo.completedUnitsCount}</p></div>
										<div><p className="text-sm text-muted">Total Credits</p><p className="font-semibold text-[#cc2131] text-lg">{studentInfo.totalCredits}</p></div>
									</div>
									<details className="mt-4 border-t border-gray-200 pt-3">
										<summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-[#cc2131]">View Completed Units ({completedUnits.length})</summary>
										<div className="flex flex-wrap gap-2 mt-3 max-h-64 overflow-y-auto p-2 bg-white rounded-md">
											{completedUnits.map(u => (
												<div key={u.code} className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
													{u.code} – {u.name}{u.grade && <span className="ml-1 opacity-70">({u.grade})</span>}
												</div>
											))}
										</div>
									</details>
								</div>
							)}

							{/* Matched planners accordion */}
							{searched && !error && matchedPlanners.length === 0 && studentInfo ? (
								<div className="card-bg p-12 rounded-theme shadow-theme text-center">
									<ChartBarIcon className="h-16 w-16 text-muted mx-auto mb-4 opacity-50" />
									<p className="text-muted text-lg">No matching study planners found.</p>
								</div>
							) : matchedPlanners.length > 0 && (
								<div className="space-y-4 mb-8">
									<h2 className="text-xl font-semibold heading-text mb-2 flex items-center gap-2"><ChartBarIcon className="h-6 w-6" />Top {matchedPlanners.length} Matching Study Planners</h2>
									{matchedPlanners.map((planner, index) => {
										const isExpanded = expandedPlanners.includes(planner.plannerId);
										return (
											<div key={planner.plannerId} className="card-bg rounded-theme shadow-theme overflow-hidden">
												<div className="p-5 bg-gradient-to-r from-gray-50 to-white border-b cursor-pointer hover:bg-gray-100 flex justify-between items-center"
													onClick={() => setExpandedPlanners(prev => prev.includes(planner.plannerId) ? prev.filter(id => id !== planner.plannerId) : [...prev, planner.plannerId])}>
													<div className="flex-1">
														<div className="flex items-center gap-3 flex-wrap">
															<span className="text-2xl font-bold text-[#cc2131]">#{index + 1}</span>
															<h3 className="text-xl font-bold heading-text">{planner.plannerName}</h3>
															<span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">ID: {planner.plannerId}</span>
															<span className="text-xs text-gray-500">Created: {new Date(planner.createdAt).toLocaleDateString()}</span>
														</div>
														<div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
															<div><span className="text-gray-500">Matching: </span>{planner.overlapCount} / {planner.completedCount}</div>
															<div><span className="text-gray-500">Credits: </span>{planner.totalMatchedCredits}</div>
														</div>
													</div>
													{isExpanded ? <ChevronDownIcon className="h-5 w-5 text-gray-500 ml-4" /> : <ChevronRightIcon className="h-5 w-5 text-gray-500 ml-4" />}
												</div>
												{isExpanded && (
													<div className="p-6 border-t border-gray-100">
														<h4 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2"><CheckCircleIcon className="h-4 w-4 text-red-600" />Matched Units ({planner.matchingUnits.length})</h4>
														{planner.matchingUnits.length ? (
															<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
																{planner.matchingUnits.map((unit, idx) => (
																	<div key={idx} className="bg-white border border-red-500 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
																		<p className="font-mono text-sm font-semibold">{unit.code}</p>
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
						</div>

						{/* Inline study planner */}
						{showStudyPlanner && (
							<div className="mt-8">
								<InlineStudyPlanner completedUnits={completedUnits} studentInfo={studentInfo} initialPlannerId={matchedPlanners[0]?.plannerId} />
							</div>
						)}

						{/* Empty state */}
						{!searched && !studentInfo && !error && (
							<div className="max-w-7xl mx-auto mt-6">
								<div className="card-bg p-12 rounded-theme shadow-theme text-center">
									<ArrowUpTrayIcon className="h-16 w-16 text-muted mx-auto mb-4 opacity-50" />
									<p className="text-muted text-lg">Upload a student transcript to compare against available study planners.</p>
								</div>
							</div>
						)}
					</div>
				</PageLoadingWrapper>
			)}
		</ConditionalRequireAuth>
	);
}