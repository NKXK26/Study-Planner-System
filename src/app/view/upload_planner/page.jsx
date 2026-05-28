'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

// ─── constants ─────────────────────────────────────────────────────────────────
const DEFAULT_CREDIT_POINTS = '12.5';

const DEFAULT_UNIT_TYPES = [
  { id: -1, name: 'Core', colour: '#c5d9f0' },
  { id: -2, name: 'Elective', colour: '#d5e2bb' },
  { id: -3, name: 'Major', colour: '#fce9d9' },
];

// ─── helpers ───────────────────────────────────────────────────────────────────
const normalizeCode = (str) =>
  (str || '').replace(/[\s\u00A0\u2000-\u200F\u2028-\u202F]+/g, '').toUpperCase();

const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Step indicator ────────────────────────────────────────────────────────────
const Step = ({ n, label, active, done }) => (
  <div className="flex items-center gap-2">
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
      ${done ? 'bg-emerald-500 border-emerald-500 text-white' :
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

// ─── Inline colour picker for a unit type ─────────────────────────────────────
const UnitTypeColourPicker = ({ typeOpt, onChange }) => {
  const inputRef = useRef(null);
  return (
    <div className="relative group">
      <input
        ref={inputRef}
        type="color"
        value={typeOpt.colour || '#cccccc'}
        onChange={(e) => onChange(typeOpt.id, e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        title={`Change colour for ${typeOpt.name}`}
      />
      <div
        className="w-6 h-6 rounded-md border-2 border-white shadow-md cursor-pointer ring-1 ring-gray-200 transition-transform group-hover:scale-110"
        style={{ backgroundColor: typeOpt.colour || '#cccccc' }}
      />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5
                       bg-gray-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
        Change colour
      </span>
    </div>
  );
};

// ─── Unit type legend / colour manager ────────────────────────────────────────
const UnitTypeLegend = ({ unitTypeOptions, setUnitTypeOptions }) => {
  const updateColour = (id, colour) =>
    setUnitTypeOptions(prev => prev.map(opt => opt.id === id ? { ...opt, colour } : opt));

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {unitTypeOptions.map(opt => (
        <div
          key={opt.id}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white shadow-sm"
        >
          <UnitTypeColourPicker typeOpt={opt} onChange={updateColour} />
          <span className="text-xs font-medium text-gray-700">{opt.name}</span>
        </div>
      ))}
      <p className="text-[10px] text-gray-400 w-full mt-0.5">Click a swatch to change row colour</p>
    </div>
  );
};

// ─── Mapping modal ─────────────────────────────────────────────────────────────
const MappingModal = ({ pdfBlobUrl, colors, unitTypeOptions, setUnitTypeOptions, onConfirm, onCancel, isParsing }) => {
  const [localColors, setLocalColors] = useState(colors);
  const [newTypeName, setNewTypeName] = useState('');

  useEffect(() => setLocalColors(colors), [colors]);

  const handleChange = (idx, typeId) => {
    const pdfColour = localColors[idx].color;
    setLocalColors(prev => prev.map((c, i) =>
      i === idx ? { ...c, selectedTypeId: typeId } : c
    ));
    if (typeId !== null) {
      setUnitTypeOptions(prevOpts =>
        prevOpts.map(opt =>
          opt.id === typeId ? { ...opt, colour: pdfColour } : opt
        )
      );
    }
  };

  const addUnitType = () => {
    const name = newTypeName.trim();
    if (!name) return;
    if (unitTypeOptions.some(o => o.name.toLowerCase() === name.toLowerCase())) {
      alert('Unit type already exists'); return;
    }
    const newId = -(Math.abs(unitTypeOptions.length + 1000));
    setUnitTypeOptions(prev => [...prev, { id: newId, name, colour: '#cccccc' }]);
    setNewTypeName('');
  };

  const removeUnitType = (id) => {
    if (localColors.some(c => c.selectedTypeId === id)) {
      alert('Cannot remove – this type is already assigned to a colour.'); return;
    }
    setUnitTypeOptions(prev => prev.filter(o => o.id !== id));
  };

  const updateUnitTypeColour = (id, newColour) =>
    setUnitTypeOptions(prev => prev.map(o => o.id === id ? { ...o, colour: newColour } : o));

  const mappedCount = localColors.filter(c => c.selectedTypeId).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch">
      <div className="flex w-full h-full">
        {/* Left panel */}
        <div className="w-[420px] flex-shrink-0 bg-gray-50 flex flex-col border-r border-gray-200 shadow-2xl">
          <div className="px-6 py-5 border-b border-gray-200 bg-white">
            <h2 className="text-lg font-bold text-gray-900">Map Colours → Unit Types</h2>
            <p className="text-sm text-gray-500 mt-1">Add unit types, set their row colour, then map each PDF colour.</p>
          </div>

          <div className="px-5 pt-4 pb-3 border-b border-gray-200 bg-gray-50">
            <div className="flex gap-2 mb-3">
              <input
                type="text" value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g. Data Science Major"
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#cc2131]/30"
                onKeyPress={(e) => e.key === 'Enter' && addUnitType()}
              />
              <button onClick={addUnitType}
                className="px-3 py-1.5 rounded-lg bg-[#cc2131] text-white text-sm hover:bg-[#b01d2c]">
                Add
              </button>
            </div>
            {unitTypeOptions.length === 0
              ? <p className="text-xs text-gray-400 italic">No unit types yet. Add one above.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {unitTypeOptions.map(opt => (
                    <div key={opt.id}
                      className="flex items-center gap-1.5 bg-white rounded-full border border-gray-200 px-2.5 py-1 text-sm">
                      <div className="relative">
                        <input
                          type="color"
                          value={opt.colour || '#cccccc'}
                          onChange={(e) => updateUnitTypeColour(opt.id, e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          title="Change colour"
                        />
                        <div
                          className="w-4 h-4 rounded-full border border-gray-300 shadow-sm"
                          style={{ backgroundColor: opt.colour || '#cccccc' }}
                        />
                      </div>
                      <span className="text-gray-700">{opt.name}</span>
                      <button onClick={() => removeUnitType(opt.id)}
                        className="ml-0.5 text-gray-400 hover:text-red-500 text-xs">×</button>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {localColors.length === 0
              ? <p className="text-sm text-gray-400 text-center py-8">No colours detected in the PDF.</p>
              : localColors.map((item, idx) => (
                <div key={item.color} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-all">
                  <div className="w-10 h-10 rounded-lg border border-gray-200 flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: item.color }} />
                  <div className="flex-1 min-w-0">
                    <code className="text-xs font-mono text-gray-500">{item.color}</code>
                    {item.sampleText && <p className="text-xs text-gray-400 truncate mt-0.5">{item.sampleText}</p>}
                  </div>
                  <select
                    value={item.selectedTypeId || ''}
                    onChange={(e) => handleChange(idx, e.target.value ? parseInt(e.target.value) : null)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700
                               focus:outline-none focus:ring-2 focus:ring-[#cc2131]/30 focus:border-[#cc2131]"
                  >
                    <option value="">— ignore —</option>
                    {unitTypeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              ))
            }
          </div>

          <div className="px-5 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3">
            <button onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-all">
              Cancel
            </button>
            <button
              onClick={() => onConfirm(localColors)}
              disabled={mappedCount === 0 || isParsing || unitTypeOptions.length === 0}
              className="flex-1 px-4 py-2 rounded-lg bg-[#cc2131] hover:bg-[#b01d2c] disabled:bg-gray-300
                         text-white text-sm font-semibold transition-all flex items-center justify-center gap-2"
            >
              {isParsing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Parsing…
                </>
              ) : (
                <>Apply Mapping &amp; Extract ({mappedCount} mapped)</>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 bg-gray-900 flex flex-col">
          <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">PDF Preview</span>
            <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors p-1 rounded">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 p-4">
            {pdfBlobUrl
              ? <iframe src={`${pdfBlobUrl}#toolbar=0&navpanes=0`}
                className="w-full h-full rounded-lg border border-gray-700"
                title="PDF preview" />
              : <div className="flex items-center justify-center h-full text-gray-500 text-sm">PDF preview unavailable</div>
            }
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Editable units table ──────────────────────────────────────────────────────
const EditableUnitsTable = ({ units, setUnits, unitTypeOptions }) => {
  const getTypeColor = (typeId) =>
    unitTypeOptions.find(t => t.id === typeId)?.colour || '#f9fafb';

  const updateUnit = (rowUid, field, value) =>
    setUnits(prev => prev.map(u => u._uid === rowUid ? { ...u, [field]: value } : u));

  const removeUnit = (rowUid) => {
    if (window.confirm('Remove this unit from the planner?')) {
      setUnits(prev => prev.filter(u => u._uid !== rowUid));
    }
  };

  const addRow = () =>
    setUnits(prev => [...prev, {
      _uid: uid(),
      unit_code: '',
      name: '',
      credit_points: DEFAULT_CREDIT_POINTS,
      unit_type_id: unitTypeOptions[0]?.id ?? null,
      _manual: true,
    }]);

  const sorted = useMemo(() => {
    return [...units].sort((a, b) => {
      const nameA = unitTypeOptions.find(t => t.id === a.unit_type_id)?.name || '';
      const nameB = unitTypeOptions.find(t => t.id === b.unit_type_id)?.name || '';
      const aCore = nameA.toLowerCase() === 'core';
      const bCore = nameB.toLowerCase() === 'core';
      if (aCore && !bCore) return -1;
      if (!aCore && bCore) return 1;
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return (a.unit_code || '').localeCompare(b.unit_code || '');
    });
  }, [units, unitTypeOptions]);

  const inputCls = "w-full border-0 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-[#cc2131]/40 rounded px-1 py-0.5";

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '115px' }} />
          <col />
          <col style={{ width: '72px' }} />
          <col style={{ width: '150px' }} />
          <col style={{ width: '52px' }} />
        </colgroup>
        <thead className="bg-gray-50">
          <tr>
            {['Code', 'Name', 'Credits', 'Unit Type', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map(unit => (
            <tr key={unit._uid}
              style={{ backgroundColor: getTypeColor(unit.unit_type_id) }}
              className="transition-colors">
              <td className="px-3 py-2">
                <input
                  value={unit.unit_code}
                  onChange={(e) => updateUnit(unit._uid, 'unit_code', e.target.value.toUpperCase())}
                  className={`${inputCls} font-mono font-semibold text-gray-900`}
                  placeholder="ABCD1234"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  value={unit.name}
                  onChange={(e) => updateUnit(unit._uid, 'name', e.target.value)}
                  className={`${inputCls} text-gray-700`}
                  placeholder="Unit name"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  value={unit.credit_points}
                  onChange={(e) => updateUnit(unit._uid, 'credit_points', e.target.value)}
                  className={`${inputCls} text-gray-600 text-center`}
                  placeholder="12.5"
                  type="number" min="0" step="0.5"
                />
              </td>
              <td className="px-3 py-2">
                <select
                  value={unit.unit_type_id || ''}
                  onChange={(e) => updateUnit(unit._uid, 'unit_type_id', parseInt(e.target.value, 10))}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white
                             focus:outline-none focus:ring-2 focus:ring-[#cc2131]/30 focus:border-[#cc2131]"
                >
                  {unitTypeOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-2 text-center">
                <button onClick={() => removeUnit(unit._uid)}
                  className="text-gray-400 hover:text-red-600 transition-colors text-xl leading-none font-bold"
                  title="Remove unit">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <button onClick={addRow}
          className="text-sm text-[#cc2131] hover:text-[#b01d2c] font-medium flex items-center gap-1">
          <span className="text-lg leading-none">+</span> Add unit manually
        </button>
      </div>
    </div>
  );
};

// ─── Regex extraction (no AI) ─────────────────────────────────────────────────
function extractUnitsWithRegex(rawText, onProgress) {
  onProgress?.('Extracting units using pattern matching…');
  let text = rawText.replace(/([A-Z]{2,4})\s+(\d{4,5})/gi, '$1$2');
  text = text.replace(/\b([A-Z]{2,4})\s+(\d{2,3})\s+(\d{2})\b/gi, '$1$2$3');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const units = [];
  const seenCodes = new Set();
  const codePattern = /\b([A-Z]{2,4}\d{4,5})\b/i;
  const skipPatterns = [/^(mpu|bahasa|service learning|last updated|swinburne|page \d+)/i];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipPatterns.some(p => p.test(line))) continue;
    let codeMatch = line.match(codePattern);
    if (!codeMatch) continue;
    const code = normalizeCode(codeMatch[1]);
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);
    let name = line.replace(codeMatch[0], '').replace(/\[[A-Z]+\]/g, '').trim();
    if (name.length < 5 || /^(NIL|CO-REQUISITE|PRE-REQUISITE|SEMESTER)/i.test(name)) {
      let nextLines = [];
      let j = i + 1;
      while (j < lines.length && nextLines.length < 4) {
        const nl = lines[j];
        if (codePattern.test(nl)) break;
        if (skipPatterns.some(p => p.test(nl))) break;
        if (nl.length > 3) nextLines.push(nl);
        j++;
      }
      if (nextLines.length > 0) name = nextLines.join(' ').replace(/\[[A-Z]+\]/g, '').trim();
    }
    name = name.replace(/^[:\-\s]+/, '').replace(/\s+(NIL|Co-requisite|Pre-requisite).*$/i, '').trim();
    units.push({
      _uid: uid(),
      unit_code: code,
      name: name || '',
      credit_points: DEFAULT_CREDIT_POINTS,
      unit_type_id: null,
    });
  }
  return units;
}

// ─── Main page component ───────────────────────────────────────────────────────
const UploadPlannerPage = () => {
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const [plannerName, setPlannerName] = useState('');
  const [unitTypeOptions, setUnitTypeOptions] = useState([...DEFAULT_UNIT_TYPES]);
  const [showModal, setShowModal] = useState(false);
  const [extractedColors, setExtractedColors] = useState([]);
  const [extractedBlocks, setExtractedBlocks] = useState([]);
  const [rawPdfText, setRawPdfText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState('');
  const [editableUnits, setEditableUnits] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1);
  const fileInputRef = useRef(null);

  useEffect(() => () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); }, [pdfBlobUrl]);
  useEffect(() => {
    if (pdfFile) {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(URL.createObjectURL(pdfFile));
    } else {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
  }, [pdfFile]);

  const resetAll = useCallback(() => {
    setPdfFile(null);
    setFileName('');
    setPlannerName('');
    setExtractedColors([]);
    setExtractedBlocks([]);
    setRawPdfText('');
    setEditableUnits([]);
    setUnitTypeOptions([...DEFAULT_UNIT_TYPES]);
    setMessage(null);
    setError(null);
    setStep(1);
    setExtractProgress('');
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    resetAll();
    setPdfFile(file);
    setFileName(file.name);
    setPlannerName(file.name.replace(/\.pdf$/i, '').trim());
    setStep(2);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/pdf-debug', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Failed to extract colours');
      const blocks = await res.json();
      setExtractedBlocks(blocks);
      const colorMap = new Map();
      for (const block of blocks) {
        const color = block.color.toLowerCase();
        if (!colorMap.has(color) && block.text?.trim()) colorMap.set(color, block.text.trim());
      }
      setExtractedColors(Array.from(colorMap.entries()).map(([color, sampleText]) => ({ color, sampleText, selectedTypeId: null })));
      setShowModal(true);
    } catch (err) {
      setError(`Failed to extract colours from PDF: ${err.message}`);
      setStep(1);
    }
  };

  // Helper to enrich units with database information (name, credit points)
  async function enrichUnitsWithDatabase(units) {
    try {
      const unitsRes = await SecureFrontendAuthHelper.authenticatedFetch('/api/units');
      if (!unitsRes.ok) throw new Error('Failed to fetch units from database');
      const unitsData = await unitsRes.json();
      const allUnits = unitsData.data || unitsData;
      const dbMap = new Map();
      for (const u of allUnits) {
        dbMap.set(u.UnitCode.toUpperCase(), {
          name: u.Name,
          creditPoints: u.CreditPoints,
          unitTypeId: u.unitTypeId,
        });
      }
      return units.map(unit => {
        const dbUnit = dbMap.get(unit.unit_code.toUpperCase());
        if (dbUnit) {
          return {
            ...unit,
            name: dbUnit.name || unit.name,
            credit_points: dbUnit.creditPoints?.toString() || unit.credit_points,
          };
        }
        return unit;
      });
    } catch (err) {
      console.warn('Could not enrich units from DB:', err);
      return units;
    }
  }

  const handleMappingConfirm = async (mappedColors) => {
    const colorMapping = {};
    for (const c of mappedColors) if (c.selectedTypeId) colorMapping[c.color.toLowerCase()] = c.selectedTypeId;
    setShowModal(false);
    setIsExtracting(true);
    setError(null);
    setExtractProgress('Extracting text from PDF…');
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), disableWorker: true }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str || '').join('\n');
        fullText += pageText + '\n\n--- page break ---\n\n';
      }
      let normalized = fullText.replace(/\r\n?/g, '\n');
      normalized = normalized.replace(/([A-Z]{2,4})\s+(\d{4,5})/gi, '$1$2');
      setRawPdfText(normalized);

      setExtractProgress('Extracting unit codes and names…');
      let extracted = extractUnitsWithRegex(normalized, (msg) => setExtractProgress(msg));

      setExtractProgress('Matching with database…');
      extracted = await enrichUnitsWithDatabase(extracted);

      const resolvedUnits = extracted.map(unit => {
        let typeId = null;
        const block = extractedBlocks.find(b => {
          const match = b.text?.match(/([A-Z]{2,4}\d{4,5})/i);
          return match ? normalizeCode(match[1]) === unit.unit_code : false;
        });
        if (block) typeId = colorMapping[block.color.toLowerCase()] ?? null;
        if (!typeId && unitTypeOptions.length > 0) typeId = unitTypeOptions[0].id;
        return { ...unit, unit_type_id: typeId };
      });

      setEditableUnits(resolvedUnits);
      setStep(3);
    } catch (err) {
      console.error(err);
      setError(`Extraction failed: ${err.message}`);
      setStep(1);
    } finally {
      setIsExtracting(false);
      setExtractProgress('');
    }
  };

  async function createUnitTypeInDB(name, colour) {
    const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/unit_type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, colour }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(`Failed to create unit type "${name}": ${data.message || 'Unknown error'}`);
    }
    return data.data.id;
  }

  const handleSave = async () => {
    if (!plannerName.trim()) {
      setError('Please enter a planner name.');
      return;
    }

    const validUnits = editableUnits.filter(u => u.unit_code?.trim());
    if (validUnits.length === 0) {
      setError('No units to save.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const typesRes = await SecureFrontendAuthHelper.authenticatedFetch('/api/unit_type');
      const typesData = await typesRes.json();
      if (!typesData.success) throw new Error('Could not fetch unit types');
      const existingTypes = typesData.data.map(t => ({
        id: t.id,
        name: t.name.toLowerCase(),
        colour: t.colour,
      }));

      const localTypes = unitTypeOptions;
      const typeNameToRealId = new Map();

      for (const localType of localTypes) {
        const existing = existingTypes.find(et => et.name === localType.name.toLowerCase());
        if (existing) {
          typeNameToRealId.set(localType.name, existing.id);
        } else {
          const newId = await createUnitTypeInDB(localType.name, localType.colour);
          typeNameToRealId.set(localType.name, newId);
        }
      }

      const unitsToSave = validUnits.map(u => {
        const localType = unitTypeOptions.find(opt => opt.id === u.unit_type_id);
        if (!localType) {
          throw new Error(`Unit type not found for unit ${u.unit_code}`);
        }
        return {
          unitCode: u.unit_code.trim(),
          name: u.name?.trim() || '',
          creditPoints: u.credit_points ? Number(u.credit_points) : 12.5,
          unitTypeName: localType.name,
        };
      });

      const saveRes = await SecureFrontendAuthHelper.authenticatedFetch('/api/study-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: plannerName.trim(),
          units: unitsToSave,
        }),
      });

      const saveResult = await saveRes.json();
      if (!saveRes.ok || !saveResult.success) {
        throw new Error(saveResult.message || `Save failed (${saveRes.status})`);
      }

      setMessage(`✓ "${plannerName}" saved successfully with ${unitsToSave.length} units.`);
      setStep(4);
    } catch (err) {
      const msg = err.message || 'Unknown error';
      if (msg.includes('already exists')) {
        setError('A planner with this name already exists. Please choose a different name.');
      } else {
        setError(`Failed to save: ${msg}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = isExtracting || isSaving;

  // ── Step 3: full-screen two-column layout ──────────────────────────────────
  if (step === 3) {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {showModal && (
          <MappingModal
            pdfBlobUrl={pdfBlobUrl}
            colors={extractedColors}
            unitTypeOptions={unitTypeOptions}
            setUnitTypeOptions={setUnitTypeOptions}
            onConfirm={handleMappingConfirm}
            onCancel={() => { setShowModal(false); resetAll(); }}
            isParsing={isExtracting}
          />
        )}

        <div className="w-1/2 flex-shrink-0 flex flex-col bg-gray-50 border-r border-gray-200 overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-base font-bold text-gray-900">Review Extracted Units</h1>
              <Link href="/view/dashboard" className="text-xs text-[#cc2131] hover:underline">← Dashboard</Link>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {editableUnits.length} unit{editableUnits.length !== 1 ? 's' : ''} found. Click any cell to edit.
            </p>
            <div className="flex items-center gap-2">
              <Step n={1} label="Upload" active={false} done={true} />
              <StepDivider />
              <Step n={2} label="Map" active={false} done={true} />
              <StepDivider />
              <Step n={3} label="Review" active={true} done={false} />
              <StepDivider />
              <Step n={4} label="Done" active={false} done={false} />
            </div>
          </div>

          <div className="px-6 pt-4 pb-2">
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Planner Name</span>
              <input
                type="text" value={plannerName}
                onChange={e => setPlannerName(e.target.value)}
                placeholder="e.g. CS Software Development 2025"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cc2131]/30 focus:border-[#cc2131]"
              />
            </label>
          </div>

          <div className="px-6 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Unit Type Colours</p>
            <div className="flex flex-wrap gap-2">
              {unitTypeOptions.map(opt => (
                <label
                  key={opt.id}
                  className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white shadow-sm cursor-pointer hover:border-gray-300 transition-all group"
                >
                  <div className="relative flex-shrink-0">
                    <input
                      type="color"
                      value={opt.colour || '#cccccc'}
                      onChange={(e) =>
                        setUnitTypeOptions(prev =>
                          prev.map(o => o.id === opt.id ? { ...o, colour: e.target.value } : o)
                        )
                      }
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div
                      className="w-5 h-5 rounded-md border border-gray-300 shadow-inner transition-transform group-hover:scale-110"
                      style={{ backgroundColor: opt.colour || '#cccccc' }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700 select-none">{opt.name}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">Click the coloured square to change a type's row colour — table updates instantly.</p>
          </div>

          <div className="px-6 py-4 flex-1">
            <EditableUnitsTable
              units={editableUnits}
              setUnits={setEditableUnits}
              unitTypeOptions={unitTypeOptions}
            />
            {editableUnits.length === 0 && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs font-semibold text-amber-700">No units extracted. Add them manually above.</p>
              </div>
            )}
          </div>

          {rawPdfText && (
            <div className="px-6 pb-4">
              <details>
                <summary className="text-xs font-medium text-gray-500 cursor-pointer">🔍 Debug: raw text ({rawPdfText.length} chars)</summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-64 whitespace-pre-wrap font-mono">{rawPdfText}</pre>
              </details>
            </div>
          )}

          {error && (
            <div className="mx-6 mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center gap-3">
            <button onClick={resetAll}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all">
              Start over
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || editableUnits.filter(u => u.unit_code?.trim()).length === 0}
              className="flex-1 px-6 py-2.5 rounded-lg bg-[#cc2131] hover:bg-[#b01d2c] disabled:bg-gray-300
                         text-white text-sm font-semibold transition-all flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </>
              ) : (
                `Save Planner (${editableUnits.filter(u => u.unit_code?.trim()).length} units)`
              )}
            </button>
          </div>
        </div>

        <div className="w-1/2 flex flex-col bg-gray-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700 flex-shrink-0 flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-200">PDF Preview</span>
            <span className="text-xs text-gray-500 truncate">{fileName}</span>
          </div>
          <div className="flex-1 overflow-hidden p-3">
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
    );
  }

  // ── Steps 1, 2, 4: centred single-column layout ───────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {showModal && (
        <MappingModal
          pdfBlobUrl={pdfBlobUrl}
          colors={extractedColors}
          unitTypeOptions={unitTypeOptions}
          setUnitTypeOptions={setUnitTypeOptions}
          onConfirm={handleMappingConfirm}
          onCancel={() => { setShowModal(false); resetAll(); }}
          isParsing={isExtracting}
        />
      )}

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Upload Study Planner</h1>
            <p className="text-sm text-gray-500 mt-1">Upload a PDF — the AI reads it directly to extract all units. Every result is editable.</p>
          </div>
          <Link href="/view/dashboard" className="text-sm text-[#cc2131] hover:underline">← Back to dashboard</Link>
        </div>

        <div className="flex items-center mb-8 bg-white rounded-xl border border-gray-200 px-6 py-4">
          <Step n={1} label="Upload PDF" active={step === 1} done={step > 1} />
          <StepDivider />
          <Step n={2} label="Map Colours" active={step === 2} done={step > 2} />
          <StepDivider />
          <Step n={3} label="Review & Edit" active={step === 3} done={step > 3} />
          <StepDivider />
          <Step n={4} label="Done" active={step === 4} done={step === 4} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <label className="block mb-4">
            <span className="text-sm font-semibold text-gray-700 mb-2 block">Planner Name</span>
            <input type="text" value={plannerName} onChange={e => setPlannerName(e.target.value)} disabled={step === 4}
              placeholder="e.g. CS Software Development 2025"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#cc2131]/30 focus:border-[#cc2131] disabled:bg-gray-50 disabled:text-gray-400" />
          </label>
          <div>
            <span className="text-sm font-semibold text-gray-700 mb-2 block">Planner PDF</span>
            {step <= 1 || step === 4 ? (
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${step === 4 ? 'border-gray-200 bg-gray-50 cursor-not-allowed' : 'border-gray-300 hover:border-[#cc2131] cursor-pointer'}`}
                onClick={() => step !== 4 && fileInputRef.current?.click()}
              >
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-gray-500">{step === 4 ? 'Upload complete' : 'Click to upload a PDF study planner'}</p>
                {step !== 4 && <p className="text-xs text-gray-400 mt-1">Units are extracted using pattern matching and enriched from the database.</p>}
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
                <div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#cc2131]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-sm text-gray-700 flex-1 truncate">{fileName}</span>
                {!isLoading && <button onClick={resetAll} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
          </div>
        </div>

        {isExtracting && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-4">
              <svg className="w-6 h-6 text-[#cc2131] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">Extracting units…</p>
                <p className="text-xs text-gray-400 mt-0.5">{extractProgress || 'Working…'}</p>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Planner saved!</h3>
            <p className="text-sm text-gray-500 mb-6">{message}</p>
            <button onClick={resetAll} className="px-6 py-2.5 rounded-lg bg-[#cc2131] hover:bg-[#b01d2c] text-white text-sm font-semibold transition-all">
              Upload another planner
            </button>
          </div>
        )}

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