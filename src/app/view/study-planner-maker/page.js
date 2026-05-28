'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import {
	DocumentDuplicateIcon,
	PlusIcon,
	XMarkIcon,
	CheckCircleIcon,
	ArrowPathIcon,
	ArrowRightIcon,
} from '@heroicons/react/24/outline';

const BRAND_RED = '#dc2d27';

export default function StudyPlannerMakerPage() {
	const { can, isSuperadmin } = useRole();
	const hasAccess = isSuperadmin() || can('planner', 'read') || can('course', 'read');

	const [planners, setPlanners] = useState([]);
	const [unitCatalog, setUnitCatalog] = useState([]);
	const [unitTypes, setUnitTypes] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const [sourceId, setSourceId] = useState('');
	const [name, setName] = useState('');
	const [draftUnits, setDraftUnits] = useState([]);
	const [addUnitId, setAddUnitId] = useState('');
	const [saving, setSaving] = useState(false);
	const [result, setResult] = useState(null);

	const defaultTypeId = unitTypes[0]?.ID ?? null;

	const loadAll = async () => {
		setLoading(true);
		setError(null);
		try {
			const [plannerRes, unitRes, typeRes] = await Promise.all([
				SecureFrontendAuthHelper.authenticatedFetch('/api/study-planner'),
				SecureFrontendAuthHelper.authenticatedFetch('/api/unit?availability=published'),
				SecureFrontendAuthHelper.authenticatedFetch('/api/unit_type'),
			]);
			const plannerData = await plannerRes.json();
			const unitData = await unitRes.json();
			const typeData = await typeRes.json();

			if (!plannerRes.ok || !plannerData.success) {
				throw new Error(plannerData.message || 'Failed to load study planners');
			}
			setPlanners(plannerData.data || []);
			setUnitCatalog(
				(unitData.data || []).map((u) => ({
					ID: u.ID,
					UnitCode: u.UnitCode,
					Name: u.Name,
					CreditPoints: u.CreditPoints || 0,
				}))
			);
			setUnitTypes(typeData.data || []);
		} catch (err) {
			setError(err.message || 'Failed to load data');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (hasAccess) loadAll();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasAccess]);

	const handlePickSource = (e) => {
		const id = e.target.value;
		setSourceId(id);
		setResult(null);
		setError(null);
		const planner = planners.find((p) => String(p.id) === String(id));
		if (!planner) {
			setDraftUnits([]);
			setName('');
			return;
		}
		const units = (planner.units || []).map((u) => ({
			unitId: u.ID,
			unitCode: u.UnitCode,
			unitName: u.Name,
			creditPoints: u.CreditPoints || 0,
			unitTypeId: u.unitTypeId ?? defaultTypeId,
		}));
		setDraftUnits(units);
		setName(planner.name + ' (Copy)');
	};

	const setUnitField = (unitId, field, value) => {
		setDraftUnits((prev) =>
			prev.map((u) => (u.unitId === unitId ? { ...u, [field]: value } : u))
		);
	};

	const removeUnit = (unitId) => {
		setDraftUnits((prev) => prev.filter((u) => u.unitId !== unitId));
	};

	const addUnit = () => {
		const id = parseInt(addUnitId, 10);
		if (!id) return;
		const unit = unitCatalog.find((u) => u.ID === id);
		if (!unit) return;
		setDraftUnits((prev) => [
			...prev,
			{
				unitId: unit.ID,
				unitCode: unit.UnitCode,
				unitName: unit.Name,
				creditPoints: unit.CreditPoints || 0,
				unitTypeId: defaultTypeId,
			},
		]);
		setAddUnitId('');
	};

	const availableToAdd = useMemo(
		() => unitCatalog.filter((u) => !draftUnits.some((d) => d.unitId === u.ID)),
		[unitCatalog, draftUnits]
	);

	const totalCredits = draftUnits.reduce((s, u) => s + (Number(u.creditPoints) || 0), 0);
	const typeColour = (typeId) =>
		unitTypes.find((t) => t.ID === typeId)?.Colour || '#9ca3af';

	const handleSave = async () => {
		if (!name.trim()) {
			setError('Please enter a name for the new study planner.');
			return;
		}
		if (draftUnits.length === 0) {
			setError('Add at least one unit before saving.');
			return;
		}
		setSaving(true);
		setError(null);
		setResult(null);
		try {
			const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/study-planner', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					units: draftUnits.map((u) => ({
						unitId: u.unitId,
						unitTypeId: u.unitTypeId || null,
						// semester intentionally omitted – standalone version does not use it
					})),
				}),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.message || 'Failed to save the study planner');
			}
			setResult({ name: name.trim(), unitCount: draftUnits.length });
			setSourceId('');
			setDraftUnits([]);
			setName('');
			await loadAll();
		} catch (err) {
			setError(err.message || 'Failed to save the study planner');
		} finally {
			setSaving(false);
		}
	};

	const cardBase = 'card-bg p-5 rounded-theme shadow-theme border border-gray-200';

	const renderUnitRow = (u) => (
		<div
			key={u.unitId}
			className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2"
		>
			<span
				className="h-3 w-3 rounded-full flex-shrink-0"
				style={{ backgroundColor: typeColour(u.unitTypeId) }}
				title="Unit type colour"
			/>
			<div className="min-w-[140px] flex-1">
				<p className="font-mono text-sm font-semibold text-gray-800">{u.unitCode}</p>
				<p className="text-xs text-gray-500 truncate">{u.unitName}</p>
			</div>
			<select
				value={u.unitTypeId ?? ''}
				onChange={(e) =>
					setUnitField(u.unitId, 'unitTypeId', e.target.value ? parseInt(e.target.value, 10) : null)
				}
				className="text-xs p-1.5 border border-gray-300 rounded-md bg-white"
			>
				<option value="">Type</option>
				{unitTypes.map((t) => (
					<option key={t.ID} value={t.ID}>
						{t.Name}
					</option>
				))}
			</select>
			<button
				onClick={() => removeUnit(u.unitId)}
				className="text-gray-400 hover:text-red-600 p-1"
				title="Remove unit"
			>
				<XMarkIcon className="h-4 w-4" />
			</button>
		</div>
	);

	return (
		<ConditionalRequireAuth>
			{!hasAccess ? (
				<AccessDenied
					requiredPermission="planner:read or course:read or system:superadmin"
					resourceName="study planner maker"
				/>
			) : (
				<PageLoadingWrapper
					requiredPermission={{ resource: 'dashboard', action: 'access' }}
					resourceName="study planner maker"
					isLoading={false}
				>
					<div className="page-bg p-6 min-h-screen">
						<div className="max-w-5xl mx-auto">
							<div className="mb-8 flex items-start gap-3">
								<div className="rounded-lg p-2" style={{ backgroundColor: BRAND_RED + '0d' }}>
									<DocumentDuplicateIcon className="h-7 w-7" style={{ color: BRAND_RED }} />
								</div>
								<div>
									<h1 className="title-text text-3xl font-bold">Study Planner Maker</h1>
									<p className="text-muted text-sm mt-1">
										Copy an existing study planner, add or remove units, adjust unit types,
										and save it as a new version.
									</p>
								</div>
							</div>

							{loading ? (
								<div className={cardBase + ' text-center'}>
									<div
										className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 mx-auto"
										style={{ borderColor: BRAND_RED }}
									/>
									<p className="text-muted mt-4">Loading study planners...</p>
								</div>
							) : (
								<>
									{error && (
										<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
											<strong>Error:</strong> {error}
										</div>
									)}

									{result && (
										<div className="bg-green-50 border border-green-300 rounded-theme p-6 mb-6">
											<div className="flex items-start gap-3">
												<CheckCircleIcon className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
												<div>
													<h2 className="font-semibold text-green-800">
														Study planner created
													</h2>
													<p className="text-sm text-green-700 mt-1">
														&quot;{result.name}&quot; was saved with {result.unitCount} unit(s).
													</p>
													<Link
														href="/view/study-planner"
														className="inline-flex items-center gap-2 mt-3 text-white font-semibold py-2 px-4 rounded-lg"
														style={{ backgroundColor: BRAND_RED }}
													>
														Go to Study Planner Management
														<ArrowRightIcon className="h-4 w-4" />
													</Link>
												</div>
											</div>
										</div>
									)}

									<div className={cardBase + ' mb-6'}>
										<div className="flex items-center gap-2 mb-3">
											<span
												className="flex items-center justify-center h-6 w-6 rounded-full text-white text-sm font-bold"
												style={{ backgroundColor: BRAND_RED }}
											>
												1
											</span>
											<h2 className="heading-text font-semibold">
												Pick a study planner to copy from
											</h2>
										</div>
										{planners.length === 0 ? (
											<p className="text-muted text-sm">
												No study planners exist yet. Upload one first using the Upload
												Study Planner feature.
											</p>
										) : (
											<select
												value={sourceId}
												onChange={handlePickSource}
												className="input-field w-full p-2 border border-gray-300 rounded-md bg-white"
											>
												<option value="">Select a study planner</option>
												{planners.map((p) => (
													<option key={p.id} value={p.id}>
														{p.name} ({p.units?.length || 0} units)
													</option>
												))}
											</select>
										)}
									</div>

									{sourceId && (
										<>
											<div className={cardBase + ' mb-6'}>
												<div className="flex items-center gap-2 mb-4">
													<span
														className="flex items-center justify-center h-6 w-6 rounded-full text-white text-sm font-bold"
														style={{ backgroundColor: BRAND_RED }}
													>
														2
													</span>
													<h2 className="heading-text font-semibold">
														Name your new study planner
													</h2>
												</div>
												<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
													<div>
														<label className="label-text block text-sm mb-1">
															New planner name
														</label>
														<input
															type="text"
															value={name}
															onChange={(e) => setName(e.target.value)}
															placeholder="e.g. BCS 2024 Sem 2 Planner"
															className="input-field w-full p-2 border border-gray-300 rounded-md bg-white"
														/>
													</div>
												</div>
											</div>

											<div className={cardBase + ' mb-6'}>
												<div className="flex items-center gap-2 mb-4">
													<span
														className="flex items-center justify-center h-6 w-6 rounded-full text-white text-sm font-bold"
														style={{ backgroundColor: BRAND_RED }}
													>
														3
													</span>
													<h2 className="heading-text font-semibold">
														Manage units in this planner
													</h2>
												</div>

												<div className="flex flex-wrap items-end gap-2 mb-4 pb-4 border-b border-gray-200">
													<div className="flex-1 min-w-[200px]">
														<label className="label-text block text-xs mb-1">
															Add a unit to this planner
														</label>
														<select
															value={addUnitId}
															onChange={(e) => setAddUnitId(e.target.value)}
															className="input-field w-full p-2 border border-gray-300 rounded-md bg-white"
														>
															<option value="">Select a unit</option>
															{availableToAdd.map((u) => (
																<option key={u.ID} value={u.ID}>
																	{u.UnitCode} - {u.Name}
																</option>
															))}
														</select>
													</div>
													<button
														onClick={addUnit}
														disabled={!addUnitId}
														className="flex items-center gap-1 text-white font-semibold py-2 px-4 rounded-md disabled:opacity-40"
														style={{ backgroundColor: BRAND_RED }}
													>
														<PlusIcon className="h-4 w-4" />
														Add
													</button>
												</div>

												{draftUnits.length === 0 ? (
													<p className="text-sm text-gray-500 italic py-4 text-center">
														No units added yet. Use the dropdown above to add units.
													</p>
												) : (
													<div className="space-y-2">{draftUnits.map(renderUnitRow)}</div>
												)}
											</div>

											<div className={cardBase}>
												<div className="flex items-center justify-between flex-wrap gap-3 mb-4">
													<p className="text-sm text-muted">
														{draftUnits.length} unit(s) - {totalCredits} credit point(s)
													</p>
												</div>
												<button
													onClick={handleSave}
													disabled={saving || !name.trim() || draftUnits.length === 0}
													className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
													style={{ backgroundColor: BRAND_RED }}
												>
													{saving ? (
														<>
															<ArrowPathIcon className="h-5 w-5 animate-spin" />
															Saving...
														</>
													) : (
														<>
															<DocumentDuplicateIcon className="h-5 w-5" />
															Save as new study planner
														</>
													)}
												</button>
											</div>
										</>
									)}
								</>
							)}
						</div>
					</div>
				</PageLoadingWrapper>
			)}
		</ConditionalRequireAuth>
	);
}