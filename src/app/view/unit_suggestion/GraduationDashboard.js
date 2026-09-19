'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ChartBarIcon,
  AcademicCapIcon,
  CalendarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const TOTAL_REQUIRED_UNITS = 24;
const TOTAL_REQUIRED_CREDITS = 300;
const UNITS_PER_SEMESTER = 4;
const SEMESTERS_PER_YEAR = 2;

const GraduationDashboard = ({ recommendations, studentInfo, completedUnits, editableSchedule }) => {
  if (!recommendations) return null;

  const [graduationCheck, setGraduationCheck] = useState(null);
  const [graduationLoading, setGraduationLoading] = useState(false);
  const [graduationError, setGraduationError] = useState(null);

  // Effective unit count: ICT20016 or any unit with doubleCount flag counts as 2, otherwise 1
  const effectiveUnitCount = useMemo(() => {
    let count = 0;
    (completedUnits || []).forEach(u => {
      if (u.code === 'ICT20016' || u.doubleCount) count += 2;
      else count += 1;
    });
    return count;
  }, [completedUnits]);

  // Total credits from completed units (already handles double credits)
  const actualTotalCredits = useMemo(() => {
    let sum = 0;
    (completedUnits || []).forEach(u => {
      let cp = u.creditPoints || u.CreditPoints || 12.5;
      if (u.code === 'ICT20016' || u.doubleCount) cp = 25;
      sum += cp;
    });
    return sum;
  }, [completedUnits]);

  const actualCompletedPercent = (effectiveUnitCount / TOTAL_REQUIRED_UNITS) * 100;
  const actualUnitsRemaining = Math.max(0, TOTAL_REQUIRED_UNITS - effectiveUnitCount);
  const actualCreditsRemaining = Math.max(0, TOTAL_REQUIRED_CREDITS - actualTotalCredits);

  // Current position based on effective units (so ICT20016 pushes the student forward by 2 units)
  const currentPosition = useMemo(() => {
    let semesterOrder = Math.ceil(effectiveUnitCount / UNITS_PER_SEMESTER);
    if (semesterOrder === 0) semesterOrder = 1;
    const year = Math.floor((semesterOrder - 1) / SEMESTERS_PER_YEAR) + 1;
    const semester = ((semesterOrder - 1) % SEMESTERS_PER_YEAR) + 1;
    return { year, semester, semesterOrder };
  }, [effectiveUnitCount]);

  const ordinal = (n) => {
    if (n % 10 === 1 && n % 100 !== 11) return 'st';
    if (n % 10 === 2 && n % 100 !== 12) return 'nd';
    if (n % 10 === 3 && n % 100 !== 13) return 'rd';
    return 'th';
  };

  const categoryReqs = recommendations.categoryRequirements || {};

  let gradSemester = null;
  if (editableSchedule && editableSchedule.length > 0) {
    const lastSem = editableSchedule[editableSchedule.length - 1];
    gradSemester = `Year ${lastSem.year}, Semester ${lastSem.semester}`;
  }

  // Helper to show credits with one decimal if needed
  const formattedCredits = Number.isInteger(actualTotalCredits)
    ? actualTotalCredits
    : actualTotalCredits.toFixed(1);

  // Filter out categories with 0 required units (optional)
  const displayCategories = Object.entries(categoryReqs).filter(([_, data]) => data.required > 0);

  // Call graduation checker API when student info and completed units are available
  const runGraduationCheck = useCallback(async () => {
    if (!studentInfo?.studentId || !completedUnits?.length) return;

    setGraduationLoading(true);
    setGraduationError(null);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch(`/api/graduation-checker?studentId=${studentInfo.studentId}`, {
        headers: { 'x-dev-override': 'true' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGraduationCheck(data.data);
      } else {
        setGraduationError(data.message || 'Failed to check graduation eligibility');
      }
    } catch (err) {
      console.error('Graduation check error:', err);
      setGraduationError('An error occurred while checking eligibility');
    } finally {
      setGraduationLoading(false);
    }
  }, [studentInfo?.studentId, completedUnits?.length]);

  // Run graduation check when recommendations are available
  useEffect(() => {
    runGraduationCheck();
  }, [runGraduationCheck]);

  const statusColors = {
    'eligible': 'bg-green-50 border-green-200 text-green-800',
    'not_eligible': 'bg-yellow-50 border-yellow-200 text-yellow-800',
    'in_progress': 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const statusIcons = {
    'eligible': '✅',
    'not_eligible': '⚠️',
    'in_progress': '📋',
  };

  const statusLabels = {
    'eligible': 'Eligible to Graduate',
    'not_eligible': 'Not Yet Eligible',
    'in_progress': 'In Progress',
  };

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <ChartBarIcon className="h-5 w-5 text-[#cc2131]" />
        <h3 className="font-bold text-gray-800">Graduation Dashboard</h3>
        <span className="text-xs text-gray-500 ml-auto">
          {studentInfo?.studentId ? `ID: ${studentInfo.studentId}` : ''}
        </span>
      </div>

      {/* Main progress ring */}
      <div className="flex flex-col md:flex-row gap-6 items-center md:items-start mb-6">
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg className="w-full h-full" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="10" />
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="#cc2131"
              strokeWidth="10"
              strokeDasharray={`${2 * Math.PI * 42}`}
              strokeDashoffset={`${2 * Math.PI * 42 * (1 - actualCompletedPercent / 100)}`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-gray-800">{Math.round(actualCompletedPercent)}%</span>
            <span className="text-[10px] text-gray-500">complete</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <AcademicCapIcon className="h-4 w-4" />
              <span>Units</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{effectiveUnitCount} / {TOTAL_REQUIRED_UNITS}</p>
            <p className="text-xs text-gray-400">{actualUnitsRemaining} remaining</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <CheckCircleIcon className="h-4 w-4" />
              <span>Credits</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{formattedCredits} / {TOTAL_REQUIRED_CREDITS}</p>
            <p className="text-xs text-gray-400">{actualCreditsRemaining} CP left</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <CalendarIcon className="h-4 w-4" />
              <span>Current position</span>
            </div>
            <p className="font-semibold text-gray-800">
              Year {currentPosition.year}, Semester {currentPosition.semester}
            </p>
            <p className="text-xs text-gray-400">
              {effectiveUnitCount} effective units · {currentPosition.semesterOrder}{ordinal(currentPosition.semesterOrder)} semester
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <AcademicCapIcon className="h-4 w-4" />
              <span>Est. Graduation</span>
            </div>
            <p className="font-semibold text-gray-800">
              {gradSemester || 'N/A'}
            </p>
            <p className="text-xs text-gray-400">
              {editableSchedule?.length ? `${editableSchedule.length} semester(s) remaining` : 'All complete!'}
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Graduation Check Results */}
      {(graduationCheck || graduationLoading || graduationError) && (
        <div className="border-t border-gray-200 pt-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
              <AcademicCapIcon className="h-5 w-5 text-[#cc2131]" />
              Graduation Eligibility Check
            </h4>
            <button
              onClick={runGraduationCheck}
              disabled={graduationLoading}
              className="text-xs text-[#cc2131] hover:underline flex items-center gap-1"
            >
              <ArrowPathIcon className={`h-4 w-4 ${graduationLoading ? 'animate-spin' : ''}`} />
              Re-check
            </button>
          </div>

          {graduationLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-3">
                <ArrowPathIcon className="h-6 w-6 text-[#cc2131] animate-spin" />
                <span className="text-gray-600">Checking graduation eligibility...</span>
              </div>
            </div>
          )}

          {graduationError && !graduationCheck && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{graduationError}</span>
            </div>
          )}

          {graduationCheck && (
            <div className="space-y-4">
              {/* Status Header */}
              <div className={`p-4 rounded-lg border ${statusColors[graduationCheck.status] || statusColors.in_progress} flex items-center gap-4`}>
                <span className="text-3xl">{statusIcons[graduationCheck.status] || '📋'}</span>
                <div>
                  <h3 className="text-xl font-bold">{statusLabels[graduationCheck.status] || 'In Progress'}</h3>
                  <p className="text-sm opacity-80">
                    {graduationCheck.studentInfo ? `${graduationCheck.studentInfo.studentId} - ${graduationCheck.studentInfo.course} (${graduationCheck.studentInfo.major})` : ''}
                  </p>
                </div>
              </div>

              {/* Progress Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ProgressCard
                  label="Total Credits"
                  value={`${graduationCheck.credits?.completed || 0} / ${graduationCheck.credits?.required || 0}`}
                  remaining={graduationCheck.credits?.remaining || 0}
                  color="blue"
                />
                <ProgressCard
                  label="Core Units"
                  value={`${graduationCheck.coreUnits?.completed || 0} / ${graduationCheck.coreUnits?.required || 0}`}
                  remaining={graduationCheck.coreUnits?.remaining || 0}
                  color="green"
                />
                <ProgressCard
                  label="Major Units"
                  value={`${graduationCheck.majorUnits?.completed || 0} / ${graduationCheck.majorUnits?.required || 0}`}
                  remaining={graduationCheck.majorUnits?.remaining || 0}
                  color="purple"
                />
                <ProgressCard
                  label="Electives"
                  value={`${graduationCheck.electives?.completed || 0} / ${graduationCheck.electives?.required || 0}`}
                  remaining={graduationCheck.electives?.remaining || 0}
                  color="orange"
                />
              </div>

              {/* Missing Requirements */}
              {(graduationCheck.missingRequirements?.length > 0) && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                    <span className="text-red-500">⚠️</span>
                    Missing Requirements ({graduationCheck.missingRequirements.length})
                  </h4>
                  <div className="space-y-2">
                    {graduationCheck.missingRequirements.map((req, idx) => (
                      <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-red-500">•</span>
                          <div>
                            <p className="font-medium text-red-800">{req.unitCode} - {req.unitName}</p>
                            <p className="text-sm text-red-600">{req.type} • {req.creditPoints} CP</p>
                          </div>
                        </div>
                        {req.prerequisites && req.prerequisites.length > 0 && (
                          <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                            Prereqs: {req.prerequisites.join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Requirements */}
              {(graduationCheck.completedRequirements?.length > 0) && (
                <details className="border border-gray-200 rounded-lg">
                  <summary className="p-4 font-medium text-gray-700 cursor-pointer flex items-center gap-2">
                    <span>✅</span>
                    Completed Requirements ({graduationCheck.completedRequirements.length})
                  </summary>
                  <div className="px-4 pb-4 space-y-1">
                    {graduationCheck.completedRequirements.map((req, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                        <span className="text-green-700">{req.unitCode} - {req.unitName}</span>
                        <span className="text-gray-500">{req.creditPoints} CP</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Failed/Incomplete Units */}
              {(graduationCheck.failedUnits?.length > 0) && (
                <details className="border border-gray-200 rounded-lg">
                  <summary className="p-4 font-medium text-gray-700 cursor-pointer flex items-center gap-2">
                    <span>❌</span>
                    Failed / Incomplete Units ({graduationCheck.failedUnits.length})
                  </summary>
                  <div className="px-4 pb-4 space-y-1">
                    {graduationCheck.failedUnits.map((unit, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                        <span className="text-red-700">{unit.unitCode} - {unit.unitName}</span>
                        <span className="text-gray-500 capitalize">{unit.status}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* WIL / Double Count Info */}
              {(graduationCheck.wilInfo) && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h5 className="font-medium text-purple-800 mb-2">WIL / Double Count Information</h5>
                  <p className="text-sm text-purple-700">{graduationCheck.wilInfo}</p>
                </div>
              )}

              {/* Notes */}
              {(graduationCheck.notes && graduationCheck.notes.length > 0) && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h5 className="font-medium text-blue-800 mb-2">Notes</h5>
                  <ul className="text-sm text-blue-700 space-y-1">
                    {graduationCheck.notes.map((note, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span>•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fallback when no graduation check yet */}
      {!graduationCheck && !graduationLoading && !graduationError && studentInfo?.studentId && (
        <div className="border-t border-gray-200 pt-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
              <AcademicCapIcon className="h-5 w-5 text-[#cc2131]" />
              Graduation Eligibility Check
            </h4>
          </div>
          <div className="text-center py-8 text-gray-500">
            <p>Upload your transcript and map external units to check graduation eligibility.</p>
            <button
              onClick={runGraduationCheck}
              className="mt-3 text-[#cc2131] hover:underline text-sm font-medium"
            >
              Check Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Progress Card Component
function ProgressCard({ label, value, remaining, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  };

  return (
    <div className={`p-4 rounded-lg border ${colors[color] || colors.blue}`}>
      <p className="text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {remaining > 0 && (
        <p className="text-sm mt-1">{remaining} remaining</p>
      )}
    </div>
  );
}

export default GraduationDashboard;