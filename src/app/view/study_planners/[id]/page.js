'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function StudyPlannerDetailPage() {
  const { id } = useParams();

  const [planner, setPlanner]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState('');

  // Unit search / add
  const [allUnits, setAllUnits]     = useState([]);
  const [unitSearch, setUnitSearch] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);
  const [unitLoading, setUnitLoading] = useState(false);

  // Remove unit confirm
  const [removeUnitId, setRemoveUnitId] = useState(null);

  const fetchPlanner = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study_planners/${id}`
      );
      const json = await res.json();
      if (json.success) {
        setPlanner(json.data);
        setNameValue(json.data.name);
      } else {
        setError(json.message);
      }
    } catch {
      setError('Failed to load study planner.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchPlanner(); }, [fetchPlanner]);

  // Fetch all units for the add-unit panel
  async function fetchAllUnits() {
    setUnitLoading(true);
    try {
      const res  = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit`
      );
      const json = await res.json();
      if (json.success) setAllUnits(json.data || json.units || []);
    } catch {
      console.error('Failed to load units');
    } finally {
      setUnitLoading(false);
    }
  }

  // Save planner name
  async function saveName() {
    if (!nameValue.trim()) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res  = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study_planners/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nameValue.trim() }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setPlanner(prev => ({ ...prev, name: json.data.name }));
        setEditingName(false);
        setSaveMsg('Saved!');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } catch {
      setSaveMsg('Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  // Add unit to planner
  async function addUnit(unit) {
    if (!planner) return;
    const currentIds = planner.units.map(u => u.ID);
    if (currentIds.includes(unit.ID)) return; // already in planner
    const newIds = [...currentIds, unit.ID];

    try {
      const res  = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study_planners/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unitIds: newIds }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setPlanner(prev => ({ ...prev, units: json.data.units }));
      }
    } catch {
      alert('Failed to add unit.');
    }
  }

  // Remove unit from planner
  async function removeUnit(unitId) {
    if (!planner) return;
    const newIds = planner.units.map(u => u.ID).filter(uid => uid !== unitId);

    try {
      const res  = await SecureFrontendAuthHelper.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_SERVER_URL}/api/study_planners/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unitIds: newIds }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setPlanner(prev => ({ ...prev, units: json.data.units }));
        setRemoveUnitId(null);
      }
    } catch {
      alert('Failed to remove unit.');
    }
  }

  // Filtered units for add panel (exclude already added)
  const existingIds  = new Set((planner?.units || []).map(u => u.ID));
  const filteredUnits = allUnits.filter(u =>
    !existingIds.has(u.ID) && (
      u.UnitCode?.toLowerCase().includes(unitSearch.toLowerCase()) ||
      u.Name?.toLowerCase().includes(unitSearch.toLowerCase())
    )
  );

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/20 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading planner…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/20 flex items-center justify-center">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm border border-red-100">
        <p className="text-red-500 mb-3">⚠️ {error}</p>
        <Link href="/view/study_planners" className="text-blue-600 underline text-sm">← Back to list</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/20">

      {/* ── Remove unit confirm modal ── */}
      {removeUnitId && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="text-3xl mb-3">🗑️</div>
            <h2 className="text-base font-bold text-gray-800 mb-2">Remove Unit?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This will remove the unit from this study planner.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => removeUnit(removeUnitId)}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Remove
              </button>
              <button
                onClick={() => setRemoveUnitId(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/view/study_planners"
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 font-medium transition-colors"
            >
              ← Back
            </Link>
            <div>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                    autoFocus
                    className="text-lg font-bold text-gray-800 border-b-2 border-blue-400 outline-none bg-transparent"
                  />
                  <button
                    onClick={saveName}
                    disabled={saving}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setNameValue(planner.name); }}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-gray-800">{planner?.name}</h1>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-gray-400 hover:text-blue-500 transition-colors text-xs"
                    title="Edit name"
                  >
                    ✏️
                  </button>
                  {saveMsg && <span className="text-xs text-emerald-500 font-medium">{saveMsg}</span>}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                Created {formatDate(planner?.createdAt)} · {planner?.units?.length || 0} units
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setAddingUnit(v => !v);
              if (!addingUnit) { fetchAllUnits(); setUnitSearch(''); }
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            {addingUnit ? '✕ Close' : '+ Add Unit'}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* ── Add unit panel ── */}
        {addingUnit && (
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Add Units to Planner</h2>
            <input
              type="text"
              placeholder="Search by unit code or name…"
              value={unitSearch}
              onChange={e => setUnitSearch(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 mb-4"
            />

            {unitLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredUnits.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">
                {unitSearch ? 'No units match your search' : 'All units already added'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                {filteredUnits.slice(0, 60).map(u => (
                  <button
                    key={u.ID}
                    onClick={() => addUnit(u)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                      <span className="text-xs font-bold text-blue-600">+</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-700 truncate">{u.UnitCode}</p>
                      <p className="text-xs text-gray-400 truncate">{u.Name}</p>
                    </div>
                    {u.CreditPoints && (
                      <span className="ml-auto text-xs font-mono text-gray-400 flex-shrink-0">{u.CreditPoints}cr</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Units table ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">Units in This Planner</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-semibold">
              {planner?.units?.length || 0} units
            </span>
          </div>

          {!planner?.units?.length ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📚</p>
              <p className="text-sm font-medium">No units added yet</p>
              <p className="text-xs mt-1">Click "+ Add Unit" to get started</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Code</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Credits</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Availability</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {planner.units.map(u => (
                  <tr key={u.ID} className="hover:bg-gray-50/60 transition-colors group">
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-blue-700">{u.UnitCode}</td>
                    <td className="px-5 py-3.5 text-gray-700">{u.Name}</td>
                    <td className="px-5 py-3.5">
                      {u.CreditPoints != null ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-600">
                          {u.CreditPoints} cr
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">{u.Availability || '—'}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setRemoveUnitId(u.ID)}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs font-semibold transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-100">
                <tr>
                  <td colSpan={2} className="px-5 py-3 text-xs font-semibold text-gray-500">Total</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                      {planner.units.reduce((sum, u) => sum + (u.CreditPoints || 0), 0)} cr
                    </span>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
