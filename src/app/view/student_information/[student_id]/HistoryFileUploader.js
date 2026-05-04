import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import UnitDB from '@app/class/Unit/UnitDB';
import Unit from '@app/class/Unit/Unit';
import TermDB from '@app/class/Term/termDB';
import Term from '@app/class/Term/term';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const StudentUnitHistoryUploader = ({ studentId, onUploadSuccess, onClose, onDataStaged, allTerms }) => {
    const [file, setFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [importMode, setImportMode] = useState('add');
    const [step, setStep] = useState(1); // Track which step we're on
    const [changesSummary, setChangesSummary] = useState(null); // Store changes analysis
    const [existingData, setExistingData] = useState([]); // Store current student data
    const [loadingPreview, setLoadingPreview] = useState(false); // Loading state for preview
    const [isImporting, setIsImporting] = useState(false); // Loading state for import button
    const fileInputRef = useRef(null);

    const modalRef = useRef(null);
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    //Fetch existing student unit history for comparison
    useEffect(() => {
        if (studentId && step === 2) {
            fetchExistingData();
        }
    }, [studentId, step]);

    const fetchExistingData = async () => {
        setLoadingPreview(true);
        try {
            const response = await SecureFrontendAuthHelper.authenticatedFetch(`/api/students/student_unit_history?studentId=${studentId}`);
            if (response.ok) {
                const data = await response.json();
                setExistingData(data.units || []);
                analyzeChanges(parsedData, data.units || []);
            } else {
                setExistingData([]);
                analyzeChanges(parsedData, []);
            }
        } catch (error) {
            console.error('Error fetching existing data:', error);
            setExistingData([]);
            analyzeChanges(parsedData, []);
        } finally {
            setLoadingPreview(false);
        }
    };

    // Analyze what changes will be made
    const analyzeChanges = (newData, currentData) => {
        const analysis = {
            newRecords: [],
            updatedRecords: [],
            unchangedRecords: [],
            deletedRecords: [], // For replace mode
            totalNew: 0,
            totalUpdated: 0,
            totalDeleted: 0,
            totalUnchanged: 0
        };

        if (importMode === 'replace') {
            // Replace mode - delete all existing and add all new
            analysis.deletedRecords = currentData.map(record => ({
                unit_code: record.Unit?.UnitCode || 'Unknown',
                unit_name: record.Unit?.Name || 'Unknown',
                status: record.Status || 'Unknown',
                term: record.Term?.Name || 'Unknown'
            }));
            analysis.totalDeleted = currentData.length;

            // All new data will be new records in replace mode
            analysis.newRecords = newData.map(record => ({
                unit_code: record.unit_code,
                status: record.status,
                term: record.term || 'TBD',
                action: 'CREATE'
            }));
            analysis.totalNew = newData.length;
        } else {
            // Add mode - only add records where unit_code+term does not exist
            newData.forEach(newRecord => {
                const exists = currentData.some(curr =>
                    curr.Unit?.UnitCode === newRecord.unit_code &&
                    curr.Term?.Name === newRecord.term
                );
                if (exists) {
                    analysis.unchangedRecords.push({
                        unit_code: newRecord.unit_code,
                        status: newRecord.status,
                        term: newRecord.term || 'TBD',
                        action: 'NO_CHANGE'
                    });
                    analysis.totalUnchanged++;
                } else {
                    analysis.newRecords.push({
                        unit_code: newRecord.unit_code,
                        status: newRecord.status,
                        term: newRecord.term || 'TBD',
                        action: 'CREATE'
                    });
                    analysis.totalNew++;
                }
            });
        }

        setChangesSummary(analysis);
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        setError(null);
        setStep(1); // Reset to step 1

        if (!selectedFile) {
            setFile(null);
            setParsedData([]);
            setPreviewData([]);
            return;
        }

        const fileExtension = selectedFile.name.split('.').pop().toLowerCase();

        if (!['csv', 'xlsx', 'xls'].includes(fileExtension)) {
            setError('Please upload a CSV or Excel file (.xlsx, .xls).');
            setFile(null);
            return;
        }

        setFile(selectedFile);

        if (fileExtension === 'csv') {
            parseCSV(selectedFile);
        } else {
            parseExcel(selectedFile);
        }
    };

    const parseCSV = (file) => {
        setIsLoading(true);
        setError(null);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    setError(`Error parsing CSV: ${results.errors[0].message}`);
                    setIsLoading(false);
                    return;
                }

                handleParseResults(results.data);
            },
            error: (error) => {
                setError(`Error parsing CSV: ${error.message}`);
                setIsLoading(false);
            }
        });
    };

    const parseExcel = async (file) => {
        setIsLoading(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);

                // Create workbook and load buffer
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(data);

                // Get first sheet
                const worksheet = workbook.getWorksheet(1);

                if (!worksheet) {
                    setError('Excel file does not contain any sheets.');
                    setIsLoading(false);
                    return;
                }

                // Extract headers from first row
                const headerRow = worksheet.getRow(1);
                const headers = [];
                headerRow.eachCell({ includeEmpty: false }, (cell) => {
                    headers.push(cell.value);
                });

                if (headers.length === 0) {
                    setError('Excel file must contain a header row.');
                    setIsLoading(false);
                    return;
                }

                // Extract data rows
                const rows = [];
                let rowCount = 0;
                worksheet.eachRow((row, rowNumber) => {
                    if (rowNumber === 1) return; // Skip header row

                    const rowData = {};
                    let hasContent = false;

                    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                        if (colNumber <= headers.length) {
                            rowData[headers[colNumber - 1]] = cell.value;
                            hasContent = true;
                        }
                    });

                    if (hasContent) {
                        rows.push(rowData);
                        rowCount++;
                    }
                });

                if (rowCount === 0) {
                    setError('Excel file must contain a header row and at least one data row.');
                    setIsLoading(false);
                    return;
                }

                handleParseResults(rows);
            } catch (error) {
                setError(`Error parsing Excel file: ${error.message}`);
                setIsLoading(false);
            }
        };

        reader.onerror = () => {
            setError('Error reading file');
            setIsLoading(false);
        };

        reader.readAsArrayBuffer(file);
    };

    const handleParseResults = (data) => {
        const cleanedData = data
            .map(row => {
                const cleanedRow = {};
                Object.keys(row).forEach(key => {
                    if (!key || typeof key !== 'string') return;

                    const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
                    let mappedKey = normalizedKey;

                    if (normalizedKey === 'course') {
                        mappedKey = 'unit_code';
                    } else if (normalizedKey === 'course_title') {
                        mappedKey = 'unit_name';
                    } else if (normalizedKey === 'credits') {
                        mappedKey = 'credit_points';
                    } else if (normalizedKey === 'grade') {
                        mappedKey = 'grade';
                    } else if (normalizedKey === 'term') {
                        mappedKey = 'term';
                    } else if (normalizedKey === 'status') {
                        mappedKey = 'status';
                    } else {
                        return;
                    }

                    const value = typeof row[key] === 'string' ? row[key].trim() : row[key];
                    cleanedRow[mappedKey] = value;
                });

                // TERM PARSING LOGIC 
                if (cleanedRow.term) {
                    const termInput = cleanedRow.term.toString().trim();
                    const yearMatch = termInput.match(/^(\d{4})[_\-]/);
                    if (yearMatch) {
                        cleanedRow.year = yearMatch[1];
                    } else {
                        cleanedRow.year = new Date().getFullYear().toString();
                        console.warn(`Invalid term format: ${termInput}, using current year as fallback`);
                    }
                    cleanedRow.term = termInput;
                }

                // STATUS PARSING LOGIC - ONLY KEEP COMPLETE UNITS
                const grade = (cleanedRow.grade || '').toUpperCase().trim();
                const statusFromFile = (cleanedRow.status || '').toLowerCase().trim();

                // DEBUG: Log the original values
                console.log(`Parsing status for unit ${cleanedRow.unit_code}: Status="${statusFromFile}", Grade="${grade}"`);

                // Check if this is a Complete unit
                if (statusFromFile === 'complete' || statusFromFile === 'completed') {
                    // For completed units, determine pass/fail based on grade
                    if (['P', 'C', 'D', 'HD'].includes(grade)) {
                        cleanedRow.status = 'pass';
                    } else if (['N', 'F', 'FAIL'].includes(grade)) {
                        cleanedRow.status = 'fail';
                    } else {
                        // If no clear grade, default to pass for completed units
                        cleanedRow.status = 'pass';
                    }
                } else {
                    // Mark all non-complete units for exclusion
                    cleanedRow.status = 'EXCLUDE_NON_COMPLETE';
                    console.log(`Unit ${cleanedRow.unit_code} marked for exclusion - not a complete unit`);
                }

                // DEBUG: Log the final status
                console.log(`Final status for ${cleanedRow.unit_code}: ${cleanedRow.status}`);

                // Add student ID if missing
                if (!cleanedRow.student_id && studentId) {
                    cleanedRow.student_id = studentId;
                }

                return {
                    student_id: cleanedRow.student_id || studentId || '',
                    unit_code: (cleanedRow.unit_code || '').toString().trim().toUpperCase(),
                    unit_name: cleanedRow.unit_name || '',
                    credit_points: cleanedRow.credit_points || '',
                    status: cleanedRow.status,
                    term: cleanedRow.term || '',
                    year: cleanedRow.year || ''
                };
            })
            .filter(row =>
                row.student_id &&
                row.unit_code &&
                row.term &&
                row.status !== 'EXCLUDE_NON_COMPLETE' &&
                !row.unit_code.startsWith('AIMFECS')
            ); // Filter out non-complete units and AIMFECS units

        console.log(`Filtering summary: ${data.length} raw rows → ${cleanedData.length} final rows (after removing non-complete units and AIMFECS)`);

        // Calculate academic years using FILTERED data
        const years = cleanedData
            .map(row => parseInt(row.year))
            .filter(y => !isNaN(y));

        const minYear = years.length > 0 ? Math.min(...years) : null;

        // Map to academic years (Year 1/2/3) using FILTERED data
        // BUT preserve the actual year for term creation
        const academicYearData = cleanedData.map(row => ({
            ...row,
            academicYear: minYear
                ? (parseInt(row.year) - minYear + 1).toString()
                : 'Unknown',
            actualYear: row.year // Keep the actual year for term creation
        }));

        console.log('PARSED DATA SAMPLE (after filtering):', academicYearData.slice(0, 3)); // DEBUG LOG

        setParsedData(academicYearData);
        setPreviewData(academicYearData.slice(0, 5));
        setIsLoading(false);
    };

    // Function to proceed to preview step
    const proceedToPreview = () => {
        if (!parsedData.length) {
            setError('No data to preview.');
            return;
        }
        setStep(2);
    };

    // Function to go back to step 1
    const goBackToUpload = () => {
        setStep(1);
        setChangesSummary(null);
    };

    // Add this new function to parse term name and create term if needed
    const parseAndCreateTerm = async (termName) => {
        try {
            // Parse the term name (format: YEAR_MONTH_SEMTYPE)
            const [year, month, semtype] = termName.split('_');

            if (!year || !month || !semtype) {
                console.warn(`Invalid term format: ${termName}`);
                return null;
            }

            // Convert month to number (1-12)
            const monthMap = {
                'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
                'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
            };
            const monthNum = monthMap[month.toUpperCase()];

            if (!monthNum) {
                console.warn(`Invalid month in term: ${termName}`);
                return null;
            }

            // Determine semester type
            let semesterType;
            if (semtype.toUpperCase() === 'S1' || semtype.toUpperCase() === 'S2') {
                semesterType = 'Long Semester';
            } else if (semtype.toUpperCase() === 'ST' || semtype.toUpperCase() === 'WT') {
                semesterType = 'Short Semester';
            } else {
                console.warn(`Invalid semester type in term: ${termName}`);
                return null;
            }

            // Check if term exists - use more specific search to avoid duplicates
            // const existingTerms = await TermDB.FetchTerms({
            //     name: termName,
            //     year: parseInt(year),
            //     month: monthNum,
            //     exact: true
            // });

            // if (existingTerms && existingTerms.data && existingTerms.data.length > 0) {
            //     console.log(`Term ${termName} already exists, using existing term`);
            //     const existingTerm = existingTerms.data[0];
            //     // Ensure the term object has all required fields
            //     return {
            //         ID: existingTerm.ID || existingTerm.id,
            //         Name: existingTerm.Name || existingTerm.name || termName,
            //         Year: existingTerm.Year || existingTerm.year || parseInt(year),
            //         Month: existingTerm.Month || existingTerm.month || monthNum,
            //         SemType: existingTerm.SemType || existingTerm.semtype || semesterType,
            //         Status: existingTerm.Status || existingTerm.status || 'published'
            //     };
            // }


            const existingTerm = IsTermExist(allTerms, termName, year, monthNum);
            if (existingTerm) {
                console.log(`Term ${termName} already exists, using existing term`);
                // Ensure the term object has all required fields
                return {
                    ID: existingTerm.ID || existingTerm.id,
                    Name: existingTerm.Name || existingTerm.name || termName,
                    Year: existingTerm.Year || existingTerm.year || parseInt(year),
                    Month: existingTerm.Month || existingTerm.month || monthNum,
                    SemType: existingTerm.SemType || existingTerm.semtype || semesterType,
                    Status: existingTerm.Status || existingTerm.status || 'published'
                };
            }


            // Create new term
            const newTerm = {
                name: termName,
                year: parseInt(year),
                month: monthNum,
                semtype: semesterType,
                status: 'published'
            };

            console.log(`Creating new term: ${termName}`);
            const result = await TermDB.AddTerm(newTerm);
            if (result.success && result.term) {
                console.log(`Successfully created term: ${termName}`);
                // Ensure the created term object has all required fields with fallbacks
                return {
                    ID: result.term.ID || result.term.id,
                    Name: result.term.Name || result.term.name || termName,
                    Year: result.term.Year || result.term.year || parseInt(year),
                    Month: result.term.Month || result.term.month || monthNum,
                    SemType: result.term.SemType || result.term.semtype || semesterType,
                    Status: result.term.Status || result.term.status || 'published'
                };
            }

            console.warn(`Failed to create term: ${termName}`);
            return null;
        } catch (error) {
            console.error('Error parsing/creating term:', error);
            return null;
        }
    };

    // Modify the handleConfirmImport function
    const handleConfirmImport = async () => {
        if (!parsedData.length) {
            setError('No data to import.');
            return;
        }

        setIsImporting(true);
        try {
            // Create a cache for terms to avoid duplicates
            const termCache = new Map();

            // First, create all unique terms to ensure they exist before processing units
            const uniqueTerms = [...new Set(parsedData.map(record => record.term).filter(Boolean))];
            console.log(`Creating ${uniqueTerms.length} unique terms first...`);

            for (const termName of uniqueTerms) {
                if (!termCache.has(termName)) {
                    const term = await parseAndCreateTerm(termName);
                    if (term && (term.ID || term.id)) {
                        termCache.set(termName, term);
                        console.log(`Pre-created term: ${termName}`);
                    } else {
                        console.error(`Failed to pre-create term: ${termName}`);
                    }
                }
            }

            //Store all the codes here
            const newly_added_units_hash = new Set();

            // Now process units with all terms already created
            const importedUnits = await Promise.all(parsedData.map(async (record) => {
                console.log('processing this record', record)
                let unitName = record.unit_name || record.unit_code;
                let creditPoints = record.credit_points || null;
                let unitID = -1;
                let unitFound = false;

                const unitHash = `${record.unit_code.toLowerCase().trim().replace(/\s+/g, '')}_${unitName.toLowerCase().trim().replace(/\s+/g, '')}`;
                try {
                    const unitRes = await UnitDB.FetchUnits({
                        code: record.unit_code,
                        availability: "published",
                        return: ['ID', 'UnitCode', 'Name', 'CreditPoints'],
                        exact: true
                    });
                    if (unitRes && unitRes.data && unitRes.data.length > 0) {
                        unitID = unitRes.data[0]._id
                        unitName = unitRes.data[0].name || unitName;
                        creditPoints = unitRes.data[0].credit_points || creditPoints;
                        unitFound = true;
                    }
                } catch (err) {
                    console.warn('Could not fetch unit details for', record.unit_code, err);
                }

                // If not found, auto-add the unit
                if (!unitFound && !newly_added_units_hash.has(unitHash)) {
                    newly_added_units_hash.add(unitHash);
                    try {
                        // Force CP to 0 for MPU units, use CSV value for others
                        const isMPU = record.unit_code.toUpperCase().startsWith('MPU');
                        const finalCP = isMPU ? 0 : (parseFloat(creditPoints) || 0);

                        const unit_obj = {
                            unit: {
                                code: record.unit_code,
                                name: unitName,
                                cp: finalCP,
                                availability: 'published',
                                offered_terms: ["Semester 1", "Semester 2", "Summer", "Winter"]
                            }
                        }
                        const addRes = await UnitDB.AddUnit(unit_obj);
                        console.log('addRes', addRes)
                        if (addRes && addRes.success && addRes.unit) {
                            unitID = addRes.unit.ID;
                            unitName = addRes.unit.Name || unitName;
                            creditPoints = addRes.unit.CreditPoints || creditPoints;
                        }
                    } catch (err) {
                        console.warn('Could not auto-add unit', record.unit_code, err);
                    }
                }

                // Get term from pre-created cache
                let term = null;
                if (record.term && termCache.has(record.term)) {
                    term = termCache.get(record.term);
                } else if (record.term) {
                    console.warn(`Term ${record.term} not found in cache, this should not happen`);
                }

                // Ensure we have valid data before returning
                const actualYear = record.actualYear || record.year;
                const academicYear = record.academicYear;

                // Debug logging for first import issues
                if (!term) {
                    console.warn(`No term assigned for unit ${record.unit_code} with term ${record.term}`);
                }

                console.log('unitID', unitID)
                return {
                    id: `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    unit: {
                        UnitID: unitID,
                        UnitCode: record.unit_code,
                        Name: unitName,
                        CreditPoints: creditPoints
                    },
                    status: record.status,
                    term: term,
                    termName: record.term,
                    Year: actualYear, // Use actual year for term assignment
                    year: actualYear, // Use actual year for term assignment
                    academicYear: academicYear, // Keep academic year for display
                    isImported: true
                };
            }));

            // Pass the staged data to parent component
            if (onDataStaged) {
                onDataStaged(importedUnits, importMode);
            }

            // Close the uploader first to avoid modal conflicts
            onClose();

            // Show success message after a brief delay
            setTimeout(async () => {
                await window.Swal.fire({
                    title: 'Import Staged Successfully!',
                    text: `Successfully staged ${changesSummary?.totalNew || importedUnits.length} unit records for import. Click "Save Unit History" to persist the changes.`,
                    icon: 'success',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#10b981',
                    backdrop: true,
                    allowOutsideClick: false
                });
            }, 100);

        } catch (error) {
            console.error('Error staging import data:', error);
            setError(`Failed to stage import data: ${error.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const resetForm = () => {
        setFile(null);
        setParsedData([]);
        setPreviewData([]);
        setError(null);
        setStep(1);
        setChangesSummary(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Render changes summary
    const renderChangesSummary = () => {
        if (!changesSummary) return null;

        return (
            <div className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {changesSummary.totalNew > 0 && (
                        <div className="bg-green-50  border border-green-200  rounded-lg p-3">
                            <div className="text-green-800 font-semibold">{changesSummary.totalNew}</div>
                            <div className="text-green-600 text-sm">New Records</div>
                        </div>
                    )}
                    {changesSummary.totalUpdated > 0 && (
                        <div className="bg-blue-50  border border-blue-200 rounded-lg p-3">
                            <div className="text-blue-800 font-semibold">{changesSummary.totalUpdated}</div>
                            <div className="text-blue-600 text-sm">Updated Records</div>
                        </div>
                    )}
                    {changesSummary.totalDeleted > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="text-red-800 font-semibold">{changesSummary.totalDeleted}</div>
                            <div className="text-red-600 text-sm">Deleted Records</div>
                        </div>
                    )}
                    {changesSummary.totalUnchanged > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <div className="text-gray-800 font-semibold">{changesSummary.totalUnchanged}</div>
                            <div className="text-gray-600 text-sm">Unchanged</div>
                        </div>
                    )}
                </div>

                {/* Detailed Changes */}
                <div className="space-y-4 max-h-64 overflow-y-auto">
                    {/* New Records */}
                    {changesSummary.newRecords.length > 0 && (
                        <div>
                            <h4 className="font-medium text-green-800 mb-2">
                                New Records ({changesSummary.newRecords.length})
                            </h4>
                            <div className="bg-green-50 border border-green-200 rounded p-3">
                                {changesSummary.newRecords.slice(0, 5).map((record, index) => (
                                    <div key={index} className="text-sm text-green-700 mb-1">
                                        <span className="font-medium">{record.unit_code}</span> - {record.status} ({record.term})
                                    </div>
                                ))}
                                {changesSummary.newRecords.length > 5 && (
                                    <div className="text-sm text-green-600 mt-2">
                                        ...and {changesSummary.newRecords.length - 5} more
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Updated Records */}
                    {changesSummary.updatedRecords.length > 0 && (
                        <div>
                            <h4 className="font-medium text-blue-800  mb-2">
                                Updated Records ({changesSummary.updatedRecords.length})
                            </h4>
                            <div className="bg-blue-50  border border-blue-200  rounded p-3">
                                {changesSummary.updatedRecords.slice(0, 5).map((record, index) => (
                                    <div key={index} className="text-sm text-blue-700  mb-2">
                                        <div className="font-medium">{record.unit_code}</div>
                                        <div className="ml-2 text-xs">
                                            {record.changes.status && (
                                                <div>Status: {record.currentStatus} → {record.status}</div>
                                            )}
                                            {record.changes.term && (
                                                <div>Term: {record.currentTerm} → {record.term}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {changesSummary.updatedRecords.length > 5 && (
                                    <div className="text-sm text-blue-600  mt-2">
                                        ...and {changesSummary.updatedRecords.length - 5} more
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Deleted Records (Replace Mode) */}
                    {changesSummary.deletedRecords.length > 0 && (
                        <div>
                            <h4 className="font-medium text-red-800  mb-2">
                                Records to be Deleted ({changesSummary.deletedRecords.length})
                            </h4>
                            <div className="bg-red-50  border border-red-200  rounded p-3">
                                {changesSummary.deletedRecords.slice(0, 5).map((record, index) => (
                                    <div key={index} className="text-sm text-red-700  mb-1">
                                        <span className="font-medium">{record.unit_code}</span> - {record.status} ({record.term})
                                    </div>
                                ))}
                                {changesSummary.deletedRecords.length > 5 && (
                                    <div className="text-sm text-red-600  mt-2">
                                        ...and {changesSummary.deletedRecords.length - 5} more
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="unit-history-modal-wrapper" onClick={handleBackdropClick}>
            <div className="Import-unit-History-box" ref={modalRef}>
                {/* Step Indicator */}
                <div className="flex items-center mb-6">
                    <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 1 ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                            }`}>
                            {step === 1 ? '1' : '✓'}
                        </div>
                        <span className="ml-2 text-sm font-medium text-muted">Upload File</span>
                    </div>
                    <div className="flex-1 mx-4 h-px border-divider"></div>
                    <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-300  text-gray-500'
                            }`}>
                            2
                        </div>
                        <span className="ml-2 text-sm font-medium text-muted">Preview Changes</span>
                    </div>
                </div>

                {step === 1 && (
                    <>
                        <h2 className="text-xl font-semibold mb-4 heading-text">Import Unit History Data</h2>

                        <div className="mb-4">
                            <label className="label-text block text-sm font-medium mb-2">
                                Select File (CSV or Excel):
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={handleFileChange}
                                    className="input-field flex-1 p-2 border rounded-md"
                                    ref={fileInputRef}
                                    disabled={isLoading}
                                />
                            </div>
                            <p className="text-xs text-muted mt-1">
                                Expected columns: Course (unit code), Status (Complete/Current/Future/etc), Grade (P/C/D/HD/N/F), Term (2024_SEP_S2 format)
                            </p>
                            <p className="text-xs text-orange-600  mt-1">
                                Units with "AIMFECS" codes and "Future" status will be automatically excluded from import.
                            </p>
                            <p className="text-xs text-blue-600  mt-1">
                                Status mapping: Complete→pass/fail (by grade), Current→current (unchanged), Incomplete→current, Future→excluded
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="label-text block text-sm font-medium mb-2">
                                Import Mode:
                            </label>
                            <div className="flex space-x-4">
                                <label className="inline-flex items-center">
                                    <input
                                        type="radio"
                                        name="importMode"
                                        value="replace"
                                        checked={importMode === 'replace'}
                                        onChange={() => setImportMode('replace')}
                                        className="form-radio h-4 w-4 text-blue-600"
                                    />
                                    <span className="ml-2 text-primary">First Time Import</span>
                                </label>
                                <label className="inline-flex items-center">
                                    <input
                                        type="radio"
                                        name="importMode"
                                        value="add"
                                        checked={importMode === 'add'}
                                        onChange={() => setImportMode('add')}
                                        className="form-radio h-4 w-4 text-blue-600"
                                    />
                                    <span className="ml-2 text-primary">Update Import</span>
                                </label>
                            </div>
                            <p className="text-xs text-muted mt-1">
                                {importMode === 'add'
                                    ? 'New records will be added, Make sure there are previous Unit History before using this mode. Changes will only be saved when you click "Save Unit History".'
                                    : studentId
                                        ? `Warning: This will stage replacement of all existing unit history for student ${studentId}. Changes will only be saved when you click "Save Unit History".`
                                        : 'Warning: This will stage replacement of existing unit history data. Changes will only be saved when you click "Save Unit History".'}
                            </p>
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-red-100  border border-red-400  text-red-700  rounded overflow-auto max-h-32">
                                <pre className="whitespace-pre-wrap text-sm">{error}</pre>
                            </div>
                        )}

                        {previewData.length > 0 && (
                            <div className="mb-4">
                                <h3 className="font-medium text-sm mb-2 heading-text">File Preview (First 5 Rows):</h3>
                                <div className="overflow-x-auto max-h-64 border border-divider rounded">
                                    <table className="table-base min-w-full divide-y">
                                        <thead className="table-header">
                                            <tr>
                                                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted uppercase tracking-wider">Student ID</th>
                                                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted uppercase tracking-wider">Unit Code</th>
                                                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted uppercase tracking-wider">Status</th>
                                                <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted uppercase tracking-wider">Term (Year Extracted)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="table-body-divided">
                                            {previewData.map((row, index) => (
                                                <tr key={index} className="table-row-hover">
                                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-primary">{row.student_id}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-primary">{row.unit_code}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-primary">
                                                        <span className={`px-2 py-1 rounded-full text-xs ${row.status === 'pass' ? 'bg-green-100 text-green-800 ' :
                                                            row.status === 'fail' ? 'bg-red-100  text-red-800 ' :
                                                                row.status === 'current' ? 'bg-blue-100  text-blue-800 ' :
                                                                    'bg-yellow-100  text-yellow-800 '
                                                            }`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-primary">{row.term || 'N/A'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-muted mt-1">
                                    Total rows: {parsedData.length} (AIMFECS and Future units filtered out)
                                </p>
                            </div>
                        )}

                        <div className="flex justify-end space-x-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="btn-cancel px-4 py-2 rounded-md"
                                disabled={isLoading}
                            >
                                Cancel
                            </button>

                            {file && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-4 py-2 bg-yellow-500  text-white rounded-md hover:bg-yellow-600 "
                                    disabled={isLoading}
                                >
                                    Reset
                                </button>
                            )}

                            {parsedData.length > 0 && (
                                <button
                                    type="button"
                                    onClick={proceedToPreview}
                                    className="px-4 py-2 bg-blue-600  hover:bg-blue-700  text-white rounded-md"
                                    disabled={isLoading}
                                >
                                    Next: Preview Changes
                                </button>
                            )}
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <h2 className="text-xl font-semibold mb-4 heading-text">Preview Changes</h2>

                        {loadingPreview ? (
                            <div className="flex justify-center items-center p-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 "></div>
                                <span className="ml-2 text-muted">Analyzing changes...</span>
                            </div>
                        ) : (
                            <>
                                <div className="mb-4 p-4 bg-blue-50 border-blue-200 rounded-lg">
                                    <h3 className="font-medium text-blue-900 mb-2">
                                        {importMode === 'replace' ? 'First Time Import Mode Summary' : 'Update Import Mode Summary'}
                                    </h3>
                                    <p className="text-sm text-blue-800 ">
                                        {importMode === 'replace'
                                            ? `This will stage deletion of ${changesSummary?.totalDeleted || 0} existing records and creation of ${changesSummary?.totalNew || 0} new records.`
                                            : `This will stage creation of ${changesSummary?.totalNew || 0} new records, update of ${changesSummary?.totalUpdated || 0} existing records, and leave ${changesSummary?.totalUnchanged || 0} records unchanged.`
                                        }
                                    </p>
                                    {/* NEW MESSAGE ABOUT STAGING */}
                                    <p className="text-sm text-blue-800  mt-2 font-medium">
                                        Changes will be staged only. Click "Save Unit History" in the main form to persist changes to database.
                                    </p>
                                </div>

                                {changesSummary && renderChangesSummary()}

                                {importMode === 'replace' && changesSummary?.totalDeleted > 0 && (
                                    <div className="mb-4 p-3 bg-red-100 border border-red-400  text-red-800 rounded">
                                        <p className="font-bold">!!! Warning: First Time Import Mode</p>
                                        <p className="text-sm">
                                            All {changesSummary.totalDeleted} existing unit history records for this student will be staged for deletion.
                                            Changes will only be applied when you click "Save Unit History" in the main form.
                                        </p>
                                    </div>
                                )}

                                {importMode === 'add' && changesSummary?.totalNew === 0 && (
                                    <div className="text-red-600 font-medium mt-2">
                                        No new records to import. Please upload a file with new unit history records.
                                    </div>
                                )}

                                <div className="flex justify-between space-x-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={goBackToUpload}
                                        className="btn-cancel px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={isImporting}
                                    >
                                        ← Back to Upload
                                    </button>

                                    <div className="flex space-x-3">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            className="btn-cancel px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={isImporting}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConfirmImport}
                                            className={`px-4 py-2 text-white rounded-md flex items-center gap-2
                                                ${(isImporting || (importMode === 'add' && changesSummary?.totalNew === 0))
                                                    ? 'bg-gray-400cursor-not-allowed'
                                                    : importMode === 'replace'
                                                        ? 'bg-orange-600  hover:bg-orange-700 '
                                                        : 'bg-green-600  hover:bg-green-700'
                                                }`}
                                            disabled={isImporting || (importMode === 'add' && changesSummary?.totalNew === 0)}
                                        >
                                            {isImporting && (
                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                            )}
                                            {isImporting ? 'Staging Import...' :
                                                importMode === 'replace'
                                                    ? `Stage Replace (${parsedData.length} Records)`
                                                    : `Stage Import (${changesSummary?.totalNew || 0} Records)`}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default StudentUnitHistoryUploader;

//CHECK HERE LATER
function IsTermExist(allTerms, termName, year, monthNum) {
    return allTerms.find(term =>
        term._name === termName &&
        term._year === parseInt(year) &&
        term._month === parseInt(monthNum)
    ) || null;
}