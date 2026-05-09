'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function StudyPlannerListPage() {
    const router = useRouter();
    const [planners, setPlanners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchPlanners();
    }, []);

    async function fetchPlanners() {
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
            {planners.length === 0 ? (
                <p className="text-gray-500">No study planners found.</p>
            ) : (
                <div className="space-y-3">
                    {planners.map(planner => (
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
                            <button
                                onClick={() => router.push(`/view/study-planner/${planner.id}`)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                            >
                                View / Edit
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}