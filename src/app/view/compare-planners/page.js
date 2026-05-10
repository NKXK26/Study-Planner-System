'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const TYPE_ID_TO_COLOR = {
    2: '#c5d9f0',
    3: '#fce9d9',
    1: '#d5e2bb',
    17: '#b1a0c6',
};

const TYPE_LABEL = {
    2: 'Core',
    3: 'Major',
    1: 'Elective',
    17: 'WIL',
};

export default function ComparePlannersPage() {
    const router = useRouter();

    const [planners, setPlanners] = useState([]);
    const [selectedA, setSelectedA] = useState('');
    const [selectedB, setSelectedB] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingPlanners, setLoadingPlanners] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchPlanners();
    }, []);

    async function fetchPlanners() {
        try {
            const res = await fetch('/api/compare-planners', {
                headers: { 'x-dev-override': 'true' },
            });
            const data = await res.json();
            if (data.success) setPlanners(data.data);
        } catch {
            setError('Failed to load planners');
        } finally {
            setLoadingPlanners(false);
        }
    }

    async function handleCompare() {
        if (!selectedA || !selectedB) return;
        if (selectedA === selectedB) {
            setError('Please select two different planners');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch(`/api/compare-planners?a=${selectedA}&b=${selectedB}`, {
                headers: { 'x-dev-override': 'true' },
            });
            const data = await res.json();
            if (data.success) setResult(data.data);
            else setError(data.message);
        } catch {
            setError('Comparison failed');
        } finally {
            setLoading(false);
        }
    }

    const UnitTypeBadge = ({ unitType, unitTypeId }) => {
        const color = TYPE_ID_TO_COLOR[unitTypeId] ?? '#e5e7eb';
        const label = unitType?.Name ?? TYPE_LABEL[unitTypeId] ?? 'None';
        return (
            <span
                className="px-2 py-0.5 rounded text-xs font-medium"
                style={{ backgroundColor: color }}
            >
                {label}
            </span>
        );
    };

    const UnitRow = ({ unit, status, unitTypeB, unitTypeIdB }) => {
        const rowBg = status === 'removed' ? '#fee2e2'
            : status === 'added' ? '#dcfce7'
                : status === 'changed' ? '#fef9c3'
                    : '#ffffff';

        const statusBadge = status === 'removed'
            ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Removed</span>
            : status === 'added'
                ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Added</span>
                : status === 'changed'
                    ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Type Changed</span>
                    : <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Same</span>;

        return (
            <tr style={{ backgroundColor: rowBg }}>
                <td className="px-4 py-2 font-mono text-sm font-medium">{unit.UnitCode}</td>
                <td className="px-4 py-2 text-sm text-gray-700">{unit.Name}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{unit.CreditPoints ?? '—'}</td>
                <td className="px-4 py-2">
                    {status === 'changed' ? (
                        <div className="flex items-center gap-1 flex-wrap">
                            <UnitTypeBadge unitType={unit.unitType} unitTypeId={unit.unitTypeId} />
                            <span className="text-gray-400 text-xs">→</span>
                            <UnitTypeBadge unitType={unitTypeB} unitTypeId={unitTypeIdB} />
                        </div>
                    ) : (
                        <UnitTypeBadge unitType={unit.unitType} unitTypeId={unit.unitTypeId} />
                    )}
                </td>
                <td className="px-4 py-2">{statusBadge}</td>
            </tr>
        );
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <button
                onClick={() => router.push('/view/study-planner')}
                className="text-sm text-blue-600 hover:underline mb-4 inline-block"
            >
                ← Back to Study Planners
            </button>

            <h1 className="text-2xl font-bold mb-1">Compare Study Planners</h1>
            <p className="text-sm text-gray-500 mb-6">Select two planners to see what changed between them.</p>

            {/* Selector */}
            <div className="flex gap-4 items-end mb-6 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Planner A</label>
                    <select
                        value={selectedA}
                        onChange={e => setSelectedA(e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                        disabled={loadingPlanners}
                    >
                        <option value="">— Select planner —</option>
                        {planners.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.name} ({p.unitCount} units)
                            </option>
                        ))}
                    </select>
                </div>

                <div className="text-gray-400 text-xl pb-2">⇄</div>

                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Planner B</label>
                    <select
                        value={selectedB}
                        onChange={e => setSelectedB(e.target.value)}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                        disabled={loadingPlanners}
                    >
                        <option value="">— Select planner —</option>
                        {planners.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.name} ({p.unitCount} units)
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={handleCompare}
                    disabled={!selectedA || !selectedB || loading}
                    className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                    {loading ? 'Comparing...' : 'Compare'}
                </button>
            </div>

            {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}

            {/* Results */}
            {result && (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        <div className="border rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-gray-800">{result.summary.inBoth}</p>
                            <p className="text-xs text-gray-500 mt-1">Unchanged</p>
                        </div>
                        <div className="border rounded-lg p-3 text-center bg-green-50">
                            <p className="text-2xl font-bold text-green-600">{result.summary.onlyInB}</p>
                            <p className="text-xs text-gray-500 mt-1">Added in B</p>
                        </div>
                        <div className="border rounded-lg p-3 text-center bg-red-50">
                            <p className="text-2xl font-bold text-red-600">{result.summary.onlyInA}</p>
                            <p className="text-xs text-gray-500 mt-1">Removed in B</p>
                        </div>
                        <div className="border rounded-lg p-3 text-center bg-yellow-50">
                            <p className="text-2xl font-bold text-yellow-600">{result.summary.unitTypeChanged}</p>
                            <p className="text-xs text-gray-500 mt-1">Type Changed</p>
                        </div>
                    </div>

                    {/* Planner names */}
                    <div className="flex gap-4 mb-4 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold">A:</span>
                            <span className="text-gray-700">{result.plannerA.name}</span>
                            <span className="text-gray-400">({result.plannerA.totalUnits} units)</span>
                        </div>
                        <div className="text-gray-300">|</div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold">B:</span>
                            <span className="text-gray-700">{result.plannerB.name}</span>
                            <span className="text-gray-400">({result.plannerB.totalUnits} units)</span>
                        </div>
                    </div>

                    {/* Diff table */}
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-left">
                                <tr>
                                    <th className="px-4 py-3 font-medium text-gray-600">Unit Code</th>
                                    <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                                    <th className="px-4 py-3 font-medium text-gray-600">Credits</th>
                                    <th className="px-4 py-3 font-medium text-gray-600">Unit Type</th>
                                    <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {result.diff.onlyInB.map(unit => (
                                    <UnitRow key={`added-${unit.joinId}`} unit={unit} status="added" />
                                ))}

                                {result.diff.onlyInA.map(unit => (
                                    <UnitRow key={`removed-${unit.joinId}`} unit={unit} status="removed" />
                                ))}

                                {result.diff.unitTypeChanged.map(unit => (
                                    <UnitRow
                                        key={`changed-${unit.joinId}`}
                                        unit={unit}
                                        status="changed"
                                        unitTypeB={unit.unitTypeB}
                                        unitTypeIdB={unit.unitTypeIdB}
                                    />
                                ))}

                                {result.diff.inBoth
                                    .filter(u => !result.diff.unitTypeChanged.find(c => c.UnitCode === u.UnitCode))
                                    .map(unit => (
                                        <UnitRow key={`same-${unit.joinId}`} unit={unit} status="same" />
                                    ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Legend */}
                    <div className="flex gap-4 mt-4 text-xs text-gray-500 flex-wrap">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#dcfce7' }}></div>
                            <span>Added in B</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#fee2e2' }}></div>
                            <span>Removed in B</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#fef9c3' }}></div>
                            <span>Unit type changed</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}></div>
                            <span>Unchanged</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}