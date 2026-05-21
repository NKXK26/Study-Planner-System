'use client';

import {
  ChartBarIcon,
  AcademicCapIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

const TOTAL_REQUIRED_UNITS = 24;
const TOTAL_REQUIRED_CREDITS = 300;

const GraduationDashboard = ({ recommendations, studentInfo, completedUnits, editableSchedule }) => {
  if (!recommendations) return null;

  const {
    totalCompleted,
    totalCredits,
    completedPercent,
    creditsToGraduate,
    unitsToGraduate,
    currentYear,
    currentSemester,
  } = recommendations;

  const categoryReqs = recommendations.categoryRequirements || {};

  // Calculate estimated graduation semester from schedule
  let gradSemester = null;
  if (editableSchedule && editableSchedule.length > 0) {
    const lastSem = editableSchedule[editableSchedule.length - 1];
    gradSemester = `Year ${lastSem.year}, Semester ${lastSem.semester}`;
  }

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
              strokeDashoffset={`${2 * Math.PI * 42 * (1 - completedPercent / 100)}`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-gray-800">{Math.round(completedPercent)}%</span>
            <span className="text-[10px] text-gray-500">complete</span>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <AcademicCapIcon className="h-4 w-4" />
              <span>Units</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{totalCompleted} / {TOTAL_REQUIRED_UNITS}</p>
            <p className="text-xs text-gray-400">{unitsToGraduate} remaining</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <CheckCircleIcon className="h-4 w-4" />
              <span>Credits</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{totalCredits} / {TOTAL_REQUIRED_CREDITS}</p>
            <p className="text-xs text-gray-400">{creditsToGraduate} CP left</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <CalendarIcon className="h-4 w-4" />
              <span>Current position</span>
            </div>
            <p className="font-semibold text-gray-800">Y{currentYear} S{currentSemester}</p>
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