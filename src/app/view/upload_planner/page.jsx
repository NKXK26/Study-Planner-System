'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import UnitDB from '@app/class/Unit/UnitDB';

const UploadPlannerPage = () => {
    const [plannerName, setPlannerName] = useState('');
    const [lastAutoPlannerName, setLastAutoPlannerName] = useState('');
    const [pdfFile, setPdfFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [extractedText, setExtractedText] = useState('');
    const [units, setUnits] = useState([]);
    const [matchedUnits, setMatchedUnits] = useState([]);
    const [selectedUnitTypes, setSelectedUnitTypes] = useState({});
    const [missingCodes, setMissingCodes] = useState([]);
    const [unitTypeOptions, setUnitTypeOptions] = useState([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isMatching, setIsMatching] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isAutoPopulating, setIsAutoPopulating] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    // Debug modal states
    const [showDebugModal, setShowDebugModal] = useState(false);
    const [debugData, setDebugData] = useState([]);
    const [debugLoading, setDebugLoading] = useState(false);

    // Colour → unit type ID mapping
    const COLOR_TO_TYPE_ID = {
        '#c5d9f0': 2,   // Core
        '#fce9d9': 3,   // Major
        '#d5e2bb': 1,   // Elective
        '#b1a0c6': 17,  // WIL (Work-Integrated Learning)
    };

    const FALLBACK_UNIT_TYPES = [
        { id: 2, name: 'Core' },
        { id: 1, name: 'Elective' },
        { id: 3, name: 'Major' },
        { id: 4, name: 'MPU' },
        { id: 17, name: 'WIL' },
    ];

    const normalizeCode = (str) => {
        return (str || '')
            .replace(/[\s\u00A0\u2000-\u200F\u2028-\u202F]+/g, '')
            .toUpperCase();
    };

    // Helper to get background color for a unit type ID
    const getTypeColor = (typeId) => {
        switch (typeId) {
            case 2: return '#c5d9f0'; // Core (light blue)
            case 3: return '#fce9d9'; // Major (light orange)
            case 1: return '#d5e2bb'; // Elective (light green)
            case 17: return '#b1a0c6'; // WIL (light purple)
            default: return '#ffffff';
        }
    };

    useEffect(() => {
        const fetchUnitTypes = async () => {
            try {
                const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/unit_type');
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.data && data.data.length) {
                        setUnitTypeOptions(data.data);
                        return;
                    }
                }
                setUnitTypeOptions(FALLBACK_UNIT_TYPES);
            } catch (err) {
                setUnitTypeOptions(FALLBACK_UNIT_TYPES);
            }
        };
        fetchUnitTypes();
    }, []);

    const handleFileChange = async (event) => {
        setMessage(null);
        setError(null);
        setUnits([]);
        setExtractedText('');
        setMatchedUnits([]);
        setSelectedUnitTypes({});
        setMissingCodes([]);

        const file = event.target.files?.[0];
        if (!file) {
            setPdfFile(null);
            setFileName('');
            return;
        }

        if (file.type !== 'application/pdf') {
            setError('Please upload a PDF file.');
            setPdfFile(null);
            setFileName('');
            return;
        }

        setPdfFile(file);
        setFileName(file.name);
        const defaultName = file.name.replace(/\.pdf$/i, '').trim();
        if (!plannerName.trim() || plannerName === lastAutoPlannerName) {
            setPlannerName(defaultName);
            setLastAutoPlannerName(defaultName);
        }
        await parsePdfFile(file);
    };

    const parsePdfFile = async (file) => {
        setIsParsing(true);
        setError(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfjs = await import('pdfjs-dist');
            pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

            const loadingTask = pdfjs.getDocument({
                data: new Uint8Array(arrayBuffer),
                disableWorker: true,
            });
            const pdf = await loadingTask.promise;

            let text = '';
            for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
                const page = await pdf.getPage(pageIndex);
                const content = await page.getTextContent();
                const pageText = content.items.map((item) => item.str).join('\n');
                text += `${pageText}\n\n`;
            }

            setExtractedText(text);
            let normalized = text.replace(/([A-Z]{2,4}\d{3})\n(\d{2})/gi, '$1$2');
            normalized = normalized.replace(/([A-Z]{2,4})\n(\d{5})/gi, '$1$2');
            normalized = normalized.replace(/([A-Z]{2,4})\s+(\d{5})/gi, '$1$2');

            const extractedUnits = extractUnitsFromText(normalized);
            setUnits(extractedUnits);

            if (extractedUnits.length > 0) {
                await fetchMatchingUnits(extractedUnits);
            } else {
                setMatchedUnits([]);
                setMissingCodes([]);
                setMessage('PDF read successfully, but no unit rows were detected.');
            }
        } catch (parseError) {
            console.error('PDF parse error', parseError);
            setError(`Unable to read the PDF file. Please use a text-based PDF and try again.`);
        } finally {
            setIsParsing(false);
        }
    };

    const extractUnitsFromText = (text) => {
        const unitRegex = /((COS|SWE|ICT|TNE)\d{5})/g;
        const matches = [...text.matchAll(unitRegex)];
        const units = [];

        for (let i = 0; i < matches.length; i++) {
            const current = matches[i];
            const next = matches[i + 1];

            const code = current[1];
            const start = current.index + code.length;
            const end = next ? next.index : text.length;

            let name = text.slice(start, end).trim();

            name = name
                .replace(/Semester\s+\d/gi, '')
                .replace(/Year\s+\w+/gi, '')
                .replace(/Elective\s+\d/gi, '')
                .replace(/Nil/gi, '')
                .replace(/Co-?requisite:.*/gi, '')
                .replace(/Pre-?requisites?.*/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

            if (!name || name.length < 3) continue;

            units.push({ code, name });
        }
        return units;
    };

    const fetchMatchingUnits = async (extractedUnits) => {
        const codes = Array.from(
            new Set(extractedUnits.map((unit) => normalizeCode(unit.code)).filter(Boolean))
        );

        if (codes.length === 0) {
            setMatchedUnits([]);
            setMissingCodes([]);
            return;
        }

        setIsMatching(true);
        try {
            const result = await UnitDB.FetchUnits({
                code: codes.join(','),
                exact: true,
                return: ['ID', 'UnitCode', 'Name', 'Availability', 'CreditPoints'],
                order_by: [{ column: 'UnitCode', ascending: true }],
            });

            if (!result.success) {
                setError(`Failed to fetch units: ${result.message || 'Unknown error'}`);
                setMatchedUnits([]);
                setMissingCodes(codes);
                return;
            }

            const matched = result.data || [];
            setMatchedUnits(matched);

            const initialTypes = {};
            matched.forEach(unit => {
                initialTypes[unit.id] = unit.unitTypeId || 1;
            });
            setSelectedUnitTypes(initialTypes);

            const matchedCodesSet = new Set(matched.map(u => normalizeCode(u.UnitCode)));
            const missingCodesLocal = codes.filter(code => !matchedCodesSet.has(code));
            setMissingCodes(missingCodesLocal);

            if (missingCodesLocal.length === 0 && matched.length > 0) {
                setMessage('All extracted units matched. Use "Auto Populate" to detect types from PDF colours.');
            }
        } catch (fetchError) {
            console.error('Matching units fetch error', fetchError);
            setMatchedUnits([]);
            setMissingCodes(codes);
            setError(`Failed to match units: ${fetchError?.message || 'Unknown fetch error'}`);
        } finally {
            setIsMatching(false);
        }
    };

    // Auto-populate unit types using PyMuPDF colour extraction
    const handleAutoPopulate = async () => {
        if (!pdfFile) {
            setError('No PDF file to analyze.');
            return;
        }

        setIsAutoPopulating(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', pdfFile);

            const response = await fetch('/api/pdf-debug', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to extract colours');
            }

            const colorBlocks = await response.json();

            // Build a map: unit code -> typeId from colour
            const colorMap = {};
            for (const block of colorBlocks) {
                const raw = block.text.trim();
                const codeMatch = raw.match(/^([A-Z]{2,4}\d{5})$/);
                if (codeMatch) {
                    const code = normalizeCode(codeMatch[1]);
                    const color = block.color.toLowerCase();
                    const typeId = COLOR_TO_TYPE_ID[color];
                    if (typeId && !colorMap[code]) {
                        colorMap[code] = typeId;
                    }
                }
            }

            if (Object.keys(colorMap).length === 0) {
                setError('No coloured unit codes found in the PDF. Cannot auto-populate.');
                return;
            }

            // Apply to matched units
            const newTypes = { ...selectedUnitTypes };
            for (const unit of matchedUnits) {
                const normCode = normalizeCode(unit.unit_code);
                if (colorMap[normCode]) {
                    newTypes[unit.id] = colorMap[normCode];
                }
            }
            setSelectedUnitTypes(newTypes);
            setMessage('Unit types have been auto‑populated from PDF colours.');
        } catch (err) {
            console.error('Auto-populate error', err);
            setError(`Auto-populate failed: ${err.message}`);
        } finally {
            setIsAutoPopulating(false);
        }
    };

    // Debug: show coloured blocks from the PDF
    const handleDebugColors = async () => {
        if (!pdfFile) {
            setError('Please upload a PDF first.');
            return;
        }

        setDebugLoading(true);
        setDebugData([]);
        setShowDebugModal(true);

        try {
            const formData = new FormData();
            formData.append('file', pdfFile);

            const response = await fetch('/api/pdf-debug', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to extract colors');
            }

            const data = await response.json();
            setDebugData(data);
        } catch (err) {
            console.error(err);
            setDebugData([{ error: err.message }]);
        } finally {
            setDebugLoading(false);
        }
    };

    const handleTypeChange = (unitId, typeId) => {
        setSelectedUnitTypes(prev => ({ ...prev, [unitId]: parseInt(typeId, 10) }));
    };
    // Sort units by type priority: Core (2) → Major (3) → Elective (1) → WIL (17) → others, then by unit code
    const sortedMatchedUnits = useMemo(() => {
        const getPriority = (typeId) => {
            switch (typeId) {
                case 2: return 1;   // Core first
                case 3: return 2;   // Major second
                case 1: return 3;   // Elective third
                case 17: return 4;  // WIL fourth
                default: return 999;
            }
        };

        return [...matchedUnits].sort((a, b) => {
            const priorityA = getPriority(selectedUnitTypes[a.id] || 1);
            const priorityB = getPriority(selectedUnitTypes[b.id] || 1);
            if (priorityA !== priorityB) return priorityA - priorityB;
            // If same type, sort by unit code alphabetically
            return (a.unit_code || '').localeCompare(b.unit_code || '');
        });
    }, [matchedUnits, selectedUnitTypes]);
    const handleUploadToDatabase = async () => {
        setMessage(null);
        setError(null);

        if (!plannerName.trim()) {
            setError('Please enter a planner name.');
            return;
        }

        if (matchedUnits.length === 0) {
            setError('No units to upload.');
            return;
        }

        const unitsToSave = matchedUnits.map(unit => ({
            unitId: unit.id,
            unitTypeId: selectedUnitTypes[unit.id] || 1,
        }));

        setIsUploading(true);

        try {
            const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/study-planner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: plannerName.trim(),
                    units: unitsToSave,
                }),
            });

            const responseText = await response.text();
            let result = {};
            if (responseText) {
                try {
                    result = JSON.parse(responseText);
                } catch {
                    throw new Error(responseText || 'Invalid JSON response');
                }
            }

            if (!response.ok || !result.success) {
                throw new Error(result.message || `Upload failed (${response.status})`);
            }

            setMessage('Study planner saved successfully!');
            setPdfFile(null);
            setFileName('');
            setUnits([]);
            setMatchedUnits([]);
            setSelectedUnitTypes({});
            setMissingCodes([]);
            setPlannerName('');
            setExtractedText('');
        } catch (err) {
            console.error('Upload error', err);
            const errorMsg = err.message || 'Unknown error during upload';
            if (errorMsg.includes('already exists')) {
                setError('A study planner with this name already exists. Please choose a different planner name.');
            } else {
                setError(`Failed to save study planner: ${errorMsg}`);
            }
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto bg-white rounded-xl shadow p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Upload Study Planner</h1>
                        <p className="text-sm text-gray-600">
                            Upload a study planner PDF – use <strong>Auto Populate</strong> to detect unit types from colours (Core = light blue, Major = light orange, Elective = light green).
                        </p>
                    </div>
                    <Link href="/view/dashboard" className="text-blue-600 hover:underline text-sm">
                        Back to dashboard
                    </Link>
                </div>

                <label className="block mb-4">
                    <span className="text-sm font-medium text-gray-700">Planner Name</span>
                    <input
                        type="text"
                        value={plannerName}
                        onChange={(e) => setPlannerName(e.target.value)}
                        placeholder="Auto-filled from file name"
                        disabled
                        className="mt-2 block w-full rounded border border-gray-300 bg-gray-100 p-2 text-gray-500 cursor-not-allowed"
                    />
                </label>

                <label className="block mb-4">
                    <span className="text-sm font-medium text-gray-700">Planner PDF file</span>
                    <input
                        type="file"
                        accept="application/pdf"
                        onChange={handleFileChange}
                        className="mt-2 block w-full rounded border border-gray-300 bg-white p-2"
                    />
                </label>

                {fileName && <p className="mb-4 text-sm text-gray-700">Selected file: {fileName}</p>}
                {isParsing && <p className="text-sm text-blue-600 mb-4">Reading PDF and extracting text...</p>}
                {message && <p className="text-sm text-green-600 mb-4">{message}</p>}
                {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

                {isMatching && <p className="text-sm text-blue-600 mb-4">Looking up matching units in the database...</p>}

                {matchedUnits.length > 0 && (
                    <div className="mb-6 overflow-x-auto">
                        <div className="mb-3">
                            <h2 className="text-xl font-semibold">Matched database units</h2>
                            <p className="text-sm text-gray-600">
                                You can manually select unit types or click <strong>Auto Populate</strong> to detect them from PDF colours.
                            </p>
                        </div>
                        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Code</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Credit points</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type in this planner</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sortedMatchedUnits.filter(unit => unit.availability === 'published').map((unit) => (
                                    <tr
                                        key={unit.id}
                                        style={{ backgroundColor: getTypeColor(selectedUnitTypes[unit.id]) }}
                                        className="transition-colors"
                                    >
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{unit.unit_code}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{unit.name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{unit.credit_points ?? '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            <select
                                                value={selectedUnitTypes[unit.id] || ''}
                                                onChange={(e) => handleTypeChange(unit.id, e.target.value)}
                                                className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
                                            >
                                                {unitTypeOptions.map(opt => (
                                                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs">
                            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: '#c5d9f0' }}></span> Core</span>
                            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: '#fce9d9' }}></span> Major</span>
                            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: '#d5e2bb' }}></span> Elective</span>
                            <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: '#b1a0c6' }}></span> WIL</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">All matched units will be saved to the study planner with their selected types.</p>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={handleAutoPopulate}
                        disabled={!pdfFile || matchedUnits.length === 0 || isAutoPopulating}
                        className="inline-flex items-center justify-center rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isAutoPopulating ? 'Detecting colours...' : 'Auto Populate'}
                    </button>
                    <button
                        type="button"
                        onClick={handleDebugColors}
                        disabled={!pdfFile || isParsing || debugLoading}
                        className="inline-flex items-center justify-center rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
                    >
                        {debugLoading ? 'Analyzing...' : 'Show Color Debug'}
                    </button>
                    <button
                        type="button"
                        disabled={!pdfFile || isParsing || isUploading || !plannerName.trim() || matchedUnits.length === 0}
                        onClick={handleUploadToDatabase}
                        className="inline-flex items-center justify-center rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isUploading ? 'Saving...' : 'Save all units to study planner'}
                    </button>
                </div>

                {extractedText && (
                    <div className="mt-6">
                        <h2 className="text-lg font-semibold mb-2">Raw extracted text</h2>
                        <textarea
                            readOnly
                            value={extractedText}
                            rows={10}
                            className="w-full rounded border border-gray-300 bg-gray-100 p-3 text-sm text-gray-800"
                        />
                    </div>
                )}

                {/* Debug Modal */}
                {showDebugModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowDebugModal(false)}>
                        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                                <h3 className="text-lg font-semibold">PDF Color & Text Extraction</h3>
                                <button onClick={() => setShowDebugModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                            </div>
                            <div className="p-4">
                                {debugLoading && <p className="text-gray-500">Analyzing PDF colors... (this may take a moment)</p>}
                                {!debugLoading && debugData.length === 0 && !debugData.error && <p className="text-gray-500">No colored text blocks found.</p>}
                                {!debugLoading && debugData.length > 0 && (
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-100">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Color (Hex)</th>
                                                <th className="px-3 py-2 text-left">Text</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {debugData.map((item, idx) => (
                                                <tr key={idx} className="border-b border-gray-200">
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-5 h-5 rounded border" style={{ backgroundColor: item.color }}></div>
                                                            <code className="text-xs">{item.color}</code>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-xs font-mono">{item.text}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                {!debugLoading && debugData.error && <p className="text-red-600">{debugData.error}</p>}
                                <p className="text-xs text-gray-400 mt-4">
                                    <strong>Note:</strong> This requires a Python backend with PyMuPDF installed at `/api/pdf-debug`.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UploadPlannerPage;