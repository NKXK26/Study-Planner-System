'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import UnitDB from '@app/class/Unit/UnitDB';

// ─── constants ────────────────────────────────────────────────────────────────

const FALLBACK_UNIT_TYPES = [
	{ id: 2,  name: 'Core',     colour: '#c5d9f0' },
	{ id: 1,  name: 'Elective', colour: '#d5e2bb' },
	{ id: 3,  name: 'Major',    colour: '#fce9d9' },
	{ id: 17, name: 'WIL',      colour: '#b1a0c6' },
];

const TYPE_PRIORITY = { 2: 1, 3: 2, 1: 3, 17: 4 };

// ─── helpers ──────────────────────────────────────────────────────────────────

const normalizeCode = (str) =>
	(str || '').replace(/[\s\u00A0\u2000-\u200F\u2028-\u202F]+/g, '').toUpperCase();

// ─── Step indicator ───────────────────────────────────────────────────────────

const Step = ({ n, label, active, done }) => (
	<div className="flex items-center gap-2">
		<div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
			${done  ? 'bg-emerald-500 border-emerald-500 text-white' :
			  active ? 'bg-[#cc2131] border-[#cc2131] text-white' :
			           'bg-white border-gray-300 text-gray-400'}`}>
			{done ? '✓' : n}
		</div>
		<span className={`text-sm font-medium ${active ? 'text-[#cc2131]' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
			{label}
		</span>
	</div>
);

const StepDivider = () => <div className="flex-1 h-px bg-gray-200 mx-1" />;

// ─── Color swatch pill ────────────────────────────────────────────────────────

const ColorRow = ({ item, idx, unitTypeOptions, onChange }) => (
	<div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-all">
		<div
			className="w-10 h-10 rounded-lg border border-gray-200 flex-shrink-0 shadow-sm"
			style={{ backgroundColor: item.color }}
		/>
		<div className="flex-1 min-w-0">
			<code className="text-xs font-mono text-gray-500">{item.color}</code>
			{item.sampleText && (
				<p className="text-xs text-gray-400 truncate mt-0.5">{item.sampleText}</p>
			)}
		</div>
		<select
			value={item.selectedTypeId || ''}
			onChange={(e) => onChange(idx, e.target.value ? parseInt(e.target.value) : null)}
			className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#cc2131]/30 focus:border-[#cc2131]"
		>
			<option value="">— ignore —</option>
			{unitTypeOptions.map(t => (
				<option key={t.id} value={t.id}>{t.name}</option>
			))}
		</select>
	</div>
);

// ─── Split-screen mapping modal ────────────────────────────────────────────────

const MappingModal = ({ pdfBlobUrl, colors, unitTypeOptions, onConfirm, onCancel, isParsing }) => {
	const [localColors, setLocalColors] = useState(colors);

	useEffect(() => setLocalColors(colors), [colors]);

	const handleChange = (idx, typeId) => {
		setLocalColors(prev => prev.map((c, i) => i === idx ? { ...c, selectedTypeId: typeId } : c));
	};

	const mappedCount = localColors.filter(c => c.selectedTypeId).length;

	return (
		<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch">
			<div className="flex w-full h-full">

				{/* ── Left panel: color mapping ── */}
				<div className="w-[420px] flex-shrink-0 bg-gray-50 flex flex-col border-r border-gray-200 shadow-2xl">
					{/* header */}
					<div className="px-6 py-5 border-b border-gray-200 bg-white">
						<h2 className="text-lg font-bold text-gray-900">Map Colours → Unit Types</h2>
						<p className="text-sm text-gray-500 mt-1">
							Assign a unit type to each colour found in the PDF.
							Colours left as <em>ignore</em> will be skipped.
						</p>
					</div>

					{/* color list */}
					<div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
						{localColors.length === 0 && (
							<p className="text-sm text-gray-400 text-center py-8">No colours detected in the PDF.</p>
						)}
						{localColors.map((item, idx) => (
							<ColorRow
								key={item.color}
								item={item}
								idx={idx}
								unitTypeOptions={unitTypeOptions}
								onChange={handleChange}
							/>
						))}
					</div>

					{/* footer */}
					<div className="px-5 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3">
						<button
							onClick={onCancel}
							className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-all"
						>
							Cancel
						</button>
						<button
							onClick={() => onConfirm(localColors)}
							disabled={mappedCount === 0 || isParsing}
							className="flex-1 px-4 py-2 rounded-lg bg-[#cc2131] hover:bg-[#b01d2c] disabled:bg-gray-300 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2"
						>
							{isParsing ? (
								<>
									<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
										<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
										<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
									</svg>
									Parsing…
								</>
							) : (
								<>Apply Mapping &amp; Parse ({mappedCount} mapped)</>
							)}
						</button>
					</div>
				</div>

				{/* ── Right panel: PDF preview ── */}
				<div className="flex-1 bg-gray-900 flex flex-col">
					<div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
						<span className="text-sm font-medium text-gray-300">PDF Preview</span>
						<button
							onClick={onCancel}
							className="text-gray-400 hover:text-white transition-colors p-1 rounded"
						>
							<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					<div className="flex-1 p-4">
						{pdfBlobUrl ? (
							<iframe
								src={`${pdfBlobUrl}#toolbar=0&navpanes=0`}
								className="w-full h-full rounded-lg border border-gray-700"
								title="PDF preview"
							/>
						) : (
							<div className="flex items-center justify-center h-full text-gray-500 text-sm">
								PDF preview unavailable
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

// ─── Matched units table ───────────────────────────────────────────────────────

const UnitsTable = ({ units, selectedUnitTypes, unitTypeOptions, onTypeChange }) => {
	const getTypeColor = (typeId) => {
		const found = unitTypeOptions.find(t => t.id === typeId);
		return found?.colour || '#f9fafb';
	};

	const sorted = useMemo(() => {
		return [...units].sort((a, b) => {
			const pa = TYPE_PRIORITY[selectedUnitTypes[a.id]] ?? 999;
			const pb = TYPE_PRIORITY[selectedUnitTypes[b.id]] ?? 999;
			if (pa !== pb) return pa - pb;
			return (a.unit_code || '').localeCompare(b.unit_code || '');
		});
	}, [units, selectedUnitTypes]);

	return (
		<div className="overflow-x-auto rounded-xl border border-gray-200">
			<table className="min-w-full divide-y divide-gray-200">
				<thead className="bg-gray-50">
					<tr>
						{['Code', 'Name', 'Credits', 'Unit Type'].map(h => (
							<th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="divide-y divide-gray-100">
					{sorted.filter(u => u.availability === 'published').map(unit => (
						<tr
							key={unit.id}
							style={{ backgroundColor: getTypeColor(selectedUnitTypes[unit.id]) }}
							className="transition-colors"
						>
							<td className="px-4 py-3 text-sm font-mono font-semibold text-gray-900">{unit.unit_code}</td>
							<td className="px-4 py-3 text-sm text-gray-700">{unit.name}</td>
							<td className="px-4 py-3 text-sm text-gray-600">{unit.credit_points ?? '—'}</td>
							<td className="px-4 py-3">
								<select
									value={selectedUnitTypes[unit.id] || ''}
									onChange={(e) => onTypeChange(unit.id, parseInt(e.target.value, 10))}
									className="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#cc2131]/30 focus:border-[#cc2131]"
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
		</div>
	);
};

// ─── Main page ─────────────────────────────────────────────────────────────────

const UploadPlannerPage = () => {
	// ── file state ──
	const [pdfFile, setPdfFile]           = useState(null);
	const [pdfBlobUrl, setPdfBlobUrl]     = useState(null);
	const [fileName, setFileName]         = useState('');
	const [plannerName, setPlannerName]   = useState('');
	const [lastAutoName, setLastAutoName] = useState('');

	// ── unit type options ──
	const [unitTypeOptions, setUnitTypeOptions] = useState([]);

	// ── mapping modal ──
	const [showModal, setShowModal]               = useState(false);
	const [extractedColors, setExtractedColors]   = useState([]); // { color, sampleText, selectedTypeId }
	const [extractedBlocks, setExtractedBlocks]   = useState([]); // raw { color, text } blocks
	const [colorMapping, setColorMapping]         = useState({}); // hex -> unitTypeId

	// ── parse / match state ──
	const [isParsing, setIsParsing]         = useState(false);
	const [isMatching, setIsMatching]       = useState(false);
	const [matchedUnits, setMatchedUnits]   = useState([]);
	const [selectedTypes, setSelectedTypes] = useState({});
	const [missingCodes, setMissingCodes]   = useState([]);

	// ── save state ──
	const [isSaving, setIsSaving] = useState(false);

	// ── feedback ──
	const [message, setMessage] = useState(null);
	const [error, setError]     = useState(null);

	// ── step tracking (1=upload, 2=map, 3=review, 4=done) ──
	const [step, setStep] = useState(1);
	const fileInputRef = useRef(null);

	// ── fetch unit types ──
	useEffect(() => {
		SecureFrontendAuthHelper.authenticatedFetch('/api/unit_type')
			.then(r => r.ok ? r.json() : null)
			.then(data => {
				if (data?.success && data.data?.length) {
					setUnitTypeOptions(data.data.map(t => ({
						id: t.id ?? t.ID,
						name: t.name ?? t.Name,
						colour: t.colour ?? t.Colour,
					})));
				} else {
					setUnitTypeOptions(FALLBACK_UNIT_TYPES);
				}
			})
			.catch(() => setUnitTypeOptions(FALLBACK_UNIT_TYPES));
	}, []);

	// ── blob URL lifecycle ──
	useEffect(() => {
		return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
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

	// ── reset everything ──
	const resetAll = useCallback(() => {
		setPdfFile(null);
		setFileName('');
		setPlannerName('');
		setLastAutoName('');
		setExtractedColors([]);
		setExtractedBlocks([]);
		setColorMapping({});
		setMatchedUnits([]);
		setSelectedTypes({});
		setMissingCodes([]);
		setMessage(null);
		setError(null);
		setStep(1);
	}, []);

	// ── Step 1: file selected → extract colors → open modal ──
	const handleFileChange = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		if (file.type !== 'application/pdf') {
			setError('Please upload a PDF file.');
			return;
		}

		resetAll();
		setPdfFile(file);
		setFileName(file.name);
		const defaultName = file.name.replace(/\.pdf$/i, '').trim();
		setPlannerName(defaultName);
		setLastAutoName(defaultName);
		setStep(2);
		setError(null);
		setMessage(null);

		// Extract colors from PDF
		try {
			const formData = new FormData();
			formData.append('file', file);
			const res = await fetch('/api/pdf-debug', { method: 'POST', body: formData });
			if (!res.ok) throw new Error('Failed to extract colours');
			const blocks = await res.json();
			setExtractedBlocks(blocks);

			// Deduplicate colours
			const colorMap = new Map();
			for (const block of blocks) {
				const color = block.color.toLowerCase();
				if (!colorMap.has(color) && block.text?.trim()) {
					colorMap.set(color, block.text.trim());
				}
			}
			const unique = Array.from(colorMap.entries()).map(([color, sampleText]) => ({
				color,
				sampleText,
				selectedTypeId: null,
			}));
			setExtractedColors(unique);
			setShowModal(true);
		} catch (err) {
			setError(`Failed to extract colours from PDF: ${err.message}`);
			setStep(1);
		}
	};

	// ── Step 2: user confirms mapping → parse PDF text → match DB units ──
	const handleMappingConfirm = async (mappedColors) => {
		// Build color → typeId map
		const mapping = {};
		for (const c of mappedColors) {
			if (c.selectedTypeId) mapping[c.color.toLowerCase()] = c.selectedTypeId;
		}
		if (Object.keys(mapping).length === 0) {
			setError('Please map at least one colour to a unit type.');
			return;
		}
		setColorMapping(mapping);
		setShowModal(false);
		setIsParsing(true);
		setError(null);

		try {
			// ── Parse PDF text to extract unit codes ──
			const arrayBuffer = await pdfFile.arrayBuffer();
			const pdfjs = await import('pdfjs-dist');
			pdfjs.GlobalWorkerOptions.workerSrc =
				`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

			const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), disableWorker: true }).promise;
			let text = '';
			for (let i = 1; i <= pdf.numPages; i++) {
				const page = await pdf.getPage(i);
				const content = await page.getTextContent();
				text += content.items.map(item => item.str).join('\n') + '\n\n';
			}

			// Normalise and fix split unit codes across lines
			let normalized = text.toUpperCase().replace(/\r\n?/g, '\n');
			let changed = true;
			let pass = 0;
			let lines = normalized.split('\n');
			while (changed && pass < 10) {
				changed = false;
				for (let i = 0; i < lines.length - 1; i++) {
					const cur = lines[i].replace(/[^A-Z0-9]+$/, '');
					const nxt = lines[i + 1].replace(/^[^A-Z0-9]+/, '');
					const pm = cur.match(/([A-Z]{2,4}\d{0,4})$/);
					if (pm) {
						const dm = nxt.match(/^(\d{1,5})/);
						if (dm) {
							const full = pm[1] + dm[1];
							if (/^[A-Z]{2,4}\d{5}$/.test(full)) {
								lines[i] = cur.slice(0, -pm[1].length) + full;
								lines[i + 1] = nxt.slice(dm[1].length);
								changed = true;
								continue;
							}
						}
					}
					const lm = cur.match(/([A-Z]{2,4})$/);
					if (lm) {
						const dm = nxt.match(/^(\d{5})/);
						if (dm) {
							const full = lm[1] + dm[1];
							if (/^[A-Z]{2,4}\d{5}$/.test(full)) {
								lines[i] = cur.slice(0, -lm[1].length) + full;
								lines[i + 1] = nxt.slice(dm[1].length);
								changed = true;
							}
						}
					}
				}
				pass++;
			}
			normalized = lines.join('\n');
			normalized = normalized.replace(/([A-Z]{2,4})\s+(\d{5})/g, '$1$2');

			// Extract unique unit codes
			const codeMatches = [...normalized.matchAll(/([A-Z]{2,4}\d{5})/g)];
			const uniqueCodes = [...new Set(codeMatches.map(m => normalizeCode(m[1])))];

			if (uniqueCodes.length === 0) {
				setError('No unit codes detected in the PDF.');
				setStep(1);
				return;
			}

			setIsParsing(false);
			setIsMatching(true);

			// ── Match codes against DB ──
			const result = await UnitDB.FetchUnits({
				code: uniqueCodes.join(','),
				exact: true,
				return: ['ID', 'UnitCode', 'Name', 'Availability', 'CreditPoints'],
				order_by: [{ column: 'UnitCode', ascending: true }],
			});

			if (!result.success) throw new Error(result.message || 'DB fetch failed');

			const matched = result.data || [];
			setMatchedUnits(matched);

			// ── Assign unit types from color mapping ──
			// For each matched unit, find which color block in the PDF contains that code
			const types = {};
			for (const unit of matched) {
				const normCode = normalizeCode(unit.unit_code);
				// Find the color block whose text contains this unit code
				const block = extractedBlocks.find(b => {
					const m = b.text?.trim().match(/([A-Z]{2,4}\d{5})/i);
					return m ? normalizeCode(m[1]) === normCode : false;
				});
				if (block) {
					const hex = block.color.toLowerCase();
					types[unit.id] = mapping[hex] ?? 1; // fallback to Elective
				} else {
					types[unit.id] = 1;
				}
			}
			setSelectedTypes(types);

			const matchedSet = new Set(matched.map(u => normalizeCode(u.unit_code)));
			setMissingCodes(uniqueCodes.filter(c => !matchedSet.has(c)));

			setStep(3);
		} catch (err) {
			console.error(err);
			setError(`Parsing failed: ${err.message}`);
			setStep(1);
		} finally {
			setIsParsing(false);
			setIsMatching(false);
		}
	};

	// ── Step 3: save to DB ──
	const handleSave = async () => {
		if (!plannerName.trim()) { setError('Please enter a planner name.'); return; }
		if (matchedUnits.length === 0) { setError('No units to save.'); return; }

		setIsSaving(true);
		setError(null);
		setMessage(null);

		try {
			const unitsToSave = matchedUnits
				.filter(u => u.availability === 'published')
				.map(u => ({ unitId: u.id, unitTypeId: selectedTypes[u.id] || 1 }));

			const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/study-planner', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: plannerName.trim(), units: unitsToSave }),
			});
			const text = await res.text();
			const result = text ? JSON.parse(text) : {};
			if (!res.ok || !result.success) throw new Error(result.message || `Save failed (${res.status})`);

			setMessage(`✓ "${plannerName}" saved successfully with ${unitsToSave.length} units.`);
			setStep(4);
		} catch (err) {
			const msg = err.message || 'Unknown error';
			setError(msg.includes('already exists')
				? 'A planner with this name already exists. Please choose a different name.'
				: `Failed to save: ${msg}`);
		} finally {
			setIsSaving(false);
		}
	};

	const isLoading = isParsing || isMatching || isSaving;

	return (
		<div className="min-h-screen bg-gray-50">
			{/* ── Mapping modal ── */}
			{showModal && (
				<MappingModal
					pdfBlobUrl={pdfBlobUrl}
					colors={extractedColors}
					unitTypeOptions={unitTypeOptions}
					onConfirm={handleMappingConfirm}
					onCancel={() => { setShowModal(false); resetAll(); }}
					isParsing={isParsing || isMatching}
				/>
			)}

			<div className="max-w-4xl mx-auto px-6 py-8">
				{/* ── Header ── */}
				<div className="flex items-start justify-between mb-8">
					<div>
						<h1 className="text-2xl font-bold text-gray-900">Upload Study Planner</h1>
						<p className="text-sm text-gray-500 mt-1">
							Upload a PDF, map colours to unit types, then save to the database.
						</p>
					</div>
					<Link href="/view/dashboard" className="text-sm text-[#cc2131] hover:underline">
						← Back to dashboard
					</Link>
				</div>

				{/* ── Step indicator ── */}
				<div className="flex items-center mb-8 bg-white rounded-xl border border-gray-200 px-6 py-4">
					<Step n={1} label="Upload PDF"     active={step === 1} done={step > 1} />
					<StepDivider />
					<Step n={2} label="Map Colours"    active={step === 2} done={step > 2} />
					<StepDivider />
					<Step n={3} label="Review & Save"  active={step === 3} done={step > 3} />
					<StepDivider />
					<Step n={4} label="Done"           active={step === 4} done={step === 4} />
				</div>

				{/* ── Step 1: file upload ── */}
				<div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
					<label className="block mb-4">
						<span className="text-sm font-semibold text-gray-700 mb-2 block">Planner Name</span>
						<input
							type="text"
							value={plannerName}
							onChange={e => setPlannerName(e.target.value)}
							disabled={step === 4}
							placeholder="e.g. CS Software Development 2025"
							className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cc2131]/30 focus:border-[#cc2131] disabled:bg-gray-50 disabled:text-gray-400"
						/>
					</label>

					{/* PDF upload — NOT a <label> to prevent double-trigger */}
					<div className="block">
						<span className="text-sm font-semibold text-gray-700 mb-2 block">Planner PDF</span>
						{step <= 1 || step === 4 ? (
							<div
								className={`border-2 border-dashed rounded-xl p-8 text-center transition-all
									${step === 4 ? 'border-gray-200 bg-gray-50 cursor-not-allowed' :
									'border-gray-300 hover:border-[#cc2131] cursor-pointer'}`}
								onClick={() => step !== 4 && fileInputRef.current?.click()}
							>
								<svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
										d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
								</svg>
								<p className="text-sm text-gray-500">
									{step === 4 ? 'Upload complete' : 'Click to upload a PDF study planner'}
								</p>
							</div>
						) : (
							<div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
								<div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center flex-shrink-0">
									<svg className="w-4 h-4 text-[#cc2131]" fill="currentColor" viewBox="0 0 20 20">
										<path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/>
									</svg>
								</div>
								<span className="text-sm text-gray-700 flex-1 truncate">{fileName}</span>
								{!isLoading && (
									<button
										onClick={resetAll}
										className="text-xs text-gray-400 hover:text-red-500 transition-colors"
									>
										Remove
									</button>
								)}
							</div>
						)}
						<input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
					</div>
				</div>

				{/* ── Loading states ── */}
				{(isParsing || isMatching) && (
					<div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 flex items-center gap-4">
						<svg className="w-6 h-6 text-[#cc2131] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
							<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
						</svg>
						<div>
							<p className="text-sm font-medium text-gray-900">
								{isParsing ? 'Parsing PDF and extracting unit codes…' : 'Matching units in database…'}
							</p>
							<p className="text-xs text-gray-400 mt-0.5">This may take a few seconds</p>
						</div>
					</div>
				)}

				{/* ── Step 3: review table + save ── */}
				{step === 3 && matchedUnits.length > 0 && (
					<div className="space-y-4">
						<div className="bg-white rounded-xl border border-gray-200 p-6">
							<div className="flex items-center justify-between mb-4">
								<div>
									<h2 className="text-base font-bold text-gray-900">Review Matched Units</h2>
									<p className="text-sm text-gray-500 mt-0.5">
										{matchedUnits.filter(u => u.availability === 'published').length} units matched.
										Unit types were assigned from your colour mapping — adjust if needed.
									</p>
								</div>
								<div className="flex gap-2">
									{unitTypeOptions.map(t => (
										t.colour && (
											<div key={t.id} className="flex items-center gap-1.5">
												<div className="w-3 h-3 rounded-sm" style={{ backgroundColor: t.colour }} />
												<span className="text-xs text-gray-500">{t.name}</span>
											</div>
										)
									))}
								</div>
							</div>

							<UnitsTable
								units={matchedUnits}
								selectedUnitTypes={selectedTypes}
								unitTypeOptions={unitTypeOptions}
								onTypeChange={(id, typeId) => setSelectedTypes(prev => ({ ...prev, [id]: typeId }))}
							/>

							{missingCodes.length > 0 && (
								<div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
									<p className="text-xs font-semibold text-amber-700 mb-1">
										{missingCodes.length} code(s) not found in the database:
									</p>
									<div className="flex flex-wrap gap-1.5">
										{missingCodes.map(c => (
											<code key={c} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">{c}</code>
										))}
									</div>
								</div>
							)}
						</div>

						<div className="flex items-center justify-between">
							<button
								onClick={resetAll}
								className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all"
							>
								Start over
							</button>
							<button
								onClick={handleSave}
								disabled={isSaving || matchedUnits.filter(u => u.availability === 'published').length === 0}
								className="px-6 py-2.5 rounded-lg bg-[#cc2131] hover:bg-[#b01d2c] disabled:bg-gray-300 text-white text-sm font-semibold transition-all flex items-center gap-2"
							>
								{isSaving ? (
									<>
										<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
											<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
											<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
										</svg>
										Saving…
									</>
								) : (
									`Save to Study Planner (${matchedUnits.filter(u => u.availability === 'published').length} units)`
								)}
							</button>
						</div>
					</div>
				)}

				{/* ── Step 4: success ── */}
				{step === 4 && (
					<div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
						<div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
							<svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
						</div>
						<h3 className="text-lg font-bold text-gray-900 mb-1">Planner saved!</h3>
						<p className="text-sm text-gray-500 mb-6">{message}</p>
						<button
							onClick={resetAll}
							className="px-6 py-2.5 rounded-lg bg-[#cc2131] hover:bg-[#b01d2c] text-white text-sm font-semibold transition-all"
						>
							Upload another planner
						</button>
					</div>
				)}

				{/* ── Error / message banner ── */}
				{error && (
					<div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
						<svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						{error}
					</div>
				)}
			</div>
		</div>
	);
};

export default UploadPlannerPage;