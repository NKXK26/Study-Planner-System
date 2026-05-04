import Button from '../../../components/button.js';
import RequisiteRelationshipListing from './requisite_relationship_listing';
import { useEffect, useState, useRef } from 'react';
import UnitDB from '@app/class/Unit/UnitDB';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import { useRole } from '@app/context/RoleContext';
import InfoTooltip from '@components/InfoTooltip.js';

const Form = ({ onClose, mode, unit, RefreshList, HandleOpenForm }) => {
	//THIS ALLOWS EVERYONE TO USE TOGGLE BETWEEN LIGHT DARK MODE #DARKMODEGANG
	const { can } = useRole();
	const { theme } = useLightDarkMode();
	const [unitData, setUnitData] = useState({
		id: -1,
		code: "",
		name: "",
		cp: 12.5,
		status: "",
		requisites: []
	});

	const formRef = useRef(null);

	// Add click outside handler
	useEffect(() => {
		const handleClickOutside = (event) => {
			const confirmDialog = document.querySelector('.swal2-container');
			if (confirmDialog && confirmDialog.contains(event.target)) {
				return;
			}

			if (formRef.current && !formRef.current.contains(event.target)) {
				onClose();
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [onClose]);

	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(mode === 'VIEW' || mode === 'EDIT');
	const [saveLoading, setSaveLoading] = useState(false)
	const [deleteLoading, setDeleteLoading] = useState(false)
	const is_fetching = useRef(false);

	const termOptions = ["Semester 1", "Semester 2", "Summer", "Winter"];
	const [offeredTerms, setOfferedTerms] = useState([]);
	const [allUnits, setaAllUnits] = useState([]);

	const toggleTerm = (term) => {
		if (is_read_only) return;
		setOfferedTerms(prev =>
			prev.includes(term)
				? prev.filter(t => t !== term)
				: [...prev, term]
		);
	};

	useEffect(() => {
		const FetchData = async () => {
			if ((mode === 'VIEW' || mode === 'EDIT') && unit && !is_fetching.current) {
				is_fetching.current = true;
				setIsLoading(true);
				try {
					// const unit_data = await UnitDB.FetchUnits({
					// 	code: unitCode,
					// 	return: ['UnitCode', 'Name', 'CreditPoints', 'Availability'],
					// 	exact: true
					// });

					let all_units_data = [];
					if (mode === 'EDIT') {
						const all_units = await UnitDB.FetchUnits({});
						console.log('all_units', all_units)
						all_units_data = all_units.data || [];
					}
					setaAllUnits(all_units_data);

					// if (unit_data && unit_data.data.length > 0) {
					if (unit) {
						const requisitesArray = Array.isArray(unit.requisites)
							? unit.requisites
							: (unit.requisites ? unit.requisites : []);

						setUnitData({
							id: unit.id || -1,
							code: unit.unit_code || "",
							name: unit.name || "",
							cp: unit.credit_points !== null && unit.credit_points !== undefined ? unit.credit_points : "",
							status: unit.availability || "",
							requisites: requisitesArray,
							original_code: unit.unit_code
						});
						setOfferedTerms(unit.offered_terms);
					} else {
						window.Swal.fire({
							title: 'Error',
							text: `Unit code: ${unitCode} is invalid`,
							icon: 'error',
							confirmButtonText: 'OK'
						});
						onClose();
					}
				} catch (error) {
					console.error("Error fetching data:", error);
					window.Swal.fire({
						title: 'Error',
						text: 'Failed to fetch unit data',
						icon: 'error',
						confirmButtonText: 'OK'
					});
					onClose();
				} finally {
					is_fetching.current = false;
					setIsLoading(false);
				}
			} else if (mode === 'ADD') {
				try {
					let all_units_data = [];
					const all_units = await UnitDB.FetchUnits({
						return: ['UnitCode', 'Name']
					});
					all_units_data = all_units.data || [];
					setaAllUnits(all_units_data);
				} catch (error) {
					console.error("Error fetching data:", error);
					window.Swal.fire({
						title: 'Error',
						text: 'Failed to fetch unit data',
						icon: 'error',
						confirmButtonText: 'OK'
					});
					onClose();
				} finally {
					is_fetching.current = false;
					setIsLoading(false);
				}
			}
		};

		FetchData();
	}, [unit, mode]);

	useEffect(() => {
		if (unitData.status === 'unavailable') {
			setOfferedTerms([]);
		}
	}, [unitData.status]);

	function normalizeMinCP(requisites) {
		return (requisites || []).map(r => {
			if (r.unit_relationship === "min") {
				return { ...r, minCP: r.minCP === '' ? null : Number(r.minCP) };
			}
			return r;
		});
	}

	function GetAllRequisites(unit_requisites) {
		let all = [];
		if (Array.isArray(unit_requisites.requisites)) all = all.concat(unit_requisites.requisites);
		if (Array.isArray(unit_requisites.added)) all = all.concat(unit_requisites.added);
		if (Array.isArray(unit_requisites.modified)) all = all.concat(unit_requisites.modified);
		return all;
	}

	const SubmitForm = async (e) => {
		setSaveLoading(true);
		e.preventDefault();
		const unit_data = new FormData(e.target);
		const unit = Object.fromEntries(
			[...unit_data.entries()].map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
		);
		unit.offered_terms = offeredTerms;

		let unit_requisites = {
			unit_code: unit.code,
			requisites: unitData.requisites
		};

		if (unitData.requisites.modified || unitData.requisites.added || unitData.requisites.deleted) {
			unit_requisites = {
				unit_code: unit.code,
				...unitData.requisites
			};
		}

		if (unit_requisites.added) {
			unit_requisites.added = normalizeMinCP(unit_requisites.added);
		}
		if (unit_requisites.modified) {
			unit_requisites.modified = normalizeMinCP(unit_requisites.modified);
		}

		let errors = ValidateForm(unit, unit_requisites);

		if (errors.length > 0) {
			setSaveLoading(false);
			window.Swal.fire({
				title: 'Validation Error',
				text: errors.join('\n'),
				icon: 'error',
				confirmButtonText: 'OK'
			});
			return;
		}

		try {
			var response;
			var requisite_response = { message: "" };
			console.log('1 allUnits', allUnits)
			console.log('1 unit', unit)

			// Check if there are existing units with the same code
			const existing_units = allUnits.filter(
				u => u.id === unit.id
			);

			if (existing_units.length > 0) {
				let text = "";

				if (unit.availability === "published") {
					text = (mode == "ADD" ? "Creating" : "Editing") + " this published unit will update the existing units' availability to unpublished. Do you want to continue?";
				} else {
					text = "A unit with this code already exists. Do you still want to continue?";
				}

				const result = await window.Swal.fire({
					icon: 'warning',
					title: "Unit Code Already Exists",
					text,
					showCancelButton: true,
					confirmButtonText: "Yes, continue",
					cancelButtonText: "Cancel",
				});

				if (!result.isConfirmed) {
					setSaveLoading(false);
					return; // stop if cancelled
				}
			}

			if (mode === "ADD") {
				const unit_obj = {
					unit,
					requisites: unit_requisites.added
				};
				response = await UnitDB.AddUnit(unit_obj);

			} else if (mode === "EDIT") {
				const unit_obj = {
					unit,
					requisites_add: unit_requisites.added,
					requisites_modified: unit_requisites.modified,
					requisites_deleted: unit_requisites.deleted,
				};
				response = await UnitDB.UpdateUnit(unit_obj);
			}

			setSaveLoading(false);
			if (response.success) {
				let message = `Success: ${response.message}`;
				message += `\n${requisite_response.message}`;
				window.Swal.fire({
					title: 'Success',
					text: message,
					icon: 'success',
					confirmButtonText: 'OK'
				});
				RefreshList();
				onClose();
			} else {
				window.Swal.fire({
					title: 'Error',
					text: `Error: ${response.message}`,
					icon: 'error',
					confirmButtonText: 'OK'
				});
			}
		} catch (error) {
			setSaveLoading(false);
			console.error('Fetch error:', error);
			window.Swal.fire({
				title: 'Error',
				text: 'An error occurred during submission. Please try again.',
				icon: 'error',
				confirmButtonText: 'OK'
			});
		}
	};

	const UpdateRequisiteRelationships = (relationships) => {
		setUnitData((prev) => ({
			...prev,
			requisites: relationships
		}));
	};

	const ValidateForm = (unit, unit_requisites = {}) => {
		const errors = [];

		if (!unit.code || !unit.name || (unit.cp === null || unit.cp === undefined || unit.cp === '') || !unit.availability) {
			errors.push("All fields are required!");
		}

		if (typeof unit.code !== 'string' || unit.code.trim() === '') {
			errors.push("Unit Code must be a valid string!");
		}

		if (typeof unit.name !== 'string' || unit.name.trim() === '') {
			errors.push("Unit Name must be a valid string!");
		}

		// Allow 0 CP for MPU units, require positive for others
		const isMPU = unit.code && unit.code.toUpperCase().startsWith('MPU');
		if (isNaN(unit.cp)) {
			errors.push("Credit Points must be a valid number!");
		} else if (unit.cp < 0) {
			errors.push("Credit Points cannot be negative!");
		} else if (!isMPU && unit.cp === 0) {
			errors.push("Credit Points must be greater than 0 for non-MPU units!");
		}

		const allRequisites = GetAllRequisites(unit_requisites);
		if (allRequisites.length > 0) {
			const seen = new Set();
			allRequisites.forEach((requisite, index) => {
				if (requisite.unit_relationship !== "min") {
					if (requisite.requisite_unit_code === unit.code) {
						errors.push(`Requisite at position ${index + 1} cannot reference the same unit.`);
					}
					allUnits.filter((u) => u.unit_code === requisite.requisite_unit_code).length === 0 &&
						errors.push(`Requisite at position ${index + 1} has an invalid unit code: ${requisite.requisite_unit_code}.`);
				}

				if (requisite.unit_relationship === "min") {
					const value = parseFloat(requisite.minCP);
					if (isNaN(value) || value <= 0) {
						errors.push(`Minimum credit points at position ${index + 1} must be a number greater than 0.`);
					}
				} else {
					if (!requisite.requisite_unit_code || typeof requisite.requisite_unit_code !== 'string' || requisite.requisite_unit_code.trim() === '') {
						errors.push(`Requisite at position ${index + 1} must have a valid unit code.`);
					}
				}

				// Check for duplicates based on requisite_unit_id (if available) to handle same unit codes with different IDs
				const key = JSON.stringify({
					requisite_unit_id: requisite.requisite_unit_id,
					unit_relationship: requisite.unit_relationship,
					operator: requisite.operator,
					minCP: requisite.minCP ?? null,
				});

				if (seen.has(key)) {
					errors.push(`Duplicate requisite found at position ${index + 1}.`);
				} else {
					seen.add(key);
				}
			});
		}

		return errors;
	};

	const form_heading_text = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
	const is_read_only = mode === "VIEW";

	const HandleDeleteUnit = async () => {
		const result = await window.Swal.fire({
			title: 'Delete Unit',
			text: 'Are you sure you want to delete this unit? This action cannot be undone.',
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#d33',
			cancelButtonColor: '#3085d6',
			confirmButtonText: 'Yes, delete it!',
			cancelButtonText: 'No, cancel'
		});

		if (!result.isConfirmed) return;
		setDeleteLoading(true);

		try {
			const res = await UnitDB.DeleteUnit(unitData.id);
			setDeleteLoading(false);
			if (res.success) {
				window.Swal.fire({
					title: 'Deleted!',
					text: res.message || 'Unit deleted successfully',
					icon: 'success',
					confirmButtonText: 'OK',
					confirmButtonColor: '#6c63ff'
				});
				RefreshList && RefreshList();
				onClose && onClose();
			} else {
				let errorMsg = res.message || 'Delete operation failed';
				if (res.details) {
					const d = res.details;
					errorMsg += `\n\nDependencies:\n` +
						(d.requisites ? `${d.requisites} requisite(s)\n` : '') +
						(d.termOfferings ? `${d.termOfferings} term offering(s)\n` : '') +
						(d.studyPlannerUnits ? `${d.studyPlannerUnits} study planner unit(s)\n` : '');
				}
				window.Swal.fire({
					title: 'Cannot Delete',
					text: errorMsg,
					icon: 'error',
					confirmButtonText: 'OK',
					confirmButtonColor: '#d33'
				});
			}
		} catch (error) {
			window.Swal.fire({
				title: 'Error',
				text: `Failed to delete unit: ${error.message}`,
				icon: 'error',
				confirmButtonText: 'OK',
				confirmButtonColor: '#d33'
			});
		}
	};

	return (
		<>
			<div className="VED-wrapper">
				<div ref={formRef} className="VED-container">
					{/* Header */}
					<div className="VED-header">
						<h1 className='VED-title'>
							{form_heading_text} Unit
							{/* Where you are able to add guides based on the mode the user is currently on, for the VED (View, Edit, Delete) */}
							<InfoTooltip
								content={
									mode === 'VIEW'
										? "Currently viewing Unit, in this mode you are viewing the details of the unit you have chosen"
										: mode === 'EDIT'
											? "Currently editting Unit, in this mode you can edit the unit details, some details can't have duplicate information for example, Unit Name"
											: mode === 'ADD'
												? "Adding Unit, please fill in the neccessary information for the unit you are creating."
												: mode === 'DELETE'
													? "Deleting a unit entirely. This action cannot be undone. All associated data will be permanently removed."
													: "Unit management form"
								}
								position="bottom"
								className="ml-2"
							/>
						</h1>

						<button
							onClick={onClose}
							className="VED-close-btn"
						>
							<svg width="24" height="24" stroke="currentColor" strokeWidth="2">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</div>

					{isLoading ? (
						<div className="flex justify-center items-center h-64 w-128">
							<p className={theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}>Loading unit data...</p>
						</div>
					) : (
						<form className="p-6 flex flex-col h-full" onSubmit={SubmitForm}>
							<div className="flex md:flex-row flex-col">
								{/* Left Column */}
								<div className="flex-1 md:pr-6">
									{/* Unit Code*/}
									<input type="hidden" name="id" value={unitData.id} readOnly />
									<div className="mb-4">
										<label htmlFor="code" className="label-text-alt">
											Unit Code:
										</label>
										<input
											type="text"
											name="code"
											id="code"
											className="form-input"
											required
											defaultValue={unitData.code}
											disabled={is_read_only || mode === "VIEW"}
											onChange={(e) => setUnitData(prev => ({ ...prev, code: e.target.value }))}
										/>
									</div>
									{/* Unit Name*/}
									<div className="mb-4">
										<label htmlFor="name" className="label-text-alt">
											Unit Name:
										</label>
										<input
											type="text"
											name="name"
											id="name"
											className="form-input"
											required
											defaultValue={unitData.name}
											disabled={is_read_only}
										/>
									</div>
									{/* Unit CP*/}
									<div className="mb-4">
										<label htmlFor="cp" className="label-text-alt">
											Credit Points:
										</label>
										<input
											type="number"
											name="cp"
											id="cp"
											className="form-input"
											step="0.1"
											required
											defaultValue={unitData.cp !== null && unitData.cp !== undefined && unitData.cp !== '' ? unitData.cp : 12.5}
											disabled={is_read_only}
											onWheel={(e) => e.target.blur()}
										/>
									</div>

									{/* Unit Status */}
									<div className="mb-4">
										<label htmlFor="availability" className="label-text-alt">
											Status:
										</label>
										<select
											name="availability"
											id="availability"
											className={`form-input ${mode != "VIEW" ? "cursor-pointer" : ""}`}
											value={unitData.status}
											onChange={
												is_read_only ? undefined : (e) => {
													const value = e.target.value;
													setUnitData((prev) => ({
														...prev,
														status: value,
													}));
													if (value === 'unavailable') {
														setOfferedTerms([]);
													}
												}
											}
											disabled={is_read_only}
										>
											<option value="published">Published</option>
											<option value="unavailable">Unavailable</option>
											<option value="unpublished">Unpublished</option>
										</select>
									</div>
									{/* Offered In */}
									<div>
										<label className="label-text-alt mb-2 block">
											Offered In:
										</label>
										<div className="flex gap-2 flex-wrap">
											{termOptions.map((term) => (
												<button
													type="button"
													key={term}
													className={`px-3 py-1 border-dashed border-1 rounded-sm cursor-pointer m-1 ${offeredTerms.includes(term)
														? 'bg-blue-500 text-white hover:bg-blue-600'
														: theme === 'dark'
															? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
															: 'bg-gray-200 text-gray-900 hover:bg-gray-300'
														}`}
													onClick={() => toggleTerm(term)}
													disabled={is_read_only || unitData.status === 'unavailable'}
												>
													{term}
												</button>
											))}
										</div>
									</div>
								</div>

								{/* Right Column - Requisite Relationship */}
								<div className="flex-1 md:pl-6 md:pt-0 md:border-l pl-0 pt-4 mt-4 md:mt-0 md:border-divider">
									<div className='mb-6'>
										<p className="heading-text text-xl font-medium mb-2">
											Requisite Relationship
										</p>
										{
											mode !== "VIEW" && (
												<div className='flex gap-5'>
													<div className='flex gap-1'>
														<div className='w-5 h-5  rounded-full border-1'>
														</div>
														Existing
													</div>
													<div className='flex gap-1'>
														<div className='w-5 h-5 bg-green-100 rounded-full border-1'>
														</div>
														New
													</div>
													<div className='flex gap-1'>
														<div className='w-5 h-5 bg-yellow-200 rounded-full border-1'>
														</div>
														Modified
													</div>
												</div>
											)
										}
										<div className='requisite-scroll-container p-4 h-[350px]'>
											{mode === "VIEW" && (!unitData.requisites || unitData.requisites.length === 0) ? (
												<p className="text-muted cursor-pointer">NIL</p>
											) : (
												<table className='w-full'>
													<tbody>
														<RequisiteRelationshipListing
															UnitCode={unitData.code}
															mode={mode === "VIEW" ? "READ" : "EDIT"}
															UpdateRequisiteRelationships={UpdateRequisiteRelationships}
															Requisites={unitData.requisites || []}
															allUnits={allUnits.filter(u => u._unit_code !== unitData.code)}
														/>
													</tbody>
												</table>
											)}
										</div>
									</div>
								</div>
							</div>

							{/* Action buttons */}
							<div className="mt-6 flex justify-end space-x-4">
								{mode === "VIEW" ? (
									<>
										<button
											type="button"
											onClick={onClose}
											className={`mx-3 px-4 py-2 rounded-xl cursor-pointer ${theme === 'dark'
												? 'bg-gray-700 text-gray-100 hover:bg-gray-600'
												: 'bg-white text-gray-900 border-2 border-gray-300 hover:bg-gray-50'
												}`}
										>
											Close
										</button>
										{can('unit', 'update') ? (
											<button
												type="button"
												onClick={() => HandleOpenForm('EDIT', unit)}
												className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer hover:bg-red-700"
											>
												Edit Unit
											</button>
										) : null}
									</>
								) : (
									<>
										<Button
											type="button"
											onClick={onClose}
											variant="cancel"
											className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer hover:bg-red-700"
										>
											Cancel
										</Button>
										{(can('unit', 'delete') && mode === "EDIT") && (
											<button
												type="button"
												onClick={HandleDeleteUnit}
												className="bg-[#dc2d27] text-white mx-3 px-4 py-2 rounded-xl cursor-pointer hover:bg-red-700"
											>
												{
													deleteLoading ? (
														<span className="flex items-center space-x-2">
															<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
																<circle
																	className="opacity-25"
																	cx="12"
																	cy="12"
																	r="10"
																	stroke="currentColor"
																	strokeWidth="4"
																	fill="none"
																/>
																<path
																	className="opacity-75"
																	fill="currentColor"
																	d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
																/>
															</svg>
															<span>Deleting...</span>
														</span>
													) : (
														<>Delete</>
													)
												}
											</button>
										)}
										{can('unit', 'create') ? (
											<Button
												type="submit"
												variant="submit"
												className="px-4 py-2  text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-70"
												disabled={saveLoading}
											>
												{saveLoading ? (
													<span className="flex items-center space-x-2">
														<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
															<circle
																className="opacity-25"
																cx="12"
																cy="12"
																r="10"
																stroke="currentColor"
																strokeWidth="4"
																fill="none"
															/>
															<path
																className="opacity-75"
																fill="currentColor"
																d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
															/>
														</svg>
														<span>Saving...</span>
													</span>
												) : (
													<span className='text-white'>{mode === "ADD" ? "Add Unit" : "Save Changes"}</span>
												)}
											</Button>
										) : null}
									</>
								)}
							</div>
						</form>
					)}
				</div>
			</div>
		</>
	);
};

export default Form;