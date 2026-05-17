'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StudyPlannerListPage() {
    const router = useRouter();
    const [planners, setPlanners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [search, setSearch] = useState(''); // Search state

    useEffect(() => {
        fetchPlanners();
    }, []);

    async function fetchPlanners() {
        setLoading(true);
        try {
            const res = await fetch('/api/study-planner', {
                headers: { 'x-dev-override': 'true' },
            });
            const data = await res.json();
            if (data.success) setPlanners(data.data);
            else setError(data.message);
        } catch (err) {
            setError('Failed to load study planners');
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id) {
        if (!confirm('Are you sure you want to delete this study planner? This action cannot be undone.')) return;

        setDeletingId(id);
        try {
            const res = await fetch(`/api/study-planner?id=${id}`, {
                method: 'DELETE',
                headers: { 'x-dev-override': 'true' },
            });
            const data = await res.json();
            if (data.success) {
                setPlanners(prev => prev.filter(p => p.id !== id));
            } else {
                alert(data.message || 'Failed to delete planner');
            }
        } catch (err) {
            alert('An error occurred while deleting the planner');
        } finally {
            setDeletingId(null);
        }
    }

    // Filter planners based on search input
    const filteredPlanners = planners.filter(planner =>
        planner.name.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <div className="p-6">Loading...</div>;
    if (error) return <div className="p-6 text-red-500">{error}</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Study Planners</h1>
                <button
                    onClick={() => router.push('/view/upload_planner')}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                >
                    + Upload New Planner
                </button>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search by planner name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {/* Search Icon */}
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {/* Clear Button */}
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {filteredPlanners.length === 0 ? (
                <p className="text-gray-500">
                    {search ? 'No planners match your search.' : 'No study planners found.'}
                </p>
            ) : (
                <div className="space-y-3">
                    {filteredPlanners.map(planner => (
                        <div
                            key={planner.id}
                            className="flex items-center justify-between border rounded-lg p-4 bg-white shadow-sm"
                        >
                            <div>
                                <p className="font-semibold text-lg">{planner.name}</p>
                                <p className="text-sm text-gray-500">
                                    {planner.units.length} unit{planner.units.length !== 1 ? 's' : ''} · Created{' '}
                                    {new Date(planner.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => router.push(`/view/study-planner/${planner.id}`)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                                >
                                    View / Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(planner.id)}
                                    disabled={deletingId === planner.id}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium disabled:opacity-50"
                                >
                                    {deletingId === planner.id ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}