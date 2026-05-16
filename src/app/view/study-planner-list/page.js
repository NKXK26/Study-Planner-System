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
  
  // Delete state
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    fetchPlanners();
  }, []);

  async function fetchPlanners() {
    setLoading(true);
    setError(null);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study-planner`
      );
      const json = await res.json();
      if (json.success) {
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
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study-planner`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim(), units: [] }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setShowCreateModal(false);
        setNewName('');
        await fetchPlanners();
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
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study-planner?id=${id}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (json.success) {
        setDeleteId(null);
        await fetchPlanners(); // refresh list after successful deletion
      } else {
        setDeleteError(json.message || 'Delete failed');
      }
    } catch (err) {
      setDeleteError('Failed to delete. Please check your network and try again.');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = planners.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/20">
      {/* Header same as yours */}

      {/* Delete confirmation modal – enhanced */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="text-3xl mb-3">🗑️</div>
            <h2 className="text-base font-bold text-gray-800 mb-2">Delete Study Planner?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This will permanently remove the planner and all its unit associations.
            </p>
            {deleteError && <p className="text-sm text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => {
                  setDeleteId(null);
                  setDeleteError('');
                }}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal – unchanged */}

      {/* Table with delete button */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* ... search bar ... */}

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
                            {p.units?.length || 0} units
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