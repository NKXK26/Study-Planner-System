'use client';
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const TYPE_ID_TO_COLOR = {
    2: '#c5d9f0',   // Core
    3: '#fce9d9',   // Major
    1: '#d5e2bb',   // Elective
    17: '#b1a0c6',  // WIL
};

const TYPE_ORDER = [2, 3, 1, 17]; // Core → Major → Elective → WIL

function sortUnits(units) {
    return [...units].sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.unitTypeId ?? -1);
        const bi = TYPE_ORDER.indexOf(b.unitTypeId ?? -1);
        const aOrder = ai === -1 ? TYPE_ORDER.length : ai;
        const bOrder = bi === -1 ? TYPE_ORDER.length : bi;
        return aOrder - bOrder;
    });
}

export default function StudyPlannerEditPage() {
    const { id } = useParams();
    const router = useRouter();

    const [planner, setPlanner] = useState(null);
    const [unitTypes, setUnitTypes] = useState([]);
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingPlanner, setDeletingPlanner] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);

    useEffect(() => {
        fetchPlanner();
    }, [id]);

    async function fetchPlanner() {
        try {
            const res = await fetch(`/api/study-planner/${id}`, {
                headers: { 'x-dev-override': 'true' },
            });
            const data = await res.json();
            if (data.success) {
                setPlanner(data.data);
                const sorted = sortUnits(data.data.units);
                setUnits(sorted.map(u => ({ ...u })));

                const types = data.data.units
                    .filter(u => u.unitType !== null)
                    .map(u => u.unitType)
                    .filter((t, i, arr) => arr.findIndex(x => x.ID === t.ID) === i)
                    .sort((a, b) => {
                        const ai = TYPE_ORDER.indexOf(a.ID);
                        const bi = TYPE_ORDER.indexOf(b.ID);
                        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                    });
                setUnitTypes(types);
            } else {
                setError(data.message);
            }
        } catch {
            setError('Failed to load planner');
        } finally {
            setLoading(false);
        }
    }

    function handleUnitTypeChange(joinId, newUnitTypeId) {
        setUnits(prev => {
            const updated = prev.map(u =>
                u.joinId === joinId
                    ? { ...u, unitTypeId: newUnitTypeId ? parseInt(newUnitTypeId) : null }
                    : u
            );
            return sortUnits(updated);
        });
    }

    function handleRemoveUnit(joinId) {
        if (confirm('Remove this unit from the planner? It will be deleted when you save.')) {
            setUnits(prev => prev.filter(u => u.joinId !== joinId));
        }
    }

    async function handleSave() {
        setSaving(true);
        setSuccessMsg(null);
        setError(null);
        try {
            const res = await fetch(`/api/study-planner/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-dev-override': 'true',
                },
                body: JSON.stringify({
                    units: units.map(u => ({
                        joinId: u.joinId,
                        unitTypeId: u.unitTypeId,
                    })),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSuccessMsg('Saved successfully!');
                const sorted = sortUnits(data.data.units.map(u => ({ ...u })));
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

    // Group units by type
    const groupedUnits = TYPE_ORDER.reduce((acc, typeId) => {
        const group = units.filter(u => u.unitTypeId === typeId);
        if (group.length > 0) acc.push({ typeId, units: group });
        return acc;
    }, []);
    const unassigned = units.filter(u => !TYPE_ORDER.includes(u.unitTypeId));
    if (unassigned.length > 0) groupedUnits.push({ typeId: null, units: unassigned });

    const typeLabel = {
        2: 'Core',
        3: 'Major',
        1: 'Elective',
        17: 'WIL',
        null: 'Unassigned',
    };

    if (loading) return <div className="p-6">Loading...</div>;
    if (error && !planner) return <div className="p-6 text-red-500">{error}</div>;

    return (
        <div className="p-6 max-w-5xl mx-auto">
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

            {error && <p className="text-red-500 mb-4">{error}</p>}
            {successMsg && <p className="text-green-600 mb-4">{successMsg}</p>}

            <div className="border rounded-lg overflow-hidden mb-6">
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
                        {groupedUnits.map(({ typeId, units: group }) => (
                            <React.Fragment key={`group-${typeId}`}>
                                <tr key={`header-${typeId}`}>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
                                        style={{
                                            backgroundColor: typeId ? TYPE_ID_TO_COLOR[typeId] + 'aa' : '#f3f4f6',
                                        }}
                                    >
                                        {typeLabel[typeId]} ({group.length})
                                    </td>
                                </tr>
                                {group.map(unit => (
                                    <tr
                                        key={unit.joinId}
                                        style={{
                                            backgroundColor: unit.unitTypeId
                                                ? TYPE_ID_TO_COLOR[unit.unitTypeId] ?? '#ffffff'
                                                : '#ffffff',
                                        }}
                                    >
                                        <td className="px-4 py-3 font-mono font-medium">{unit.UnitCode}</td>
                                        <td className="px-4 py-3 text-gray-700">{unit.Name}</td>
                                        <td className="px-4 py-3 text-gray-500">{unit.CreditPoints ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={unit.unitTypeId ?? ''}
                                                onChange={e => handleUnitTypeChange(unit.joinId, e.target.value)}
                                                className="border rounded px-2 py-1 text-sm w-full max-w-[180px] bg-white"
                                            >
                                                <option value="">— None —</option>
                                                {unitTypes.map(ut => (
                                                    <option key={ut.ID} value={ut.ID}>
                                                        {ut.Name}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleRemoveUnit(unit.joinId)}
                                                className="text-red-500 hover:text-red-700"
                                                title="Remove from planner"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

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