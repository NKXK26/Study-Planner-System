'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function StudyPlannerListPage() {
  const [planners, setPlanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    fetchPlanners();
  }, []);

  async function fetchPlanners() {
    setLoading(true);
    setError(null);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study_planners`
      );
      const json = await res.json();
      if (json.success) {
        // Sort by newest first
        const sorted = (json.data || []).sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        );
        setPlanners(sorted);
      } else {
        setError(json.message || 'Failed to load planners');
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) {
      setCreateError('Name is required');
      return;
    }
    setCreateError('');
    setCreating(true);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study_planners`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setShowCreateModal(false);
        setNewName('');
        await fetchPlanners(); // refresh list
      } else {
        setCreateError(json.message || 'Creation failed');
      }
    } catch (err) {
      setCreateError('Failed to create. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id) {
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study_planners/${id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (json.success) {
        setDeleteId(null);
        await fetchPlanners();
      } else {
        alert(json.message || 'Delete failed');
      }
    } catch (err) {
      alert('Failed to delete. Please try again.');
    }
  }

  const filtered = planners.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/20">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link
              href="/view/dashboard"
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 font-medium transition-colors"
            >
              ← Back
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Study Planners</h1>
              <p className="text-xs text-gray-400">{planners.length} planners total</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Blank Planner
            </button>
            <Link
              href="/view/upload_planner"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload from PDF
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Delete confirmation modal */}
        {deleteId && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
              <div className="text-3xl mb-3">🗑️</div>
              <h2 className="text-base font-bold text-gray-800 mb-2">Delete Study Planner?</h2>
              <p className="text-sm text-gray-500 mb-5">This will permanently remove the planner and all its unit associations.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleDelete(deleteId)}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create planner modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Create New Planner</h2>
                <button onClick={() => { setShowCreateModal(false); setCreateError(''); setNewName(''); }} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <form onSubmit={handleCreate}>
                <label className="block mb-4">
                  <span className="text-sm font-medium text-gray-700">Planner Name</span>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., My Software Engineering Plan"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    autoFocus
                  />
                </label>
                {createError && <p className="text-sm text-red-600 mb-3">{createError}</p>}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreateModal(false); setCreateError(''); setNewName(''); }}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search planners…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 w-72 bg-white shadow-sm"
          />
          <span className="text-xs text-gray-400">{filtered.length} results</span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            ⚠️ {error}
            <button onClick={fetchPlanners} className="ml-3 underline font-medium">Retry</button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-sm font-medium">No study planners found</p>
                <p className="text-xs mt-1">Create one using the buttons above</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Units</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                      <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map(p => (
                      <tr key={p.id} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-5 py-4 font-mono text-xs text-gray-400">#{p.id}</td>
                        <td className="px-5 py-4 font-medium text-gray-800">{p.name}</td>
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                            {p.unitCount ?? p.units?.length ?? 0} units
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-gray-400">{formatDate(p.createdAt)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link
                              href={`/view/study_planners/${p.id}`}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
                            >
                              View / Edit
                            </Link>
                            <button
                              onClick={() => setDeleteId(p.id)}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs font-semibold transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}