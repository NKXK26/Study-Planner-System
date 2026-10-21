'use client';
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Bars3Icon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Soft pastel palette for unit types not in the hardcoded map
const FALLBACK_COLOURS = [
    '#fde8d8', '#d8f0e8', '#d8e8f0', '#f0d8f0',
    '#f0f0d8', '#e8d8f0', '#d8f0d8', '#f0e8d8',
];

function hexToRgba(hex, alpha = 0.5) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// Build a colour map from the template's unit types (uses Colour field if set, else fallback)
function buildColourMap(unitTypes) {
    const map = {};
    unitTypes.forEach((ut, i) => {
        map[ut.ID] = ut.Colour || FALLBACK_COLOURS[i % FALLBACK_COLOURS.length];
    });
    return map;
}

function sortUnits(units, typeOrder) {
    return [...units].sort((a, b) => {
        const ai = typeOrder.indexOf(a.unitTypeId ?? -1);
        const bi = typeOrder.indexOf(b.unitTypeId ?? -1);
        const aOrder = ai === -1 ? typeOrder.length : ai;
        const bOrder = bi === -1 ? typeOrder.length : bi;
        return aOrder - bOrder;
    });
}

// ─── Template Selector Banner ─────────────────────────────────────────────────
function TemplateSelectorBanner({ templates, selectedTemplateId, onChange, saving }) {
    return (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
                <p className="text-sm font-semibold text-blue-800 mb-0.5">Degree Programme Template</p>
                <p className="text-xs text-blue-600">
                    Select a template to use its unit types, or choose no template to use all unit types.
                </p>
            </div>
            <select
                value={selectedTemplateId ?? ''}
                onChange={e => onChange(e.target.value ? parseInt(e.target.value) : null)}
                disabled={saving}
                className="border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[220px] disabled:opacity-50"
            >
                <option value="">— No template —</option>
                {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>
        </div>
    );
}

// ─── Progress Bar (shows completion vs template requirements) ────────────────
function TemplateProgressBar({ template, units }) {
    if (!template) return null;

    return (
        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Graduation Requirements Progress
            </p>
            <div className="space-y-2">
                {template.unitTypes.map(ut => {
                    const assigned = units.filter(u => u.unitTypeId === ut.ID).length;
                    const pct = Math.min(100, Math.round((assigned / ut.requiredCount) * 100));
                    const done = assigned >= ut.requiredCount;
                    return (
                        <div key={ut.ID} className="flex items-center gap-3">
                            <span className="text-xs text-gray-600 w-24 shrink-0 truncate">{ut.Name}</span>
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-emerald-500' : 'bg-blue-400'}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <span className={`text-xs w-16 text-right shrink-0 ${done ? 'text-emerald-600 font-semibold' : 'text-gray-500'}`}>
                                {assigned}/{ut.requiredCount}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StudyPlannerEditPage() {
    const { id } = useParams();
    const router = useRouter();

    const [planner, setPlanner] = useState(null);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingPlanner, setDeletingPlanner] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [unitCatalog, setUnitCatalog] = useState([]);
    const [showUnitLibrary, setShowUnitLibrary] = useState(false);
    const [unitSearch, setUnitSearch] = useState('');

    // All templates from the API (for the selector dropdown)
    const [allTemplates, setAllTemplates] = useState([]);
    const [allUnitTypes, setAllUnitTypes] = useState([]);
    // Currently selected template ID (may differ from saved until Save is clicked)
    const [selectedTemplateId, setSelectedTemplateId] = useState(null);

    // Derived from selectedTemplateId
    const selectedTemplate = allTemplates.find(t => t.id === selectedTemplateId) ?? null;
    const activeUnitTypes = selectedTemplate ? selectedTemplate.unitTypes : allUnitTypes;
    const typeOrder = activeUnitTypes.map(ut => ut.ID);
    const colourMap = buildColourMap(activeUnitTypes);

    useEffect(() => { fetchPlanner(); }, [id]);

    async function fetchPlanner() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/study-planner/${id}`, {
                headers: { 'x-dev-override': 'true' },
            });
            const data = await res.json();
            if (data.success) {
                setPlanner(data.data);
                setAllTemplates(data.data.templates ?? []);
                setAllUnitTypes(data.data.unitTypes ?? []);
                setSelectedTemplateId(data.data.plannerTemplateId ?? null);
                setUnits(data.data.units.map(u => ({ ...u })));
                const unitRes = await fetch('/api/unit?availability=published', {
                    headers: { 'x-dev-override': 'true' },
                });
                const unitData = await unitRes.json();
                if (unitRes.ok) setUnitCatalog(unitData.data ?? []);
            } else {
                setError(data.message);
            }
        } catch {
            setError('Failed to load planner');
        } finally {
            setLoading(false);
        }
    }

    function handleTemplateChange(newTemplateId) {
        setSelectedTemplateId(newTemplateId);
        // When template changes, clear unitTypeId on any unit whose type is no longer valid
        if (newTemplateId) {
            const newTemplate = allTemplates.find(t => t.id === newTemplateId);
            const validIds = new Set((newTemplate?.unitTypes ?? []).map(ut => ut.ID));
            setUnits(prev => prev.map(u => ({
                ...u,
                unitTypeId: validIds.has(u.unitTypeId) ? u.unitTypeId : null,
            })));
        }
    }

    function handleUnitTypeChange(joinId, newUnitTypeId) {
        setUnits(prev => {
            const updated = prev.map(u =>
                u.joinId === joinId
                    ? { ...u, unitTypeId: newUnitTypeId ? parseInt(newUnitTypeId) : null }
                    : u
            );
            return typeOrder.length > 0 ? sortUnits(updated, typeOrder) : updated;
        });
    }

    function handleRemoveUnit(joinId) {
        if (confirm('Remove this unit from the planner? It will be deleted when you save.')) {
            setUnits(prev => prev.filter(u => u.joinId !== joinId));
        }
    }

    function addUnitToPeriod(catalogUnit, period) {
        if (units.some(unit => unit.ID === catalogUnit.ID || unit.unitId === catalogUnit.ID)) {
            setError(`${catalogUnit.UnitCode} is already in this planner.`);
            return;
        }
        setUnits(prev => [...prev, {
            joinId: null,
            unitId: catalogUnit.ID,
            ID: catalogUnit.ID,
            UnitCode: catalogUnit.UnitCode,
            Name: catalogUnit.Name,
            CreditPoints: catalogUnit.CreditPoints,
            unitTypeId: activeUnitTypes[0]?.ID ?? null,
            plannedYear: period.year,
            plannedSemester: period.semester,
            plannedDates: period.dates,
            sortOrder: prev.length,
        }]);
        setError(null);
    }

    function moveUnitToPeriod(dragged, period) {
        setUnits(prev => {
            const nextSortOrder = prev
                .filter(unit => unit.plannedYear === period.year && unit.plannedSemester === period.semester && unit.plannedDates === period.dates)
                .reduce((highest, unit) => Math.max(highest, unit.sortOrder ?? 0), -1) + 1;
            return prev.map(unit => {
                const isMatch = dragged.joinId
                    ? unit.joinId === dragged.joinId
                    : (unit.unitId ?? unit.ID) === dragged.unitId;
                return isMatch ? {
                    ...unit,
                    plannedYear: period.year,
                    plannedSemester: period.semester,
                    plannedDates: period.dates,
                    sortOrder: nextSortOrder,
                } : unit;
            });
        });
    }

    function handlePeriodDrop(event, period) {
        event.preventDefault();
        const catalogRaw = event.dataTransfer.getData('application/study-planner-catalog-unit');
        const existingRaw = event.dataTransfer.getData('application/study-planner-existing-unit');
        try {
            if (catalogRaw) addUnitToPeriod(JSON.parse(catalogRaw), period);
            if (existingRaw) moveUnitToPeriod(JSON.parse(existingRaw), period);
        } catch {
            setError('Unable to move that unit. Please try again.');
        }
    }

    async function handleSave() {
        setSaving(true);
        setSuccessMsg(null);
        setError(null);
        try {
            const res = await fetch(`/api/study-planner/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-dev-override': 'true' },
                body: JSON.stringify({
                    plannerTemplateId: selectedTemplateId,
                    units: units.map(u => ({
                        joinId: u.joinId,
                        unitTypeId: u.unitTypeId,
                        plannedYear: u.plannedYear,
                        plannedSemester: u.plannedSemester,
                        plannedDates: u.plannedDates,
                        sortOrder: u.sortOrder,
                        unitId: u.unitId,
                    })),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg('Saved successfully!');
                setPlanner(prev => ({ ...prev, plannerTemplateId: data.data.plannerTemplateId }));
                const sorted = typeOrder.length > 0
                    ? sortUnits(data.data.units.map(u => ({ ...u })), typeOrder)
                    : data.data.units.map(u => ({ ...u }));
                setUnits(sorted);
            } else {
                setError(data.message);
            }
        } catch {
            setError('Save failed');
        } finally {
            setSaving(false);
        }
    }

    async function handleDeletePlanner() {
        if (!confirm('Delete this entire study planner? This action cannot be undone.')) return;
        setDeletingPlanner(true);
        try {
            const res = await fetch(`/api/study-planner?id=${id}`, {
                method: 'DELETE',
                headers: { 'x-dev-override': 'true' },
            });
            const data = await res.json();
            if (data.success) {
                router.push('/view/study-planner');
            } else {
                alert(data.message || 'Delete failed');
                setDeletingPlanner(false);
            }
        } catch {
            alert('Failed to delete planner');
            setDeletingPlanner(false);
        }
    }

    // Group units: by typeOrder first, then unassigned/unknown at the end
    const groupedUnits = (() => {
        const groups = [];
        if (typeOrder.length > 0) {
            typeOrder.forEach(typeId => {
                const group = units.filter(u => u.unitTypeId === typeId);
                if (group.length > 0) groups.push({ typeId, units: group });
            });
        }
        // Unassigned or types not in the current template order
        const assignedIds = new Set(typeOrder);
        const leftover = units.filter(u => !u.unitTypeId || !assignedIds.has(u.unitTypeId));
        if (leftover.length > 0) groups.push({ typeId: null, units: leftover });
        return groups;
    })();

    const typeLabelMap = Object.fromEntries(activeUnitTypes.map(ut => [ut.ID, ut.Name]));

    // New planners store their units in study periods. Older planners without
    // that information remain readable in a default Year 1 / Semester 1 section.
    const studyPeriods = Object.values(units.reduce((periods, unit) => {
        const year = unit.plannedYear || 1;
        const semester = unit.plannedSemester || 'Semester 1';
        const dates = unit.plannedDates || 'Dates not specified';
        const key = `${year}|${semester}|${dates}`;
        if (!periods[key]) periods[key] = { key, year, semester, dates, units: [] };
        periods[key].units.push(unit);
        return periods;
    }, {})).sort((a, b) => (
        a.year - b.year || a.semester.localeCompare(b.semester) || a.dates.localeCompare(b.dates)
    ));

    if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
    if (error && !planner) return <div className="p-6 text-red-500">{error}</div>;

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Top nav */}
            <div className="flex items-center justify-between mb-4">
                <button
                    onClick={() => router.push('/view/study-planner')}
                    className="text-sm text-blue-600 hover:underline"
                >
                    ← Back to list
                </button>
                <button
                    onClick={handleDeletePlanner}
                    disabled={deletingPlanner}
                    className="px-3 py-1.5 bg-red-50 text-red-600 rounded-md text-sm hover:bg-red-100 disabled:opacity-50"
                >
                    {deletingPlanner ? 'Deleting...' : 'Delete Planner'}
                </button>
            </div>

            <h1 className="text-2xl font-bold mb-1">{planner?.name}</h1>
            <p className="text-sm text-gray-500 mb-6">
                {units.length} unit{units.length !== 1 ? 's' : ''}
            </p>

            <button
                onClick={() => { setShowUnitLibrary(true); setUnitSearch(''); }}
                className="mb-6 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
                <PlusIcon className="h-4 w-4" /> Add unit
            </button>

            {/* Template selector */}
            <TemplateSelectorBanner
                templates={allTemplates}
                selectedTemplateId={selectedTemplateId}
                onChange={handleTemplateChange}
                saving={saving}
            />

            {/* Progress bar — only when a template is selected */}
            <TemplateProgressBar template={selectedTemplate} units={units} />

            {/* Status messages */}
            {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
            {successMsg && <p className="text-green-600 mb-4 text-sm">{successMsg}</p>}

            {/* Units grouped as the saved study-plan sequence */}
            <div className={`mb-6 grid grid-cols-1 gap-6 ${showUnitLibrary ? 'xl:grid-cols-[300px_minmax(0,1fr)]' : ''}`}>
                {showUnitLibrary && (
                    <aside className="h-fit rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:sticky xl:top-6">
                        <div className="mb-3 flex items-start justify-between gap-2">
                            <div>
                                <h2 className="font-semibold text-gray-800">Unit library</h2>
                                <p className="mt-1 text-xs text-gray-500">Drag a unit into a study period.</p>
                            </div>
                            <button onClick={() => setShowUnitLibrary(false)} className="p-1 text-gray-500 hover:text-red-600" title="Close unit library">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <label className="relative mb-3 block">
                            <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input autoFocus value={unitSearch} onChange={event => setUnitSearch(event.target.value)} placeholder="Search units"
                                className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-2 text-sm" />
                        </label>
                        <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                            {unitCatalog.filter(unit => {
                                const term = unitSearch.trim().toLowerCase();
                                return !units.some(item => item.ID === unit.ID || item.unitId === unit.ID)
                                    && (!term || unit.UnitCode.toLowerCase().includes(term) || unit.Name.toLowerCase().includes(term));
                            }).map(unit => (
                                <div key={unit.ID} draggable onDragStart={event => {
                                    event.dataTransfer.effectAllowed = 'copy';
                                    event.dataTransfer.setData('application/study-planner-catalog-unit', JSON.stringify(unit));
                                }} className="flex cursor-grab items-center gap-2 rounded-lg border border-gray-200 p-2.5 hover:border-blue-300 active:cursor-grabbing">
                                    <Bars3Icon className="h-4 w-4 shrink-0 text-gray-400" />
                                    <div className="min-w-0"><p className="font-mono text-xs font-semibold">{unit.UnitCode}</p><p className="truncate text-xs text-gray-500">{unit.Name}</p></div>
                                </div>
                            ))}
                        </div>
                    </aside>
                )}
            <div className="space-y-6">
                {studyPeriods.length === 0 ? (
                    <div className="border rounded-lg px-4 py-8 text-center text-gray-400 text-sm">
                        No units in this planner.
                    </div>
                ) : studyPeriods.map(period => (
                    <section key={period.key} onDragOver={event => event.preventDefault()} onDrop={event => handlePeriodDrop(event, period)} className="border rounded-xl overflow-hidden">
                        <header className="bg-gray-800 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h2 className="font-semibold">Year {period.year} — {period.semester}</h2>
                                <p className="text-xs text-gray-300 mt-0.5">{period.dates}</p>
                            </div>
                            <span className="text-xs bg-white/15 rounded-full px-2.5 py-1">
                                {period.units.length} unit{period.units.length !== 1 ? 's' : ''}
                            </span>
                        </header>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-100 text-left">
                                    <tr>
                                        <th className="px-4 py-3 font-medium text-gray-600">Unit Code</th>
                                        <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                                        <th className="px-4 py-3 font-medium text-gray-600">Credits</th>
                                        <th className="px-4 py-3 font-medium text-gray-600">Unit Type</th>
                                        <th className="px-4 py-3 font-medium text-gray-600 w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {[...period.units].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(unit => (
                                        <tr key={unit.joinId ?? unit.ID} draggable
                                            onDragStart={event => {
                                                event.dataTransfer.effectAllowed = 'move';
                                                event.dataTransfer.setData('application/study-planner-existing-unit', JSON.stringify({
                                                    joinId: unit.joinId,
                                                    unitId: unit.unitId ?? unit.ID,
                                                }));
                                            }}
                                            className="cursor-grab active:cursor-grabbing"
                                            style={{
                                            backgroundColor: unit.unitTypeId && colourMap[unit.unitTypeId]
                                                ? hexToRgba(colourMap[unit.unitTypeId], 0.18)
                                                : '#ffffff',
                                        }}>
                                            <td className="px-4 py-3 font-mono font-medium"><span className="mr-2 inline-flex align-middle text-gray-400" title="Drag to another study period"><Bars3Icon className="h-4 w-4" /></span>{unit.UnitCode}</td>
                                            <td className="px-4 py-3 text-gray-700">{unit.Name}</td>
                                            <td className="px-4 py-3 text-gray-500">{unit.CreditPoints ?? '—'}</td>
                                            <td className="px-4 py-3">
                                                <select value={unit.unitTypeId ?? ''} onChange={e => handleUnitTypeChange(unit.joinId, e.target.value)}
                                                    className="border rounded px-2 py-1 text-sm w-full max-w-[180px] bg-white"
                                                    disabled={saving || activeUnitTypes.length === 0}>
                                                    <option value="">— None —</option>
                                                    {unit.unitType && !activeUnitTypes.some(ut => ut.ID === unit.unitTypeId) && <option value={unit.unitTypeId}>{unit.unitType.Name}</option>}
                                                    {activeUnitTypes.map(ut => <option key={ut.ID} value={ut.ID}>{ut.Name}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => handleRemoveUnit(unit.joinId)} className="text-red-400 hover:text-red-600 transition-colors" title="Remove from planner">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))}
            </div>
            </div>

            {/* Save */}
            <div className="flex gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
}
