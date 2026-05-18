'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import UnitDB from '@app/class/Unit/UnitDB';
import Draggable from 'react-draggable';
import { useRef } from 'react';
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
    const [showColorSidebar, setShowColorSidebar] = useState(false);
    const [colorMappings, setColorMappings] = useState([]);      // for matching
    const [sidebarLoading, setSidebarLoading] = useState(false);
    const [showPdfPreview, setShowPdfPreview] = useState(true);
    const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
    const nodeRef = useRef(null);
    const [size, setSize] = useState({ width: 500, height: 'calc(70vh)' });
    // Debug modal states
    const [showDebugModal, setShowDebugModal] = useState(false);
    const [debugData, setDebugData] = useState([]);
    const [debugLoading, setDebugLoading] = useState(false);
    const [selectedUnitColors, setSelectedUnitColors] = useState({});
    const FALLBACK_UNIT_TYPES = [
        { id: 2, name: 'Core', colour: '#c5d9f0', colors: [] },
        { id: 1, name: 'Elective', colour: '#d5e2bb', colors: [] },
        { id: 3, name: 'Major', colour: '#fce9d9', colors: [] },
        { id: 17, name: 'WIL', colour: '#b1a0c6', colors: [] },
    ];
    // Helper: find unit type ID by exact colour match from colour mappings
    function findMatchingUnitTypeFromMappings(exactHex, mappings) {
        const normalizedHex = exactHex.toLowerCase();
        for (const m of mappings) {
            // Check primary colour
            if (m.color && m.color.toLowerCase() === normalizedHex) {
                return m.unitTypeId;
            }
            // Check alternative colours (if any)
            if (m.colors && Array.isArray(m.colors)) {
                const foundAlt = m.colors.find(c => c.toLowerCase() === normalizedHex);
                if (foundAlt) return m.unitTypeId;
            }
        }
        return null;
    }

    const normalizeCode = (str) => {
        return (str || '')
            .replace(/[\s\u00A0\u2000-\u200F\u2028-\u202F]+/g, '')
            .toUpperCase();
    };

    const getTypeColor = (typeId) => {
        const found = unitTypeOptions.find(t => t.id === typeId);
        if (found && found.colour) return found.colour;
        switch (typeId) {
            case 2: return '#c5d9f0';
            case 3: return '#fce9d9';
            case 1: return '#d5e2bb';
            case 17: return '#b1a0c6';
            default: return '#ffffff';
        }
    };

    // Fetch unit types (for dropdown options and display)
    useEffect(() => {
        const fetchUnitTypes = async () => {
            try {
                const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/unit_type');
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.data && data.data.length) {
                        const types = data.data.map(t => ({
                            id: t.id ?? t.ID,
                            name: t.name ?? t.Name,
                            colour: t.colour ?? t.Colour,
                            colors: t.colors || []
                        }));
                        setUnitTypeOptions(types);
                        return;
                    }
                }
                setUnitTypeOptions(FALLBACK_UNIT_TYPES);
            } catch (err) {
                console.error(err);
                setUnitTypeOptions(FALLBACK_UNIT_TYPES);
            }
        };
        fetchUnitTypes();
    }, []);
    // Clean up blob URL when component unmounts or file changes
    useEffect(() => {
        return () => {
            if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
        };
    }, [pdfBlobUrl]);

    useEffect(() => {
        if (pdfFile) {
            if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
            setPdfBlobUrl(URL.createObjectURL(pdfFile));
        } else {
            if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
            setPdfBlobUrl(null);
        }
    }, [pdfFile]);
    // Fetch colour mappings from /api/unit-type-color (used for both sidebar and matching)
    const fetchColourMappings = async () => {
        setSidebarLoading(true);
        try {
            const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/unit-type-color');
            const json = await res.json();
            if (json.success && json.data) {
                setColorMappings(json.data);
            } else {
                setColorMappings([]);
            }
        } catch (err) {
            console.error('Failed to fetch colour mappings', err);
            setColorMappings([]);
        } finally {
            setSidebarLoading(false);
        }
    };

    const toggleColorSidebar = () => {
        if (!showColorSidebar && colorMappings.length === 0) {
            fetchColourMappings();
        }
        setShowColorSidebar(!showColorSidebar);
    };

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

            let normalized = text.toUpperCase();
            normalized = normalized.replace(/\r\n?/g, '\n');
            normalized = normalized.replace(/[\f\v\u2028\u2029]/g, '\n');

            let changed = true;
            let pass = 0;
            const MAX_PASSES = 10;
            let lines = normalized.split('\n');

            while (changed && pass < MAX_PASSES) {
                changed = false;
                const newLines = [...lines];
                for (let i = 0; i < newLines.length - 1; i++) {
                    let current = newLines[i];
                    let next = newLines[i + 1];
                    if (!current || !next) continue;

                    current = current.replace(/[^A-Z0-9]+$/, '');
                    next = next.replace(/^[^A-Z0-9]+/, '');

                    const partialMatch = current.match(/([A-Z]{2,4}\d{0,4})$/);
                    if (partialMatch) {
                        const partial = partialMatch[1];
                        // Next starts with 1-5 digits (allow single digit case)
                        const digitsMatch = next.match(/^(\d{1,5})/);
                        if (digitsMatch) {
                            const digits = digitsMatch[1];
                            const fullCode = partial + digits;
                            // Validate: 2-4 letters + exactly 5 digits total
                            if (/^[A-Z]{2,4}\d{5}$/.test(fullCode)) {
                                // Replace the partial part and merge
                                newLines[i] = current.slice(0, -partial.length) + fullCode;
                                // Remove the consumed digits from the next line
                                newLines[i + 1] = next.slice(digits.length);
                                changed = true;
                                continue;
                            }
                        }
                    }

                    const lettersMatch = current.match(/([A-Z]{2,4})$/);
                    if (lettersMatch && !partialMatch) {
                        const letters = lettersMatch[1];
                        const digitsMatch = next.match(/^(\d{1,5})/);
                        if (digitsMatch) {
                            const digits = digitsMatch[1];
                            const fullCode = letters + digits;
                            if (/^[A-Z]{2,4}\d{5}$/.test(fullCode)) {
                                newLines[i] = current.slice(0, -letters.length) + fullCode;
                                newLines[i + 1] = next.slice(digits.length);
                                changed = true;
                                continue;
                            }
                        }
                    }
                }
                lines = newLines;
                pass++;
            }
            normalized = lines.join('\n');

            // 3. Remove any punctuation inside codes (e.g., "COS300-49" -> "COS30049")
            normalized = normalized.replace(/([A-Z]{2,4})[^A-Z0-9]+(\d{5})/gi, '$1$2');

            // 4. Merge codes separated by whitespace (including newlines that were not caught in iterative loop)
            normalized = normalized.replace(/([A-Z]{2,4})\s+(\d{5})/gi, '$1$2');

            setExtractedText(normalized);
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
        const unitRegex = /([A-Z]{2,4}\d{5})/g;
        const matches = [...text.matchAll(unitRegex)];
        const units = [];

        // Patterns that indicate we should stop capturing the unit name
        const stopPatterns = [
            /^SEMESTER\s+\d+/im,
            /^YEAR\s+\w+/im,
            /^ELECTIVE\s+\d+/im,
            /^UNIT\s+CODE/im,
            /^PRE-?REQUISITES/im,
            /^NOTES/im,
            /^COURSE\s+INFORMATION/im,
            /^HOW\s+TO\s+USE/im,
            /^\s*$/ // blank line
        ];

        for (let i = 0; i < matches.length; i++) {
            const current = matches[i];
            const next = matches[i + 1];
            const code = current[1];
            let start = current.index + code.length;
            // Default end is the start of the next code, or the end of text
            let end = next ? next.index : text.length;

            // Extract the raw slice
            let rawName = text.slice(start, end);

            // If the next code is far away (more than 500 chars), try to stop earlier
            if (end - start > 500) {
                // Find the earliest occurrence of any stop pattern within the next 500 chars
                const earlyStop = rawName.search(new RegExp(stopPatterns.map(p => p.source).join('|'), 'i'));
                if (earlyStop !== -1 && earlyStop < 500) {
                    rawName = rawName.substring(0, earlyStop);
                } else {
                    // Otherwise truncate to 300 chars
                    rawName = rawName.substring(0, 300);
                }
            }

            // Clean the name
            let name = rawName
                .replace(/Semester\s+\d+/gi, '')
                .replace(/Year\s+\w+/gi, '')
                .replace(/Elective\s+\d+/gi, '')
                .replace(/\bNil\b/gi, '')
                .replace(/Co-?requisite:.*/gi, '')
                .replace(/Pre-?requisites?:.*/gi, '')
                .replace(/\[.*?\]/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

            if (name.length < 3) continue;

            // Skip offering lines
            const skipPatterns = [
                /\b(only|semester|year|elective|pre-?requisites?|co-?requisite?|nil|credit|points|availability|offered)\b/i,
                /^\s*\d+\s*$/
            ];
            const shouldSkip = skipPatterns.some(p => p.test(name)) && name.length < 30;
            if (shouldSkip) continue;

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

    // Auto‑populate using exact colour matching from the /api/unit-type-color endpoint
const handleAutoPopulate = async () => {
    if (!pdfFile) {
        setError('No PDF file to analyze.');
        return;
    }
    if (colorMappings.length === 0) {
        await fetchColourMappings();
        if (colorMappings.length === 0) {
            setError('No colour mappings defined. Please upload a study planner design first in Unit Type Management.');
            return;
        }
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

        // Pass 1: exact unit code matches (full block = code)
        const colorMap = {};
        for (const block of colorBlocks) {
            const raw = block.text.trim();
            const codeMatch = raw.match(/^([A-Z]{2,4}\d{5})$/);
            if (codeMatch) {
                const code = normalizeCode(codeMatch[1]);
                const extractedHex = block.color.toLowerCase();
                const typeId = findMatchingUnitTypeFromMappings(extractedHex, colorMappings);
                if (typeId !== null && !colorMap[code]) {
                    colorMap[code] = { typeId, colorHex: extractedHex };
                }
            }
        }

        // Pass 2: WIL‑coloured blocks that contain a unit code anywhere (e.g., "ICT20016* Optional")
        for (const block of colorBlocks) {
            const raw = block.text.trim();
            const extractedHex = block.color.toLowerCase();
            const typeId = findMatchingUnitTypeFromMappings(extractedHex, colorMappings);
            if (typeId === 17) { // WIL type ID
                const codeMatch = raw.match(/([A-Z]{2,4}\d{5})/i);
                if (codeMatch) {
                    const code = normalizeCode(codeMatch[1]);
                    if (!colorMap[code]) {
                        colorMap[code] = { typeId: 17, colorHex: extractedHex };
                    }
                }
            }
        }

        if (Object.keys(colorMap).length === 0) {
            setError('No coloured unit codes found in the PDF. Ensure the PDF has coloured unit codes and mappings exist.');
            return;
        }

        // Apply mappings to displayed matchedUnits
        const newTypes = { ...selectedUnitTypes };
        const newColors = { ...selectedUnitColors };
        for (const unit of matchedUnits) {
            const normCode = normalizeCode(unit.unit_code);
            if (colorMap[normCode]) {
                newTypes[unit.id] = colorMap[normCode].typeId;
                newColors[unit.id] = colorMap[normCode].colorHex;
            }
        }
        setSelectedUnitTypes(newTypes);
        setSelectedUnitColors(newColors);

        setMessage('Unit types auto‑populated by matching code colours (primary/alternative). WIL placements detected from loose code patterns.');
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
            <div className={`max-w-5xl mx-auto bg-white rounded-xl shadow p-8 transition-all duration-300 ${showPdfPreview ? 'mr-[540px]' : ''}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Upload Study Planner</h1>
                        <p className="text-sm text-gray-600">
                            Upload a study planner PDF – use <strong>Auto Populate</strong> to detect unit types by matching PDF colours to the colour mappings defined in <strong>Unit Type Management</strong>.<br />
                            The system uses exact colour matching – no fuzzy matching.
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
                                You can manually select unit types or click <strong>Auto Populate</strong> to detect them from PDF colours (exact match to colour mappings).
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
                                        style={{ backgroundColor: selectedUnitColors[unit.id] || getTypeColor(selectedUnitTypes[unit.id]) }}
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
                            {unitTypeOptions.map(t => (
                                t.colour && (
                                    <span key={t.id}>
                                        <span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ backgroundColor: t.colour }}></span>
                                        {t.name}
                                    </span>
                                )
                            ))}
                        </div>
                        <p className="mt-2 text-sm text-gray-600">All matched units will be saved to the study planner with their selected types.</p>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={handleAutoPopulate}
                        disabled={!pdfFile || matchedUnits.length === 0 || isAutoPopulating}
                        className="inline-flex items-center justify-center rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                        {isAutoPopulating ? 'Detecting colours...' : 'Auto Populate'}
                    </button>
                    <button
                        type="button"
                        onClick={handleDebugColors}
                        disabled={!pdfFile || isParsing || debugLoading}
                        className="inline-flex items-center justify-center rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
                    >
                        {debugLoading ? 'Analyzing...' : 'Show Color Debug'}
                    </button>
                    <button
                        type="button"
                        disabled={!pdfFile || isParsing || isUploading || !plannerName.trim() || matchedUnits.length === 0}
                        onClick={handleUploadToDatabase}
                        className="inline-flex items-center justify-center rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isUploading ? 'Saving...' : 'Save all units to study planner'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowPdfPreview(!showPdfPreview)}
                        disabled={!pdfFile}
                        className="inline-flex items-center justify-center rounded bg-[#dc2d27] px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                        {showPdfPreview ? 'Hide PDF Preview' : 'Show PDF Preview'}
                    </button>
                    <button
                        type="button"
                        onClick={toggleColorSidebar}
                        className="inline-flex items-center justify-center rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
                    >
                        {showColorSidebar ? 'Hide Colour Mappings' : 'Show Colour Mappings'}
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
                {/* Draggable PDF Preview Window */}
                {showPdfPreview && pdfBlobUrl && (
                    <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="body">
                        <div ref={nodeRef} className="fixed bg-white shadow-xl rounded-lg border border-gray-200 p-3 z-50"
                            style={{ width: '500px', minWidth: '250px', maxWidth: '80vw', top: '100px', right: '20px' }}>
                            <div className="drag-handle flex justify-between items-center mb-2 cursor-move bg-gray-100 p-1 rounded">
                                <h3 className="font-semibold text-gray-800 text-sm">PDF Preview</h3>
                                <button onClick={() => setShowPdfPreview(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                            </div>
                            <iframe
                                src={`${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                                className="w-full h-[70vh] border rounded"
                                title="PDF preview"
                            />
                        </div>
                    </Draggable>
                )}
                {showDebugModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowDebugModal(false)}>
                        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                                <h3 className="text-lg font-semibold">PDF Color & Text Extraction</h3>
                                <button onClick={() => setShowDebugModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
                            </div>
                            <div className="p-4">
                                {debugLoading && <p className="text-gray-500">Analyzing PDF colors...</p>}
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

            {/* Colour Mapping Sidebar (uses same data as matching) */}
            {showColorSidebar && (
                <div className="fixed right-0 top-1/2 transform -translate-y-1/2 w-80 bg-white shadow-xl rounded-l-lg border-l border-t border-b border-gray-200 p-4 z-40 max-h-[80vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-gray-800">Colour Mappings (Unit Type ↔ Colour)</h3>
                        <button onClick={toggleColorSidebar} className="text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    {sidebarLoading ? (
                        <p className="text-sm text-gray-500">Loading colour mappings...</p>
                    ) : colorMappings.length === 0 ? (
                        <p className="text-sm text-gray-500">No colour mappings defined.</p>
                    ) : (
                        <div className="space-y-2">
                            {colorMappings.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 p-1 border-b border-gray-100">
                                    <div className="w-6 h-6 rounded border" style={{ backgroundColor: item.color }}></div>
                                    <code className="text-xs font-mono flex-1">{item.color}</code>
                                    <span className="text-xs text-gray-700 truncate max-w-[120px]" title={item.unitTypeName}>
                                        {item.unitTypeName}
                                    </span>
                                    <span className="text-[10px] text-gray-400">{item.source === 'Alternative' ? 'Alt' : 'Primary'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default UploadPlannerPage;