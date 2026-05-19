'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';

// Helper to collect all unit codes from the prerequisite tree
function collectTreeNodes(tree, set = new Set()) {
    if (!tree) return set;
    set.add(tree.UnitCode);
    if (tree.prerequisites) {
        tree.prerequisites.forEach(child => collectTreeNodes(child, set));
    }
    return set;
}



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
            <div className={`border-l-4 rounded-lg p-3 mb-2 ${colorClass}`}>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm">{node.UnitCode}</span>
                            <span className="text-xs text-gray-500">{node.CreditPoints ? `${node.CreditPoints} CP` : ''}</span>
                            {node.minCPRequired && (
                                <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium border border-orange-200">
                                    Min {node.minCPRequired} CP to enroll
                                </span>
                            )}
                            {node.logicalOperator && (
                                <span className="text-xs px-1.5 py-0.5 bg-gray-200 rounded font-medium">{node.logicalOperator}</span>
                            )}
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5">{node.Name}</p>
                    </div>
                    {hasChildren && (
                        <button onClick={() => setCollapsed(!collapsed)} className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-50 shrink-0">
                            {collapsed ? '▶ Show' : '▼ Hide'}
                        </button>
                    )}
                </div>
            </div>
            {hasChildren && !collapsed && (
                <div className="ml-6 border-l-2 border-gray-200 pl-4">
                    <p className="text-xs text-gray-400 mb-2 -ml-4 pl-4">requires:</p>
                    {node.prerequisites.map((prereq, i) => (
                        <TreeNode key={`${prereq.ID}-${i}`} node={prereq} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

function getTreeDepth(node) {
    if (!node.prerequisites || node.prerequisites.length === 0) return 0;
    return 1 + Math.max(...node.prerequisites.map(getTreeDepth));
}

function countNodes(node) {
    if (!node.prerequisites || node.prerequisites.length === 0) return 1;
    return 1 + node.prerequisites.reduce((sum, p) => sum + countNodes(p), 0);
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function PrerequisiteChainPage() {
    const router = useRouter();

    const [units, setUnits] = useState([]);
    const [search, setSearch] = useState('');
    const [selectedCode, setSelectedCode] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingUnits, setLoadingUnits] = useState(true);
    const [error, setError] = useState(null);
    const [graphData, setGraphData] = useState(null);
    const [graphHighlight, setGraphHighlight] = useState([]);
    const [graphLoading, setGraphLoading] = useState(false);
    const [cy, setCy] = useState(null);
    const [initialZoomDone, setInitialZoomDone] = useState(false);
    useEffect(() => {
        fetchUnits();
        fetchGraphData();
    }, []);
    useEffect(() => {
        if (cy && graphData && !initialZoomDone) {
            const applyZoom = () => {
                cy.zoom(5);        // Adjust zoom level as needed
                cy.center();
                setInitialZoomDone(true);
                cy.off('layoutstop', applyZoom);
            };

            // Listen for layout completion
            cy.on('layoutstop', applyZoom);

            // Fallback: if layout already completed before event attached,
            // or never fires, apply zoom after a short delay
            const timeoutId = setTimeout(() => {
                if (!initialZoomDone) {
                    applyZoom();
                }
            }, 500);

            return () => {
                clearTimeout(timeoutId);
                cy.off('layoutstop', applyZoom);
            };
        }
    }, [cy, graphData, initialZoomDone]);
    async function fetchUnits() {
        try {
            const res = await fetch('/api/prerequisite-chain', { headers: { 'x-dev-override': 'true' } });
            const data = await res.json();
            if (data.success) setUnits(data.data);
        } catch { setError('Failed to load units'); }
        finally { setLoadingUnits(false); }
    }

    async function fetchGraphData(highlightCodes = null) {
        setGraphLoading(true);
        try {
            let url = '/api/prerequisite-graph';
            if (highlightCodes && highlightCodes.length) {
                url += `?highlight=${encodeURIComponent(highlightCodes.join(','))}`;
            }
            const res = await fetch(url, { headers: { 'x-dev-override': 'true' } });
            const data = await res.json();
            if (data.success) {
                setGraphData({ nodes: data.nodes, edges: data.edges });
                setGraphHighlight(data.highlight || []);
            } else {
                console.warn('Graph data failed:', data.message);
            }
        } catch (err) {
            console.error('Failed to load graph data:', err);
        } finally {
            setGraphLoading(false);
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
            if (data.success) {
                setResult(data.data);
                const allNodesInTree = collectTreeNodes(data.data.tree);
                data.data.requiredBy.forEach(u => allNodesInTree.add(u.UnitCode));
                const highlightCodes = Array.from(allNodesInTree);
                await fetchGraphData(highlightCodes);
            } else {
                setError(data.message);
            }
        } catch { setError('Failed to fetch prerequisite chain'); }
        finally { setLoading(false); }
    }

    const filteredUnits = units.filter(u =>
        u.UnitCode.toLowerCase().includes(search.toLowerCase()) ||
        u.Name.toLowerCase().includes(search.toLowerCase())
    );

    const depth = result ? getTreeDepth(result.tree) : 0;
    const nodeCount = result ? countNodes(result.tree) : 0;
    const hasMinCPRequired = result?.tree?.minCPRequired && result.tree.minCPRequired > 0;

    // Cytoscape styles – includes edge highlighting
    const stylesheet = [
        {
            selector: 'node',
            style: {
                'label': 'data(displayLabel)',
                'background-color': '#3b82f6',
                'color': '#ffffff',
                'font-size': '9px',
                'width': '100px',
                'height': '50px',
                'text-valign': 'center',
                'text-halign': 'center',
                'text-wrap': 'wrap',
                'text-max-width': '80px',
                'shape': 'ellipse',
                'border-width': 1,
                'border-color': '#1e3a8a',
            },
        },
        {
            selector: 'node.highlighted',
            style: {
                'background-color': '#ff9800',
                'border-color': '#e65100',
            },
        },
        {
            selector: 'edge',
            style: {
                'width': 1.5,
                'line-color': '#94a3b8',
                'target-arrow-color': '#94a3b8',
                'target-arrow-shape': 'triangle',
                'arrow-scale': 0.8,
                'curve-style': 'bezier',
            },
        },
        {
            selector: 'edge.highlighted-edge',
            style: {
                'line-color': '#ff9800',
                'target-arrow-color': '#ff9800',
                'width': 3,
            },
        },
    ];

    const layout = { name: 'cose', idealEdgeLength: 100, nodeRepulsion: 4000, gravity: 0.1 };

    const elements = graphData ? [
        ...graphData.nodes.map(node => ({
            data: {
                id: node.id,
                label: node.label,
                displayLabel: `${node.label}\n${node.name.length > 25 ? node.name.slice(0, 22) + '…' : node.name}`,
                fullName: node.name
            }
        })),
        ...graphData.edges.map(edge => ({ data: { source: edge.source, target: edge.target } })),
    ] : [];

    // Apply highlighting: nodes + edges between highlighted nodes
    useEffect(() => {
        if (cy) {
            // First remove all highlight classes
            cy.nodes().removeClass('highlighted');
            cy.edges().removeClass('highlighted-edge');

            // Highlight nodes
            cy.nodes().forEach(node => {
                const nodeLabel = node.data('label');
                if (graphHighlight.includes(nodeLabel)) {
                    node.addClass('highlighted');
                }
            });

            // Highlight edges where both source and target are highlighted
            cy.edges().forEach(edge => {
                const source = edge.source();
                const target = edge.target();
                if (source.hasClass('highlighted') && target.hasClass('highlighted')) {
                    edge.addClass('highlighted-edge');
                }
            });
        }
    }, [cy, graphHighlight]);

    return (
        <div className="p-6 max-w-full mx-auto">
            <button onClick={() => router.back()} className="text-sm text-blue-600 hover:underline mb-4 inline-block">← Back</button>

            <h1 className="text-2xl font-bold mb-1">Prerequisite Chain Viewer</h1>
            <p className="text-sm text-gray-500 mb-6">
                Search for a unit to see its chain (left). Full prerequisite graph is shown on the right – nodes and edges related to the searched unit are highlighted in orange.
            </p>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* LEFT SIDE: TREE VIEW (unchanged) */}
                <div className="lg:w-2/5">
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
                            onClick={() => { if (selectedCode) handleSearch(selectedCode); }}
                            disabled={!selectedCode || loading}
                            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                        >
                            {loading ? 'Loading...' : 'View Chain'}
                        </button>
                    </div>

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

                    {result && (
                        <>
                            <div className="grid grid-cols-3 gap-3 mb-4">
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

                            <div className="mb-4 max-h-[60vh] overflow-y-auto pr-2">
                                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Prerequisite Tree</h2>
                                {nodeCount === 1 ? (
                                    <div className="border rounded-lg p-4 bg-gray-50 text-sm text-gray-500 space-y-2">
                                        <p><span className="font-mono font-bold text-gray-700">{result.tree.UnitCode}</span> has no prerequisite units.</p>
                                        {result.tree.minCPRequired && (
                                            <p className="text-orange-700 font-medium">⚠ Minimum {result.tree.minCPRequired} CP required.</p>
                                        )}
                                    </div>
                                ) : (
                                    <TreeNode node={result.tree} depth={0} />
                                )}
                            </div>

                            {result.requiredBy.length > 0 && (
                                <div>
                                    <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                                        Units That Require <span className="font-mono text-blue-700">{result.tree.UnitCode}</span>
                                    </h2>
                                    <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 sticky top-0">
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

                {/* RIGHT SIDE: CYTOPLASM GRAPH */}
                <div className="lg:w-3/5">
                    <div className="sticky top-4">
                        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Full Prerequisite Graph</h2>
                        <div className="border rounded-lg overflow-hidden bg-white shadow-sm" style={{ height: 'calc(100vh - 200px)' }}>
                            {graphLoading && (
                                <div className="h-full flex items-center justify-center text-gray-500">
                                    Loading graph data...
                                </div>
                            )}
                            {!graphLoading && !graphData && (
                                <div className="h-full flex items-center justify-center text-gray-500">
                                    Graph not available.
                                </div>
                            )}
                            {graphData && graphData.nodes.length > 0 && (
                                <CytoscapeComponent
                                    elements={elements}
                                    stylesheet={stylesheet}
                                    layout={layout}
                                    style={{ width: '100%', height: '100%' }}
                                    cy={(cyInstance) => setCy(cyInstance)}
                                    wheelSensitivity={0.2}
                                    minZoom={0.2}
                                    maxZoom={2}
                                />
                            )}
                        </div>
                        <p className="text-xs text-gray-400 mt-2 text-center">
                            Interactive graph – drag, zoom, click. Orange nodes and edges belong to the prerequisite tree of the selected unit.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}