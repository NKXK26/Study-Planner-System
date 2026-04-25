'use client';

import { useState } from 'react';
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
    const [selectedUnitIds, setSelectedUnitIds] = useState([]);
    const [missingCodes, setMissingCodes] = useState([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isMatching, setIsMatching] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);

    const handleFileChange = async (event) => {
        setMessage(null);
        setError(null);
        setUnits([]);
        setExtractedText('');
        setMatchedUnits([]);
        setSelectedUnitIds([]);
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
            const extractedUnits = extractUnitsFromText(text);
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

            // 🧹 CLEANING RULES
            name = name
                .replace(/Semester\s+\d/gi, '')
                .replace(/Year\s+\w+/gi, '')
                .replace(/Elective\s+\d/gi, '')
                .replace(/Nil/gi, '')
                .replace(/Co-?requisite:.*/gi, '')
                .replace(/Pre-?requisites?.*/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

            // ❌ Skip garbage
            if (!name || name.length < 3) continue;

            units.push({
                code,
                name,
            });
        }

        return units;
    };

    const fetchMatchingUnits = async (extractedUnits) => {
        const codes = Array.from(
            new Set(
                extractedUnits
                    .map((unit) => unit.code.trim().toUpperCase())
                    .filter(Boolean)
            )
        );

        if (codes.length === 0) {
            setMatchedUnits([]);
            setMissingCodes([]);
            return;
        }

        console.log('Fetching matching units for codes:', codes);
        setIsMatching(true);

        try {
            const result = await UnitDB.FetchUnits({
                code: codes.join(','),
                exact: true,
                return: ['ID', 'UnitCode', 'Name', 'Availability', 'CreditPoints'],
                order_by: [{ column: 'UnitCode', ascending: true }],
            });

            console.log('FetchUnits result:', result);

            if (!result.success) {
                console.error('API returned error:', result.message);
                setMatchedUnits([]);
                setMissingCodes(codes);
                setError(`Failed to fetch units: ${result.message || 'Unknown error'}`);
                return;
            }

            const matched = result.data || [];
            console.log('Matched units from API:', matched);
            setMatchedUnits(matched);
            setSelectedUnitIds(matched.map((unit) => unit.id));

            const matchedCodes = new Set(matched.map((unit) => unit.UnitCode));
            const missingCodesLocal = codes.filter((code) => !matchedCodes.has(code));
            setMissingCodes(missingCodesLocal);

            if (missingCodesLocal.length === 0 && matched.length > 0) {
                setMessage('All extracted units are matched. Review selections and click Save to create the study planner.');
            }

        } catch (fetchError) {
            console.error('Matching units fetch error', fetchError);
            setMatchedUnits([]);
            setSelectedUnitIds([]);
            setMissingCodes(codes);
            const errorMsg = fetchError?.message || 'Unknown fetch error';
            setError(`Failed to match units: ${errorMsg}. Please check the console for details.`);
        } finally {
            setIsMatching(false);
        }
    };

    const handleToggleUnit = (unitId) => {
        setSelectedUnitIds((prev) =>
            prev.includes(unitId)
                ? prev.filter((id) => id !== unitId)
                : [...prev, unitId]
        );
    };

    const handleSelectAll = () => {
        setSelectedUnitIds(matchedUnits.map((unit) => unit.id));
    };

    const handleDeselectAll = () => {
        setSelectedUnitIds([]);
    };

    const handleUploadToDatabase = async () => {
        setMessage(null);
        setError(null);

        if (!plannerName.trim()) {
            setError('Please enter a planner name.');
            return;
        }

        if (selectedUnitIds.length === 0) {
            setError('No matched units selected to upload.');
            return;
        }

        setIsUploading(true);

        try {
            const selectedUnitCodes = matchedUnits
                .filter((unit) => selectedUnitIds.includes(unit.id))
                .map((unit) => unit.unit_code)
                .filter(Boolean);

            const response = await SecureFrontendAuthHelper.authenticatedFetch(
                '/api/study-planner',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: plannerName.trim(),
                        unitIds: selectedUnitIds.filter((id) => Number.isInteger(id)),
                        unitCodes: selectedUnitCodes,
                    }),
                }
            );

            const responseText = await response.text();
            console.log('📡 Study planner API response status:', response.status);
            console.log('📡 Study planner API response text:', responseText);
            
            let result = {};
            if (responseText) {
                try {
                    result = JSON.parse(responseText);
                } catch (jsonError) {
                    const message = responseText || response.statusText || 'Invalid JSON response from server';
                    throw new Error(message);
                }
            }

            if (!response.ok) {
                const message = result.message || result.error || result.details || `Upload failed (${response.status})`;
                console.error('❌ API error:', message);
                throw new Error(message);
            }

            if (!result.success) {
                const message = result.message || result.error || result.details || 'Upload failed';
                throw new Error(message);
            }

            setMessage('Study planner saved successfully!');
            setPdfFile(null);
            setFileName('');
            setUnits([]);
            setMatchedUnits([]);
            setSelectedUnitIds([]);
            setMissingCodes([]);
            setPlannerName('');
        } catch (err) {
            console.error('Upload error', err);
            const errorMsg = err.message || 'Unknown error during upload';
            if (errorMsg.includes('already exists')) {
                setError('A study planner with this name already exists. Please choose a different planner name and try again.');
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
                            Upload a study planner PDF and extract unit codes and names.
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
                        className="mt-2 block w-full rounded border border-gray-300 bg-white p-2"
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

                {isMatching && (
                    <p className="text-sm text-blue-600 mb-4">Looking up matching units in the database...</p>
                )}

                {matchedUnits.length > 0 && (
                    <div className="mb-6 overflow-x-auto">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            <div>
                                <h2 className="text-xl font-semibold">Matched database units</h2>
                                <p className="text-sm text-gray-600">
                                    Click Add/Remove to choose which units to save.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleSelectAll}
                                    className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                                >
                                    Select all
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeselectAll}
                                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                    Deselect all
                                </button>
                            </div>
                        </div>
                        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Code</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Availability</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Credit points</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {matchedUnits.map((unit) => (
                                    <tr key={unit.id} className={selectedUnitIds.includes(unit.id) ? 'bg-blue-50' : ''}>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{unit.unit_code}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{unit.name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{unit.availability || 'Unknown'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{unit.credit_points ?? '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleUnit(unit.id)}
                                                className={`rounded px-3 py-1 text-sm ${selectedUnitIds.includes(unit.id) ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-600 text-white hover:bg-green-700'}`}
                                            >
                                                {selectedUnitIds.includes(unit.id) ? 'Remove' : 'Add'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="mt-3 text-sm text-gray-600">Selected units: {selectedUnitIds.length}</p>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        type="button"
                        disabled={!pdfFile || isParsing || isUploading || !plannerName.trim() || selectedUnitIds.length === 0}
                        onClick={handleUploadToDatabase}
                        className="inline-flex items-center justify-center rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isUploading ? 'Saving...' : 'Save selected units to study planner'}
                    </button>
                </div>
                {/* 
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
                )} */}
            </div>
        </div>
    );
};

export default UploadPlannerPage;
