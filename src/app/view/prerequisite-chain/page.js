'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Recursive tree node component
function TreeNode({ node, depth = 0 }) {
    const [collapsed, setCollapsed] = useState(false);
    const hasChildren = node.prerequisites && node.prerequisites.length > 0;

    const depthColors = [
        'border-blue-400 bg-blue-50',
        'border-purple-400 bg-purple-50',
        'border-green-400 bg-green-50',
        'border-orange-400 bg-orange-50',
        'border-pink-400 bg-pink-50',
    ];
    const colorClass = depthColors[depth % depthColors.length];

    return (
        <div className="relative">
            {/* Node card */}
            <div className={`border-l-4 rounded-lg p-3 mb-2 ${colorClass}`}>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm">{node.UnitCode}</span>
                            <span className="text-xs text-gray-500">
                                {node.CreditPoints ? `${node.CreditPoints} CP` : ''}
                            </span>
                            {node.minCPRequired && (
                                <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium border border-orange-200">
                                    Min {node.minCPRequired} CP to enroll
                                </span>
                            )}
                            {node.logicalOperator && (
                                <span className="text-xs px-1.5 py-0.5 bg-gray-200 rounded font-medium">
                                    {node.logicalOperator}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5">{node.Name}</p>
                    </div>
                    {hasChildren && (
                        <button
                            onClick={() => setCollapsed(!collapsed)}
                            className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-50 shrink-0"
                        >
                            {collapsed ? '▶ Show' : '▼ Hide'}
                        </button>
                    )}
                </div>
            </div>

            {/* Children */}
            {hasChildren && !collapsed && (
                <div className="ml-6 border-l-2 border-gray-200 pl-4">
                    <p className="text-xs text-gray-400 mb-2 -ml-4 pl-4">
                        requires:
                    </p>
                    {node.prerequisites.map((prereq, i) => (
                        <TreeNode key={`${prereq.ID}-${i}`} node={prereq} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

// Count total depth of tree
function getTreeDepth(node) {
    if (!node.prerequisites || node.prerequisites.length === 0) return 0;
    return 1 + Math.max(...node.prerequisites.map(getTreeDepth));
}

// Count total nodes in tree
function countNodes(node) {
    if (!node.prerequisites || node.prerequisites.length === 0) return 1;
    return 1 + node.prerequisites.reduce((sum, p) => sum + countNodes(p), 0);
}

export default function PrerequisiteChainPage() {
    const router = useRouter();

    const [units, setUnits] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedCode, setSelectedCode] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingUnits, setLoadingUnits] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchUnits();
    }, []);

    async function fetchUnits() {
        try {
            const res = await fetch('/api/prerequisite-chain', {
                headers: { 'x-dev-override': 'true' },
            });
            const data = await res.json();
            if (data.success) setUnits(data.data);
        } catch {
            setError('Failed to load units');
        } finally {
            setLoadingUnits(false);
        }
    }

    async function handleSearch(code) {
        if (!code) return;
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch(`/api/prerequisite-chain?code=${encodeURIComponent(code)}`, {
                headers: { 'x-dev-override': 'true' },
            });
            const data = await res.json();
            if (data.success) setResult(data.data);
            else setError(data.message);
        } catch {
            setError('Failed to fetch prerequisite chain');
        } finally {
            setLoading(false);
        }
    }

    const filteredUnits = units.filter(u =>
        u.UnitCode.toLowerCase().includes(search.toLowerCase()) ||
        u.Name.toLowerCase().includes(search.toLowerCase())
    );

    const depth = result ? getTreeDepth(result.tree) : 0;
    const nodeCount = result ? countNodes(result.tree) : 0;
    const hasMinCPRequired = result?.tree?.minCPRequired && result.tree.minCPRequired > 0;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <button
                onClick={() => router.back()}
                className="text-sm text-blue-600 hover:underline mb-4 inline-block"
            >
                ← Back
            </button>

            <h1 className="text-2xl font-bold mb-1">Prerequisite Chain Viewer</h1>
            <p className="text-sm text-gray-500 mb-6">
                Search for a unit to see its full prerequisite chain and which units depend on it.
            </p>

            {/* Search input */}
            <div className="flex gap-3 mb-2">
                <input
                    type="text"
                    placeholder="Type unit code or name (e.g. COS30019)"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && filteredUnits.length > 0) {
                            const code = filteredUnits[0].UnitCode;
                            setSelectedCode(code);
                            setSearch(code);
                            handleSearch(code);
                        }
                    }}
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                    disabled={loadingUnits}
                />
                <button
                    onClick={() => {
                        if (selectedCode) handleSearch(selectedCode);
                    }}
                    disabled={!selectedCode || loading}
                    className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                    {loading ? 'Loading...' : 'View Chain'}
                </button>
            </div>

            {/* Dropdown suggestions */}
            {search && !loading && filteredUnits.length > 0 && (
                <div className="border rounded-md shadow-sm mb-4 max-h-48 overflow-y-auto bg-white">
                    {filteredUnits.slice(0, 10).map(u => (
                        <button
                            key={u.ID}
                            onClick={() => {
                                setSearch(u.UnitCode);
                                setSelectedCode(u.UnitCode);
                                handleSearch(u.UnitCode);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-3 border-b last:border-0"
                        >
                            <span className="font-mono font-medium text-blue-700">{u.UnitCode}</span>
                            <span className="text-gray-600 truncate">{u.Name}</span>
                        </button>
                    ))}
                </div>
            )}

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            {/* Result */}
            {result && (
                <>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        <div className="border rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-gray-800">{nodeCount - 1}</p>
                            <p className="text-xs text-gray-500 mt-1">Prerequisite Units</p>
                        </div>
                        <div className="border rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-gray-800">{depth}</p>
                            <p className="text-xs text-gray-500 mt-1">Chain Depth</p>
                        </div>
                        {hasMinCPRequired ? (
                            <div className="border rounded-lg p-3 text-center bg-orange-50">
                                <p className="text-2xl font-bold text-orange-600">{result.tree.minCPRequired}</p>
                                <p className="text-xs text-gray-500 mt-1">Min CP Required</p>
                            </div>
                        ) : (
                            <div className="border rounded-lg p-3 text-center">
                                <p className="text-2xl font-bold text-gray-800">{result.requiredBy.length}</p>
                                <p className="text-xs text-gray-500 mt-1">Units Require This</p>
                            </div>
                        )}
                    </div>

                    {/* Tree */}
                    <div className="mb-6">
                        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                            Prerequisite Tree
                        </h2>
                        {nodeCount === 1 ? (
                            <div className="border rounded-lg p-4 bg-gray-50 text-sm text-gray-500 space-y-2">
                                <p>
                                    <span className="font-mono font-bold text-gray-700">{result.tree.UnitCode}</span> has no prerequisite units.
                                </p>
                                {result.tree.minCPRequired && (
                                    <p className="text-orange-700 font-medium">
                                        ⚠ Minimum {result.tree.minCPRequired} credit points must be completed before enrolling.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <TreeNode node={result.tree} depth={0} />
                        )}
                    </div>

                    {/* Required by (Always show if there are dependent units, even when minCPRequired exists) */}
                    {result.requiredBy.length > 0 && (
                        <div>
                            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                                Units That Require{' '}
                                <span className="font-mono text-blue-700">{result.tree.UnitCode}</span>
                            </h2>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-medium text-gray-600">Unit Code</th>
                                            <th className="px-4 py-2 text-left font-medium text-gray-600">Name</th>
                                            <th className="px-4 py-2 text-left font-medium text-gray-600">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {result.requiredBy.map(u => (
                                            <tr key={u.ID} className="hover:bg-gray-50">
                                                <td className="px-4 py-2 font-mono font-medium text-blue-700">{u.UnitCode}</td>
                                                <td className="px-4 py-2 text-gray-700">{u.Name}</td>
                                                <td className="px-4 py-2">
                                                    <button
                                                        onClick={() => {
                                                            setSearch(u.UnitCode);
                                                            setSelectedCode(u.UnitCode);
                                                            handleSearch(u.UnitCode);
                                                        }}
                                                        className="text-xs text-blue-600 hover:underline"
                                                    >
                                                        View chain →
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}