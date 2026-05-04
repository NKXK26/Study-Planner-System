import React from 'react';

const CurrentAmendments = ({ studentStudyPlanner, isAmendmentsExpanded, setIsAmendmentsExpanded, getUnitTypeInfo, getUnitCodeDisplay, getAmendmentAction }) => {
  return (
    <div className="plannerInfoCard">
      <div
        className="plannerInfoHeader"
        onClick={() => setIsAmendmentsExpanded(!isAmendmentsExpanded)}
      >
        <div className="flex items-center">
          <div className="bg-white p-2 rounded-full mr-3 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white">Current Amendments</h3>
          {studentStudyPlanner?.amendments && studentStudyPlanner.amendments.length > 0 && (
            <div className="ml-3 bg-blue-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center shadow-sm">
              {studentStudyPlanner.amendments.length}
            </div>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-white transition-transform duration-300 ${isAmendmentsExpanded ? 'transform rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <div
        className={`transition-all duration-300 ease-in-out overflow-auto ${isAmendmentsExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-6">
          {!studentStudyPlanner?.amendments || studentStudyPlanner.amendments.length === 0 ? (
            <div className="text-center py-8">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="plannerDetailsTitle">No amendments made</p>
              <p className="plannerDetailsSubtitle">No changes have been made to the study planner yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Old Unit</th>
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">New Unit</th>
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Year</th>
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody className="table-body-divided">
                  {studentStudyPlanner.amendments.map((amendment, index) => (
                    <tr key={index}>
                      <td className="py-3 px-4 border-b">
                        <div className="flex items-center justify-start gap-2">
                          <div className="w-5 h-5 rounded-full shadow-sm border border-gray-300" style={{ backgroundColor: getUnitTypeInfo(amendment.old_unit_type_id)?.color }}>
                          </div>
                          <span>{getUnitCodeDisplay(amendment.old_unit_code, amendment.old_unit_type_id) || "Empty Slot"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b">
                        <div className="flex items-center justify-start gap-2">
                          <div className="w-5 h-5 rounded-full shadow-sm border border-gray-300" style={{ backgroundColor: getUnitTypeInfo(amendment.new_unit_type_id)?.color }}>
                          </div>
                          <span>{getUnitCodeDisplay(amendment.new_unit_code, amendment.new_unit_type_id) || "Empty Slot"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b text-left">
                        <div>
                          <span>Year {amendment.year_index}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b text-left">
                        <div>
                          {(() => {
                            const action = getAmendmentAction(amendment);
                            return (
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${action.color}`}>
                                {action.label}
                              </span>
                            );
                          })()}
                        </div>
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

export default CurrentAmendments; 