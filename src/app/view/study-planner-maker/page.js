'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { DocumentDuplicateIcon, PlusIcon, XMarkIcon, CheckCircleIcon, ArrowPathIcon, ArrowRightIcon, MagnifyingGlassIcon, Bars3Icon } from '@heroicons/react/24/outline';

const BRAND_RED = '#dc2d27';
const makeSection = (year = 1, semester = 'Semester 1', dates = 'February – June') => ({
  id: `section-${Date.now()}-${Math.random().toString(36).slice(2)}`, year, semester, dates,
});

export default function StudyPlannerMakerPage() {
  const { can, isSuperadmin } = useRole();
  const hasAccess = isSuperadmin() || can('planner', 'read') || can('course', 'read');
  const [planners, setPlanners] = useState([]);
  const [unitCatalog, setUnitCatalog] = useState([]);
  const [unitTypes, setUnitTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sourceId, setSourceId] = useState('');
  const [creationMode, setCreationMode] = useState('copy');
  const [name, setName] = useState('');
  const [sections, setSections] = useState([makeSection()]);
  const [draftUnits, setDraftUnits] = useState([]);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [unitSearch, setUnitSearch] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const defaultType = unitTypes[0] || null;
  const typeColour = (typeId) => unitTypes.find((type) => type.id === typeId)?.colour || '#9ca3af';

  const loadAll = async () => {
    setLoading(true); setError(null);
    try {
      const [plannerRes, unitRes, typeRes] = await Promise.all([
        SecureFrontendAuthHelper.authenticatedFetch('/api/study-planner'),
        SecureFrontendAuthHelper.authenticatedFetch('/api/unit?availability=published'),
        SecureFrontendAuthHelper.authenticatedFetch('/api/unit_type'),
      ]);
      const [plannerData, unitData, typeData] = await Promise.all([plannerRes.json(), unitRes.json(), typeRes.json()]);
      if (!plannerRes.ok || !plannerData.success) throw new Error(plannerData.message || 'Failed to load study planners');
      setPlanners(plannerData.data || []);
      setUnitCatalog((unitData.data || []).map((unit) => ({ id: unit.ID, code: unit.UnitCode, name: unit.Name, creditPoints: unit.CreditPoints || 0 })));
      setUnitTypes(typeData.data || []);
    } catch (err) { setError(err.message || 'Failed to load data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (hasAccess) loadAll(); }, [hasAccess]);

  const resetDraft = () => { setSourceId(''); setName(''); setSections([makeSection()]); setDraftUnits([]); setResult(null); setError(null); };
  const handleStartFromScratch = () => { setCreationMode('scratch'); resetDraft(); };
  const handleCopyMode = () => { setCreationMode('copy'); resetDraft(); };

  const handlePickSource = (event) => {
    const id = event.target.value;
    setSourceId(id); setResult(null); setError(null);
    const planner = planners.find((item) => String(item.id) === String(id));
    if (!planner) { setDraftUnits([]); setName(''); return; }
    const sectionMap = new Map();
    const copiedUnits = (planner.units || []).map((unit, index) => {
      const year = unit.plannedYear || 1;
      const semester = unit.plannedSemester || 'Semester 1';
      const dates = unit.plannedDates || 'February – June';
      const sectionKey = `${year}-${semester}-${dates}`;
      if (!sectionMap.has(sectionKey)) sectionMap.set(sectionKey, makeSection(year, semester, dates));
      return {
        id: `draft-${unit.ID}-${index}`, unitCode: unit.UnitCode, unitName: unit.Name, creditPoints: unit.CreditPoints || 0,
        unitTypeId: unit.unitTypeId ?? defaultType?.id ?? null, unitTypeName: unit.unitType?.Name ?? defaultType?.name ?? '',
        sectionId: sectionMap.get(sectionKey).id,
      };
    });
    setSections(sectionMap.size ? [...sectionMap.values()] : [makeSection()]);
    setDraftUnits(copiedUnits); setName(`${planner.name} (Copy)`);
  };

  const addSection = () => {
    const last = sections[sections.length - 1];
    setSections((previous) => [...previous, makeSection(last?.year || 1, 'Semester 2', 'August – November')]);
  };
  const updateSection = (sectionId, field, value) => setSections((previous) => previous.map((section) => (
    section.id === sectionId ? { ...section, [field]: field === 'year' ? Math.max(1, Number(value) || 1) : value } : section
  )));
  const removeSection = (sectionId) => {
    if (sections.length === 1) return;
    if (draftUnits.some((unit) => unit.sectionId === sectionId)) { setError('Move or remove the units in this section before removing it.'); return; }
    setSections((previous) => previous.filter((section) => section.id !== sectionId));
  };
  const addCatalogUnit = (unit, sectionId = selectedSectionId || sections[0]?.id) => {
    if (!sectionId || draftUnits.some((item) => item.unitCode === unit.code)) return;
    setDraftUnits((previous) => [...previous, {
      id: `draft-${unit.id}-${Date.now()}`, unitCode: unit.code, unitName: unit.name, creditPoints: unit.creditPoints,
      unitTypeId: defaultType?.id ?? null, unitTypeName: defaultType?.name ?? '', sectionId,
    }]);
  };
  const moveUnit = (unitId, sectionId) => setDraftUnits((previous) => previous.map((unit) => unit.id === unitId ? { ...unit, sectionId } : unit));
  const setUnitType = (unitId, typeId) => {
    const type = unitTypes.find((item) => item.id === typeId);
    setDraftUnits((previous) => previous.map((unit) => unit.id === unitId ? { ...unit, unitTypeId: typeId, unitTypeName: type?.name || '' } : unit));
  };
  const removeUnit = (unitId) => setDraftUnits((previous) => previous.filter((unit) => unit.id !== unitId));
  const openPicker = (sectionId) => { setSelectedSectionId(sectionId || sections[0]?.id || ''); setUnitSearch(''); setShowUnitPicker(true); };
  const handleDrop = (event, sectionId) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/study-planner-unit');
    if (!raw) return;
    try {
      const item = JSON.parse(raw);
      if (item.kind === 'catalog') addCatalogUnit(item.unit, sectionId);
      if (item.kind === 'draft') moveUnit(item.unitId, sectionId);
    } catch { setError('Unable to move that unit. Please try again.'); }
  };

  const availableUnits = useMemo(() => {
    const term = unitSearch.trim().toLowerCase();
    return unitCatalog.filter((unit) => !draftUnits.some((item) => item.unitCode === unit.code))
      .filter((unit) => !term || unit.code.toLowerCase().includes(term) || unit.name.toLowerCase().includes(term));
  }, [unitCatalog, draftUnits, unitSearch]);
  const totalCredits = draftUnits.reduce((sum, unit) => sum + (Number(unit.creditPoints) || 0), 0);
  const typeTotals = unitTypes.map((type) => ({ ...type, count: draftUnits.filter((unit) => unit.unitTypeId === type.id).length })).filter((type) => type.count > 0);

  const handleSave = async () => {
    if (!name.trim()) { setError('Please enter a name for the new study planner.'); return; }
    if (!draftUnits.length) { setError('Add at least one unit before saving.'); return; }
    setSaving(true); setError(null); setResult(null);
    try {
      const units = draftUnits.map((unit, index) => {
        const section = sections.find((item) => item.id === unit.sectionId);
        return { unitCode: unit.unitCode, unitTypeName: unit.unitTypeName, creditPoints: unit.creditPoints, name: unit.unitName,
          plannedYear: section?.year ?? 1, plannedSemester: section?.semester ?? 'Semester 1', plannedDates: section?.dates ?? '', sortOrder: index };
      });
      const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/study-planner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), units }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Failed to save the study planner');
      const savedPlanner = { name: name.trim(), unitCount: draftUnits.length };
      resetDraft();
      setResult(savedPlanner);
      await loadAll();
    } catch (err) { setError(err.message || 'Failed to save the study planner'); }
    finally { setSaving(false); }
  };

  const cardBase = 'card-bg p-5 rounded-theme shadow-theme border border-gray-200';
  const UnitCard = ({ unit }) => (
    <div draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/study-planner-unit', JSON.stringify({ kind: 'draft', unitId: unit.id })); }}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm cursor-grab active:cursor-grabbing">
      <Bars3Icon className="h-4 w-4 text-gray-400" title="Drag to another study period" />
      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: typeColour(unit.unitTypeId) }} />
      <div className="min-w-[150px] flex-1"><p className="font-mono text-sm font-semibold text-gray-800">{unit.unitCode}</p><p className="text-xs text-gray-500">{unit.unitName}</p></div>
      <span className="text-xs text-gray-500">{unit.creditPoints} CP</span>
      <select value={unit.unitTypeId ?? ''} onChange={(event) => setUnitType(unit.id, event.target.value ? Number(event.target.value) : null)}
        className="rounded-md border border-gray-300 bg-white p-1.5 text-xs" aria-label={`Unit type for ${unit.unitCode}`}>
        <option value="">Type</option>{unitTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select>
      <button onClick={() => removeUnit(unit.id)} className="p-1 text-gray-400 hover:text-red-600" title="Remove unit"><XMarkIcon className="h-4 w-4" /></button>
    </div>
  );

  return (
    <ConditionalRequireAuth>
      {!hasAccess ? <AccessDenied requiredPermission="planner:read or course:read or system:superadmin" resourceName="study planner maker" /> : (
        <PageLoadingWrapper requiredPermission={{ resource: 'dashboard', action: 'access' }} resourceName="study planner maker" isLoading={false}>
          <div className="page-bg min-h-screen p-6"><div className="mx-auto max-w-6xl">
            <div className="mb-8 flex items-start gap-3"><div className="rounded-lg p-2" style={{ backgroundColor: BRAND_RED + '0d' }}><DocumentDuplicateIcon className="h-7 w-7" style={{ color: BRAND_RED }} /></div>
              <div><h1 className="title-text text-3xl font-bold">Study Planner Maker</h1><p className="text-muted mt-1 text-sm">Build a study plan by year and semester, then drag units into each study period.</p></div></div>
            {loading ? <div className={cardBase + ' text-center'}><ArrowPathIcon className="mx-auto h-8 w-8 animate-spin" style={{ color: BRAND_RED }} /></div> : <>
              {error && <div className="mb-6 rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700"><strong>Error:</strong> {error}</div>}
              {result && <div className="mb-6 rounded-theme border border-green-300 bg-green-50 p-6"><div className="flex gap-3"><CheckCircleIcon className="h-6 w-6 text-green-600" /><div><h2 className="font-semibold text-green-800">Study planner created</h2><p className="mt-1 text-sm text-green-700">&quot;{result.name}&quot; was saved with {result.unitCount} unit(s).</p><Link href="/view/study-planner" className="mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-white" style={{ backgroundColor: BRAND_RED }}>Go to Study Planner Management <ArrowRightIcon className="h-4 w-4" /></Link></div></div></div>}
              <div className={cardBase + ' mb-6'}><h2 className="heading-text mb-3 font-semibold">1. Choose how to create the planner</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button onClick={handleStartFromScratch} className={`rounded-lg border p-4 text-left ${creationMode === 'scratch' ? 'border-red-500 bg-red-50 ring-1 ring-red-500' : 'border-gray-300 bg-white'}`}><span className="block font-semibold">Start from scratch</span><span className="mt-1 block text-sm text-gray-500">Create your own years, semesters, and unit sequence.</span></button>
                <button onClick={handleCopyMode} className={`rounded-lg border p-4 text-left ${creationMode === 'copy' ? 'border-red-500 bg-red-50 ring-1 ring-red-500' : 'border-gray-300 bg-white'}`}><span className="block font-semibold">Copy an existing planner</span><span className="mt-1 block text-sm text-gray-500">Use an existing planner as a starting point.</span></button>
              </div>{creationMode === 'copy' && <select value={sourceId} onChange={handlePickSource} className="input-field mt-4 w-full rounded-md border border-gray-300 bg-white p-2"><option value="">Select a study planner to copy</option>{planners.map((planner) => <option key={planner.id} value={planner.id}>{planner.name} ({planner.units?.length || 0} units)</option>)}</select>}</div>
              {(creationMode === 'scratch' || sourceId) && <><div className={cardBase + ' mb-6'}><label className="label-text mb-1 block text-sm">New planner name</label><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Bachelor of Computer Science 2026" className="input-field w-full rounded-md border border-gray-300 bg-white p-2" /></div>
                <div className={`mb-6 grid grid-cols-1 gap-6 ${showUnitPicker ? 'xl:grid-cols-[320px_minmax(0,1fr)_280px]' : 'xl:grid-cols-[minmax(0,1fr)_280px]'}`}>
                  {showUnitPicker && <aside className={cardBase + ' h-fit xl:sticky xl:top-6'}><div className="mb-3 flex items-start justify-between gap-2"><div><h2 className="heading-text font-semibold">Unit library</h2><p className="mt-1 text-xs text-gray-500">Drag a unit directly into a study period.</p></div><button onClick={() => setShowUnitPicker(false)} className="p-1 text-gray-500 hover:text-red-600" title="Close unit library"><XMarkIcon className="h-5 w-5" /></button></div><label className="relative mb-3 block"><MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" /><input autoFocus value={unitSearch} onChange={(event) => setUnitSearch(event.target.value)} placeholder="Search units" className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 text-sm" /></label><div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">{availableUnits.map((unit) => <div key={unit.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/study-planner-unit', JSON.stringify({ kind: 'catalog', unit })); }} className="flex cursor-grab items-center gap-2 rounded-lg border border-gray-200 p-2.5 hover:border-red-300 active:cursor-grabbing"><Bars3Icon className="h-4 w-4 shrink-0 text-gray-400" /><div className="min-w-0 flex-1"><p className="font-mono text-xs font-semibold">{unit.code}</p><p className="truncate text-xs text-gray-500">{unit.name}</p></div></div>)}{!availableUnits.length && <p className="py-6 text-center text-sm text-gray-500">No available units match your search.</p>}</div></aside>}
                  <div className={cardBase}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="heading-text font-semibold">2. Plan study periods</h2><p className="mt-1 text-sm text-gray-500">Open the unit library, then drag a unit directly into the required semester.</p></div><button onClick={() => openPicker(sections[0]?.id)} className="flex items-center gap-1 rounded-md px-4 py-2 font-semibold text-white" style={{ backgroundColor: BRAND_RED }}><PlusIcon className="h-4 w-4" />Add Unit</button></div>
                  <div className="space-y-5">{sections.map((section) => { const sectionUnits = draftUnits.filter((unit) => unit.sectionId === section.id); const sectionCredits = sectionUnits.reduce((sum, unit) => sum + Number(unit.creditPoints || 0), 0); return <div key={section.id} className="overflow-hidden rounded-xl border border-gray-300"><div className="flex flex-wrap items-end gap-3 bg-gray-50 p-3"><label className="text-xs font-semibold text-gray-600">Year<input type="number" min="1" value={section.year} onChange={(event) => updateSection(section.id, 'year', event.target.value)} className="mt-1 block w-20 rounded border border-gray-300 bg-white p-1.5 text-sm" /></label><label className="flex-1 text-xs font-semibold text-gray-600">Semester / term<input value={section.semester} onChange={(event) => updateSection(section.id, 'semester', event.target.value)} className="mt-1 block w-full rounded border border-gray-300 bg-white p-1.5 text-sm" placeholder="Semester 1" /></label><label className="flex-1 text-xs font-semibold text-gray-600">Dates<input value={section.dates} onChange={(event) => updateSection(section.id, 'dates', event.target.value)} className="mt-1 block w-full rounded border border-gray-300 bg-white p-1.5 text-sm" placeholder="February – June 2027" /></label><button onClick={() => removeSection(section.id)} disabled={sections.length === 1} className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30" title="Remove empty section"><XMarkIcon className="h-5 w-5" /></button></div>
                    <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, section.id)} onClick={() => setSelectedSectionId(section.id)} className="min-h-28 space-y-2 p-3 transition-colors hover:bg-red-50/30">{sectionUnits.map((unit) => <UnitCard key={unit.id} unit={unit} />)}{!sectionUnits.length && <button onClick={() => openPicker(section.id)} className="flex min-h-20 w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-red-300 hover:text-red-600">Drop units here. Open the Unit library to add units</button>}</div><div className="border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">{sectionUnits.length} unit(s) · {sectionCredits} credit point(s)</div></div>; })}</div>
                  <button onClick={addSection} className="mt-4 flex items-center gap-1 text-sm font-semibold text-red-700"><PlusIcon className="h-4 w-4" />Add another study period</button></div>
                  <aside className={cardBase + ' h-fit'}><h2 className="heading-text font-semibold">Planner summary</h2><p className="mt-2 text-2xl font-bold text-gray-800">{draftUnits.length} <span className="text-sm font-normal text-gray-500">units</span></p><p className="text-sm text-gray-500">{totalCredits} credit points</p><div className="mt-4 space-y-2 border-t border-gray-200 pt-4">{typeTotals.length ? typeTotals.map((type) => <div key={type.id} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: type.colour }} />{type.name}</span><strong>{type.count}</strong></div>) : <p className="text-sm text-gray-500">Unit-type totals will appear here.</p>}</div><button onClick={handleSave} disabled={saving || !name.trim() || !draftUnits.length} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: BRAND_RED }}>{saving ? <><ArrowPathIcon className="h-5 w-5 animate-spin" />Saving...</> : <><DocumentDuplicateIcon className="h-5 w-5" />Save as new study planner</>}</button></aside></div></>}
            </>}</div></div>
        </PageLoadingWrapper>
      )}
    </ConditionalRequireAuth>
  );
}
