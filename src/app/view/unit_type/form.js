'use client';
import { useEffect, useState, useRef } from 'react';
import UnitTypeDB from '@app/class/UnitType/UnitTypeDB';
import Button from '../../../components/button.js';
import InfoTooltip from '../../../components/InfoTooltip.js';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import { useRole } from '@app/context/RoleContext';

const isRestrictedUnitType = (unitTypeName) => {
	const restrictedTypes = ['core', 'major', 'elective', 'mpu'];
	return restrictedTypes.includes(unitTypeName?.toLowerCase());
};

const Form = ({ onClose, mode, unitTypeId, RefreshList, HandleOpenForm, unitType }) => {
	const { can } = useRole();
	const { theme } = useLightDarkMode();
	const [unitTypeData, setUnitTypeData] = useState({ id: '', name: '', colour: '#000000', colors: [] });
	const [originalData, setOriginalData] = useState({ id: '', name: '', colour: '#000000', colors: [] });
	const [isLoading, setIsLoading] = useState(mode === 'VIEW' || mode === 'EDIT');
	const [isSaveLoading, setIsSaveLoading] = useState(false);
	const [isDeleteLoading, setIsDeleteLoading] = useState(false);

	useEffect(() => {
		if ((mode === 'VIEW' || mode === 'EDIT') && unitType) {
			const data = {
				id: unitType.id ?? unitTypeId,
				name: unitType.name,
				colour: unitType.colour || '#000000',
				colors: unitType.colors || []
			};
			setUnitTypeData(data);
			setOriginalData(data);
			setIsLoading(false);
		} else if (mode === 'ADD') {
			setIsLoading(false);
		} else if ((mode === 'VIEW' || mode === 'EDIT') && unitTypeId && !unitType) {
			(async () => {
				try {
					const res = await UnitTypeDB.FetchUnitTypes({ ids: [unitTypeId] });
					const data = res.data?.[0];
					if (data) {
						const unitData = {
							id: data.id,
							name: data.name,
							colour: data.colour || '#000000',
							colors: data.colors || []
						};
						setUnitTypeData(unitData);
						setOriginalData(unitData);
					} else throw new Error('Not found');
				} catch (err) {
					window.Swal.fire({ title: 'Error', text: 'Failed to load unit type', icon: 'error' }).then(() => onClose());
				} finally {
					setIsLoading(false);
				}
			})();
		}
	}, [unitType, mode, unitTypeId, onClose]);

	const SubmitForm = async (e) => {
		e.preventDefault();

		// For EDIT mode, we must have a valid ID from the prop
		if (mode === 'EDIT' && !unitTypeId) {
			window.Swal.fire({ title: 'Error', text: 'Unit type ID is missing. Cannot save.', icon: 'error' });
			return;
		}
		setIsSaveLoading(true);

		const payload = {
			name: unitTypeData.name,
			colour: unitTypeData.colour,
			colors: unitTypeData.colors
		};

		// For restricted types, name cannot change
		if (mode === 'EDIT' && isRestrictedUnitType(originalData.name)) {
			payload.name = originalData.name;
		}

		// For non‑restricted types, check if any change was made
		if (mode === 'EDIT' && !isRestrictedUnitType(originalData.name)) {
			const nameChanged = unitTypeData.name !== originalData.name;
			const colorsChanged = JSON.stringify(unitTypeData.colors) !== JSON.stringify(originalData.colors);
			if (!nameChanged && !colorsChanged) {
				window.Swal.fire({ title: 'No Changes', text: 'No changes were made.', icon: 'info' });
				setIsSaveLoading(false);
				return;
			}
		}

		// Validation
		if (!payload.name) {
			window.Swal.fire({ title: 'Validation Error', text: 'Name is required!', icon: 'error' });
			setIsSaveLoading(false);
			return;
		}

		const dataToSend = { ...payload };
		if (mode === 'EDIT') dataToSend.id = unitTypeId; // Use the prop directly
		console.log('Saving unit type with ID:', unitTypeId, 'data:', dataToSend);

		try {
			await UnitTypeDB.SaveUnitType(dataToSend, mode === 'ADD' ? 'POST' : 'PUT');
			window.Swal.fire({ title: 'Success', text: `Unit type ${mode === 'ADD' ? 'added' : 'updated'} successfully`, icon: 'success' });
			onClose();
			RefreshList();
		} catch (err) {
			console.error(err);
			window.Swal.fire({ title: 'Error', text: err.message || 'Failed to save', icon: 'error' });
		} finally {
			setIsSaveLoading(false);
		}
	};

	const handleDeleteColor = async (color) => {
		const result = await window.Swal.fire({
			title: 'Remove Color', text: `Remove ${color}?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Yes'
		});
		if (result.isConfirmed) {
			setUnitTypeData(prev => ({ ...prev, colors: prev.colors.filter(c => c !== color) }));
		}
	};

	const HandleConfirmDelete = async () => {
		setIsDeleteLoading(true);
		if (isRestrictedUnitType(unitTypeData.name)) {
			await window.Swal.fire({ title: 'Cannot Delete', text: 'System unit type cannot be deleted.', icon: 'warning' });
			setIsDeleteLoading(false);
			return;
		}
		try {
			const res = await UnitTypeDB.deleteUnitType(unitTypeData.id);
			if (res.success) {
				await window.Swal.fire({ title: 'Deleted!', text: 'Unit type deleted.', icon: 'success' });
				RefreshList();
				onClose();
			} else throw new Error(res.message);
		} catch (err) {
			window.Swal.fire({ title: 'Error', text: err.message, icon: 'error' });
		} finally {
			setIsDeleteLoading(false);
		}
	};

	const form_heading_text = `${mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase()} Unit Type`;
	const is_read_only = mode === "VIEW";
	const is_restricted = isRestrictedUnitType(unitTypeData.name);
	const formRef = useRef(null);

	useEffect(() => {
		const handleClickOutside = (e) => {
			const confirmDialog = document.querySelector('.swal2-container');
			if (confirmDialog && confirmDialog.contains(e.target)) return;
			if (formRef.current && !formRef.current.contains(e.target)) onClose();
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [onClose]);

	return (
		<div className="VED-wrapper">
			<div ref={formRef} className="VED-container">
				<div className="VED-header">
					<h1 className='VED-title'>{form_heading_text}<InfoTooltip content="..." position="bottom" className="ml-2" /></h1>
					<button onClick={onClose} className="VED-close-btn"><svg width="24" height="24" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
				</div>
				{isLoading ? (
					<div className="flex justify-center items-center h-64"><p className={theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}>Loading...</p></div>
				) : (
					<form onSubmit={SubmitForm} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} className="p-6 flex flex-col h-full">
						<div className="flex md:flex-row flex-col">
							<div className="flex-1 pr-6">
								<div className="mb-4">
									<label htmlFor="name" className="label-text-alt">Name:</label>
									<input type="text" id="name" value={unitTypeData.name} onChange={e => setUnitTypeData({ ...unitTypeData, name: e.target.value })} className="form-input" required disabled={is_read_only || (is_restricted && mode === 'EDIT')} />
									{is_restricted && mode === 'EDIT' && <p className="text-xs text-blue-600 mt-1">System unit type – only colors can be modified.</p>}
								</div>
								<div className="mb-4">
									<label className="label-text-alt">Primary Color:</label>
									<div className="flex items-center gap-2 mt-1">
										<div className="w-8 h-8 rounded-full border border-gray-400" style={{ backgroundColor: unitTypeData.colour }}></div>
										<span className="font-mono">{unitTypeData.colour}</span>
									</div>
								</div>
								<div className="mb-4">
									<label className="label-text-alt">Alternative Colors:</label>
									<div className="space-y-2 mt-1">
										{unitTypeData.colors.length === 0 ? <p className="text-xs text-gray-400">No alternative colors defined.</p> : null}
										{unitTypeData.colors.map((c, idx) => (
											<div key={idx} className="flex items-center gap-2 p-1 border rounded">
												<div className="w-6 h-6 rounded border" style={{ backgroundColor: c }}></div>
												<code className="text-xs font-mono flex-1">{c}</code>
												{!is_read_only && <button type="button" onClick={() => handleDeleteColor(c)} className="text-red-500 hover:text-red-700"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}
											</div>
										))}
									</div>
									{!is_read_only && <p className="text-xs text-gray-400 mt-2">To add alternative colors, use the <strong>"Upload Study Planner Design"</strong> tool.</p>}
								</div>
							</div>
						</div>
						<div className="mt-6 flex justify-end space-x-4">
							{mode === "VIEW" ? (
								<>
									<button type="button" onClick={onClose} className="bg-white text-gray-900 border-2 border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-xl">Close</button>
									{can("unit_type", "update") && (
										<button type="button" onClick={() => { onClose(); HandleOpenForm('EDIT', unitTypeData.id, unitTypeData); }} className="bg-[#dc2d27] text-white px-4 py-2 rounded-xl">Edit Unit Type</button>
									)}
								</>
							) : (
								<>
									<Button type="button" onClick={onClose} variant="cancel">Cancel</Button>
									{can("unit_type", "delete") && mode === "EDIT" && !is_restricted && (
										<button type="button" onClick={async () => { const result = await window.Swal.fire({ title: 'Delete Unit Type', text: 'Are you sure?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Yes' }); if (result.isConfirmed) await HandleConfirmDelete(); }} className="bg-[#dc2d27] text-white px-4 py-2 rounded-xl">{isDeleteLoading ? 'Deleting...' : 'Delete Unit Type'}</button>
									)}
									<Button type="submit" variant="submit" disabled={isSaveLoading}>{isSaveLoading ? 'Saving...' : (mode === "ADD" ? "Add Unit Type" : "Save Changes")}</Button>
								</>
							)}
						</div>
					</form>
				)}
			</div>
		</div>
	);
};

export default Form;