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
        // Unknown types go to the end
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

                // Unique unit types from the planner's units
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
                // Re-sort after save response
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

    // Group units by type for section headers
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
        <div className="p-6 max-w-4xl mx-auto">
            <button
                onClick={() => router.push('/view/study-planner')}
                className="text-sm text-blue-600 hover:underline mb-4 inline-block"
            >
                ← Back to list
            </button>

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
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {groupedUnits.map(({ typeId, units: group }) => (
                            <React.Fragment key={`group-${typeId}`}>
                                {/* Section header row */}
                                <tr key={`header-${typeId}`}>
                                    <td
                                        colSpan={4}
                                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
                                        style={{
                                            backgroundColor: typeId ? TYPE_ID_TO_COLOR[typeId] + 'aa' : '#f3f4f6',
                                        }}
                                    >
                                        {typeLabel[typeId]} ({group.length})
                                    </td>
                                </tr>

                                {/* Unit rows */}
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
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
                {saving ? 'Saving...' : 'Save Changes'}
            </button>
        </div>
    );
}