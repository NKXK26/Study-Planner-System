'use client';

import { useState, useEffect } from 'react';
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
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    // Fallback unit types in case API fails
    const FALLBACK_UNIT_TYPES = [
        { id: 2, name: 'Core' },
        { id: 1, name: 'Elective' },
        { id: 3, name: 'Major' },
        { id: 4, name: 'MPU' },
        { id: 17, name: 'WIL' },
    ];

    // Fetch unit type options
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
                // Fallback to hardcoded types
                console.warn('Using fallback unit types');
                setUnitTypeOptions(FALLBACK_UNIT_TYPES);
            } catch (err) {
                console.error('Failed to fetch unit types, using fallback', err);
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

        const extension = file.name.split('.').pop().toLowerCase();
        if (extension !== 'pdf') {
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
            for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
                const page = await pdf.getPage(pageIndex);
                const content = await page.getTextContent();
                const pageText = content.items.map((item) => item.str).join('\n');
                text += `${pageText}\n\n`;
            }

            setExtractedText(text);
            // Normalise the raw text
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
            }

            if (extractedUnits.length === 0) {
                setMessage('PDF read successfully, but no unit rows were detected.');
            }
        } catch (parseError) {
            console.error('PDF parse error', parseError);
            const parseMessage = parseError?.message ? ` (${parseError.message})` : '';
            setError(`Unable to read the PDF file. Please use a text-based PDF and try again.${parseMessage}`);
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

            // Cleaning rules
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
            new Set(extractedUnits.map((unit) => unit.code.trim().toUpperCase()).filter(Boolean))
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

            // Initialize selected unit types (use existing unitTypeId if available, else default to Elective = 1)
            const initialTypes = {};
            matched.forEach(unit => {
                initialTypes[unit.id] = unit.unitTypeId || 1;
            });
            setSelectedUnitTypes(initialTypes);

            // Compute missing codes correctly
            const matchedCodesSet = new Set(matched.map(u => u.UnitCode?.toUpperCase()));
            const missingCodesLocal = codes.filter(code => !matchedCodesSet.has(code));
            setMissingCodes(missingCodesLocal);

            if (missingCodesLocal.length === 0 && matched.length > 0) {
                setMessage('All extracted units matched. Select a type for each unit and click Save.');
            } else if (missingCodesLocal.length > 0) {
                setMessage(`⚠️ Some units could not be matched: ${missingCodesLocal.join(', ')}`);
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

    const handleTypeChange = (unitId, typeId) => {
        setSelectedUnitTypes(prev => ({ ...prev, [unitId]: parseInt(typeId, 10) }));
    };

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
            // Reset form
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
                            Upload a study planner PDF – assign a type (Core/Elective/Major) to each unit.
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
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                                <h2 className="text-xl font-semibold">Matched database units</h2>
                                <p className="text-sm text-gray-600">
                                    Choose a type for each unit (Core/Elective/Major/MPU/WIL).
                                </p>
                            </div>
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
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {matchedUnits.filter(unit => unit.availability === 'published').map((unit) => (
                                    <tr key={unit.id}>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{unit.unit_code}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{unit.name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{unit.credit_points ?? '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            <select
                                                value={selectedUnitTypes[unit.id] || ''}
                                                onChange={(e) => handleTypeChange(unit.id, e.target.value)}
                                                className="border border-gray-300 rounded-md px-2 py-1 text-sm"
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
                        {missingCodes.length > 0 && (
                            <p className="mt-2 text-sm text-amber-600">
                                ⚠️ Could not match: {missingCodes.join(', ')}
                            </p>
                        )}
                        <p className="mt-3 text-sm text-gray-600">All matched units will be saved with their selected types.</p>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        type="button"
                        disabled={!pdfFile || isParsing || isUploading || !plannerName.trim() || matchedUnits.length === 0}
                        onClick={handleUploadToDatabase}
                        className="inline-flex items-center justify-center rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isUploading ? 'Saving...' : 'Save selected units to study planner'}
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
            </div>
        </div>
    );
};

export default UploadPlannerPage;