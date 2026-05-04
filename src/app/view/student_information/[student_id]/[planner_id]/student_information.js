import InfoTooltip from '@components/InfoTooltip';
import React from 'react';

const StudentInformation = ({ studentStudyPlanner, studentEmail, isInfoExpanded, setIsInfoExpanded }) => {
  return (
    <div className="plannerInfoCard">
      <div
        className="plannerInfoHeader"
        onClick={() => setIsInfoExpanded(!isInfoExpanded)}
      >
        <div className="flex items-center">
          <div className="bg-white p-2 rounded-full mr-3 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#DC2D27]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="plannerInfoTitle">Student Information<InfoTooltip content={
            "Information of Student, Academic Progress, Unit Progress will be shown here"
          }></InfoTooltip></h3>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-white transition-transform duration-300 ${isInfoExpanded ? 'transform rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <div
        className={`transition-all duration-300 ease-in-out overflow-auto ${isInfoExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Student Profile Card */}
          <div className="plannerDetailsCard">
            <div className="flex items-center mb-4">
              <div className="bg-blue-100 p-3 rounded-full mr-4 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h3 className="plannerDetailsTitle">Student Profile</h3>
                <p className="plannerDetailsSubtitle">Personal Details</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex border-b border-gray-100 pb-3">
                <span className="plannerDetailLabel">Name:</span>
                <span className="plannerDetailValue">{studentStudyPlanner?.student_info?.name}</span>
              </div>
              <div className="flex border-b border-gray-100 pb-3">
                <span className="plannerDetailLabel">Student ID:</span>
                <span className="plannerDetailValue">{studentStudyPlanner?.student_info?.student_id}</span>
              </div>
              <div className="flex border-b border-gray-100 pb-3">
                <span className="plannerDetailLabel">Email:</span>
                <span className="plannerDetailValue">{studentEmail}</span>
              </div>
            </div>
          </div>

          {/* Academic Progress Card */}
          <div className="plannerDetailsCard">
            <div className="flex items-center mb-4">
              <div className="bg-green-100 p-3 rounded-full mr-4 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="plannerDetailsTitle">Academic Progress</h3>
                <p className="plannerDetailsSubtitle">Credit Completion Status</p>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="plannerDetailLabel">Credits Completed:</span>
                <span className="font-semibold">{studentStudyPlanner?.student_info?.credits_completed} / {studentStudyPlanner?.required_cp}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-green-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(studentStudyPlanner?.student_info?.credits_completed / studentStudyPlanner?.required_cp) * 100}%` }}
                ></div>
              </div>
              <p className="plannerDetailLabel">
                {Math.round((studentStudyPlanner?.student_info?.credits_completed / studentStudyPlanner?.required_cp) * 100)}% complete
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="plannerDetailLabel">MPU Completed:</span>
                <span className="font-semibold text-blue-600">{studentStudyPlanner?.student_info?.mpu_credits_completed || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Unit Type Progress */}
        <div className="px-6 pb-6">
          <div className="plannerDetailsCard">
            <div className="flex items-center mb-4">
              <div className="bg-purple-100 p-3 rounded-full mr-4 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="plannerDetailsTitle">Unit Progress</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Unit Type</th>
                    <th className="py-3 px-4 border-b text-center font-semibold text-gray-700">Passed</th>
                    <th className="py-3 px-4 border-b text-center font-semibold text-gray-700">Planned</th>
                    <th className="py-3 px-4 border-b text-center font-semibold text-gray-700">Ratio</th>
                  </tr>
                </thead>
                <tbody className="table-body-divided">
                  {/* {Object.entries(studentStudyPlanner.study_planner.GetAllPassedAndPlannedUnitsRatioByUnitType()).map(([typeName, data]) => ( */}
                  {Object.entries(studentStudyPlanner.GetAllPassedAndPlannedUnitsRatioByUnitType()).map(([typeName, data]) => (
                    <tr key={typeName}>
                      <td className="py-3 px-4 border-b font-medium">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full shadow-sm"
                            style={{ backgroundColor: data.color || '#CCCCCC' }}
                          ></div>
                          {typeName}
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b text-center">{data.passed}</td>
                      <td className="py-3 px-4 border-b text-center">{data.planned}</td>
                      <td className="py-3 px-4 border-b text-center font-medium">{data.passed} / {data.planned + data.passed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentInformation; 