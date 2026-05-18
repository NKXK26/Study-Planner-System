'use client';

import { useState } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

function StatusBadge({ status }) {
  const styles = {
    'Eligible to Graduate': 'bg-green-100 text-green-800 border-green-200',
    'Missing Required Units': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'On Track': 'bg-blue-100 text-blue-800 border-blue-200',
    'At Risk': 'bg-red-100 text-red-800 border-red-200',
    'In Progress': 'bg-gray-100 text-gray-800 border-gray-200',
    'Not Eligible': 'bg-gray-100 text-gray-800 border-gray-200'
  };
  
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles['In Progress']}`}>
      {status}
    </span>
  );
}

function ProgressBar({ percent }) {
  const getColor = () => {
    if (percent >= 100) return 'bg-green-500';
    if (percent >= 70) return 'bg-blue-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5">
      <div 
        className={`${getColor()} h-2.5 rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

export default function GraduationEligibilityPage() {
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const checkEligibility = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) return;
    
    setLoading(true);
    setError(null);
    setSearched(true);
    
    try {
      const response = await SecureFrontendAuthHelper.authenticatedFetch(
        `/api/graduation-dashboard?studentId=${studentId.trim()}`
      );
      const data = await response.json();
      
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.message || 'Failed to check eligibility');
        setResult(null);
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to connect to server');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50/20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/view/dashboard" 
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 font-medium transition-colors"
            >
              ← Back
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Graduation Eligibility</h1>
              <p className="text-xs text-gray-400">Check student graduation status</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Form */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <form onSubmit={checkEligibility} className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Student ID
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Enter student ID (e.g., 2201234)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-400 text-white font-medium rounded-lg transition"
              >
                {loading ? 'Checking...' : 'Check Eligibility'}
              </button>
            </div>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-6">
            {/* Student Info Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-red-500 to-red-700 px-6 py-4">
                <h2 className="text-white font-semibold text-lg">Student Information</h2>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Student ID</p>
                  <p className="font-semibold text-gray-800">{result.student.id}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Name</p>
                  <p className="font-semibold text-gray-800">{result.student.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Course</p>
                  <p className="font-semibold text-gray-800">{result.student.course}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Major</p>
                  <p className="font-semibold text-gray-800">{result.student.major}</p>
                </div>
              </div>
            </div>

            {/* Status Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">Eligibility Status</h2>
                  <StatusBadge status={result.eligibilityStatus} />
                </div>
                <p className="text-sm text-gray-600 mb-4">{result.statusReason}</p>
                
                {/* Progress */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Credit Completion</span>
                    <span className="font-semibold">{result.credits.percentage}%</span>
                  </div>
                  <ProgressBar percent={result.credits.percentage} />
                </div>
                
                {/* Credit Summary */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{result.credits.completed}</p>
                    <p className="text-xs text-gray-500">Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-yellow-600">{result.credits.remaining}</p>
                    <p className="text-xs text-gray-500">Remaining</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-600">{result.credits.required}</p>
                    <p className="text-xs text-gray-500">Required</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Unit Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Unit Summary</h2>
              </div>
              <div className="p-6 grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">{result.units.passed}</p>
                  <p className="text-xs text-gray-500">Passed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{result.units.failed}</p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{result.units.inProgress}</p>
                  <p className="text-xs text-gray-500">In Progress</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{result.units.missing}</p>
                  <p className="text-xs text-gray-500">Missing</p>
                </div>
              </div>
            </div>

            {/* Failed Units */}
            {result.failedUnits.length > 0 && (
              <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-red-50 border-b border-red-100">
                  <h2 className="font-semibold text-red-800">⚠️ Failed Units</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-2">
                    {result.failedUnits.map((unit, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-red-50/50 rounded-lg">
                        <div>
                          <p className="font-mono text-sm font-semibold text-red-800">{unit.code}</p>
                          <p className="text-xs text-gray-600">{unit.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">{unit.year}</p>
                          <p className="text-xs text-red-600">{unit.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Missing Units */}
            {result.missingUnits.length > 0 && (
              <div className="bg-white rounded-2xl border border-yellow-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-yellow-50 border-b border-yellow-100">
                  <h2 className="font-semibold text-yellow-800">📚 Missing Required Units</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-2">
                    {result.missingUnits.map((unit, idx) => (
                      <div key={idx} className="p-3 bg-yellow-50/50 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-mono text-sm font-semibold text-yellow-800">{unit.code}</p>
                            <p className="text-xs text-gray-600">{unit.name}</p>
                            <p className="text-xs text-gray-500 mt-1">{unit.credits} credits</p>
                          </div>
                          {unit.prerequisiteStatus === 'not_met' && (
                            <div className="text-right">
                              <p className="text-xs text-red-600 font-semibold">⚠️ Prerequisites Not Met</p>
                              {unit.missingPrerequisites.map((pr, i) => (
                                <p key={i} className="text-xs text-gray-500">{pr}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Graduation Eligible Message */}
            {result.graduationEligible && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-green-800 font-semibold text-lg">🎓 CONGRATULATIONS! 🎓</p>
                <p className="text-green-600 mt-1">This student is eligible to graduate!</p>
              </div>
            )}
          </div>
        )}

        {/* No Search Yet */}
        {!searched && !result && !error && (
          <div className="mt-12 text-center py-12 bg-white rounded-2xl border border-gray-100">
            <p className="text-gray-400">Enter a student ID to check graduation eligibility</p>
            <p className="text-xs text-gray-300 mt-1">The system will analyze credits, completed units, and requirements</p>
          </div>
        )}
      </div>
    </div>
  );
}