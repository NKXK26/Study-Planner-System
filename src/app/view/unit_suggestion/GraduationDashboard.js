'use client';

import { useMemo } from 'react';
import {
  ChartBarIcon,
  AcademicCapIcon,
  CalendarIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

const TOTAL_REQUIRED_UNITS = 24;
const TOTAL_REQUIRED_CREDITS = 300;
const UNITS_PER_SEMESTER = 4;
const SEMESTERS_PER_YEAR = 2;

const GraduationDashboard = ({ recommendations, studentInfo, completedUnits, editableSchedule }) => {
  if (!recommendations) return null;

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
      <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
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
        </div>
      </div>

      {/* Category progress bars */}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {['core', 'major', 'elective'].map(cat => {
          const data = categoryReqs[cat] || { completed: 0, required: 8 };
          const percent = (data.completed / data.required) * 100;
          return (
            <div key={cat}>
              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                <span className="capitalize">{cat}</span>
                <span>{data.completed}/{data.required}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-[#cc2131] h-1.5 rounded-full" style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GraduationDashboard;