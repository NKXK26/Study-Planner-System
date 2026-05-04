import React, { useState } from 'react';
import { useLightDarkMode } from '@app/context/LightDarkMode';

const AmendmentHistory = ({ amendment_history, getUnitTypeInfo, getUnitCodeDisplay, getAmendmentAction }) => {
  const [isExpanded, setIsExpanded] = useState(false);
	const { theme } = useLightDarkMode();

  // Helper function to format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Helper function to get unit code from amendment (handles both DB format and internal format)
  const getOldUnitCode = (amendment) => {
    // Check internal format first (underscore-prefixed from ApplyAmendments)
    if (amendment._unit_code !== undefined) {
      return amendment._unit_code;
    }
    // Check if the old unit data is available from DB relation
    if (amendment.Unit_StudentStudyPlannerAmmendments_UnitIDToUnit) {
      return amendment.Unit_StudentStudyPlannerAmmendments_UnitIDToUnit.UnitCode;
    }
    return null;
  };

  // Helper function to get new unit code from amendment (handles both DB format and internal format)
  const getNewUnitCode = (amendment) => {
    // Check internal format first (underscore-prefixed from ApplyAmendments)
    if (amendment._new_unit_code !== undefined) {
      return amendment._new_unit_code;
    }
    // Check if the new unit data is available from DB relation
    if (amendment.Unit_StudentStudyPlannerAmmendments_NewUnitIDToUnit) {
      return amendment.Unit_StudentStudyPlannerAmmendments_NewUnitIDToUnit.UnitCode;
    }
    return null;
  };

  // Helper to get the old unit type ID
  const getOldUnitTypeId = (amendment) => {
    // Check if we have stored old unit type ID
    if (amendment._old_unit_type_id !== undefined) {
      return amendment._old_unit_type_id;
    }
    if (amendment.OldUnitTypeID !== undefined && amendment.OldUnitTypeID !== null) {
      return amendment.OldUnitTypeID;
    }
    // Check if we have the old unit type relation from database
    if (amendment.UnitType_OldUnitType) {
      return amendment.UnitType_OldUnitType.ID;
    }
    // For historical amendments, old unit type might not be stored
    return null;
  };

  // Display unit code with elective handling
  const displayUnitCode = (unitCode, unitTypeId) => {
    // If we have a unit code, display it
    if (unitCode) {
      return unitCode;
    }

    // If no unit code but we have a unit type ID, check if it's an elective
    if (unitTypeId) {
      const unitTypeInfo = getUnitTypeInfo(unitTypeId);

      // Check if the unit type name contains "elective" (case-insensitive)
      if (unitTypeInfo?.name && unitTypeInfo.name.toLowerCase().includes("elective")) {
        return "Elective";
      }
    }

    // Default to "Empty Slot"
    return "Empty Slot";
  };

  // Helper to get action from amendment (handles both formats)
  const getAction = (amendment) => {
    return amendment._action || amendment.Action;
  };

  // Helper to get year from amendment (handles both formats)
  const getYear = (amendment) => {
    return amendment._year || amendment.Year;
  };

  // Helper to get sem index from amendment (handles both formats)
  const getSemIndex = (amendment) => {
    if (amendment._sem_index !== undefined) return amendment._sem_index;
    return amendment.SemIndex;
  };

  // Helper to get sem type from amendment (handles both formats)
  const getSemType = (amendment) => {
    return amendment._sem_type || amendment.SemType;
  };

  // Helper to get timestamp from amendment (handles both formats)
  const getTimestamp = (amendment) => {
    return amendment._time_of_action || amendment.TimeofAction;
  };

  // Helper to get new unit type ID from amendment (handles both formats)
  const getNewUnitTypeId = (amendment) => {
    if (amendment._new_unit_type_id !== undefined) return amendment._new_unit_type_id;
    if (amendment.NewUnitTypeID !== undefined && amendment.NewUnitTypeID !== null) {
      return amendment.NewUnitTypeID;
    }
    // Check if we have the new unit type relation from database
    if (amendment.UnitType_NewUnitType) {
      return amendment.UnitType_NewUnitType.ID;
    }
    return null;
  };

  // Sort amendments by date (most recent first)
  const sortedAmendments = amendment_history && amendment_history.length > 0
    ? [...amendment_history].sort((a, b) => {
      const dateA = new Date(getTimestamp(a));
      const dateB = new Date(getTimestamp(b));
      return dateB - dateA;
    })
    : [];

  return (
    <div className="plannerInfoCard">
      <div
        className="plannerInfoHeader"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <div className="bg-white p-2 rounded-full mr-3 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white">Amendment History</h3>
          {sortedAmendments.length > 0 && (
            <div className="ml-3 bg-purple-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center shadow-sm">
              {sortedAmendments.length}
            </div>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-white transition-transform duration-300 ${isExpanded ? 'transform rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <div
        className={`transition-all duration-300 ease-in-out overflow-auto ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-6">
          {!sortedAmendments || sortedAmendments.length === 0 ? (
            <div className="text-center py-8">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="plannerDetailsTitle">No amendment history</p>
              <p className="plannerDetailsSubtitle">No historical changes have been recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-200">
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Date & Time</th>
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Old Unit</th>
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">New Unit</th>
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Year</th>
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Semester</th>
                    <th className="py-3 px-4 border-b text-left font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody className="table-body-divided">
                  {sortedAmendments.map((amendment, index) => {
                    const oldUnitCode = getOldUnitCode(amendment);
                    const newUnitCode = getNewUnitCode(amendment);
                    const oldUnitTypeId = getOldUnitTypeId(amendment);
                    const newUnitTypeId = getNewUnitTypeId(amendment);
                    const year = getYear(amendment);
                    const semType = getSemType(amendment);
                    const semIndex = getSemIndex(amendment);
                    const timestamp = getTimestamp(amendment);

                    return (
                      <tr key={index} className={`hover:${theme == "dark" ? "bg-gray-400" : "bg-gray-50"} transition-colors`}>
                        <td className="py-3 px-4 border-b">
                          <div className="text-sm text-gray-600">
                            {formatDate(timestamp)}
                          </div>
                        </td>
                        <td className="py-3 px-4 border-b">
                          <div className="flex items-center justify-start gap-2">
                            {oldUnitTypeId && (
                              <div
                                className="w-5 h-5 rounded-full shadow-sm border border-gray-300"
                                style={{ backgroundColor: getUnitTypeInfo(oldUnitTypeId)?.color }}
                              />
                            )}
                            <span>{displayUnitCode(oldUnitCode, oldUnitTypeId)}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 border-b">
                          <div className="flex items-center justify-start gap-2">
                            {newUnitTypeId && (
                              <div
                                className="w-5 h-5 rounded-full shadow-sm border border-gray-300"
                                style={{ backgroundColor: getUnitTypeInfo(newUnitTypeId)?.color }}
                              />
                            )}
                            <span>{displayUnitCode(newUnitCode, newUnitTypeId)}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 border-b text-left">
                          <div>
                            <span>Year {year || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 border-b text-left">
                          <div className="text-sm">
                            <span>{semType || 'N/A'}</span>
                            {semIndex !== null && semIndex !== undefined && (
                              <span className="text-gray-500"> ({semIndex + 1})</span>
                            )}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AmendmentHistory;