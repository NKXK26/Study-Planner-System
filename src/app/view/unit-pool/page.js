'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// Import shared helpers (adjust path as needed)
import {
  extractUnitCode,
  getUnitCategory,
  CategoryBadge,
} from '../../libs/studyPlannerUtils';

// Helper to extract field from planner name
function getPlannerField(name) {
  const lower = name.toLowerCase();
  if (lower.includes('cssd')) return 'Software Dev';
  if (lower.includes('cscs')) return 'Cybersecurity';
  if (lower.includes('csiot')) return 'IoT';
  if (lower.includes('csds')) return 'Data Science';
  if (lower.includes('csai')) return 'AI';
  return null;
}

export default function UnitPoolPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allPlanners, setAllPlanners] = useState([]);
  const [filteredUnits, setFilteredUnits] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypes, setSelectedTypes] = useState({
    core: true,
    major: true,
    elective: true,
  });
  const [selectedFields, setSelectedFields] = useState({
    'Software Dev': true,
    Cybersecurity: true,
    'Data Science': true,
    IoT: true,
    AI: true,
  });

  // Fetch all planners on load
  useEffect(() => {
    fetch('/api/study-planner', { headers: { 'x-dev-override': 'true' } })
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setAllPlanners(json.data || []);
        } else {
          setError('Failed to load planners.');
        }
      })
      .catch(() => setError('Network error fetching planners.'))
      .finally(() => setLoading(false));
  }, []);

  // Build flattened unit list whenever planners change
  useEffect(() => {
    if (!allPlanners.length) {
      setFilteredUnits([]);
      return;
    }

    const flatUnits = [];
    for (const planner of allPlanners) {
      const field = getPlannerField(planner.name);
      if (!field) continue; // skip planners that don't match any field (optional)
      for (const unit of (planner.units || [])) {
        const type = getUnitCategory(unit);
        flatUnits.push({
          code: extractUnitCode(unit.UnitCode),
          name: unit.Name,
          creditPoints: unit.CreditPoints || 12.5,
          plannerName: planner.name,
          plannerField: field,
          unitType: type,
          rawUnit: unit,
        });
      }
    }
    setFilteredUnits(flatUnits);
  }, [allPlanners]);

  // Apply filters: search, type, field
  const applyFilters = () => {
    let result = [...filteredUnits];
    // Search by code or name
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        u => u.code.toLowerCase().includes(term) || u.name.toLowerCase().includes(term)
      );
    }
    // Filter by unit type
    const activeTypes = Object.keys(selectedTypes).filter(k => selectedTypes[k]);
    if (activeTypes.length > 0 && activeTypes.length < 3) {
      result = result.filter(u => activeTypes.includes(u.unitType));
    }
    // Filter by planner field
    const activeFields = Object.keys(selectedFields).filter(k => selectedFields[k]);
    if (activeFields.length > 0 && activeFields.length < 5) {
      result = result.filter(u => activeFields.includes(u.plannerField));
    }
    return result;
  };

  const displayedUnits = applyFilters();

  const toggleType = (type) => {
    setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const toggleField = (field) => {
    setSelectedFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto text-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading unit pool...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Unit Pool</h1>
            <p className="text-sm text-gray-500 mt-1">
              All units from all study planners ({displayedUnits.length} units)
            </p>
          </div>
          <Link
            href="/view/dashboard"
            className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Filters bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-start">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Code or name..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Unit type filters */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Unit Type</label>
              <div className="flex gap-2">
                {['core', 'major', 'elective'].map(type => (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-all capitalize
                      ${selectedTypes[type]
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Planner field filters */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Study Field</label>
              <div className="flex flex-wrap gap-2">
                {['Software Dev', 'Cybersecurity', 'Data Science', 'IoT', 'AI'].map(field => (
                  <button
                    key={field}
                    onClick={() => toggleField(field)}
                    className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-all
                      ${selectedFields[field]
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                  >
                    {field}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset filters */}
            <div className="self-end">
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedTypes({ core: true, major: true, elective: true });
                  setSelectedFields({
                    'Software Dev': true,
                    Cybersecurity: true,
                    'Data Science': true,
                    IoT: true,
                    AI: true,
                  });
                }}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <XMarkIcon className="h-4 w-4" /> Reset all
              </button>
            </div>
          </div>
        </div>

        {/* Units table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credit Points
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Study Field / Planner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {displayedUnits.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                      No units match the current filters.
                    </td>
                  </tr>
                ) : (
                  displayedUnits.map((unit, idx) => (
                    <tr key={`${unit.code}-${unit.plannerName}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-sm font-medium text-gray-900">
                        {unit.code}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {unit.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {unit.creditPoints} CP
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <CategoryBadge category={unit.unitType} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-gray-700">{unit.plannerField}</span>
                          <span className="text-xs text-gray-400">{unit.plannerName}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer with count */}
        <div className="mt-4 text-right text-xs text-gray-500">
          Showing {displayedUnits.length} of {filteredUnits.length} total unit occurrences
        </div>
      </div>
    </div>
  );
}