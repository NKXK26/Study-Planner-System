import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const UnitFileUploader = ({ onUploadSuccess, onClose }) => {
    const { theme } = useLightDarkMode();
    const [file, setFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [importMode, setImportMode] = useState('add'); // 'add' or 'replace'
    const [includeRequisites, setIncludeRequisites] = useState(true); // Option to include requisites
    const fileInputRef = useRef(null);
    const modalRef = useRef(null);

    // Add click outside handler
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if click is on the confirmation dialog
            const confirmDialog = document.querySelector('.swal2-container');
            if (confirmDialog && confirmDialog.contains(event.target)) {
                return;
            }

            if (modalRef.current && !modalRef.current.contains(event.target)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        setError(null);

        if (!selectedFile) {
            setFile(null);
            setParsedData([]);
            setPreviewData([]);
            return;
        }

        // Check file size (max 10MB)
        const maxSizeMB = 10;
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        if (selectedFile.size > maxSizeBytes) {
            setError(`File size exceeds maximum limit of ${maxSizeMB}MB. Your file is ${(selectedFile.size / 1024 / 1024).toFixed(2)}MB.`);
            setFile(null);
            return;
        }

        // Check file type
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
        // Clean and normalize data
        const cleanedData = data
            .map(row => {
                // Create a new object with trimmed keys and values
                const cleanedRow = {};
                Object.keys(row).forEach(key => {
                    // Skip empty keys
                    if (!key || typeof key !== 'string') return;

                    // Normalize the key name (lowercase, strip spaces)
                    const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_');

                    // Handle common variations of field names
                    let mappedKey = normalizedKey;
                    if (normalizedKey === 'code' || normalizedKey === 'unit_code') {
                        mappedKey = 'code';
                    } else if (normalizedKey === 'name' || normalizedKey === 'unit_name') {
                        mappedKey = 'name';
                    } else if (normalizedKey === 'cp' || normalizedKey === 'credit_points' || normalizedKey === 'credits') {
                        mappedKey = 'cp';
                    } else if (normalizedKey === 'availability' || normalizedKey === 'status') {
                        mappedKey = 'availability';
                    } else if (normalizedKey === 'offered_terms' || normalizedKey === 'terms' || normalizedKey === 'offered_in') {
                        mappedKey = 'offered_terms';
                    } else if (normalizedKey === 'pre_requisites' || normalizedKey === 'prerequisites') {
                        mappedKey = 'pre_requisites';
                    } else if (normalizedKey === 'co_requisites' || normalizedKey === 'corequisites') {
                        mappedKey = 'co_requisites';
                    } else if (normalizedKey === 'anti_requisites' || normalizedKey === 'antirequisites') {
                        mappedKey = 'anti_requisites';
                    } else if (normalizedKey === 'min_cp' || normalizedKey === 'minimum_cp') {
                        mappedKey = 'min_cp';
                    }

                    // Trim string values and handle null/undefined
                    const value = typeof row[key] === 'string' ? row[key].trim() : row[key];
                    cleanedRow[mappedKey] = value;
                });

                // Normalize offered_terms if it's a comma-separated string
                if (typeof cleanedRow.offered_terms === 'string') {
                    cleanedRow.offered_terms = cleanedRow.offered_terms
                        .split(',')
                        .map(term => term.trim())
                        .filter(term => term);
                }

                // Format the terms if they exist
                if (cleanedRow.offered_terms && Array.isArray(cleanedRow.offered_terms)) {
                    // Normalize term values to match valid options
                    cleanedRow.offered_terms = cleanedRow.offered_terms.map(term => {
                        const termStr = term.toString().toLowerCase();

                        if (termStr.includes('sem') && termStr.includes('1')) return 'Semester 1';
                        if (termStr.includes('sem') && termStr.includes('2')) return 'Semester 2';
                        if (termStr.includes('sum')) return 'Summer';
                        if (termStr.includes('win')) return 'Winter';

                        // Keep original if no match
                        return term;
                    }).filter(term => {
                        // Filter to only valid terms
                        const validTerms = ['Semester 1', 'Semester 2', 'Summer', 'Winter'];
                        return validTerms.includes(term);
                    });
                } else {
                    cleanedRow.offered_terms = [];
                }

                // Normalize availability
                if (cleanedRow.availability) {
                    const availabilityStr = cleanedRow.availability.toString().toLowerCase();
                    if (availabilityStr.includes('pub')) {
                        cleanedRow.availability = 'published';
                    } else if (availabilityStr.includes('unpub')) {
                        cleanedRow.availability = 'unpublished';
                    } else if (availabilityStr.includes('unavail')) {
                        cleanedRow.availability = 'unavailable';
                    } else {
                        cleanedRow.availability = 'unavailable'; // Default
                    }
                } else {
                    cleanedRow.availability = 'unavailable'; // Default
                }

                // Process requisites if they exist
                const processRequisites = (requisiteStr) => {
                    if (!requisiteStr) return [];

                    if (typeof requisiteStr === 'string') {
                        return requisiteStr
                            .split(',')
                            .map(code => code.trim())
                            .filter(code => code);
                    }

                    return [];
                };

                // Normalize requisites
                cleanedRow.pre_requisites = processRequisites(cleanedRow.pre_requisites);
                cleanedRow.co_requisites = processRequisites(cleanedRow.co_requisites);
                cleanedRow.anti_requisites = processRequisites(cleanedRow.anti_requisites);

                // Normalize min_cp
                cleanedRow.min_cp = parseFloat(cleanedRow.min_cp) || null;

                // Ensure the required fields are present
                // Force CP to 0 for MPU units, use value or default 12.5 for others
                const unitCode = cleanedRow.code || '';
                const isMPU = unitCode.toUpperCase().startsWith('MPU');

                let cp;
                if (isMPU) {
                    // Always set 0 for MPU units, ignore CSV value
                    cp = 0;
                } else {
                    // For non-MPU units, use provided value or default to 12.5
                    cp = cleanedRow.cp !== null && cleanedRow.cp !== undefined && cleanedRow.cp !== '' ? cleanedRow.cp : 12.5;
                }

                return {
                    code: unitCode,
                    name: cleanedRow.name || '',
                    cp: cp,
                    availability: cleanedRow.availability || 'unavailable',
                    offered_terms: cleanedRow.offered_terms || [],
                    pre_requisites: cleanedRow.pre_requisites || [],
                    co_requisites: cleanedRow.co_requisites || [],
                    anti_requisites: cleanedRow.anti_requisites || [],
                    min_cp: cleanedRow.min_cp
                };
            })
            // Filter out rows with empty required fields
            .filter(row => row.code && row.name);

        setParsedData(cleanedData);
        // Create preview data (first 5 rows)
        setPreviewData(cleanedData.slice(0, 5));
        setIsLoading(false);
    };

    // Function to chunk array into smaller pieces
    const chunkArray = (array, chunkSize) => {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    };

    // Upload data in chunks to prevent timeouts
    const uploadDataInChunks = async (data, chunkSize = 50) => {
        setIsLoading(true);
        setError(null);

        try {
            // Split data into chunks
            const chunks = chunkArray(data, chunkSize);
            let successfulUnits = 0;
            let failedUnits = 0;
            const errorsList = [];
            let requisitesAdded = 0;

            // Handle replace mode in the first chunk only
            const firstChunkMode = importMode;

            // Process each chunk
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];

                // Only the first chunk should be in replace mode if selected
                const chunkMode = i === 0 ? firstChunkMode : 'add';

                // Only include requisites in the last chunk
                const chunkIncludeRequisites = i === chunks.length - 1 ? includeRequisites : false;

                // Send chunk to API
                const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit/unit-upload`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        units: chunk,
                        mode: chunkMode,
                        includeRequisites: chunkIncludeRequisites
                    }),
                });

                // Parse response
                const responseText = await response.text();
                let result;

                try {
                    result = JSON.parse(responseText);
                } catch (error) {
                    console.error('Error parsing response:', error);
                    throw new Error('Invalid response from server');
                }

                if (!response.ok) {
                    throw new Error(result.message || 'Upload failed');
                }

                // Update counts
                successfulUnits += result.successful || 0;
                failedUnits += result.failed || 0;
                requisitesAdded += result.requisitesAdded || 0;

                // Collect errors
                if (result.errors && result.errors.length > 0) {
                    errorsList.push(...result.errors);
                }

            }

            // Prepare final result message
            let resultMessage = '';

            if (failedUnits > 0) {
                resultMessage = successfulUnits > 0
                    ? `Successfully processed ${successfulUnits} of ${data.length} units with ${failedUnits} errors.`
                    : `Failed to process any units. Found ${failedUnits} errors.`;
            } else {
                resultMessage = `Successfully processed all ${data.length} units.`;
            }

            if (includeRequisites) {
                resultMessage += ` Added ${requisitesAdded} requisite relationships.`;
            }

            // Show errors if any
            if (errorsList.length > 0) {
                let errorMessage = resultMessage + '\n\nErrors:\n';

                // Show the first 5 errors
                const errorsToShow = errorsList.slice(0, 5);
                errorMessage += errorsToShow.map(err =>
                    `Unit ${err.code}: ${err.errors.join(', ')}`
                ).join('\n');

                // Indicate if there are more errors
                if (errorsList.length > 5) {
                    errorMessage += `\n...and ${errorsList.length - 5} more errors.`;
                }

                setError(errorMessage);
            } else {
                // Complete success
                window.Swal.fire({
                    title: 'Success',
                    text: resultMessage,
                    icon: 'success',
                    confirmButtonText: 'OK'
                });
                onUploadSuccess(); // Refresh the course list
                onClose(); // Close the uploader
            }

            return {
                success: successfulUnits > 0,
                successful: successfulUnits,
                failed: failedUnits,
                requisitesAdded
            };
        } catch (error) {
            setError(`Upload failed: ${error.message}`);
            return { success: false };
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpload = async () => {
        if (!parsedData.length) {
            setError('No data to upload.');
            return;
        }

        // Use new chunked upload function
        await uploadDataInChunks(parsedData);
    };

    const resetForm = () => {
        setFile(null);
        setParsedData([]);
        setPreviewData([]);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const downloadTemplate = async () => {
        // Create template with headers only (no sample data)
        const templateHeaders = [
            'code',
            'name',
            'cp',
            'availability',
            'offered_terms',
            'pre_requisites',
            'co_requisites',
            'anti_requisites',
            'min_cp'
        ];

        // Determine which format to download
        const format = document.getElementById('unit-template-format')?.value || 'csv';

        if (format === 'csv') {
            // Create CSV with headers only using simple string concatenation
            const csvContent = templateHeaders.join(',') + '\n';

            // Create blob and download link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'units_import_template.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            // Create Excel file with headers only using ExcelJS
            try {
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Units Template');

                // Add headers
                worksheet.addRow(templateHeaders);

                // Set column widths for better readability
                worksheet.columns = [
                    { width: 12 }, // code
                    { width: 25 }, // name
                    { width: 8 },  // cp
                    { width: 15 }, // availability
                    { width: 20 }, // offered_terms
                    { width: 15 }, // pre_requisites
                    { width: 15 }, // co_requisites
                    { width: 15 }, // anti_requisites
                    { width: 10 }  // min_cp
                ];

                // Write to blob and download
                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'units_import_template.xlsx');
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error creating Excel file:', error);
                // FALLBACK: Create CSV if Excel fails
                const csvContent = templateHeaders.join(',') + '\n';
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', 'units_import_template.csv');
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        }
    };

    // Format requisites for display in preview
    const formatRequisiteList = (requisites) => {
        if (!requisites || requisites.length === 0) return 'None';
        return requisites.join(', ');
    };
    return (
        <div className={`fileUploaderModalClick`}>
            <div ref={modalRef} className={`fileUploaderShow`}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className={`importTitle`}>Import Unit Data</h2>
                    <button onClick={onClose} className={`fileUploadClose`}>
                        <svg width="24" height="24" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className={`downloadTemplateBox`}>
                    <h3 className={`downloadTemplateWord`}>Download Template</h3>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center">
                            <label htmlFor="unit-template-format" className={`importFormat`}>Format:</label>
                            <select
                                id="unit-template-format"
                                className={`importOptionDesc`}
                                defaultValue="csv"
                            >
                                <option value="csv">CSV</option>
                                <option value="xlsx">Excel</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={downloadTemplate}
                            className="downloadTemplateBttn"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Download Template
                        </button>
                    </div>
                    <p className={`importInstruction`}>
                        Download an empty template with the correct column headers: <strong>code</strong>, <strong>name</strong>, <strong>cp</strong>, <strong>availability</strong>, <strong>offered_terms</strong>, <strong>pre_requisites</strong>, <strong>co_requisites</strong>, <strong>anti_requisites</strong>, <strong>min_cp</strong>
                    </p>
                    <p className={`importGuide`}>
                        • <strong>offered_terms</strong>: Comma-separated list (e.g., "Semester 1, Semester 2")<br />
                        • <strong>availability</strong>: "Published", "Unpublished", or "Unavailable"<br />
                        • <strong>requisites</strong>: Comma-separated unit codes (e.g., "COS10009, COS10026")<br />
                        • <strong>cp</strong>: Credit points as a number (e.g., 12.5)<br />
                        • <strong>min_cp</strong>: Minimum credit points (optional)
                    </p>
                </div>
                <div className="mb-4">
                    <label className={`importText`}>
                        Select File (CSV or Excel):
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileChange}
                            className={`importFileHolder`}
                            ref={fileInputRef}
                            disabled={isLoading}
                        />
                    </div>
                    <p className={`importRequirement`}>
                        File should contain columns for: code, name, cp, availability, offered_terms
                    </p>
                    <p className={`importOptional`}>
                        Optional columns: pre_requisites, co_requisites, anti_requisites, min_cp
                    </p>
                </div>

                {/* Import Options */}
                <div className="mb-4">
                    <label className={`importText`}>
                        Import Options:
                    </label>
                    <div className="flex space-x-4 mb-2">
                        <label className={`importOptions`}>
                            <input
                                type="radio"
                                name="importMode"
                                value="add"
                                checked={importMode === 'add'}
                                onChange={() => setImportMode('add')}
                                className="form-radio h-4 w-4 text-blue-600"
                            />
                            <span className="ml-2">Add to existing data</span>
                        </label>
                        <label className={`inline-flex items-center ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                            <input
                                type="radio"
                                name="importMode"
                                value="replace"
                                checked={importMode === 'replace'}
                                onChange={() => setImportMode('replace')}
                                className="form-radio h-4 w-4 text-blue-600"
                            />
                            <span className="ml-2">Replace existing data</span>
                        </label>
                    </div>
                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="includeRequisites"
                            checked={includeRequisites}
                            onChange={(e) => setIncludeRequisites(e.target.checked)}
                            className="form-checkbox h-4 w-4 text-blue-600"
                        />
                        <label htmlFor="includeRequisites" className={`ml-2 text-sm ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                            Process requisite relationships
                        </label>
                    </div>
                    {/* <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}> */}
                    <p className='importGuide'>
                        {importMode === 'add'
                            ? 'New units will be added, existing units will be updated based on unit code.'
                            : 'Warning: This will delete all existing units and replace them with the imported data.'}
                    </p>
                    <p className={`importGuide`}>
                        {includeRequisites
                            ? 'Requisites will be processed after all units are imported. Units must exist before requisites can be linked.'
                            : 'Requisite relationships will be ignored during import.'}
                    </p>
                </div>

                {error && (
                    <div className={`mb-4 p-3 border rounded overflow-auto max-h-32 ${theme === 'dark' ? 'bg-red-900/30 border-red-800 text-red-200' : 'bg-red-100 border-red-400 text-red-700'}`}>
                        <pre className="whitespace-pre-wrap text-sm">{error}</pre>
                    </div>
                )}

                {previewData.length > 0 && (
                    <div className="mb-4">
                        <h3 className={`importPreview`}>Preview (First 5 Rows):</h3>
                        <div className={`overflow-x-auto max-h-64 border rounded ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}>
                            <table className={`min-w-full divide-y ${theme === 'dark' ? 'divide-gray-600' : 'divide-gray-200'}`}>
                                <thead className={theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'}>
                                    <tr>
                                        <th scope="col" className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>Code</th>
                                        <th scope="col" className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>Name</th>
                                        <th scope="col" className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>CP</th>
                                        <th scope="col" className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>Status</th>
                                        <th scope="col" className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>Terms</th>
                                        <th scope="col" className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>Pre-req</th>
                                        <th scope="col" className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>Co-req</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${theme === 'dark' ? 'bg-gray-800 divide-gray-600' : 'bg-white divide-gray-200'}`}>
                                    {previewData.map((row, index) => (
                                        <tr key={index}>
                                            <td className={`px-3 py-2 whitespace-nowrap text-sm ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{row.code}</td>
                                            <td className={`px-3 py-2 whitespace-nowrap text-sm ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{row.name}</td>
                                            <td className={`px-3 py-2 whitespace-nowrap text-sm ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{row.cp}</td>
                                            <td className={`px-3 py-2 whitespace-nowrap text-sm ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{row.availability}</td>
                                            <td className={`px-3 py-2 whitespace-nowrap text-sm ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{row.offered_terms}</td>
                                            <td className={`px-3 py-2 whitespace-nowrap text-sm ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{formatRequisiteList(row.pre_requisites)}</td>
                                            <td className={`px-3 py-2 whitespace-nowrap text-sm ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{formatRequisiteList(row.co_requisites)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            Total rows: {parsedData.length} {parsedData.length > 100 ? '(will be uploaded in chunks)' : ''}
                        </p>
                    </div>
                )}

                {importMode === 'replace' && parsedData.length > 0 && (
                    <div className={`mb-4 p-3 border rounded ${theme === 'dark' ? 'bg-yellow-900/30 border-yellow-800 text-yellow-200' : 'bg-yellow-100 border-yellow-400 text-yellow-800'}`}>
                        <p className="font-bold">!! Warning: Replace Mode Selected !!</p>
                        <p className="text-sm">
                            This will delete all existing units and replace them with the {parsedData.length} units in this file.
                            This action cannot be undone.
                        </p>
                    </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className={`px-4 py-2 rounded-md ${theme === 'dark' ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'}`}
                        disabled={isLoading}
                    >
                        Cancel
                    </button>

                    {file && (
                        <button
                            type="button"
                            onClick={resetForm}
                            className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600"
                            disabled={isLoading}
                        >
                            Reset
                        </button>
                    )}

                    {parsedData.length > 0 && (
                        <button
                            type="button"
                            onClick={handleUpload}
                            className={`px-4 py-2 text-white rounded-md ${importMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                            disabled={isLoading}
                        >
                            Import
                        </button>
                    )}
                </div>
            </div>
        </div>

    );
};

export default UnitFileUploader;