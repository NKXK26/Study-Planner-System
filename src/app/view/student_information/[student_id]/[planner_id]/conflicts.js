import InfoTooltip from '@components/InfoTooltip';
import React from 'react';

const Conflicts = ({ conflicts, isConflictsExpanded, setIsConflictsExpanded, getUnitTypeInfo }) => {
  return (
    <div className="plannerInfoCard">
      <div
        className="plannerInfoHeader"
        onClick={() => setIsConflictsExpanded(!isConflictsExpanded)}
      >
        <div className="flex items-center">
          <div className="bg-white p-2 rounded-full mr-3 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white">Conflicts <InfoTooltip content={
            "If conflicts with the study planner happens, it will be shown here. Example of conflicts are requisites conflict (Re-, Co-, Anti-), Sufficient CP, Not Offered or Not available in the semester,  Insufficient Credits or Empty slots in the Study Planner"
          }></InfoTooltip></h3>
          {conflicts.length > 0 && (
            <div className="ml-3 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center shadow-sm">
              {conflicts.length}
            </div>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-white transition-transform duration-300 ${isConflictsExpanded ? 'transform rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${isConflictsExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-6">
          {conflicts.length === 0 ? (
            <div className="text-center py-8">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-medium text-gray-700">No conflicts found</p>
              <p className="text-gray-500">All units are properly scheduled and offered in their assigned semesters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                    <th className="py-3 px-4 border-b text-center font-semibold text-gray-700">Type</th>
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Unit</th>
                    <th className="py-3 px-4 border-b text-center font-semibold text-gray-700">Year/Semester</th>
                    <th className="py-3 px-4 border-b text-center font-semibold text-gray-700">Issue</th>
                  </tr>
                </thead>
                <tbody className="table-body-divided">
                  {conflicts.map((conflict, index) => (
                    <tr key={index}>
                      <td className="py-3 px-4 border-b text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div
                            className="w-5 h-5 rounded-full shadow-sm border border-gray-300"
                            style={{ backgroundColor: conflict.unit_type_color || getUnitTypeInfo(conflict.unit_type_id)?._color }}
                          ></div>
                          <span>{conflict.unit_type || getUnitTypeInfo(conflict.unit_type_id)?.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b">
                        <div>
                          <span className="font-medium">{conflict.unit_code}</span>
                          <p className="text-sm">{conflict.unit_name}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b text-center">
                        <div>
                          <span>Year {conflict.year}</span>
                          <p className="text-sm">{conflict.semester}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${conflict.issue_type === 'conflict'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-orange-100 text-red-800'
                          }`}>
                          {conflict.issue}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Conflicts; 